import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import { applyTransition, createOperation } from '../src/operation.js'
import { reconcileDelegation } from '../src/delegation-states.js'
import { buildDelegationPlan } from '../src/delegation.js'
import type { DelegationIntent } from '../src/delegation.js'
import { MOCK_DELEGATION_OBSERVED, createMockDelegationAdapter } from '../src/index.js'

const ACCOUNT: Address = '0x00000000000000000000000000000000000000A1'
const PROVIDER = MOCK_DELEGATION_OBSERVED.provider
const WRAP_AMOUNT = MOCK_DELEGATION_OBSERVED.wrapAmount

describe('mock-delegation — reproduces the observed DelegationReads shapes (M10-R8)', () => {
  it('blank-slate: matches the observed dry read exactly', async () => {
    const reads = await createMockDelegationAdapter().read(ACCOUNT)
    expect(reads).toEqual({
      nativeBalance: MOCK_DELEGATION_OBSERVED.nativeBalance,
      wrappedBalance: 0n,
      mode: 0,
      delegates: [],
      votePower: 0n,
      undelegatedVotePower: 0n,
    })
  })

  it('wrapped: wrappedBalance 5e18, mode still NOTSET (before any delegate call)', async () => {
    const reads = await createMockDelegationAdapter({
      wrappedBalance: WRAP_AMOUNT,
      votePower: WRAP_AMOUNT,
      undelegatedVotePower: WRAP_AMOUNT,
    }).read(ACCOUNT)
    expect(reads.wrappedBalance).toBe(WRAP_AMOUNT)
    expect(reads.mode).toBe(0)
    expect(reads.delegates).toEqual([])
  })

  it('delegated: delegatesOf = [{provider,10000}], mode 1 PERCENTAGE, votePower 0 (100% delegated away)', async () => {
    const reads = await createMockDelegationAdapter({
      wrappedBalance: WRAP_AMOUNT,
      mode: 1,
      delegates: [{ address: PROVIDER, bips: 10_000 }],
      votePower: 0n,
      undelegatedVotePower: 0n,
    }).read(ACCOUNT)
    expect(reads.delegates).toEqual([{ address: PROVIDER, bips: 10_000 }])
    expect(reads.mode).toBe(1)
    expect(reads.votePower).toBe(0n)
    expect(reads.undelegatedVotePower).toBe(0n)
  })

  it('undelegated: delegatesOf = [], mode STAYS 1 (delegationModeOf never resets to NOTSET), votePower back to 5e18', async () => {
    const reads = await createMockDelegationAdapter({
      wrappedBalance: WRAP_AMOUNT,
      mode: 1,
      delegates: [],
      votePower: WRAP_AMOUNT,
      undelegatedVotePower: WRAP_AMOUNT,
    }).read(ACCOUNT)
    expect(reads.delegates).toEqual([])
    expect(reads.mode).toBe(1)
    expect(reads.votePower).toBe(WRAP_AMOUNT)
    expect(reads.undelegatedVotePower).toBe(WRAP_AMOUNT)
  })
})

describe('mock-delegation drives the REAL buildDelegationPlan', () => {
  it('a wrap plan: WNat.deposit() payable with the observed amount', async () => {
    const adapter = createMockDelegationAdapter()
    const reads = await adapter.read(ACCOUNT)
    const r = buildDelegationPlan(adapter, adapter.deployment, ACCOUNT, { kind: 'wrap', amount: WRAP_AMOUNT }, reads)
    expect(r.kind).toBe('plan')
    if (r.kind === 'plan') {
      expect(r.plan.calls[0]).toMatchObject({ abiKind: 'wnat', functionName: 'deposit', value: WRAP_AMOUNT })
    }
  })

  it('a valid percentage delegate plan against the wrapped snapshot', async () => {
    const adapter = createMockDelegationAdapter({ wrappedBalance: WRAP_AMOUNT })
    const reads = await adapter.read(ACCOUNT)
    const r = buildDelegationPlan(
      adapter,
      adapter.deployment,
      ACCOUNT,
      { kind: 'delegate', targets: [{ to: PROVIDER, bips: 10_000 }] },
      reads,
    )
    expect(r.kind).toBe('plan')
    if (r.kind === 'plan') {
      expect(r.plan.calls[0]).toMatchObject({ abiKind: 'vptoken', functionName: 'delegate', args: [PROVIDER, 10_000n] })
    }
  })
})

describe('mock-delegation drives the REAL reconcileDelegation', () => {
  const DELEGATE: DelegationIntent = { kind: 'delegate', targets: [{ to: PROVIDER, bips: 10_000 }] }
  const NOW = 1_700_000_000

  function submittedRecord() {
    const base = createOperation({ capability: 'delegation', network: 114, intent: DELEGATE, now: NOW, id: 'mockdel1' })
    const steps = [
      { id: 'delegate', type: 'delegate', actor: 'your_wallet', state: 'pending', attempts: 0 },
      { id: 'record', type: 'await_delegation', actor: 'flare', state: 'pending', attempts: 0 },
    ] as const
    const executing = applyTransition(base, { to: 'executing', at: NOW, patch: { steps: [...steps] } }).record
    return applyTransition(executing, { to: 'submitted', at: NOW }).record
  }

  it('an empty delegatesOf stays awaiting_external, NEVER succeeded', async () => {
    const reads = await createMockDelegationAdapter({ delegates: [] }).read(ACCOUNT)
    const r = reconcileDelegation(submittedRecord(), reads, DELEGATE, NOW + 1000)
    expect(r.state).toBe('awaiting_external')
    expect(r.state).not.toBe('succeeded')
  })

  it('reaches succeeded ONLY when the mock delegatesOf reflects the target', async () => {
    const reads = await createMockDelegationAdapter({ delegates: [{ address: PROVIDER, bips: 10_000 }] }).read(ACCOUNT)
    const r = reconcileDelegation(submittedRecord(), reads, DELEGATE, NOW + 2000)
    expect(r.state).toBe('succeeded')
    expect(r.steps.every((s) => s.state === 'done')).toBe(true)
  })
})

describe('mock-delegation refuses the unobserved', () => {
  it('an explicit AMOUNT-mode request (never observed live) throws', () => {
    expect(() => createMockDelegationAdapter({ mode: 2 })).toThrow(/not observed live/)
  })

  it('a network the live run never drove throws (never invents one)', () => {
    expect(() => createMockDelegationAdapter({}, 'flare')).toThrow(/refuses to invent/)
  })
})
