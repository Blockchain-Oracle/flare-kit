import { describe, expect, it } from 'vitest'
import type { Address, PublicClient } from 'viem'
import { delegationFor } from '@flarekit-dev/contracts'
import { type DelegationReads, makeDelegationAdapter } from '../src/delegation-adapter.js'
import { type DelegationIntent, buildDelegationPlan } from '../src/delegation.js'

// M10: the delegation plan builder. Mirrors the vault Result convention
// (`{ kind: 'plan' } | { kind: 'error' }`). The VERIFIED GATE runs FIRST — before any
// invariant, read or call — and every invariant the protocol would silently no-op is
// caught BEFORE a call is built (the two-delegate cap, the 100% bips ceiling, mode
// exclusivity, and the wrapped-balance floor).

const A: Address = '0x00000000000000000000000000000000000000A1'
const B: Address = '0x00000000000000000000000000000000000000B2'
const C: Address = '0x00000000000000000000000000000000000000C3'
const ACCOUNT: Address = '0x00000000000000000000000000000000000000D4'

const VERIFIED = { ...delegationFor('coston2')!, delegationVerified: true as const }
// Explicit override: Task 5's live round trip flipped the real coston2 config's
// `delegationVerified` to true, so this fixture must force false rather than rely on
// the shared config's (now-verified) default to exercise the not-verified gate.
const UNVERIFIED = { ...delegationFor('coston2')!, delegationVerified: false as const }

// The build* methods never touch the client, so a bare stub is enough for the plan.
const adapter = makeDelegationAdapter({} as unknown as PublicClient, VERIFIED)
const unverifiedAdapter = makeDelegationAdapter({} as unknown as PublicClient, UNVERIFIED)

function reads(over: Partial<DelegationReads> = {}): DelegationReads {
  return {
    nativeBalance: 100n,
    wrappedBalance: 100n,
    mode: 0,
    delegates: [],
    votePower: 100n,
    undelegatedVotePower: 100n,
    ...over,
  }
}

describe('buildDelegationPlan — verified gate FIRST (M10)', () => {
  it('refuses with not-verified when delegationVerified is false, producing no calls', () => {
    const intent: DelegationIntent = { kind: 'delegate', targets: [{ to: A, bips: 10000 }] }
    const result = buildDelegationPlan(unverifiedAdapter, UNVERIFIED, ACCOUNT, intent, reads())
    expect(result).toEqual({ kind: 'error', error: { kind: 'not-verified' } })
    expect(result.kind).not.toBe('plan')
  })

  it('the gate wins over an otherwise-invalid intent — it is checked before any invariant', () => {
    // three targets AND unverified → still not-verified, never too-many-delegates.
    const intent: DelegationIntent = {
      kind: 'delegate',
      targets: [
        { to: A, bips: 1 },
        { to: B, bips: 1 },
        { to: C, bips: 1 },
      ],
    }
    const result = buildDelegationPlan(unverifiedAdapter, UNVERIFIED, ACCOUNT, intent, reads())
    expect(result).toEqual({ kind: 'error', error: { kind: 'not-verified' } })
  })
})

describe('buildDelegationPlan — percentage delegate invariants (M10)', () => {
  it('rejects more than two delegates with too-many-delegates (max 2)', () => {
    const intent: DelegationIntent = {
      kind: 'delegate',
      targets: [
        { to: A, bips: 3000 },
        { to: B, bips: 3000 },
        { to: C, bips: 3000 },
      ],
    }
    const result = buildDelegationPlan(adapter, VERIFIED, ACCOUNT, intent, reads())
    expect(result).toEqual({ kind: 'error', error: { kind: 'too-many-delegates', max: 2 } })
  })

  it('rejects a bips sum over 100% with bips-over-100 carrying the total', () => {
    const intent: DelegationIntent = {
      kind: 'delegate',
      targets: [
        { to: A, bips: 5000 },
        { to: B, bips: 5001 },
      ],
    }
    const result = buildDelegationPlan(adapter, VERIFIED, ACCOUNT, intent, reads())
    expect(result).toEqual({ kind: 'error', error: { kind: 'bips-over-100', sum: 10001 } })
  })

  it('rejects a percentage delegate while the account is in AMOUNT mode (mode-conflict, current amount)', () => {
    const intent: DelegationIntent = { kind: 'delegate', targets: [{ to: A, bips: 10000 }] }
    const result = buildDelegationPlan(adapter, VERIFIED, ACCOUNT, intent, reads({ mode: 2 }))
    expect(result).toEqual({ kind: 'error', error: { kind: 'mode-conflict', current: 'amount' } })
  })

  it('builds a batchDelegate call for a valid two-target percentage delegate', () => {
    const intent: DelegationIntent = {
      kind: 'delegate',
      targets: [
        { to: A, bips: 3000 },
        { to: B, bips: 7000 },
      ],
    }
    const result = buildDelegationPlan(adapter, VERIFIED, ACCOUNT, intent, reads())
    expect(result.kind).toBe('plan')
    if (result.kind !== 'plan') throw new Error('expected a plan')
    expect(result.plan.calls).toHaveLength(1)
    expect(result.plan.calls[0]!.functionName).toBe('batchDelegate')
    expect(result.plan.intent).toEqual(intent)
    expect(result.plan.steps.length).toBeGreaterThan(0)
  })

  it('builds a single delegate call for one target (not a batch)', () => {
    const intent: DelegationIntent = { kind: 'delegate', targets: [{ to: A, bips: 10000 }] }
    const result = buildDelegationPlan(adapter, VERIFIED, ACCOUNT, intent, reads())
    if (result.kind !== 'plan') throw new Error('expected a plan')
    expect(result.plan.calls[0]!.functionName).toBe('delegate')
  })
})

