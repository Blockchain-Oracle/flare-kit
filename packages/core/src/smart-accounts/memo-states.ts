import type { OperationRecord, OperationStep } from '../operation.js'
import { advance, reconcileTo, waitSince } from '../reconcile.js'

/**
 * The memo instruction's durable lifecycle (M14-R8).
 *
 * ```
 * xrpl ──────► fdc ───────────► flare ──────────► effect
 * payment      XRPPayment       the relay we      the account
 * validates    round + proof    submit ourselves  actually did it
 * ```
 *
 * Four legs, like M13's — but with one state M13 had no need for, and it is the whole reason
 * this file exists rather than reusing `states.ts`:
 *
 * **A rate-limited mint MINES SUCCESSFULLY AND MINTS NOTHING.** `_executeDirectMinting`
 * refunds `msg.value` and `return`s without reverting (`DirectMintingFacet.sol:135-139`). The
 * receipt says success. No FAssets exist, `handleMintedFAssets` was never called, and the memo
 * never ran. A reconciler that read a mined receipt as a completed mint would report something
 * that did not happen — the exact failure this project's rules exist to prevent, wearing an
 * unusually convincing disguise.
 *
 * So `delayed` is carried as a WAIT with a known end (`executionAllowedAt`), retryable with
 * the SAME proof. Prompting the user for a second XRPL payment there is the documented
 * anti-pattern: the proof is still valid and the mint is still owed.
 *
 * `succeeded` still requires BOTH the `UserOperationExecuted` event and the instruction's own
 * observable consequence, exactly as M13.
 */

/** The four steps this reconciler walks, in order. Indexed off `steps.length` below. */
export function memoSpine(): OperationStep[] {
  return [
    { id: 'xrpl-payment', type: 'pay_core_vault', actor: 'your_wallet', state: 'pending', attempts: 0 },
    { id: 'attestation', type: 'await_xrp_payment_proof', actor: 'fdc', state: 'pending', attempts: 0 },
    { id: 'relay', type: 'execute_direct_minting', actor: 'flare', state: 'pending', attempts: 0 },
    { id: 'effect', type: 'await_instruction_effect', actor: 'flare', state: 'pending', attempts: 0 },
  ]
}

export interface MemoObservation {
  /** The XRPL payment, once validated on the ledger. */
  readonly xrplPayment?: { readonly transactionId: string }
  /** True once an `XRPPayment` proof has been retrieved. */
  readonly proofRetrieved?: boolean
  /** The relay transaction we submitted, once it is on chain. */
  readonly relayHash?: string
  /**
   * The mint was rate-limited. The relay MINED — this is not a failure and not a success, and
   * the same proof is used again after `executionAllowedAt`.
   */
  readonly delayed?: { readonly executionAllowedAt: number }
  /**
   * The payment did not cover the minimum minting fee, so it was consumed entirely by the fee
   * receiver and the memo never ran. Terminal, and nothing is recoverable.
   */
  readonly paymentTooSmall?: boolean
  /** The decoded `UserOperationExecuted`, once read back. */
  readonly userOperationExecuted?: { readonly personalAccount: string; readonly nonce: bigint }
  /**
   * Whether the operation's own consequence was observed. `undefined` is "not looked at yet",
   * which is NOT `false`; only an explicit `true` can complete the operation.
   */
  readonly effectObserved?: boolean
}

export interface MemoClock {
  readonly now: number
}

export function reconcileMemoInstruction<I, Q, P>(
  record: OperationRecord<I, Q, P>,
  observation: MemoObservation,
  clock: MemoClock,
): OperationRecord<I, Q, P> {
  const n = record.steps.length
  const { now } = clock

  // The ONLY path to succeeded: the operation ran AND its effect is real.
  if (observation.userOperationExecuted && observation.effectObserved === true) {
    return reconcileTo(record, 'succeeded', now, {
      steps: advance(record, now, n, 'done'),
      awaiting: undefined,
    })
  }

  // A burn. Terminal and NOT retryable: everything went to the fee receiver, nothing was
  // minted, and no opcode recovers it. `failed` rather than `expired` because no window
  // closed — the payment was simply too small to do anything.
  if (observation.paymentTooSmall) {
    return reconcileTo(record, 'failed', now, {
      steps: advance(record, now, 1, 'failed'),
      awaiting: undefined,
    })
  }

  const leg = (
    actor: 'xrpl' | 'fdc' | 'flare',
    reason: string,
    done: number,
    availableAt?: number,
  ) =>
    reconcileTo(record, 'awaiting_external', now, {
      steps: advance(record, now, done, 'active'),
      awaiting: {
        actor,
        reason,
        since: waitSince(record, now, actor),
        ...(availableAt === undefined ? {} : { availableAt }),
      },
    })

  // Rate-limited. The relay mined and did nothing; the wait has a known end and the SAME
  // proof is resubmitted then.
  if (observation.delayed) {
    return leg(
      'flare',
      'The mint hit a rate limit and was delayed. Nothing was minted and your instruction has ' +
        'not run — the same proof is submitted again when the window opens. Do not pay again.',
      Math.max(0, n - 2),
      observation.delayed.executionAllowedAt,
    )
  }

  if (observation.userOperationExecuted) {
    return leg('flare', 'Your instruction ran. Confirming what it actually did.', Math.max(0, n - 1))
  }
  if (observation.relayHash) {
    return leg(
      'flare',
      'The mint is submitted. A mined transaction is not yet a mint — confirming it landed.',
      Math.max(0, n - 2),
    )
  }
  if (observation.proofRetrieved) {
    return leg('flare', 'Proof retrieved. Ready to submit the mint.', Math.max(0, n - 2))
  }
  if (observation.xrplPayment) {
    return leg(
      'fdc',
      'Waiting for the attestation round to finalize and the proof to be retrievable.',
      Math.max(0, n - 3),
    )
  }
  return leg('xrpl', 'Waiting for your XRPL payment to validate.', 0)
}
