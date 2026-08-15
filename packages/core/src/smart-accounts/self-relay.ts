import { directMintingAbi } from '@flarekit-dev/contracts'
import { type Abi, keccak256 } from 'viem'
import { FlareKitError } from '../errors.js'
import { type XrpPaymentInput, type XrpPaymentProof, toProofStruct } from '../fdc/families/xrp-payment.js'
import type { SmartAccountCall } from './adapter.js'
import { MEMO_OPCODE, decodeMemo } from './memo.js'

/**
 * Self-relay: request the proof in our own name, and submit it ourselves (M14-R10).
 *
 * The reference flow sends the XRPL payment and then WATCHES FOR AN EVENT, hoping somebody
 * else's relayer finalises it. This kit does not infer an outcome from an event that may never
 * arrive, so it relays its own operations — which the protocol permits at every point that
 * could have stopped it:
 *
 * - `executeDirectMinting[WithData]` may be called by any address, and `_decodeTarget` returns
 *   `allowedExecutor: address(0)` for the smart-account branch, so the exclusivity window
 *   never binds (`DirectMintingFacet.sol:352-356`);
 * - the controller's per-account executor pin only binds when one is set
 *   (`MemoInstructionsFacet.sol:67-70`);
 * - and `verifyProofOwnership` accepts `msg.sender` when the proof names it
 *   (`TransactionAttestation.sol:46`).
 *
 * That last line is the whole mechanism, and it cuts both ways. Naming our EOA at REQUEST time
 * means only that EOA can ever submit the proof — a guarantee bought with an exclusion. So
 * every condition the AssetManager would revert on is checked here first, because by the time
 * it reverts the XRP is settled at the Core Vault and the gas is spent.
 */

const ZERO_ADDRESS = /^0x0{40}$/i

const sameAddress = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()
const sameBytes = (a: string, b: string): boolean =>
  a.replace(/^0x/, '').toLowerCase() === b.replace(/^0x/, '').toLowerCase()

export interface SelfRelayBinding {
  /** Exactly what goes to the verifier. `proofOwner` is the binding. */
  readonly request: XrpPaymentInput
  readonly notes: readonly string[]
}

/**
 * Bind the attestation request to the account that will relay it.
 *
 * The zero address is refused. It is not the contract refusing — `proofOwner == address(0)`
 * passes `verifyProofOwnership` and lets anybody submit. It is this kit refusing to request a
 * proof it cannot claim as its own, because the entire reason to self-relay is to know the
 * outcome rather than to watch for it.
 */