describe('buildDelegationPlan — explicit-amount, wrap, unwrap, undelegate (M10)', () => {
  it('rejects delegate-explicit while the account is in PERCENTAGE mode (mode-conflict, current percentage)', () => {
    const intent: DelegationIntent = { kind: 'delegate-explicit', targets: [{ to: A, amount: 10n }] }
    const result = buildDelegationPlan(adapter, VERIFIED, ACCOUNT, intent, reads({ mode: 1 }))
    expect(result).toEqual({ kind: 'error', error: { kind: 'mode-conflict', current: 'percentage' } })
  })

  it('rejects delegate-explicit whose amounts exceed the wrapped balance (insufficient-wrapped)', () => {
    const intent: DelegationIntent = {
      kind: 'delegate-explicit',
      targets: [
        { to: A, amount: 60n },
        { to: B, amount: 60n },
      ],
    }
    const result = buildDelegationPlan(adapter, VERIFIED, ACCOUNT, intent, reads({ wrappedBalance: 100n, mode: 2 }))
    expect(result).toEqual({ kind: 'error', error: { kind: 'insufficient-wrapped', have: 100n, need: 120n } })
  })

  it('builds one delegateExplicit call per target when amounts fit', () => {
    const intent: DelegationIntent = {
      kind: 'delegate-explicit',
      targets: [
        { to: A, amount: 10n },
        { to: B, amount: 20n },
      ],
    }
    const result = buildDelegationPlan(adapter, VERIFIED, ACCOUNT, intent, reads({ wrappedBalance: 100n, mode: 0 }))
    if (result.kind !== 'plan') throw new Error('expected a plan')
    expect(result.plan.calls).toHaveLength(2)
    expect(result.plan.calls.every((c) => c.functionName === 'delegateExplicit')).toBe(true)
  })

  it('rejects an unwrap larger than the wrapped balance (insufficient-wrapped)', () => {
    const intent: DelegationIntent = { kind: 'unwrap', amount: 150n }
    const result = buildDelegationPlan(adapter, VERIFIED, ACCOUNT, intent, reads({ wrappedBalance: 100n }))
    expect(result).toEqual({ kind: 'error', error: { kind: 'insufficient-wrapped', have: 100n, need: 150n } })
  })

  it('builds a payable wrap (deposit) call carrying the amount as value', () => {
    const intent: DelegationIntent = { kind: 'wrap', amount: 5n }
    const result = buildDelegationPlan(adapter, VERIFIED, ACCOUNT, intent, reads())
    if (result.kind !== 'plan') throw new Error('expected a plan')
    expect(result.plan.calls[0]!.functionName).toBe('deposit')
    expect(result.plan.calls[0]!.value).toBe(5n)
  })

  it('builds an unwrap (withdraw) call within the wrapped balance', () => {
    const intent: DelegationIntent = { kind: 'unwrap', amount: 40n }
    const result = buildDelegationPlan(adapter, VERIFIED, ACCOUNT, intent, reads({ wrappedBalance: 100n }))
    if (result.kind !== 'plan') throw new Error('expected a plan')
    expect(result.plan.calls[0]!.functionName).toBe('withdraw')
  })

  it('builds an undelegateAll call for undelegate', () => {
    const intent: DelegationIntent = { kind: 'undelegate' }
    const result = buildDelegationPlan(
      adapter,
      VERIFIED,
      ACCOUNT,
      intent,
      reads({ mode: 1, delegates: [{ address: A, bips: 10000 }] }),
    )
    if (result.kind !== 'plan') throw new Error('expected a plan')
    expect(result.plan.calls[0]!.functionName).toBe('undelegateAll')
  })
})
