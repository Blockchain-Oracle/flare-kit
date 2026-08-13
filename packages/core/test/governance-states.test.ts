import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import { OPERATION_STATES } from '../src/states.js'
import { reconcileGovernance } from '../src/governance-states.js'
import type { GovernanceIntent } from '../src/governance.js'
import { submittedGovernanceRecord } from './governance-fixtures.js'

// M12: the durable governance-delegation reconciler. A broadcast delegate/undelegate is
// only `submitted`; the OUTCOME is chain state (`getDelegateOfAtNow`), not the receipt — so
// the op reaches `succeeded` ONLY once that pure read REFLECTS the intent (the delegate
// target, or the zero address for undelegate). A read that does not yet reflect the intent
// stays `awaiting_external` (actor flare), NEVER succeeded from the submission and NEVER
// failed from a not-yet-reflecting read. The record carries the `GovernanceIntent`, so the
// reconciler reads the target off `op.intent`.

const TARGET: Address = '0x00000000000000000000000000000000000000A1'
const OTHER: Address = '0x00000000000000000000000000000000000000B2'
const ZERO: Address = '0x0000000000000000000000000000000000000000'
const NOW = 1_700_000_000

const DELEGATE: GovernanceIntent = { kind: 'delegate', to: TARGET }
const UNDELEGATE: GovernanceIntent = { kind: 'undelegate' }

/** The shared fixture (`governance-fixtures.ts`) — it walks the FULL legal path, so the
 *  `steps.every(...)` assertions below are about a real two-step spine rather than `[]`. */
const submittedRecord = (intent: GovernanceIntent, now = NOW) => submittedGovernanceRecord(intent, { now })

describe('reconcileGovernance — succeeded ONLY from the getDelegateOfAtNow read (M12)', () => {
  it('the fixture really is submitted and really carries the spine — the assertions below are not vacuous', () => {
    const op = submittedRecord(DELEGATE)
    expect(op.state).toBe('submitted')
    expect(op.steps).toHaveLength(2)
    expect(op.steps.every((s) => s.state === 'done')).toBe(false)
  })


  it('a submitted delegate whose read-back is still the zero address stays awaiting_external (actor flare), NEVER succeeded', () => {
    const r = reconcileGovernance(submittedRecord(DELEGATE), { delegate: ZERO }, NOW + 5000)
    expect(r.state).toBe('awaiting_external')
    expect(r.awaiting?.actor).toBe('flare')
    // the load-bearing honesty: a broadcast delegate is not a recorded delegation.
    expect(r.state).not.toBe('succeeded')
  })

  it('a read-back that reflects a DIFFERENT delegate stays awaiting_external, NEVER succeeded', () => {
    const r = reconcileGovernance(submittedRecord(DELEGATE), { delegate: OTHER }, NOW + 5000)
    expect(r.state).toBe('awaiting_external')
    expect(r.state).not.toBe('succeeded')
  })

  it('reaches succeeded ONLY once the read-back equals the intent target, finalizing the spine and clearing the wait', () => {
    const r = reconcileGovernance(submittedRecord(DELEGATE), { delegate: TARGET }, NOW + 8000)
    expect(r.state).toBe('succeeded')
    expect(r.awaiting).toBeUndefined() // a settled op stops claiming it waits on somebody
    expect(r.steps.every((s) => s.state === 'done')).toBe(true)
  })

  it('matches the target case-insensitively (getDelegateOfAtNow returns checksummed, the intent may be lower-case)', () => {
    const lower: GovernanceIntent = { kind: 'delegate', to: TARGET.toLowerCase() as Address }
    const r = reconcileGovernance(submittedRecord(lower), { delegate: TARGET }, NOW + 3000)
    expect(r.state).toBe('succeeded')
  })

  it('awaiting then reflected reaches succeeded (idempotent reconcileTo walk, no patch dropped on an illegal jump)', () => {
    let op = submittedRecord(DELEGATE)
    op = reconcileGovernance(op, { delegate: ZERO }, NOW + 1000)
    expect(op.state).toBe('awaiting_external')
    op = reconcileGovernance(op, { delegate: TARGET }, NOW + 2000)
    expect(op.state).toBe('succeeded')
    // the spine is fully advanced — proof the reconcileTo patch was applied, not dropped.
    expect(op.steps.every((s) => s.state === 'done')).toBe(true)
  })

  it('the flare wait `since` is preserved across repeated awaiting reconciles (same leg)', () => {
    let op = reconcileGovernance(submittedRecord(DELEGATE), { delegate: ZERO }, NOW + 1000)
    const since = op.awaiting?.since
    op = reconcileGovernance(op, { delegate: ZERO }, NOW + 9000)
    expect(op.awaiting?.since).toBe(since)
  })

  it('every state it enters is a canonical states.ts id — it never mints a new one', () => {
    const submitted = reconcileGovernance(submittedRecord(DELEGATE), { delegate: ZERO }, NOW + 1000)
    const done = reconcileGovernance(submittedRecord(DELEGATE), { delegate: TARGET }, NOW + 2000)
    expect(OPERATION_STATES).toContain(submitted.state)
    expect(OPERATION_STATES).toContain(done.state)
  })
})

describe('reconcileGovernance — undelegate terminal check (M12)', () => {
  it('an undelegate whose read-back still shows a delegate stays awaiting_external', () => {
    const still = reconcileGovernance(submittedRecord(UNDELEGATE), { delegate: TARGET }, NOW + 1000)
    expect(still.state).toBe('awaiting_external')
    expect(still.state).not.toBe('succeeded')
  })

  it('an undelegate reaches succeeded only once the read-back is the zero address', () => {
    const done = reconcileGovernance(submittedRecord(UNDELEGATE), { delegate: ZERO }, NOW + 2000)
    expect(done.state).toBe('succeeded')
    expect(done.awaiting).toBeUndefined()
    expect(done.steps.every((s) => s.state === 'done')).toBe(true)
  })
})
