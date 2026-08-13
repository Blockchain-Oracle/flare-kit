// packages/core/src/gasless-states.ts
import type { OperationRecord } from './operation.js'
import { advance, reconcileTo, waitSince } from './reconcile.js'
import type { GaslessTransferState } from './gasless-adapter.js'

/**
 * The durable gasless reconciler (M9-R3). The relayer submits the payment on the
 * payer's behalf, so — like the bridge's cross-chain delivery — the outcome is CHAIN
 * state, not session state: on app open the hook re-reads `paymentSince` and this
 * function advances the operation. There is no Resume button.
 *
 * It reuses the EXISTING canonical states (no new identifier, per R-LIFE-001 — the same
 * call M3/M7/M8 made): the relayer submitting is `awaiting_external` with actor
 * `relayer`; the confirmed on-chain FXRP transfer is `succeeded`. `succeeded` is entered
 * ONLY from `transfer.kind === 'confirmed'` — the relayer's HTTP 200 (which put the op
 * in `submitted`) NEVER advances it. Every hop walks the table (`reconcileTo`), and the
 * terminal finalizes the spine steps AND clears `awaiting`, so a settled op stops
 * claiming it waits on somebody (the M8 terminal-reconcile lesson).
 */
export function reconcileGaslessPayment<I, Q, P>(
  record: OperationRecord<I, Q, P>,
  transfer: GaslessTransferState,
  now: number,
): OperationRecord<I, Q, P> {
  const n = record.steps.length
  // The ONLY path to succeeded: the FXRP transfer observed on-chain (PaymentExecuted).
  if (transfer.kind === 'confirmed') {
    return reconcileTo(record, 'succeeded', now, { steps: advance(record, now, n, 'done'), awaiting: undefined })
  }
  // Absence is IN-FLIGHT: the relayer accepted the job (submitted) and is submitting
  // on-chain — awaiting_external, never succeeded from the relayer response alone.
  return reconcileTo(record, 'awaiting_external', now, {
    steps: advance(record, now, Math.max(0, n - 1), 'active'),
    awaiting: {
      actor: 'relayer',
      reason: 'Relayer submitting your payment on-chain.',
      since: waitSince(record, now, 'relayer'),
    },
  })
}
