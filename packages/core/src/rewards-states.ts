// packages/core/src/rewards-states.ts
import type { OperationRecord } from './operation.js'
import { advance, reconcileTo, waitSince } from './reconcile.js'

/**
 * The durable claim reconciler (M10). A broadcast FTSO / RNat / FlareDrop claim is only
 * `submitted`; the OUTCOME is chain state (the reward transfer / the reflected balance),
 * not the transaction receipt — so on app open the hook re-reads the confirmation and this
 * function advances the operation. There is no Resume button.
 *
 * It reuses the EXISTING canonical states (no new identifier, R-LIFE-001 — the same call
 * M3/M7/M8/M9 and M10's delegation reconciler made): a submitted claim the chain does not
 * yet confirm is `awaiting_external` with actor `flare`; the claim reaches `succeeded` ONLY
 * from a CONFIRMED on-chain read (mirroring `reconcileGaslessPayment`, whose only path to
 * `succeeded` is the confirmed transfer). Every hop walks the table via `reconcileTo` —
 * which drops nothing on an illegal jump — and the terminal advances the whole spine `done`
 * AND clears `awaiting`, so a settled claim stops claiming it waits on somebody.
 *
 * An unconfirmed read stays `awaiting_external`: NEVER `succeeded` from the submission and
 * NEVER `failed` from an unconfirmed read (M10 honesty — an unknown outcome is not a
 * failure).
 */
export function reconcileClaim<I, Q, P>(
  record: OperationRecord<I, Q, P>,
  confirmed: boolean,
  now: number,
): OperationRecord<I, Q, P> {
  const n = record.steps.length
  // The ONLY path to succeeded: a confirmed on-chain read of the claim.
  if (confirmed) {
    return reconcileTo(record, 'succeeded', now, { steps: advance(record, now, n, 'done'), awaiting: undefined })
  }
  // Absence of a confirmation is IN-FLIGHT: the claim is submitted and Flare is confirming
  // it — awaiting_external, never succeeded from the submission alone.
  return reconcileTo(record, 'awaiting_external', now, {
    steps: advance(record, now, Math.max(0, n - 1), 'active'),
    awaiting: {
      actor: 'flare',
      reason: 'Flare is confirming your claim.',
      since: waitSince(record, now, 'flare'),
    },
  })
}
