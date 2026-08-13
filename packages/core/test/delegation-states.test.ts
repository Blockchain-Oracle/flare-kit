import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import { applyTransition, createOperation } from '../src/operation.js'
import { reconcileDelegation } from '../src/delegation-states.js'
import type { DelegationReads } from '../src/delegation-adapter.js'
import type { DelegationIntent } from '../src/delegation.js'

// M10: the durable delegation reconciler. A broadcast delegate is only `submitted`; the
// OUTCOME is chain state (delegatesOf / balanceOf), so the op reaches `succeeded` ONLY
// once a pure chain read REFLECTS the intent — never from the submission. A read that
// does not yet reflect the intent stays `awaiting_external` (actor flare), NEVER
// succeeded and NEVER failed.

const TARGET: Address = '0x00000000000000000000000000000000000000A1'
const OTHER: Address = '0x00000000000000000000000000000000000000B2'
const NOW = 1_700_000_000

const DELEGATE: DelegationIntent = { kind: 'delegate', targets: [{ to: TARGET, bips: 10000 }] }

function reads(over: Partial<DelegationReads> = {}): DelegationReads {
  return {
    nativeBalance: 0n,
    wrappedBalance: 0n,
    mode: 1,
    delegates: [],
    votePower: 0n,
    undelegatedVotePower: 0n,
    ...over,
  }
}

/**
 * A delegate op that has signed + broadcast the delegate call (state `submitted`, the
 * delegate/record spine present), ready to reconcile against delegatesOf. Built manually
 * exactly as bridge-states.test.ts's submittedOp() is.
 */
function submittedDelegateRecord(now = NOW) {
  const base = createOperation({ capability: 'delegation', network: 114, intent: DELEGATE, now, id: 'del1' })
  const steps = [
    { id: 'delegate', type: 'delegate', actor: 'your_wallet', state: 'pending', attempts: 0 },
    { id: 'record', type: 'await_delegation', actor: 'flare', state: 'pending', attempts: 0 },
  ] as const
  const executing = applyTransition(base, { to: 'executing', at: now, patch: { steps: [...steps] } }).record
  return applyTransition(executing, { to: 'submitted', at: now }).record
}

describe('reconcileDelegation — succeeded ONLY from the read (M10)', () => {
  it('a submitted delegate with an empty delegatesOf stays awaiting_external (actor flare), NEVER succeeded', () => {
    const r = reconcileDelegation(submittedDelegateRecord(), reads({ delegates: [] }), DELEGATE, NOW + 5000)
    expect(r.state).toBe('awaiting_external')
    expect(r.awaiting?.actor).toBe('flare')
    // the load-bearing honesty: a broadcast delegate is not a recorded delegation.
    expect(r.state).not.toBe('succeeded')
  })

  it('a delegatesOf that does not yet contain the target stays awaiting_external', () => {
    const r = reconcileDelegation(
      submittedDelegateRecord(),
      reads({ delegates: [{ address: OTHER, bips: 10000 }] }),
      DELEGATE,
      NOW + 5000,
    )
    expect(r.state).toBe('awaiting_external')
    expect(r.state).not.toBe('succeeded')
  })

  it('reaches succeeded ONLY once delegatesOf contains the target, finalizing the spine and clearing the wait', () => {
    const r = reconcileDelegation(
      submittedDelegateRecord(),
      reads({ delegates: [{ address: TARGET, bips: 10000 }] }),
      DELEGATE,
      NOW + 8000,
    )
    expect(r.state).toBe('succeeded')
    expect(r.awaiting).toBeUndefined() // H1: a settled op stops claiming it waits on somebody
    expect(r.steps.every((s) => s.state === 'done')).toBe(true)
  })

  it('awaiting then present reaches succeeded (idempotent table walk, no lost patch)', () => {
    let op = submittedDelegateRecord()
    op = reconcileDelegation(op, reads({ delegates: [] }), DELEGATE, NOW + 1000)
    expect(op.state).toBe('awaiting_external')
    op = reconcileDelegation(op, reads({ delegates: [{ address: TARGET, bips: 10000 }] }), DELEGATE, NOW + 2000)
    expect(op.state).toBe('succeeded')
    expect(op.steps.every((s) => s.state === 'done')).toBe(true)
  })

  it('matches the target case-insensitively (chain returns checksummed, the intent may be lower-case)', () => {
    const lower: DelegationIntent = { kind: 'delegate', targets: [{ to: TARGET.toLowerCase() as Address, bips: 10000 }] }
    const r = reconcileDelegation(
      submittedDelegateRecord(),
      reads({ delegates: [{ address: TARGET, bips: 10000 }] }),
      lower,
      NOW + 3000,
    )
    expect(r.state).toBe('succeeded')
  })

  it('the flare wait `since` is preserved across repeated awaiting reconciles (same leg)', () => {
    let op = reconcileDelegation(submittedDelegateRecord(), reads({ delegates: [] }), DELEGATE, NOW + 1000)
    const since = op.awaiting?.since
    op = reconcileDelegation(op, reads({ delegates: [] }), DELEGATE, NOW + 9000)
    expect(op.awaiting?.since).toBe(since)
  })
})

describe('reconcileDelegation — terminal check per intent (M10)', () => {
  it('undelegate reaches succeeded only when delegatesOf is empty', () => {
    const UND: DelegationIntent = { kind: 'undelegate' }
    const still = reconcileDelegation(
      submittedDelegateRecord(),
      reads({ delegates: [{ address: TARGET, bips: 10000 }] }),
      UND,
      NOW + 1000,
    )
    expect(still.state).toBe('awaiting_external')
    const done = reconcileDelegation(submittedDelegateRecord(), reads({ delegates: [] }), UND, NOW + 2000)
    expect(done.state).toBe('succeeded')
  })

  it('wrap reaches succeeded only once the wrapped balance reflects the amount', () => {
    const WRAP: DelegationIntent = { kind: 'wrap', amount: 50n }
    const still = reconcileDelegation(submittedDelegateRecord(), reads({ wrappedBalance: 10n }), WRAP, NOW + 1000)
    expect(still.state).toBe('awaiting_external')
    const done = reconcileDelegation(submittedDelegateRecord(), reads({ wrappedBalance: 50n }), WRAP, NOW + 2000)
    expect(done.state).toBe('succeeded')
  })

  it('unwrap reaches succeeded only once the wrapped balance no longer holds the unwrapped amount', () => {
    const UNWRAP: DelegationIntent = { kind: 'unwrap', amount: 50n }
    const still = reconcileDelegation(submittedDelegateRecord(), reads({ wrappedBalance: 60n }), UNWRAP, NOW + 1000)
    expect(still.state).toBe('awaiting_external')
    const done = reconcileDelegation(submittedDelegateRecord(), reads({ wrappedBalance: 40n }), UNWRAP, NOW + 2000)
    expect(done.state).toBe('succeeded')
  })
})
