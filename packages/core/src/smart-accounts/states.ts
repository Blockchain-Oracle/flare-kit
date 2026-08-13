import type { OperationRecord } from '../operation.js'
import { advance, reconcileTo, waitSince } from '../reconcile.js'

/**
 * The durable instruction lifecycle — four legs, and only one way to reach `succeeded`.
 *
 * ```
 * xrpl ──────► fdc ──────────► flare ─────────► effect
 * payment      round finality  executeInstruction  the account actually did it
 * validates    + proof         submitted
 * ```
 *
 * Each leg is `awaiting_external`, distinguished by actor — the shape M3's proof wait and
 * M8's delivery wait already established, so no new canonical state is introduced
 * (`R-LIFE-001`). Every hop walks the table through `reconcileTo`, because
 * `applyTransition` SILENTLY DROPS its patch on an illegal hop.
 *
 * `succeeded` requires BOTH the decoded `InstructionExecuted` event AND the instruction's
 * observable consequence. The event alone is not enough for the same reason M8's
 * `FAssetRedeemed` was not enough: it says the controller dispatched, not that the effect
 * the user asked for is real. A caller that cannot yet observe the consequence reports
 * `effectObserved: undefined`, and the operation stays in flight rather than being dressed
 * as done.
 *
 * PROOF EXPIRY is a first-class terminal state, not a failure to retry. Past
 * `blockTimestamp + proofWindowSeconds` the controller will refuse the proof forever, while
 * the XRP has already reached the operator. The record carries where the funds are and says
 * that paying again is a NEW payment — `R-SA-008`'s "must not invite a duplicate payment".
 */

export interface InstructionObservation {
  /** The XRPL payment, once it is validated on the ledger. */
  readonly xrplPayment?: {
    readonly transactionId: string
    /** Ledger close time, in SECONDS — the instant the proof window measures from. */
    readonly blockTimestamp: bigint
  }
  /** True once an FDC proof for the payment has been retrieved. */
  readonly proofRetrieved?: boolean
  /** The `executeInstruction` transaction, once submitted. */
  readonly submissionHash?: string
  /** The decoded `InstructionExecuted` event, once read back off the chain. */
  readonly instructionExecuted?: {
    readonly personalAccount: string
    readonly transactionId: string
    readonly instructionId: number
  }
  /**
   * Whether the look for `instructionExecuted` actually succeeded.
   *
   * Without this, an absent event means two different things — "the controller has not
   * dispatched" and "the scan failed" — and `scanInstructionHistory`'s honest `undefined`
   * has nowhere to go. Set it `false` when the dispatch read could not be completed;
   * expiry then holds off rather than declaring the payment stranded.
   */
  readonly dispatchReadSucceeded?: boolean
  /**
   * Whether the instruction's own consequence was observed — the recipient's balance for a
   * transfer, the share balance for a deposit.
   *
   * `undefined` means "not looked at yet", which is NOT `false`. Only an explicit `true`
   * can complete the operation.
   */
  readonly effectObserved?: boolean
}

export interface InstructionClock {
  /** Wall clock, in milliseconds. */
  readonly now: number
  /** From `getPaymentProofValidityDurationSeconds` — read live, never assumed. */
  readonly proofWindowSeconds: bigint
}

/** The absolute instant the proof stops being usable, once the payment has landed. */
export function proofDeadlineMs(
  observation: InstructionObservation,
  proofWindowSeconds: bigint,
): number | undefined {
  const payment = observation.xrplPayment
  if (!payment) return undefined
  return Number(payment.blockTimestamp + proofWindowSeconds) * 1000
}

function expired(observation: InstructionObservation, clock: InstructionClock): boolean {
  const deadline = proofDeadlineMs(observation, clock.proofWindowSeconds)
  if (deadline === undefined || observation.instructionExecuted) return false
  // A dispatch that was SUBMITTED but whose event has not been read back is an unknown
  // outcome, not a dead one: the transaction may already be mined and successful. Declaring
  // it expired would tell a user the controller will refuse the proof forever and their XRP
  // is stranded, on the strength of a read we have not done.
  if (observation.submissionHash) return false
  // Likewise a dispatch read that FAILED. Absence of the event is only evidence of
  // non-dispatch when the look succeeded.
  if (observation.dispatchReadSucceeded === false) return false
  return clock.now > deadline
}

export function reconcileInstruction<I, Q, P>(
  record: OperationRecord<I, Q, P>,
  observation: InstructionObservation,
  clock: InstructionClock,
): OperationRecord<I, Q, P> {
  const n = record.steps.length
  const { now } = clock

  // The ONLY path to succeeded: the controller dispatched AND the effect is real.
  if (observation.instructionExecuted && observation.effectObserved === true) {
    return reconcileTo(record, 'succeeded', now, {
      steps: advance(record, now, n, 'done'),
      awaiting: undefined,
    })
  }

  // Terminal, and deliberately without a retry affordance.
  if (expired(observation, clock)) {
    return reconcileTo(record, 'expired', now, {
      steps: advance(record, now, Math.max(0, n - 1), 'failed'),
      awaiting: undefined,
    })
  }

  const leg = (actor: 'xrpl' | 'fdc' | 'flare', reason: string, done: number) =>
    reconcileTo(record, 'awaiting_external', now, {
      steps: advance(record, now, done, 'active'),
      awaiting: { actor, reason, since: waitSince(record, now, actor) },
    })

  // Dispatched, but the consequence has not been confirmed yet. Still in flight.
  if (observation.instructionExecuted) {
    return leg(
      'flare',
      'Instruction dispatched. Confirming what your account actually did.',
      Math.max(0, n - 1),
    )
  }
  if (observation.submissionHash) {
    return leg('flare', 'Submitting the proof to the controller.', Math.max(0, n - 2))
  }
  if (observation.proofRetrieved) {
    return leg('flare', 'Proof retrieved. Ready to dispatch the instruction.', Math.max(0, n - 2))
  }
  if (observation.xrplPayment) {
    return leg('fdc', 'Waiting for the attestation round to finalize and the proof to be retrievable.', Math.max(0, n - 3))
  }
  return leg('xrpl', 'Waiting for your XRPL payment to validate.', 0)
}
