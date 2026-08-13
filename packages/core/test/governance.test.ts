import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import { governanceFor, type GovernanceDeployment } from '@flare-kit/contracts'
import { planGovernance, type GovernanceIntent } from '../src/governance.js'
import type { GovernanceVoteReads } from '../src/governance-adapter.js'

// M12: the governance-delegation plan builder. Governance vote power is ALL-OR-NOTHING to
// a single delegate (`GovernanceVotePower.delegate` / `.undelegate`) — no bips/two-provider
// shape. Two honesty guarantees, mirroring `buildDelegationPlan` (M10):
//   1. the VERIFIED GATE runs FIRST — before any invariant, read or call, the plan refuses
//      to emit a signable governance-delegation until `governanceVerified` is flipped by a
//      live Coston2 round trip (Task 6).
//   2. every single-target invariant the protocol would silently no-op is caught before a
//      call is built: a missing/zero/malformed delegate target, self-delegation, and an
//      undelegate against no current delegate.

const ACCOUNT: Address = '0x00000000000000000000000000000000000000A1'
const TARGET: Address = '0x00000000000000000000000000000000000000B2'
const ZERO: Address = '0x0000000000000000000000000000000000000000'

function verified(): GovernanceDeployment {
  return { ...governanceFor('coston2'), governanceVerified: true }
}
function unverified(): GovernanceDeployment {
  return { ...governanceFor('coston2'), governanceVerified: false }
}
function reads(over: Partial<GovernanceVoteReads> = {}): GovernanceVoteReads {
  return { votes: 100n, delegate: ZERO, ...over }
}

const DELEGATE: GovernanceIntent = { kind: 'delegate', to: TARGET }
const UNDELEGATE: GovernanceIntent = { kind: 'undelegate' }

describe('planGovernance — verified gate runs FIRST (M12)', () => {
  it('refuses with unverified when governanceVerified is false, even for an otherwise-valid delegate', () => {
    const result = planGovernance({ intent: DELEGATE, deployment: unverified(), reads: reads(), account: ACCOUNT })
    expect(result).toEqual({ ok: false, error: { code: 'unverified' } })
  })

  it('the gate outranks the invariants: a self-delegation under an unverified deployment still reads unverified', () => {
    const selfIntent: GovernanceIntent = { kind: 'delegate', to: ACCOUNT }
    const result = planGovernance({ intent: selfIntent, deployment: unverified(), reads: reads(), account: ACCOUNT })
    // The verified gate must win — never leak self_delegation before the flag is checked.
    expect(result).toEqual({ ok: false, error: { code: 'unverified' } })
  })
})

describe('planGovernance — single-target invariants (only with governanceVerified true)', () => {
  it('a delegate with a missing `to` is invalid_target', () => {
    const result = planGovernance({ intent: { kind: 'delegate' }, deployment: verified(), reads: reads(), account: ACCOUNT })
    expect(result).toEqual({ ok: false, error: { code: 'invalid_target' } })
  })

  it('a delegate with the zero address as `to` is invalid_target — never signs a burn-to-nowhere', () => {
    const result = planGovernance({ intent: { kind: 'delegate', to: ZERO }, deployment: verified(), reads: reads(), account: ACCOUNT })
    expect(result).toEqual({ ok: false, error: { code: 'invalid_target' } })
  })

  it('a delegate with a malformed `to` is invalid_target', () => {
    const result = planGovernance({
      intent: { kind: 'delegate', to: '0x123' as Address },
      deployment: verified(),
      reads: reads(),
      account: ACCOUNT,
    })
    expect(result).toEqual({ ok: false, error: { code: 'invalid_target' } })
  })

  it('a delegate to the account itself is self_delegation (case-insensitive)', () => {
    const upper: GovernanceIntent = { kind: 'delegate', to: ACCOUNT.toUpperCase().replace('0X', '0x') as Address }
    const result = planGovernance({ intent: upper, deployment: verified(), reads: reads(), account: ACCOUNT })
    expect(result).toEqual({ ok: false, error: { code: 'self_delegation' } })
  })

  it('a valid delegate builds a plan that carries the intent, the flare spine step and the delegate call', () => {
    const deployment = verified()
    const result = planGovernance({ intent: DELEGATE, deployment, reads: reads(), account: ACCOUNT })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.plan.intent).toEqual(DELEGATE)
    // the reconciler reads the intent off the record, so the plan must carry it verbatim.
    expect(result.plan.steps.some((step) => step.actor === 'flare')).toBe(true)
    expect(result.plan.calls).toHaveLength(1)
    expect(result.plan.calls[0]!.functionName).toBe('delegate')
    expect(result.plan.calls[0]!.address).toBe(deployment.governanceVotePower)
  })

  it('an undelegate with no current delegate (reads.delegate is the zero address) is no_delegate', () => {
    const result = planGovernance({ intent: UNDELEGATE, deployment: verified(), reads: reads({ delegate: ZERO }), account: ACCOUNT })
    expect(result).toEqual({ ok: false, error: { code: 'no_delegate' } })
  })

  it('an undelegate with a real current delegate builds a plan carrying the undelegate call', () => {
    const deployment = verified()
    const result = planGovernance({ intent: UNDELEGATE, deployment, reads: reads({ delegate: TARGET }), account: ACCOUNT })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.plan.intent).toEqual(UNDELEGATE)
    expect(result.plan.calls).toHaveLength(1)
    expect(result.plan.calls[0]!.functionName).toBe('undelegate')
    expect(result.plan.calls[0]!.address).toBe(deployment.governanceVotePower)
  })
})
