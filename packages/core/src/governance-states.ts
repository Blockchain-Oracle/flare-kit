// packages/core/src/governance-states.ts
import { zeroAddress } from 'viem'
import { advance, reconcileTo, waitSince } from './reconcile.js'
import type { GovernanceIntent, GovernanceOperation } from './governance.js'

/**
 * The durable governance-delegation reconciler (M12). A broadcast delegate / undelegate
 * transaction is only `submitted`; the OUTCOME is chain state (`getDelegateOfAtNow`), not
 * the transaction receipt — so on app open the hook re-reads the delegate and this function
 * advances the operation. There is no Resume button.
 *
 * It reuses the EXISTING canonical states (no new identifier, R-LIFE-001 — the same call
 * M3/M7/M8/M9/M10 made): a submitted op the chain does not yet reflect is `awaiting_external`
 * with actor `flare`; the op reaches `succeeded` ONLY when the pure read REFLECTS THE INTENT
 * (the delegate target for a delegate, the zero address for an undelegate) — mirroring
 * `reconcileDelegation`. Every hop walks the table via `reconcileTo` — which silently drops
 * nothing on an illegal jump — and the terminal advances the whole spine `done` AND clears
 * `awaiting`, so a settled op stops claiming it waits on somebody (the M8 terminal-reconcile
 * lesson).
 *
 * A read that does not yet reflect the intent stays `awaiting_external`: it is NEVER
 * `succeeded` from the submission and NEVER `failed` from a not-yet-reflecting read (M10
 * honesty — an unknown outcome is not a failure). The record carries the `GovernanceIntent`,
 * so the delegate target is read off `op.intent` rather than passed separately.
 */
export function reconcileGovernance(
  op: GovernanceOperation,
  reads: { delegate: `0x${string}` },
  now: number,
): GovernanceOperation {
  const intent = op.intent
  const n = op.steps.length

  // The ONLY path to succeeded: the getDelegateOfAtNow read reflects the submitted intent.
  if (intentReflected(reads, intent)) {
    return reconcileTo(op, 'succeeded', now, { steps: advance(op, now, n, 'done'), awaiting: undefined })
  }

  // Absence of the reflected intent is IN-FLIGHT: the tx is submitted and Flare is recording
  // it — awaiting_external, never succeeded from the submission alone.
  return reconcileTo(op, 'awaiting_external', now, {
    steps: advance(op, now, Math.max(0, n - 1), 'active'),
    awaiting: {
      actor: 'flare',
      reason: awaitingReason(intent),
      since: waitSince(op, now, 'flare'),
    },
  })
}

/**
 * The per-intent terminal check: the ONE condition under which the `getDelegateOfAtNow` read
 * proves the intent landed. Anything short of it keeps the op `awaiting_external`, never
 * `succeeded`. The read-back is checksummed and the intent target may be lower-case, so the
 * delegate comparison is case-insensitive (mirroring delegation-states' `hasDelegate`).
 */
function intentReflected(reads: { delegate: `0x${string}` }, intent: GovernanceIntent): boolean {
  if (intent.kind === 'undelegate') {
    // getDelegateOfAtNow returns the zero address once the delegation is cleared.
    return reads.delegate.toLowerCase() === zeroAddress
  }
  // delegate: the read-back equals the intent target (case-insensitive).
  return intent.to !== undefined && reads.delegate.toLowerCase() === intent.to.toLowerCase()
}

function awaitingReason(intent: GovernanceIntent): string {
  return intent.kind === 'delegate'
    ? 'Flare is recording your governance delegation.'
    : 'Flare is clearing your governance delegation.'
}
