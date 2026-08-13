// packages/core/src/delegation-states.ts
import type { OperationRecord } from './operation.js'
import { advance, reconcileTo, waitSince } from './reconcile.js'
import type { DelegationIntent } from './delegation.js'
import type { DelegationReads } from './delegation-adapter.js'

/**
 * The durable delegation reconciler (M10). A broadcast wrap / unwrap / delegate /
 * undelegate transaction is only `submitted`; the OUTCOME is chain state (`delegatesOf`,
 * `balanceOf`), not the transaction receipt — so on app open the hook re-reads the
 * position and this function advances the operation. There is no Resume button.
 *
 * It reuses the EXISTING canonical states (no new identifier, R-LIFE-001 — the same call
 * M3/M7/M8/M9 made): a submitted op the chain does not yet reflect is `awaiting_external`
 * with actor `flare`; the op reaches `succeeded` ONLY when a pure chain read REFLECTS THE
 * INTENT (mirroring `reconcileGaslessPayment`, whose only path to `succeeded` is the
 * confirmed on-chain transfer). Every hop walks the table via `reconcileTo` — which
 * silently drops nothing on an illegal jump — and the terminal advances the whole spine
 * `done` AND clears `awaiting`, so a settled op stops claiming it waits on somebody (the
 * M8 terminal-reconcile lesson).
 *
 * A read that does not yet reflect the intent stays `awaiting_external`: it is NEVER
 * `succeeded` from the submission and NEVER `failed` from a not-yet-reflecting read (M10
 * honesty — an unknown outcome is not a failure).
 */
export function reconcileDelegation<I, Q, P>(
  record: OperationRecord<I, Q, P>,
  reads: DelegationReads,
  intent: DelegationIntent,
  now: number,
): OperationRecord<I, Q, P> {
  const n = record.steps.length
  // The ONLY path to succeeded: the chain read reflects the submitted intent.
  if (intentReflected(reads, intent)) {
    return reconcileTo(record, 'succeeded', now, { steps: advance(record, now, n, 'done'), awaiting: undefined })
  }
  // Absence of the reflected intent is IN-FLIGHT: the tx is submitted and Flare is
  // recording it — awaiting_external, never succeeded from the submission alone.
  return reconcileTo(record, 'awaiting_external', now, {
    steps: advance(record, now, Math.max(0, n - 1), 'active'),
    awaiting: {
      actor: 'flare',
      reason: awaitingReason(intent),
      since: waitSince(record, now, 'flare'),
    },
  })
}

/**
 * The per-intent terminal check: the ONE condition under which the chain read proves the
 * intent landed. Anything short of it keeps the op `awaiting_external`, never `succeeded`.
 */
function intentReflected(reads: DelegationReads, intent: DelegationIntent): boolean {
  switch (intent.kind) {
    case 'wrap':
      // The wrapped tokens appeared.
      return reads.wrappedBalance >= intent.amount
    case 'unwrap':
      // The wrapped balance no longer holds the unwrapped amount. With only the current
      // balance to look at we can positively confirm this only once the remaining balance
      // has fallen below what was unwrapped; an ambiguous larger balance stays awaiting
      // rather than claim a success we cannot see (honesty over a hopeful guess).
      return reads.wrappedBalance < intent.amount
    case 'delegate':
    case 'delegate-explicit':
      // EVERY requested provider is present in delegatesOf (matched by address).
      return intent.targets.every((target) => hasDelegate(reads, target.to))
    case 'undelegate':
      // delegatesOf is empty.
      return reads.delegates.length === 0
  }
}

/** delegatesOf comes back checksummed; an intent address may be lower-case. Match both. */
function hasDelegate(reads: DelegationReads, to: `0x${string}`): boolean {
  const target = to.toLowerCase()
  return reads.delegates.some((delegate) => delegate.address.toLowerCase() === target)
}

function awaitingReason(intent: DelegationIntent): string {
  switch (intent.kind) {
    case 'wrap':
      return 'Flare is confirming your wrap.'
    case 'unwrap':
      return 'Flare is confirming your unwrap.'
    case 'undelegate':
      return 'Flare is clearing your delegation.'
    case 'delegate':
    case 'delegate-explicit':
      return 'Flare is recording your delegation.'
  }
}
