import {
  type DelegationIntent,
  type DelegationPlan,
  applyTransition,
  createMockDelegationAdapter,
  createOperation,
} from '@flare-kit/core'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useDelegation } from '../src/use-delegation.js'

type Hex0x = `0x${string}`
const TARGET: Hex0x = '0x00000000000000000000000000000000000000A1'
const ACCOUNT: Hex0x = '0x00000000000000000000000000000000000000C3'

const DELEGATE_INTENT: DelegationIntent = { kind: 'delegate', targets: [{ to: TARGET, bips: 10_000 }] }

/**
 * Mirrors `delegation-states.test.ts`'s `submittedDelegateRecord` fixture builder, but
 * walks the FULL legal state path (draft→quoting→ready→executing→submitted) —
 * `applyTransition` silently drops the patch on an illegal hop (a jump straight to
 * `executing` is not one), so skipping a leg would strand this fixture back at `draft`.
 */
function submittedDelegateRecord() {
  const base = createOperation<DelegationIntent, unknown, DelegationPlan>({
    capability: 'delegation',
    network: 114,
    intent: DELEGATE_INTENT,
    now: 0,
    id: 'del1',
  })
  const steps = [
    { id: 'delegate', type: 'delegate', actor: 'your_wallet' as const, state: 'pending' as const, attempts: 0 },
    { id: 'record', type: 'await_delegation', actor: 'flare' as const, state: 'pending' as const, attempts: 0 },
  ]
  const quoting = applyTransition(base, { to: 'quoting', at: 0 }).record
  const ready = applyTransition(quoting, { to: 'ready', at: 0 }).record
  const executing = applyTransition(ready, { to: 'executing', at: 0, patch: { steps } }).record
  return applyTransition(executing, { to: 'submitted', at: 0 }).record
}

describe('useDelegation — position honesty (M10)', () => {
  it('reports unavailable before any read has ever landed — never a confident zero', () => {
    const { result } = renderHook(() => useDelegation({ account: undefined, adapter: undefined, operation: undefined }))
    expect(result.current.position.status).toBe('unavailable')
  })

  it('surfaces a real observed (possibly empty) position once a read lands', async () => {
    const adapter = createMockDelegationAdapter()
    const { result } = renderHook(() =>
      useDelegation({ account: ACCOUNT, adapter, operation: undefined, reconcile: (account) => adapter.read(account), pollMs: 5 }),
    )
    await waitFor(() => expect(result.current.position.status).toBe('observed'))
    const position = result.current.position
    if (position.status !== 'observed') throw new Error('expected observed')
    expect(position.delegates).toEqual([])
    expect(position.wrappedBalance).toBe(0n)
  })
})

describe('useDelegation — the plan builder (M10)', () => {
  it('is undefined before a read lands (never plans off fabricated reads)', () => {
    const adapter = createMockDelegationAdapter()
    const { result } = renderHook(() => useDelegation({ account: ACCOUNT, adapter, operation: undefined }))
    expect(result.current.buildPlan({ kind: 'wrap', amount: 5n })).toBeUndefined()
  })

  it('builds a real plan once reads have landed', async () => {
    const adapter = createMockDelegationAdapter()
    const { result } = renderHook(() =>
      useDelegation({ account: ACCOUNT, adapter, operation: undefined, reconcile: (account) => adapter.read(account), pollMs: 5 }),
    )
    await waitFor(() => expect(result.current.position.status).toBe('observed'))
    const plan = result.current.buildPlan({ kind: 'wrap', amount: 5n })
    expect(plan?.kind).toBe('plan')
  })

  it('surfaces the not-verified gate honestly (never a signable plan on an unverified path)', async () => {
    const base = createMockDelegationAdapter()
    const adapter = { ...base, deployment: { ...base.deployment, delegationVerified: false } }
    const { result } = renderHook(() =>
      useDelegation({ account: ACCOUNT, adapter, operation: undefined, reconcile: (account) => adapter.read(account), pollMs: 5 }),
    )
    await waitFor(() => expect(result.current.position.status).toBe('observed'))
    expect(result.current.buildPlan({ kind: 'wrap', amount: 5n })).toEqual({ kind: 'error', error: { kind: 'not-verified' } })
  })
})

