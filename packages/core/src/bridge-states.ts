// packages/core/src/bridge-states.ts
import type { OperationRecord } from './operation.js'
import { advance, reconcileTo, waitSince } from './reconcile.js'
import type { DeliveryState, RedemptionState, SettlementState } from './bridge-adapter.js'

/**
 * The durable cross-chain reconcilers (M8-R3). Delivery lives on a DIFFERENT chain
 * than the signature, so state is chain state, not session state: on app open the
 * hook re-reads the destination and these functions advance the operation. There is
 * no Resume button.
 *
 * They reuse the EXISTING canonical states — a bridge is `submitted →
 * awaiting_external → succeeded`; the redeem's external legs (LayerZero delivery to
 * the composer, the FAssets redemption, then XRPL settlement) are `awaiting_external`
 * phases distinguished only by the `awaiting` descriptor a same-state patch rewrites.
 * No new state identifier is invented (R-LIFE-001), the same call the M3 FDC proof
 * wait and the M7 vault delayed claim make.
 *
 * Every hop walks the transition table breadth-first (`pathTo`) — the
 * `applyTransition` silent-drop hazard: an illegal jump drops its patch with no
 * error. Each reconcile ALSO advances the spine steps (so a delivered op's delivery
 * row reads `done`, not the "outcome unknown" a `pending` row draws) and CLEARS the
 * `awaiting` descriptor on a terminal (so a settled op stops claiming it waits on
 * somebody). DELIVERED / SUCCEEDED is entered ONLY from a destination read; `failed`
 * only from a real FAssetRedeemFailed; an unknown outcome is neither.
 */

/**
 * Reconcile a submitted plain BRIDGE against the destination chain. A source receipt
 * only proves the message was SENT — the op sits in `awaiting_external` until the
 * destination read confirms delivery, and only then reaches `succeeded`.
 */
export function reconcileDelivery<I, Q, P>(
  record: OperationRecord<I, Q, P>,
  delivery: DeliveryState,
  now: number,
): OperationRecord<I, Q, P> {
  const n = record.steps.length
  if (delivery.kind === 'delivered') {
    return reconcileTo(record, 'succeeded', now, { steps: advance(record, now, n, 'done'), awaiting: undefined })
  }
  return reconcileTo(record, 'awaiting_external', now, {
    steps: advance(record, now, Math.max(0, n - 1), 'active'),
    awaiting: {
      actor: 'executor',
      reason: 'Waiting for LayerZero to deliver on the destination chain.',
      since: waitSince(record, now, 'executor'),
    },
  })
}

/**
 * Reconcile a submitted cross-chain REDEEM: three async legs, each `awaiting_external`
 * and distinguished only by the awaited actor.
 *   1 `executor` — LayerZero delivery to the composer (delivery in-flight)
 *   2 `flare`    — the FAssets redemption is filed (delivered, redemption pending)
 *   3 `xrpl`     — the agent pays native XRP (redemption filed, XRPL not settled)
 * `succeeded` (native XRP received) comes ONLY from the XRPL settlement read — never
 * from FAssetRedeemed, which is merely the redemption REQUEST filed (M1's rule:
 * nothing is done until the protocol settles). `failed` only from a real
 * FAssetRedeemFailed; an unknown outcome is neither.
 */
export function reconcileBridgeRedeem<I, Q, P>(
  record: OperationRecord<I, Q, P>,
  delivery: DeliveryState,
  redemption: RedemptionState,
  settlement: SettlementState,
  now: number,
): OperationRecord<I, Q, P> {
  const n = record.steps.length
  // Leg 3 terminal: XRP actually landed on the XRP Ledger. The ONLY path to succeeded.
  if (settlement.kind === 'settled') {
    return reconcileTo(record, 'succeeded', now, { steps: advance(record, now, n, 'done'), awaiting: undefined })
  }
  if (redemption.kind === 'failed') {
    return reconcileTo(record, 'failed', now, { steps: advance(record, now, Math.max(0, n - 1), 'failed'), awaiting: undefined })
  }
  // Leg 3: redemption FILED on chain, agent paying XRPL — awaiting settlement, NOT done.
  if (redemption.kind === 'filed') {
    return reconcileTo(record, 'awaiting_external', now, {
      steps: advance(record, now, Math.max(0, n - 1), 'active'),
      awaiting: {
        actor: 'xrpl',
        reason: 'Redemption filed — the FAssets agent is paying native XRP to your XRPL address.',
        since: waitSince(record, now, 'xrpl'),
      },
    })
  }
  // Leg 2: delivered to the composer, awaiting the FAssets redemption to be filed.
  if (delivery.kind === 'delivered') {
    return reconcileTo(record, 'awaiting_external', now, {
      steps: advance(record, now, Math.max(0, n - 1), 'active'),
      awaiting: {
        actor: 'flare',
        reason: 'Delivered to the composer — awaiting the FAssets redemption.',
        since: waitSince(record, now, 'flare'),
      },
    })
  }
  // Leg 1: awaiting LayerZero delivery to the composer.
  return reconcileTo(record, 'awaiting_external', now, {
    steps: advance(record, now, Math.max(0, n - 2), 'active'),
    awaiting: {
      actor: 'executor',
      reason: 'Waiting for LayerZero to deliver to the composer on the destination chain.',
      since: waitSince(record, now, 'executor'),
    },
  })
}
