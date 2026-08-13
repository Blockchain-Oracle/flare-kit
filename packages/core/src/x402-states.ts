// packages/core/src/x402-states.ts
import type { FlareNetworkKey } from '@flarekit-dev/contracts'
import {
  type OperationRecord,
  type OperationStep,
  type TransitionResult,
  applyTransition,
  createOperation,
} from './operation.js'
import { advance, reconcileTo, waitSince } from './reconcile.js'
import type { Authorization } from './x402-eip3009.js'
import type { X402ResourceState, X402SettlementState, X402Challenge } from './x402-client.js'

/**
 * The durable x402 lifecycle (M9-R6). x402 is the first capability whose outcome has TWO
 * independent legs on two transports: the on-chain SETTLEMENT (the facilitator tx) and
 * the HTTP RESOURCE (200 + body). They are reconciled separately and one can succeed
 * while the other fails.
 *
 * It reuses the EXISTING canonical states (no new identifier): the facilitator settling
 * is `awaiting_external` with actor `provider`; **settled + delivered → `succeeded`**;
 * **settled + resource failed → `partially_succeeded`** (the honest split — the payment
 * took, the resource did not); a rejected settlement → `failed`. `succeeded` /
 * `partially_succeeded` are entered ONLY from the observed settlement + resource, never
 * from the `402` alone. Every hop walks the table (`reconcileTo`); a terminal finalizes
 * the spine and clears `awaiting`.
 */

export interface X402Intent {
  readonly network: FlareNetworkKey
  readonly resource: string
}

export interface X402Plan {
  readonly challenge: X402Challenge
  readonly authorization: Authorization
}

export type X402Operation = OperationRecord<X402Intent, undefined, X402Plan>

export function createX402(input: { chainId: number; intent: X402Intent; now: number; id?: string }): X402Operation {
  const op = createOperation<X402Intent, undefined, X402Plan>({
    capability: 'x402',
    network: input.chainId,
    intent: input.intent,
    now: input.now,
    ...(input.id ? { id: input.id } : {}),
  })
  return applyTransition(op, { to: 'awaiting_input', at: input.now, patch: {} }).record
}

/** The x402 spine: sign the authorization (your_wallet), then the facilitator settles (provider). */
function x402Steps(): OperationStep[] {
  return [
    { id: 'sign', type: 'sign_authorization', actor: 'your_wallet', state: 'pending', attempts: 0 },
    { id: 'settle', type: 'settle_and_fetch', actor: 'provider', state: 'pending', attempts: 0 },
  ]
}

/**
 * Move a received challenge into `ready` (the authorization is signable). An EXPIRED
 * challenge has nothing to sign — it returns to `awaiting_input`; the surface renders
 * `expired`, not a valid challenge.
 */
export function applyX402Challenge(
  record: X402Operation,
  input: { plan: X402Plan; now: number },
): TransitionResult<X402Intent, undefined, X402Plan> {
  if (input.now >= input.plan.challenge.expiresAt) {
    return applyTransition(record, { to: 'awaiting_input', at: input.now, patch: {} })
  }
  return applyTransition(record, {
    to: 'ready',
    at: input.now,
    patch: { plan: input.plan, steps: x402Steps() },
  })
}

export function reconcileX402<I, Q, P>(
  record: OperationRecord<I, Q, P>,
  settlement: X402SettlementState,
  resource: X402ResourceState,
  now: number,
): OperationRecord<I, Q, P> {
  const n = record.steps.length
  // A rejected settlement — the payment did not take. `failed`, never partial.
  if (settlement.kind === 'rejected') {
    return reconcileTo(record, 'failed', now, { steps: advance(record, now, Math.max(0, n - 1), 'failed'), awaiting: undefined })
  }
  if (settlement.kind === 'settled') {
    // Settled + delivered — the ONLY path to succeeded.
    if (resource.kind === 'delivered') {
      return reconcileTo(record, 'succeeded', now, { steps: advance(record, now, n, 'done'), awaiting: undefined })
    }
    // Settled but the resource FAILED — the payment took, the resource did not.
    if (resource.kind === 'failed') {
      return reconcileTo(record, 'partially_succeeded', now, { steps: advance(record, now, Math.max(0, n - 1), 'failed'), awaiting: undefined })
    }
    // Settled, resource not yet delivered — awaiting the provider's resource.
    return reconcileTo(record, 'awaiting_external', now, {
      steps: advance(record, now, Math.max(0, n - 1), 'active'),
      awaiting: { actor: 'provider', reason: 'Payment settled — awaiting the resource delivery.', since: waitSince(record, now, 'provider') },
    })
  }
  // Settlement pending — the facilitator is settling. Never succeeded from here.
  return reconcileTo(record, 'awaiting_external', now, {
    steps: advance(record, now, Math.max(0, n - 1), 'active'),
    awaiting: { actor: 'provider', reason: 'Facilitator settling the payment.', since: waitSince(record, now, 'provider') },
  })
}