describe('useDelegation — the submit path (calls go via the host onSubmit) (M10)', () => {
  it('forwards the plan to onSubmit and adopts the returned operation', async () => {
    const submitted = submittedDelegateRecord()
    const onSubmit = vi.fn().mockResolvedValue(submitted)
    const { result } = renderHook(() => useDelegation({ account: ACCOUNT, adapter: undefined, operation: undefined, onSubmit }))
    const plan = { steps: [], calls: [], intent: DELEGATE_INTENT }
    await result.current.submit(plan)
    await waitFor(() => expect(result.current.operation?.state).toBe('submitted'))
    expect(onSubmit).toHaveBeenCalledWith(plan)
  })

  it('a failed submit is recorded as an error, never a fabricated operation', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('wallet rejected'))
    const { result } = renderHook(() => useDelegation({ account: ACCOUNT, adapter: undefined, operation: undefined, onSubmit }))
    const plan = { steps: [], calls: [], intent: DELEGATE_INTENT }
    const outcome = await result.current.submit(plan)
    expect(outcome).toBeUndefined()
    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(result.current.operation).toBeUndefined()
  })
})

describe('useDelegation — the durable delegation poll (M10)', () => {
  it('a submitted delegate stays awaiting_external(flare) until delegatesOf reflects the target', async () => {
    const adapter = createMockDelegationAdapter({ delegates: [] })
    const operation = submittedDelegateRecord()
    const { result } = renderHook(() =>
      useDelegation({ account: ACCOUNT, adapter, operation, reconcile: (account) => adapter.read(account), pollMs: 5 }),
    )
    await waitFor(() => expect(result.current.operation?.state).toBe('awaiting_external'))
    expect(result.current.operation?.awaiting?.actor).toBe('flare')
    expect(result.current.isSettled).toBe(false)
  })

  it('reaches succeeded ONLY once delegatesOf reflects the target — never fabricated from the submit', async () => {
    const adapter = createMockDelegationAdapter({ delegates: [{ address: TARGET, bips: 10_000 }], mode: 1 })
    const operation = submittedDelegateRecord()
    const { result } = renderHook(() =>
      useDelegation({ account: ACCOUNT, adapter, operation, reconcile: (account) => adapter.read(account), pollMs: 5 }),
    )
    await waitFor(() => expect(result.current.operation?.state).toBe('succeeded'))
    expect(result.current.isSettled).toBe(true)
  })

  it('a transient read error clears once a later poll succeeds — never a sticky failure', async () => {
    const adapter = createMockDelegationAdapter({ delegates: [{ address: TARGET, bips: 10_000 }], mode: 1 })
    let calls = 0
    const reconcile = async (account: Hex0x) => {
      calls += 1
      if (calls === 1) throw new Error('lagged Coston2 RPC')
      return adapter.read(account)
    }
    const operation = submittedDelegateRecord()
    const { result } = renderHook(() => useDelegation({ account: ACCOUNT, adapter, operation, reconcile, pollMs: 5 }))
    // the first poll's error is transient and racy to observe directly (mirrors
    // use-bridge.test.tsx: prove it cleared by checking it AT settlement, not mid-flight).
    await waitFor(() => expect(result.current.operation?.state).toBe('succeeded'))
    expect(result.current.error).toBeUndefined()
  })

  it('a failed reading is recorded but never moves the operation to failed', async () => {
    const operation = submittedDelegateRecord()
    const reconcile = async () => {
      throw new Error('rpc down')
    }
    const { result } = renderHook(() => useDelegation({ account: ACCOUNT, adapter: undefined, operation, reconcile, pollMs: 5 }))
    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(result.current.operation?.state).toBe('submitted')
  })
})
