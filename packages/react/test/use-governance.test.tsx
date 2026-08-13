import { applyTransition, createOperation, governanceFor, type GovernanceIntent, type GovernancePlan } from '@flare-kit/core'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useGovernance, type GovernanceEvmClient, type GovernanceWalletClient } from '../src/use-governance.js'

type Hex0x = `0x${string}`
const ACCOUNT: Hex0x = '0x00000000000000000000000000000000000000C3'
const TARGET: Hex0x = '0x00000000000000000000000000000000000000A1'
const ZERO: Hex0x = '0x0000000000000000000000000000000000000000'

// Coston2 is the M12 write/verify network — `governanceVerified` flipped true there after
// the live Task-6 round trip, so `planGovernance` is not refused on this fixture.
const deployment = governanceFor('coston2')

interface FakeState {
  delegate: Hex0x
  votes: bigint
  isProposer: boolean
  canPropose: boolean
}

/** A stubbed `PublicClient`: dispatches `readContract` by address+functionName exactly like
 *  `governance-adapter.test.ts`'s fixture. `isMember` always reverts (probe-observed reality,
 *  `governance-adapter.ts`'s documented behavior) — never coerced to a fabricated boolean. */
function makePublicClient(state: FakeState): GovernanceEvmClient {
  return {
    async readContract({ address, functionName }: { address: Hex0x; functionName: string }) {
      const addr = address.toLowerCase()
      if (addr === deployment.governanceVotePower.toLowerCase()) {
        if (functionName === 'getVotes') return state.votes
        if (functionName === 'getDelegateOfAtNow') return state.delegate
      }
      if (addr === deployment.pollingFoundation.toLowerCase()) {
        if (functionName === 'isProposer') return state.isProposer
      }
      if (addr === deployment.pollingFtso.toLowerCase()) {
        if (functionName === 'canPropose') return state.canPropose
        if (functionName === 'isMember') throw new Error('execution reverted: PollingFtso.isMember')
      }
      throw new Error(`unexpected read ${functionName} on ${address}`)
    },
  } as unknown as GovernanceEvmClient
}

function makeWalletClient(): GovernanceWalletClient & { writeContract: ReturnType<typeof vi.fn> } {
  return { writeContract: vi.fn().mockResolvedValue('0xhash' as Hex0x) }
}

/**
 * A governance op that has signed + broadcast the delegate call (state `submitted`),
 * mirroring `governance-states.test.ts`'s `submittedRecord` — walks the FULL legal state
 * path (`applyTransition` drops a patch on an illegal jump), so a jump straight to
 * `submitted` would strand this fixture back at `draft`.
 */
function submittedDelegateRecord() {
  const intent: GovernanceIntent = { kind: 'delegate', to: TARGET }
  const plan: GovernancePlan = {
    intent,
    calls: [{ address: deployment.governanceVotePower, abi: [], functionName: 'delegate', args: [TARGET] }],
    steps: [
      { id: 'call-0', type: 'delegate', actor: 'your_wallet', state: 'pending', attempts: 0 },
      { id: 'record', type: 'await_governance_delegation', actor: 'flare', state: 'pending', attempts: 0 },
    ],
  }
  const base = createOperation<GovernanceIntent, unknown, GovernancePlan>({ capability: 'governance', network: 114, intent, now: 0, id: 'gov1' })
  const quoting = applyTransition(base, { to: 'quoting', at: 0, patch: { steps: plan.steps, plan } }).record
  const ready = applyTransition(quoting, { to: 'ready', at: 0 }).record
  const executing = applyTransition(ready, { to: 'executing', at: 0 }).record
  return applyTransition(executing, { to: 'submitted', at: 0 }).record
}

describe('useGovernance — keyless reads + plan (M12)', () => {
  it('lands reads/eligibility/position/plan with NO walletClient at all', async () => {
    const state: FakeState = { delegate: ZERO, votes: 0n, isProposer: false, canPropose: false }
    const publicClient = makePublicClient(state)
    const { result } = renderHook(() => useGovernance({ deployment, account: ACCOUNT, publicClient, pollMs: 5 }))

    await waitFor(() => expect(result.current.position.status).toBe('observed'))
    expect(result.current.reads).toEqual({ votes: 0n, delegate: ZERO })
    expect(result.current.eligibility).toEqual({ isProposer: false, canPropose: false, isMember: undefined })
    expect(result.current.canWrite).toBe(false)

    const planned = result.current.plan({ kind: 'delegate', to: TARGET })
    expect(planned?.ok).toBe(true)
  })

  it('plan is undefined before any read has landed — never plans off a fabricated read', () => {
    const state: FakeState = { delegate: ZERO, votes: 0n, isProposer: false, canPropose: false }
    const publicClient = makePublicClient(state)
    const { result } = renderHook(() => useGovernance({ deployment, account: ACCOUNT, publicClient }))
    expect(result.current.plan({ kind: 'delegate', to: TARGET })).toBeUndefined()
  })
})

