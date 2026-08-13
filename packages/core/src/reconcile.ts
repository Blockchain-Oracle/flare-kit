// packages/core/src/reconcile.ts
import { type OperationPatch, type OperationRecord, advanceSteps, applyTransition } from './operation.js'
import { type OperationState, type StepActor, pathTo } from './states.js'

/**
 * The shared lifecycle-reconcile helpers (M9-R13), extracted from `bridge-states.ts`
 * so the bridge, gasless and x402 reconcilers share ONE table-walking implementation.
 *
 * Every durable reconcile has the same hazard and the same answer: `applyTransition`
 * SILENTLY DROPS its patch on an illegal hop, so a reconcile that jumps states loses
 * its step/awaiting updates with no error and no failing test. `reconcileTo` walks the
 * legal transition table breadth-first (`pathTo`), applying the patch at every hop
 * (including a same-state reconcile, which makes it idempotent). Homing this here means
 * that rule is enforced in exactly one place across every capability.
 */

/** Walk `record` to `target` along the legal table, applying `patch` at every hop. */
export function reconcileTo<I, Q, P>(
  record: OperationRecord<I, Q, P>,
  target: OperationState,
  now: number,
  patch: OperationPatch<Q, P>,
): OperationRecord<I, Q, P> {
  let current = record
  for (const next of pathTo(record.state, target)) {
    current = applyTransition<I, Q, P>(current, { to: next, at: now, patch }).record
  }
  if (current.state === target) {
    current = applyTransition<I, Q, P>(current, { to: target, at: now, patch }).record
  }
  return current
}

/**
 * When THIS leg's wait began. Preserved across re-reconciles of the same leg (so
 * `since` is not reset each read), but reset when the awaited actor changes — a new leg
 * is a genuinely new wait, and each leg's duration should read independently.
 */
export function waitSince(record: OperationRecord, now: number, actor: StepActor): number {
  return record.state === 'awaiting_external' && record.awaiting?.actor === actor ? record.awaiting.since : now
}

/** The spine progress for a leg: `done` leading steps finished, the next `current`. */
export function advance(
  record: OperationRecord,
  now: number,
  done: number,
  current: 'active' | 'done' | 'failed',
) {
  return advanceSteps(record.steps, { done, current }, now)
}
