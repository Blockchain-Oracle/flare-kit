import {
  type MemoFeeSettings,
  type MemoIntent,
  type MemoPlanResult,
  type MemoSimulation,
  type PersonalAccountState,
  type SmartAccountsDeployment,
  planMemoInstruction,
  readDirectMintProtocolState,
  readPersonalAccount,
  readTransactionIdUsed,
} from '@flare-kit/core'
import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * `useMemoInstruction` — the reads a memo instruction needs, and the gate over them (M14-R11).
 *
 * Keyless, like `useSmartAccount`. Nothing here signs, submits or requests an attestation:
 * the subject is an XRPL address and a proposed operation, and everything this hook does is
 * decide whether that operation may be SIGNED. Self-relay is a separate, key-holding step the
 * host drives with `planSelfRelay`.
 *
 * The reads are composed, not re-coded. `readDirectMintProtocolState` already reads the fee
 * settings this gate needs, `readPersonalAccount` already reads the nonce and pin, and
 * `readTransactionIdUsed` already answers replay. This hook's own work is keeping their
 * `undefined`s distinct all the way to the surface, because each one means something
 * different and collapsing any of them fabricates a fact:
 *
 * - **fees unread** yields NO PLAN AT ALL, not a plan with guessed fees. Every refusal this
 *   gate can raise is computed against the minimum minting fee, and a plan built on a guessed
 *   minimum would wave through a payment that burns entirely to the fee receiver.
 * - **replay unread** is passed through as `undefined`, which the gate turns into a warning.
 *   It is never sent as `false`; that would claim a payment has not dispatched when we could
 *   not look.
 * - **the nonce unread** is the gate's own refusal, not this hook's to paper over.
 */

/** viem's `PublicClient`, named transitively so this package stays viem-free. */
export type MemoEvmClient = Parameters<typeof readPersonalAccount>[0]

export interface UseMemoInstructionInput {
  readonly deployment: SmartAccountsDeployment
  /** Which network's FAsset deployment the fees are read from. */
  readonly chainId: number
  /** The XRPL address that controls the account. Not an EVM address, and not a signer. */
  readonly xrplOwner: string
  readonly publicClient: MemoEvmClient
  /**
   * The operation to gate. `undefined` reads the account and stops there, which is the state
   * a composer opens in.
   *
   * The caller supplies the nonce, having read it here first. That is deliberate: feeding the
   * freshly-read nonce back in automatically would make the gate's nonce-mismatch refusal
   * unreachable, and that refusal exists because two payments sharing one nonce read means the
   * second is refused with its XRP already spent.
   */
  readonly intent?: MemoIntent
  /** Whatever tag the caller intends to set. Any value at all is refused. */
  readonly destinationTag?: number
  /** An XRPL payment already made, to check for replay before planning another. */
  readonly transactionId?: `0x${string}`
  /** The `eth_call` result for the inner calldata, when the host has run one. */
  readonly simulation?: MemoSimulation
  /** The FAsset token, so the account's balance is read alongside its native one. */
  readonly fassetToken?: `0x${string}`
  /** Poll cadence in ms. Default 30s — this is account state, not an in-flight operation. */
  readonly pollMs?: number
}

export interface UseMemoInstructionResult {
  /** `undefined` when the account address itself could not be derived. */
  readonly account: PersonalAccountState | undefined
  /** `undefined` when the AssetManager's fee settings could not be read. */
  readonly fees: MemoFeeSettings | undefined
  /** The Core Vault's XRPL address — where the payment must go. `undefined` when unread. */
  readonly xrplDestination: string | undefined
  /** `undefined` when unread, and never assumed false — a paused mint cannot dispatch. */
  readonly mintingPaused: boolean | undefined
  /**
   * The gate's verdict. `undefined` when there is no intent to gate, OR when the fees could
   * not be read — a plan is never built on guessed fees.
   */
  readonly planResult: MemoPlanResult | undefined
  /** `undefined` means "we could not look", which the gate renders as a warning. */
  readonly replayed: boolean | undefined
  readonly loading: boolean
  /** True once a read cycle has completed, so "loading" and "unavailable" never blur. */
  readonly loaded: boolean
  refresh(): void
}