describe('useGovernance — the write path requires the injected walletClient (M12)', () => {
  it('delegate is a no-op without a walletClient — never a fabricated submission', async () => {
    const state: FakeState = { delegate: ZERO, votes: 0n, isProposer: false, canPropose: false }
    const publicClient = makePublicClient(state)
    const { result } = renderHook(() => useGovernance({ deployment, account: ACCOUNT, publicClient, pollMs: 5 }))
    await waitFor(() => expect(result.current.position.status).toBe('observed'))

    result.current.delegate(TARGET)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current.operation).toBeUndefined()
  })

  it('undelegate is a no-op without a walletClient', async () => {
    const state: FakeState = { delegate: TARGET, votes: 5n, isProposer: false, canPropose: false }
    const publicClient = makePublicClient(state)
    const { result } = renderHook(() => useGovernance({ deployment, account: ACCOUNT, publicClient, pollMs: 5 }))
    await waitFor(() => expect(result.current.position.status).toBe('observed'))

    result.current.undelegate()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current.operation).toBeUndefined()
  })

  it('delegate submits via the injected walletClient.writeContract once a read has landed', async () => {
    const state: FakeState = { delegate: ZERO, votes: 0n, isProposer: false, canPropose: false }
    const publicClient = makePublicClient(state)
    const walletClient = makeWalletClient()
    const { result } = renderHook(() =>
      useGovernance({ deployment, account: ACCOUNT, publicClient, walletClient, pollMs: 5 }),
    )
    await waitFor(() => expect(result.current.position.status).toBe('observed'))
    expect(result.current.canWrite).toBe(true)

    result.current.delegate(TARGET)
    await waitFor(() => expect(walletClient.writeContract).toHaveBeenCalledTimes(1))
    const call = walletClient.writeContract.mock.calls[0]?.[0]
    expect(call.functionName).toBe('delegate')
    expect(call.args).toEqual([TARGET])
    expect(call.account).toBe(ACCOUNT)
  })
})

describe('useGovernance — the durable poll: succeeded ONLY from the getDelegateOfAtNow read-back (M12)', () => {
  it('a submitted delegate stays awaiting_external(flare) until the read reflects the target — never succeeded from the submit', async () => {
    const state: FakeState = { delegate: ZERO, votes: 0n, isProposer: false, canPropose: false }
    const publicClient = makePublicClient(state)
    const walletClient = makeWalletClient()
    const { result } = renderHook(() =>
      useGovernance({ deployment, account: ACCOUNT, publicClient, walletClient, pollMs: 5 }),
    )
    await waitFor(() => expect(result.current.position.status).toBe('observed'))

    result.current.delegate(TARGET)
    await waitFor(() => expect(result.current.operation?.state).toBe('awaiting_external'))
    expect(result.current.operation?.awaiting?.actor).toBe('flare')
    expect(result.current.isSettled).toBe(false)

    // The chain has NOT recorded it yet (state.delegate is still ZERO) — hold here a beat to
    // prove several more polls do not fabricate succeeded from the submission alone.
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(result.current.operation?.state).toBe('awaiting_external')
    expect(result.current.isSettled).toBe(false)
  })

  it('reaches succeeded ONLY once getDelegateOfAtNow reflects the target', async () => {
    const state: FakeState = { delegate: ZERO, votes: 0n, isProposer: false, canPropose: false }
    const publicClient = makePublicClient(state)
    const walletClient = makeWalletClient()
    const { result } = renderHook(() =>
      useGovernance({ deployment, account: ACCOUNT, publicClient, walletClient, pollMs: 5 }),
    )
    await waitFor(() => expect(result.current.position.status).toBe('observed'))

    result.current.delegate(TARGET)
    await waitFor(() => expect(result.current.operation?.state).toBe('awaiting_external'))

    // NOW the chain records it — the next poll's read-back reflects the target.
    state.delegate = TARGET
    await waitFor(() => expect(result.current.operation?.state).toBe('succeeded'))
    expect(result.current.isSettled).toBe(true)
    expect(result.current.position.status).toBe('observed')
    if (result.current.position.status === 'observed') {
      expect(result.current.position.delegate.toLowerCase()).toBe(TARGET.toLowerCase())
    }
  })

  it('an undelegate reaches succeeded only once the read-back is the zero address', async () => {
    const state: FakeState = { delegate: TARGET, votes: 5n, isProposer: false, canPropose: false }
    const publicClient = makePublicClient(state)
    const walletClient = makeWalletClient()
    const { result } = renderHook(() =>
      useGovernance({ deployment, account: ACCOUNT, publicClient, walletClient, pollMs: 5 }),
    )
    await waitFor(() => expect(result.current.position.status).toBe('observed'))

    result.current.undelegate()
    await waitFor(() => expect(result.current.operation?.state).toBe('awaiting_external'))

    state.delegate = ZERO
    await waitFor(() => expect(result.current.operation?.state).toBe('succeeded'))
    expect(result.current.isSettled).toBe(true)
  })

  it('a permanently failing read never advances a hydrated in-flight op — position stays unavailable, never a fabricated zero', async () => {
    // governance-adapter.ts's reads catch their OWN throw and return `undefined` (unlike
    // delegation/staking's reconcile, which propagates); a hydrated `operation` (rehydrated
    // from storage on app open — there is no Resume button) must stay exactly where it was.
    const alwaysThrows: GovernanceEvmClient = {
      async readContract() {
        throw new Error('rpc down')
      },
    } as unknown as GovernanceEvmClient
    const hydrated = submittedDelegateRecord()
    const { result } = renderHook(() =>
      useGovernance({ deployment, account: ACCOUNT, publicClient: alwaysThrows, operation: hydrated, pollMs: 5 }),
    )
    await waitFor(() => expect(result.current.position.status).toBe('unavailable'))
    expect(result.current.operation?.state).toBe('submitted')
    expect(result.current.operation?.state).not.toBe('succeeded')
  })
})
