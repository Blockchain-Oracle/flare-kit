import { describe, expect, it } from 'vitest'
import { applyTransition, createOperation } from '../src/operation.js'
import { reconcileClaim } from '../src/rewards-states.js'

// M10 Task 7 + M11 Task 8: the durable claim reconciler. A broadcast claim is only `submitted`;
// the OUTCOME is chain state, so the op reaches `succeeded` ONLY from a confirmed on-chain read —
// never from the submission. An unconfirmed claim stays `awaiting_external` (actor flare), NEVER
// succeeded and NEVER failed (an unknown outcome is not a failure). The 4th kind (staking) reuses
// this SAME reconciler unchanged — its `succeeded` likewise derives only from the confirmation read.

const NOW = 1_700_000_000

/**
 * A claim op that has signed + broadcast the claim call (state `submitted`, the
 * claim/record spine present), ready to reconcile against the confirmation read. Built
 * manually exactly as delegation-states.test.ts's submitted record is. `recordType` names the
 * trailing `flare` wait step per kind (`await_ftso_claim` / … / `await_staking_claim`).
 */
function submittedClaimRecord(intentKind = 'ftso-delegation', recordType = 'await_ftso_claim', now = NOW) {
  const base = createOperation({ capability: 'rewards_claim', network: 114, intent: { kind: intentKind }, now, id: 'claim1' })
  const steps = [
    { id: 'call-0', type: 'claim', actor: 'your_wallet', state: 'pending', attempts: 0 },
    { id: 'record', type: recordType, actor: 'flare', state: 'pending', attempts: 0 },
  ] as const
  const executing = applyTransition(base, { to: 'executing', at: now, patch: { steps: [...steps] } }).record
  return applyTransition(executing, { to: 'submitted', at: now }).record
}

describe('reconcileClaim — succeeded ONLY from a confirmed read (M10)', () => {
  it('an unconfirmed submitted claim stays awaiting_external (actor flare), NEVER succeeded', () => {
    const r = reconcileClaim(submittedClaimRecord(), false, NOW + 5000)
    expect(r.state).toBe('awaiting_external')
    expect(r.awaiting?.actor).toBe('flare')
    // the load-bearing honesty: a broadcast claim is not a settled claim.
    expect(r.state).not.toBe('succeeded')
  })

  it('a confirmed claim reaches succeeded, finalizes the spine and clears awaiting', () => {
    const r = reconcileClaim(submittedClaimRecord(), true, NOW + 8000)
    expect(r.state).toBe('succeeded')
    expect(r.awaiting).toBeUndefined() // a settled op stops claiming it waits on somebody
    expect(r.steps.every((s) => s.state === 'done')).toBe(true)
  })

  it('unconfirmed then confirmed reaches succeeded (idempotent table walk, no lost patch)', () => {
    let op = submittedClaimRecord()
    op = reconcileClaim(op, false, NOW + 1000)
    expect(op.state).toBe('awaiting_external')
    op = reconcileClaim(op, true, NOW + 2000)
    expect(op.state).toBe('succeeded')
    expect(op.steps.every((s) => s.state === 'done')).toBe(true)
  })

  it('the flare wait `since` is preserved across repeated unconfirmed reconciles (same leg)', () => {
    let op = reconcileClaim(submittedClaimRecord(), false, NOW + 1000)
    const since = op.awaiting?.since
    op = reconcileClaim(op, false, NOW + 9000)
    expect(op.awaiting?.since).toBe(since)
  })
})

describe('reconcileClaim — the staking (4th) kind reuses the SAME reconciler (M11)', () => {
  it('an unconfirmed staking claim stays awaiting_external, NEVER succeeded from the submission', () => {
    const r = reconcileClaim(submittedClaimRecord('staking', 'await_staking_claim'), false, NOW + 5000)
    expect(r.state).toBe('awaiting_external')
    expect(r.awaiting?.actor).toBe('flare')
    expect(r.state).not.toBe('succeeded')
  })

  it('a staking claim reaches succeeded ONLY from a confirmed on-chain (claimed-delta) read', () => {
    const r = reconcileClaim(submittedClaimRecord('staking', 'await_staking_claim'), true, NOW + 8000)
    expect(r.state).toBe('succeeded')
    expect(r.awaiting).toBeUndefined()
    expect(r.steps.every((s) => s.state === 'done')).toBe(true)
  })
})
