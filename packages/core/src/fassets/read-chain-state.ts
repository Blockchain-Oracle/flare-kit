import {
  DIRECT_MINTING_DELAY_STATES,
  assetManagerAbi,
  registryFor,
} from '@flare-kit/contracts'
import { findEvidence } from '../evidence.js'
import type { XrpPaymentProofRetriever } from '../fdc/families/xrp-payment.js'
import { toProofStruct } from '../fdc/families/xrp-payment.js'
import type { XrplClient } from '../xrpl-rpc.js'
import type { DirectMintOperation } from './direct-mint.js'
import type { DirectMintChainState } from './direct-mint-recovery.js'

/**
 * The live producer of `DirectMintChainState` — the twin of the mock's
 * `chainAt()`, reading the same questions from the chain instead of a clock.
 *
 * Every branch answers honestly or answers "no". A reading that could not be
 * taken is never reported as a failure: the XRP has already moved by the time
 * any of this runs, and an unreachable endpoint says nothing about where it
 * went.
 */

const XRPL_REQUIRED_CONFIRMATIONS = 3

/**
 * viem's `PublicClient`, structurally. `simulateContract` is required because
 * the AssetManager exposes no getter for "has this payment been confirmed" —
 * only a revert.
 */
export interface ChainStateReader {
  readContract(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
  }): Promise<unknown>
  simulateContract(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
    value?: bigint
    account?: unknown
  }): Promise<unknown>
}

export interface ReadChainStateInput {
  client: ChainStateReader
  xrpl: XrplClient
  fdc: XrpPaymentProofRetriever
  chainId: number
  operation: DirectMintOperation
  now: number
  underlyingSymbol?: string
}

async function quietly<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work()
  } catch {
    return fallback
  }
}

export async function readDirectMintChainState(
  input: ReadChainStateInput,
): Promise<DirectMintChainState> {
  const deployment = registryFor(input.chainId).fassets[input.underlyingSymbol ?? 'XRP']
  const assetManager = deployment?.assetManager as `0x${string}`

  const xrplTxId = findEvidence(input.operation.evidence, 'xrpl_tx')?.value ?? ''
  if (!xrplTxId) {
    // Nothing has been paid, so there is nothing on chain to reconcile against.
    return {
      xrplTxId: '',
      xrplFinal: false,
      proofAvailable: false,
      delayState: 'NotDelayed',
      alreadySettled: false,
    }
  }
  const txIdHex = (xrplTxId.startsWith('0x') ? xrplTxId : `0x${xrplTxId}`) as `0x${string}`

  const read = (functionName: string, args?: readonly unknown[]) =>
    input.client.readContract({ address: assetManager, abi: assetManagerAbi, functionName, ...(args ? { args } : {}) })

  const [xrplFinal, delay, mintingPaused, emergencyPaused] = await Promise.all([
    quietly(async () => {
      const tx = await input.xrpl.getTransaction(xrplTxId)
      if (!tx.validated || !tx.succeeded || tx.ledgerIndex === undefined) return false
      const head = await input.xrpl.getCurrentLedgerIndex()
      return head - tx.ledgerIndex >= XRPL_REQUIRED_CONFIRMATIONS
    }, false),
    quietly(
      async () => (await read('directMintingDelayState', [txIdHex])) as [number, bigint, bigint],
      [0, 0n, 0n] as [number, bigint, bigint],
    ),
    quietly(async () => (await read('mintingPaused')) as boolean, false),
    quietly(async () => (await read('emergencyPaused')) as boolean, false),
  ])

  const delayState = DIRECT_MINTING_DELAY_STATES[delay[0]] ?? 'NotDelayed'
  // The contract keeps seconds; an operation record keeps milliseconds.
  const allowedAt = delay[1] > 0n ? Number(delay[1]) * 1_000 : undefined

  // The proof is only retrievable once its round has finalized. Absence is a
  // wait, not an error, so it is asked for quietly.
  const proof = await quietly(async () => {
    const requestBytes = findEvidence(input.operation.evidence, 'fdc_request')?.value
    const round = findEvidence(input.operation.evidence, 'fdc_round')?.value
    if (!requestBytes || !round) return undefined
    return await input.fdc.retrieveProof({ votingRoundId: BigInt(round), requestBytes })
  }, undefined)

  /**
   * The only way to learn a mint has already executed. A third party may
   * execute at any moment — on Coston2 one did — and the contract answers only
   * by reverting `PaymentAlreadyConfirmed()`. Any other revert means something
   * else is true, not that this is settled.
   */
  const alreadySettled = proof
    ? await quietly(async () => {
        try {
          await input.client.simulateContract({
            address: assetManager,
            abi: assetManagerAbi,
            functionName: 'executeDirectMinting',
            args: [toProofStruct(proof)],
            value: 0n,
            // Must simulate as the proof's owner. `verifyProofOwnership`
            // requires `msg.sender == proofOwner` and runs *before* the
            // already-confirmed check, so simulating as anyone else reverts
            // with OnlyProofOwner() and reveals nothing about settlement.
            account: proof.data.requestBody.proofOwner as `0x${string}`,
          })
          return false
        } catch (error) {
          return String(error).includes('PaymentAlreadyConfirmed')
        }
      }, false)
    : false

  const unavailableReason = emergencyPaused
    ? 'The asset manager is emergency-paused'
    : mintingPaused
      ? 'Minting is paused on this asset manager'
      : undefined

  return {
    xrplTxId,
    xrplFinal,
    proofAvailable: proof !== undefined,
    delayState,
    ...(allowedAt !== undefined ? { allowedAt } : {}),
    alreadySettled,
    ...(unavailableReason ? { unavailableReason } : {}),
  }
}
