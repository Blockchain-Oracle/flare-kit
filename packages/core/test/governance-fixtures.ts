import { applyTransition, createOperation, type OperationRecord, type OperationState } from '../src/operation.js'
import type { GovernanceIntent } from '../src/governance.js'

/**
 * The ONE governance-op fixture, shared by `governance-states.test.ts` and
 * `mock-governance.test.ts` (they had a verbatim copy each).
 *
 * It walks the FULL legal path `draft → quoting → ready → executing → submitted`. That is
 * load-bearing, not tidiness: `draft → executing` is NOT a legal edge (`states.ts` allows only
 * `discovering|quoting|awaiting_input|failed|cancelled|expired` out of `draft`), and
 * `applyTransition` DROPS the patch on a rejected transition. The earlier copies jumped
 * straight to `executing`, so both stranded at `draft` with `steps: []` — and every
 * `steps.every(s => s.state === 'done')` assertion written against them was VACUOUSLY true,
 * including the one guarding this codebase's named failure mode (a dropped `reconcileTo`
 * patch). Those assertions would still have passed if `reconcileGovernance` had stopped
 * advancing the spine entirely.
 *
 * `assertTransition` below is why that cannot silently recur: a rejected hop throws here
 * rather than quietly returning the unchanged record.
 */

function assertTransition<I>(record: OperationRecord<I>, to: OperationState, at: number, patch?: Record<string, unknown>) {
  const result = applyTransition(record, patch ? { to, at, patch } : { to, at })
  if (result.rejection) throw new Error(`governance fixture: illegal transition ${record.state} -> ${to} (${result.rejection})`)
  return result.record
}

/** The two-step governance spine a plan produces: one wallet call, one `flare` record step. */
export function governanceSpine(intent: GovernanceIntent) {
  return [
    {
      id: 'call-0',
      type: intent.kind === 'delegate' ? 'delegate' : 'undelegate',
      actor: 'your_wallet' as const,
      state: 'pending' as const,
      attempts: 0,
    },
    {
      id: 'record',
      type: intent.kind === 'delegate' ? 'await_governance_delegation' : 'await_governance_undelegate',
      actor: 'flare' as const,
      state: 'pending' as const,
      attempts: 0,
    },
  ]
}

/**
 * A governance op that has signed + broadcast the delegate/undelegate call (state `submitted`,
 * the call/record spine present), ready to reconcile against `getDelegateOfAtNow`. The intent
 * is carried on the record, exactly as `planGovernance` carries it.
 */
export function submittedGovernanceRecord(intent: GovernanceIntent, opts: { now?: number; id?: string } = {}) {
  const now = opts.now ?? 1_700_000_000
  const id = opts.id ?? 'gov1'
  const base = createOperation({ capability: 'governance', network: 114, intent, now, id })
  const quoting = assertTransition(base, 'quoting', now, { steps: governanceSpine(intent) })
  const ready = assertTransition(quoting, 'ready', now)
  const executing = assertTransition(ready, 'executing', now)
  const submitted = assertTransition(executing, 'submitted', now)
  // The whole point of the walk: the fixture really is `submitted` and really carries a spine,
  // so a `steps.every(...)` assertion downstream is never vacuous.
  if (submitted.state !== 'submitted' || submitted.steps.length !== 2) {
    throw new Error(`governance fixture stranded at ${submitted.state} with ${submitted.steps.length} steps`)
  }
  return submitted
}
