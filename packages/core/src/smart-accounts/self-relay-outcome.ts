import {
  ALREADY_SETTLED_ERRORS,
  UNAVAILABLE_ERRORS,
  WAIT_ERRORS,
} from '@flare-kit/contracts'
import type { MemoObservation } from './memo-states.js'

/**
 * What the submission actually did (M14-R10, second half).
 *
 * Two readings, and neither is allowed to invent an outcome:
 *
 * - A REVERT carries a named reason, and one of those names is not a failure at all.
 *   `PaymentAlreadyConfirmed` means the payment was consumed — by a third party racing us, or
 *   by our own earlier submission. Self-relay makes the race rarer, not impossible, and a
 *   flow that rendered it as failed would be reporting the opposite of what happened.
 * - A MINED RECEIPT decides nothing by its status. `_executeDirectMinting` refunds `msg.value`
 *   and `return`s when rate-limited (`DirectMintingFacet.sol:135-139`), so the most convincing
 *   disguise a non-event wears in this whole protocol is a successful receipt. The events
 *   decide.
 *
 * Every timestamp crossing this boundary is converted from the contract's SECONDS to the
 * milliseconds every clock in core uses. Carried raw, a 2026 delay window compares against
 * `Date.now()` as 1970 and a surface announces a wait that has not started.
 */

/** Seconds on chain, milliseconds everywhere in core. The conversion is not optional. */
const toMillis = (seconds: bigint | number): number => Number(seconds) * 1000

export type SelfRelayOutcome =
  | { readonly kind: 'executed'; readonly personalAccount: string; readonly nonce: bigint }
  | { readonly kind: 'delayed'; readonly executionAllowedAt: number }
  | { readonly kind: 'payment-too-small'; readonly reason: string }
  | { readonly kind: 'already-confirmed'; readonly reason: string }
  | { readonly kind: 'wait'; readonly error: string; readonly reason: string; readonly availableAt?: number }
  | { readonly kind: 'unavailable'; readonly error: string; readonly reason: string }
  | { readonly kind: 'refused'; readonly error: string; readonly reason: string }
  | { readonly kind: 'unknown'; readonly reason: string }

/**
 * Why each named refusal happened, in the words a payer needs.
 *
 * Absent from this table means absent from the transcription, which is `unknown` — never
 * `failed`. A name we cannot explain is not a licence to guess at the outcome.
 */
const REASONS: Readonly<Record<string, string>> = {
  DirectMintingStillDelayed:
    'The mint is inside the protocol’s delay window. Nothing was minted and your instruction ' +
    'has not run. The SAME proof is submitted again when the window opens — do not pay again.',
  InvalidExecutor:
    'Another executor holds the exclusive right to complete this mint for a short period. If ' +
    'it does not, you will be able to submit again yourself.',
  DirectMintingNotUnblocked:
    'Governance has not unblocked delayed mintings. Your payment and its proof keep.',
  MissingMintingTagManager:
    'Direct minting is not fully configured on this network. Nothing you did, and nothing you ' +
    'can do — your payment and its proof remain valid.',
  MissingSmartAccountManager:
    'Smart-account minting is not fully configured on this network. Your payment and its proof ' +
    'remain valid.',
  OnlyProofOwner:
    'This proof is bound to a different account. Request a new attestation naming the account ' +
    'that will submit it — the XRPL payment is unchanged and can be attested again.',
  PaymentFailed: 'The XRPL payment itself did not succeed, so there is nothing to mint against.',
  InvalidChain: 'The proof attests a different chain from the one this AssetManager serves.',
  LegalPaymentNotProven:
    'This network’s FDC verification did not accept the proof. It may belong to a round this ' +
    'deployment cannot verify.',
  InvalidReceivingAddress: 'The payment did not reach the Core Vault’s underlying address.',
  AmountNotPositive: 'The attested payment delivered nothing.',
  CustomInstructionHashMismatch:
    'The supplied bytes do not hash to the commitment in the memo, so the operation could not ' +
    'be decoded. The payment is settled and unspent — recover it with a 0xE0 skip-memo payment.',
  InvalidNonce:
    'The account’s nonce moved after this operation was built, so it can never dispatch. The ' +
    'payment is settled and unspent — recover it with a 0xE0 skip-memo payment.',
  InvalidSender:
    'The operation names a different account from the one this payment derives. Recover the ' +
    'payment with a 0xE0 skip-memo.',
  InvalidMemoData:
    'The controller refused the memo’s length. Recover the payment with a 0xE0 skip-memo, ' +
    'which is checked before any memo validation and works on a memo too malformed to parse.',
  InvalidInstructionId:
    'The controller does not dispatch this opcode. Recover the payment with a 0xE0 skip-memo.',
  WrongExecutor:
    'This account has an executor pinned and it is not the submitting account. Either that ' +
    'executor relays, or a 0xD1 payment unpins it; the payment can also be recovered with 0xE0.',
  InsufficientAmountForFee:
    'What reached the controller did not cover the memo’s own executor fee. Recover the ' +
    'payment with a 0xE0 skip-memo.',
  CallFailed:
    'A call inside the operation reverted, which unwound the mint with the payment still ' +
    'settled. Recover it with a 0xE0 skip-memo payment, then fix the call.',
}

const has = (names: readonly string[], name: string): boolean => names.includes(name)