export function bindProofToRelayer(input: {
  readonly transactionId: string
  readonly relayer: string
}): SelfRelayBinding {
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.relayer) || ZERO_ADDRESS.test(input.relayer)) {
    throw new FlareKitError('INVALID_PROOF_OWNER', {
      domain: 'input',
      message: ZERO_ADDRESS.test(input.relayer)
        ? 'A proof owner of the zero address can be submitted by anyone. Bind the request to the account that will relay it.'
        : 'The relayer must be a 20-byte EVM address.',
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }

  return {
    request: {
      transactionId: input.transactionId,
      // Lower-cased to match what the verifier attests, so the request we price and submit is
      // byte-identical to the one that comes back inside the proof.
      proofOwner: input.relayer.toLowerCase(),
    },
    notes: [
      `Only ${input.relayer} will be able to submit this proof. That is what makes the outcome ` +
        'ours to observe rather than something to wait and hope for.',
    ],
  }
}

export type SelfRelayRefusalCode =
  | 'proof_owner_mismatch'
  | 'payment_failed'
  | 'amount_not_positive'
  | 'destination_tag'
  | 'no_memo_data'
  | 'memo_mismatch'
  | 'data_missing'
  | 'data_unexpected'
  | 'data_hash_mismatch'

export interface SelfRelayRefusal {
  readonly code: SelfRelayRefusalCode
  readonly message: string
}

export interface SelfRelaySubmission {
  /** Unsigned. Nothing here signs, sends or reads. */
  readonly call: SmartAccountCall
  readonly opcode: number
  /** What the submitter must know before broadcasting. Never decoration. */
  readonly notes: readonly string[]
}

export type SelfRelayResult =
  | { readonly ok: true; readonly plan: SelfRelaySubmission }
  | { readonly ok: false; readonly refusal: SelfRelayRefusal }

export interface PlanSelfRelayInput {
  readonly assetManager: `0x${string}`
  readonly proof: XrpPaymentProof
  /** The EOA that will send the transaction. */
  readonly relayer: string
  /** The memo this operation planned, to check the attested bytes against. */
  readonly memo: `0x${string}`
  /** `0xFE` only: the bytes the memo committed to by hash. */
  readonly executorData?: `0x${string}`
  /** The batch's total call value, arriving as one lump. Zero for every recovery opcode. */
  readonly valueWei: bigint
}

const refuse = (code: SelfRelayRefusalCode, message: string): SelfRelayResult => ({
  ok: false,
  refusal: { code, message },
})

/**
 * The gate between a retrieved proof and a broadcast, plus the call it authorises.
 *
 * Which AssetManager function to call is derived from the memo's own opcode and is not a
 * caller's choice: `executeDirectMintingWithData` is `only allowed for minting to smart
 * accounts` and exists to deliver `0xFE`'s committed bytes. Everything else — `0xFF` inline,
 * and all five recovery opcodes, which ride on ordinary direct-mint payments too — goes
 * through `executeDirectMinting`.
 */
export function planSelfRelay(input: PlanSelfRelayInput): SelfRelayResult {
  const { proof, memo } = input
  const body = proof.data.responseBody
  const notes: string[] = []

  // 1. Can we submit this at all? `OnlyProofOwner` is the one revert that is purely about
  //    identity, and it costs a full transaction's gas to discover on chain.
  const proofOwner = proof.data.requestBody.proofOwner
  if (ZERO_ADDRESS.test(proofOwner)) {
    notes.push(
      'This proof names no owner, so anyone holding it can submit it. Whoever lands first ' +
        'executes the instruction; a later submission reverts PaymentAlreadyConfirmed.',
    )
  } else if (!sameAddress(proofOwner, input.relayer)) {
    return refuse(
      'proof_owner_mismatch',
      `This proof is bound to ${proofOwner} and would be submitted by ${input.relayer}. ` +
        'The AssetManager accepts only the named owner, so this transaction would revert ' +
        'OnlyProofOwner with its gas spent. Request a new attestation naming the submitting ' +
        'account — the XRPL payment is unchanged and can be attested again.',
    )
  }

  // 2. The destination tag, refused a SECOND time here. The plan gate already refuses to
  //    construct a tagged payment; this catches a tag that arrived by any other route. The
  //    AssetManager forbids only the core-vault donation tag, so a different registered tag
  //    passes on chain, redirects the mint to the tag holder and discards the memo entirely
  //    (`DirectMintingFacet.sol:311-320`). Submitting spends the payment and runs nothing.
  if (body.hasDestinationTag) {
    return refuse(
      'destination_tag',
      `The attested payment carries destination tag ${body.destinationTag}. A registered tag ` +
        'redirects the mint to the tag holder and discards the memo, so this proof must not be ' +
        'submitted. There is no override.',
    )
  }

  // 3. What the proof says about the payment. Each of these is a revert with the gas spent.
  if (body.status !== 0n) {
    return refuse(
      'payment_failed',
      `The attested XRPL payment has status ${body.status}; only 0 is a success. It reverts ` +
        'PaymentFailed and no amount of retrying changes what the ledger recorded.',
    )
  }
  if (body.receivedAmount <= 0n) {
    return refuse(
      'amount_not_positive',
      'The attested payment delivered nothing to the Core Vault, so there is nothing to mint ' +
        'against and it reverts AmountNotPositive.',
    )
  }

  // 4. The memo. Relaying a proof whose memo is not ours would execute somebody else's
  //    instruction under our gas and our proof ownership.
  if (!body.hasMemoData || sameBytes(body.firstMemoData, '0x')) {
    return refuse(
      'no_memo_data',
      'The attested payment carries no memo, so it would mint but dispatch no instruction.',
    )
  }
  if (!sameBytes(body.firstMemoData, memo)) {
    return refuse(
      'memo_mismatch',
      'The memo the FDC attested is not the memo this operation planned. Submitting would ' +
        'execute an instruction the plan never showed anyone.',
    )
  }

  // `decodeMemo` re-checks the exact length for every opcode, which is where a memo one byte
  // off is caught — the controller's lengths are equalities, not minimums.
  const decoded = decodeMemo(memo)
  const withData = decoded.opcode === MEMO_OPCODE.userOperationWithData

  // 5. The custom-data channel. `keccak256(_data)` is compared BEFORE the decode
  //    (`MemoInstructions.sol:44-48`), which makes a mismatch the one failure on this path
  //    reportable by name — and it is free to check here, so it is checked here.
  if (withData) {
    if (!input.executorData) {
      return refuse(
        'data_missing',
        'A 0xFE memo carries only a hash. Without the bytes it commits to, the operation ' +
          'cannot be decoded and the mint reverts after the payment has settled.',
      )
    }
    if (!sameBytes(keccak256(input.executorData), decoded.payload ?? '0x')) {
      return refuse(
        'data_hash_mismatch',
        'These bytes do not hash to the commitment in the memo. The controller checks the hash ' +
          'before decoding and reverts CustomInstructionHashMismatch.',
      )
    }
  } else if (input.executorData) {
    return refuse(
      'data_unexpected',
      `A 0x${decoded.opcode.toString(16).toUpperCase()} memo carries everything it needs. The ` +
        'controller ignores supplied data for it, so sending any would pay calldata gas for ' +
        'bytes nothing reads.',
    )
  }

  notes.push(
    'A mined receipt is not yet a mint: a rate-limited direct mint refunds the value and ' +
      'returns without reverting, which looks like success and mints nothing. The outcome is ' +
      'read from the events, never from the receipt status.',
  )
  if (input.valueWei > 0n) {
    notes.push(
      `This call attaches ${input.valueWei} wei for the operation's own calls. If the mint is ` +
        'delayed, the AssetManager returns it to the submitting account.',
    )
  }

  return {
    ok: true,
    plan: {
      opcode: decoded.opcode,
      notes,
      call: {
        address: input.assetManager,
        abi: directMintingAbi as unknown as Abi,
        functionName: withData ? 'executeDirectMintingWithData' : 'executeDirectMinting',
        // `toProofStruct`, not a second transcription of the same tuple. M1 has used it to
        // call `executeDirectMinting` since the first live mint; the encoding this path needs
        // is the encoding that path already proved.
        args: withData ? [toProofStruct(proof), input.executorData] : [toProofStruct(proof)],
        value: input.valueWei,
      },
    },
  }
}