interface ChainReads {
  readonly account: PersonalAccountState | undefined
  readonly fees: MemoFeeSettings | undefined
  readonly xrplDestination: string | undefined
  readonly mintingPaused: boolean | undefined
  readonly replayed: boolean | undefined
}

const EMPTY: ChainReads = {
  account: undefined,
  fees: undefined,
  xrplDestination: undefined,
  mintingPaused: undefined,
  replayed: undefined,
}

export function useMemoInstruction(input: UseMemoInstructionInput): UseMemoInstructionResult {
  const {
    deployment,
    chainId,
    xrplOwner,
    publicClient,
    intent,
    transactionId,
    fassetToken,
    pollMs = 30_000,
  } = input

  const [reads, setReads] = useState<ChainReads>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((value) => value + 1), [])

  // A new SUBJECT means the old answers are about somebody else. `useSmartAccount` resets on
  // exactly this key and for exactly this reason: holding a previous owner's personal-account
  // ADDRESS under a new name shows an address a user can send funds to.
  useEffect(() => {
    setReads(EMPTY)
    setLoaded(false)
  }, [deployment, xrplOwner, chainId])

  useEffect(() => {
    // Per-effect, not a shared ref: with a shared ref React runs the old cleanup and the new
    // effect body before an in-flight read resolves, and that read then writes the PREVIOUS
    // subject's account into state and leaks a poll loop.
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const read = async () => {
      setLoading(true)

      const [account, protocol, replayed] = await Promise.all([
        readPersonalAccount(publicClient, deployment, xrplOwner, fassetToken),
        // It THROWS when the network has no direct-minting deployment. That is an
        // availability answer, not a crash, and it must not take the account read with it.
        readDirectMintProtocolState({ client: publicClient, chainId }).catch(() => undefined),
        transactionId
          ? readTransactionIdUsed(publicClient, deployment, transactionId)
          : Promise.resolve(undefined),
      ])
      if (!live) return

      setReads({
        account,
        // All three fee fields come from one read, so they are present or absent together.
        // A partial fee settings object is not a thing this gate could safely use.
        fees: protocol
          ? {
              feeBIPS: protocol.feeSettings.mintingFeeBIPS,
              minimumFeeUBA: protocol.feeSettings.minimumMintingFeeUBA,
              assetManagerExecutorFeeUBA: protocol.feeSettings.executorFeeUBA,
            }
          : undefined,
        xrplDestination: protocol?.xrplDestination,
        mintingPaused: protocol ? protocol.mintingPaused || protocol.emergencyPaused : undefined,
        replayed,
      })
      setLoading(false)
      setLoaded(true)
      timer = setTimeout(() => void read(), pollMs)
    }

    void read()
    return () => {
      live = false
      if (timer) clearTimeout(timer)
    }
  }, [deployment, chainId, xrplOwner, publicClient, fassetToken, transactionId, pollMs, tick])

  const planResult = useMemo<MemoPlanResult | undefined>(() => {
    // No intent is not a refusal — there is simply nothing to gate yet.
    if (!intent) return undefined
    // No fees is NOT a refusal either, and must not be rendered as one. Every check below the
    // fee line is computed against the live minimum; without it there is no honest verdict,
    // so the surface reports the reads as unavailable instead of the plan as refused.
    if (!reads.fees) return undefined

    return planMemoInstruction({
      deployment,
      personalAccount: reads.account,
      fees: reads.fees,
      intent,
      replayed: reads.replayed,
      ...(input.destinationTag === undefined ? {} : { destinationTag: input.destinationTag }),
      ...(input.simulation === undefined ? {} : { simulation: input.simulation }),
    })
  }, [deployment, intent, reads.fees, reads.account, reads.replayed, input.destinationTag, input.simulation])

  return {
    account: reads.account,
    fees: reads.fees,
    xrplDestination: reads.xrplDestination,
    mintingPaused: reads.mintingPaused,
    replayed: reads.replayed,
    planResult,
    loading,
    loaded,
    refresh,
  }
}