/**
 * Read a revert.
 *
 * `errorName` is whatever viem decoded from the revert data against the AssetManager ABI —
 * `undefined` when it could not be decoded at all, which is `unknown` and never `failed`.
 */
export function classifySelfRelayRevert(
  errorName: string | undefined,
  args?: readonly unknown[],
): SelfRelayOutcome {
  if (!errorName) {
    return {
      kind: 'unknown',
      reason:
        'The transaction reverted with data this build cannot decode. Whether the mint ' +
        'happened is unknown until the chain is read back.',
    }
  }

  if (has(ALREADY_SETTLED_ERRORS, errorName)) {
    return {
      kind: 'already-confirmed',
      reason:
        'This payment has already been confirmed — either by our own earlier submission, or by ' +
        'a third party who got there first. That is a normal condition on an open protocol, ' +
        'not a failure. What the instruction did is read back from the chain.',
    }
  }

  const reason = REASONS[errorName]

  if (has(WAIT_ERRORS, errorName)) {
    // `DirectMintingStillDelayed(uint256 allowedAt)` is the only one of these carrying a
    // deadline, so a surface can state when rather than showing an open-ended wait.
    const raw = args?.[0]
    const availableAt = typeof raw === 'bigint' || typeof raw === 'number' ? toMillis(raw) : undefined
    return {
      kind: 'wait',
      error: errorName,
      reason: reason ?? 'The protocol is not ready to execute this mint yet.',
      ...(availableAt === undefined ? {} : { availableAt }),
    }
  }

  if (has(UNAVAILABLE_ERRORS, errorName)) {
    return {
      kind: 'unavailable',
      error: errorName,
      reason: reason ?? 'The protocol is not configured to serve this mint on this network.',
    }
  }

  if (reason) return { kind: 'refused', error: errorName, reason }

  return {
    kind: 'unknown',
    reason: `The transaction reverted with ${errorName}, which this build does not explain. ` +
      'Whether the mint happened is unknown until the chain is read back.',
  }
}

/** One decoded log, in the shape viem's `decodeEventLog` returns. */
export interface RelayEvent {
  readonly eventName: string
  readonly args: Readonly<Record<string, unknown>>
}

const find = (events: readonly RelayEvent[], name: string): RelayEvent | undefined =>
  events.find((event) => event.eventName === name)

const allowedAtOf = (event: RelayEvent): number => {
  const raw = event.args.executionAllowedAt
  return typeof raw === 'bigint' || typeof raw === 'number' ? toMillis(raw) : 0
}

/**
 * Read a MINED receipt. The status is not consulted, because it cannot distinguish the three
 * outcomes below — all of them mine successfully.
 */
export function interpretSelfRelayReceipt(events: readonly RelayEvent[]): SelfRelayOutcome {
  // The burn first. The system fee is minted to the fee receiver BEFORE this branch emits, so
  // a burned payment's receipt can carry a mint event too; reading the mint event first would
  // report a mint to a user who received nothing.
  const burned = find(events, 'DirectMintingPaymentTooSmallForFee')
  if (burned) {
    return {
      kind: 'payment-too-small',
      reason:
        'The payment did not cover the minimum minting fee, so all of it went to the fee ' +
        'receiver and your instruction never ran. There is no mechanism that recovers this.',
    }
  }

  const delayed = find(events, 'DirectMintingDelayed') ?? find(events, 'LargeDirectMintingDelayed')
  if (delayed) {
    return { kind: 'delayed', executionAllowedAt: allowedAtOf(delayed) }
  }

  const executed = find(events, 'UserOperationExecuted')
  if (executed) {
    return {
      kind: 'executed',
      personalAccount: String(executed.args.personalAccount),
      nonce: typeof executed.args.nonce === 'bigint' ? executed.args.nonce : 0n,
    }
  }

  return {
    kind: 'unknown',
    reason:
      'The transaction mined but carried no event this build recognises. A mined receipt is ' +
      'not a mint, so the outcome stays unknown until the chain is read back.',
  }
}

/**
 * Fold an outcome into the lifecycle's observation (M14-R8).
 *
 * `base` carries what the operation already knows — the XRPL payment, that a proof was
 * retrieved, the relay hash. The outcome only contributes what it PROVES, and it never
 * contributes `effectObserved`: `succeeded` requires the instruction's own observable
 * consequence, which is a separate read against the chain and not this function's to assert.
 */
export function toMemoObservation(
  outcome: SelfRelayOutcome,
  base: MemoObservation = {},
): MemoObservation {
  switch (outcome.kind) {
    case 'executed':
      return {
        ...base,
        userOperationExecuted: {
          personalAccount: outcome.personalAccount,
          nonce: outcome.nonce,
        },
      }
    case 'delayed':
      return { ...base, delayed: { executionAllowedAt: outcome.executionAllowedAt } }
    case 'payment-too-small':
      return { ...base, paymentTooSmall: true }
    case 'already-confirmed':
      // The payment is consumed, and that is ALL it establishes. A below-minimum payment is
      // confirmed too and mints nothing to the payer, so this may not claim the operation ran.
      return { ...base, proofRetrieved: true }
    default:
      // A wait, an unavailability or an unknown adds no observation. The operation keeps the
      // legs it had; nothing regresses and nothing is invented.
      return base
  }
}
