import {
  type ClaimIntent,
  type FtsoReward,
  type RewardsClaimPlan,
  type RewardsReads,
  MOCK_REWARDS_OBSERVED,
  applyTransition,
  createMockRewardsAdapter,
  createOperation,
  reconcileClaim,
} from '@flare-kit/core'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRewards, type RewardsOperation } from '../src/use-rewards.js'

type Hex0x = `0x${string}`
const RECIPIENT: Hex0x = '0x00000000000000000000000000000000000000D4'

/**
 * Mirrors `rewards-states.test.ts`'s `submittedClaimRecord` fixture builder, but walks
 * the FULL legal state path (draft→quoting→ready→executing→submitted) —
 * `applyTransition` silently drops the patch on an illegal hop (a jump straight to
 * `executing` is not one), so skipping a leg would strand this fixture back at `draft`.
 */
function submittedClaimRecord(intent: ClaimIntent, awaitType: string, id: string): RewardsOperation {
  const base = createOperation<ClaimIntent, unknown, RewardsClaimPlan>({ capability: 'rewards_claim', network: 114, intent, now: 0, id })
  const steps = [
    { id: 'call-0', type: 'claim', actor: 'your_wallet' as const, state: 'pending' as const, attempts: 0 },
    { id: 'record', type: awaitType, actor: 'flare' as const, state: 'pending' as const, attempts: 0 },
  ]
  const quoting = applyTransition(base, { to: 'quoting', at: 0 }).record
  const ready = applyTransition(quoting, { to: 'ready', at: 0 }).record
  const executing = applyTransition(ready, { to: 'executing', at: 0, patch: { steps } }).record
  return applyTransition(executing, { to: 'submitted', at: 0 }).record
}

function reward(over: Partial<FtsoReward> = {}): FtsoReward {
  return {
    kind: 'ftso-delegation',
    epoch: 5928,
    amount: 5n,
    claimType: 2,
    proof: ['0xaa'],
    expiresAtEpoch: 5902,
    source: { url: 'https://mirror.example', official: false },
    ...over,
  }
}

function reads(over: Partial<RewardsReads> = {}): RewardsReads {
  return {
    currentRewardEpoch: 5930,
    claimableEpochs: [5927, 5928],
    expireNextEpoch: 5902,
    ftso: [],
    rnat: { kind: 'rnat', month: 26, wNat: 0n, rnat: 0n, locked: 0n, hasProject: false },
    flaredrop: { kind: 'flaredrop', claimableMonths: [], amount: 0n, concluded: true },
    // T8 wired staking in as the 4th ClaimKind: an honest on-chain (0,0) → claimable 0n,
    // NON-EXPIRING — the same blank-slate shape the other kinds carry here.
    staking: { kind: 'staking', total: 0n, claimed: 0n, claimable: 0n, expires: false },
    ...over,
  }
}

describe('useRewards — the claimable reads (M10)', () => {
  it('surfaces the real observed empty/legacy reads: no ftso entitlement, no RNat project, FlareDrop concluded', async () => {
    const adapter = createMockRewardsAdapter()
    const { result } = renderHook(() =>
      useRewards({ account: MOCK_REWARDS_OBSERVED.account, adapter, reconcile: (account) => adapter.read(account), pollMs: 5 }),
    )
    await waitFor(() => expect(result.current.reads).toBeDefined())
    expect(result.current.reads?.ftso).toEqual([])
    expect(result.current.reads?.rnat.hasProject).toBe(false)
    expect(result.current.reads?.flaredrop.concluded).toBe(true)
    expect(result.current.reads?.flaredrop.claimableMonths).toEqual([])
  })

  it('a transient read error clears once a later poll succeeds — never a sticky failure', async () => {
    const adapter = createMockRewardsAdapter()
    let calls = 0
    const reconcile = async (account: Hex0x) => {
      calls += 1
      if (calls === 1) throw new Error('lagged Coston2 RPC')
      return adapter.read(account)
    }
    const { result } = renderHook(() => useRewards({ account: MOCK_REWARDS_OBSERVED.account, adapter, reconcile, pollMs: 5 }))
    // the first poll's error is transient and racy to observe directly (mirrors
    // use-bridge.test.tsx: prove it cleared by checking it AT the successful read, not
    // mid-flight — a 50ms `waitFor` tick can miss a 5ms error window entirely).
    await waitFor(() => expect(result.current.reads).toBeDefined())
    expect(result.current.error).toBeUndefined()
  })
})

describe('useRewards — the proof-fetch state (present / proof-unavailable) (M10)', () => {
  it('a proof never observed for this account is declared proof-unavailable — never a claimable amount', async () => {
    const adapter = createMockRewardsAdapter()
    const { result } = renderHook(() => useRewards({ account: MOCK_REWARDS_OBSERVED.account, adapter }))
    const proof = await result.current.fetchProof(MOCK_REWARDS_OBSERVED.proofPresentEpoch)
    expect(proof).toEqual({ status: 'proof-unavailable' })
  })

  it('a real observed mirror proof (for its actual beneficiary) is returned present, never fabricated', async () => {
    const adapter = createMockRewardsAdapter({ account: MOCK_REWARDS_OBSERVED.proofPresentBeneficiary })
    const { result } = renderHook(() => useRewards({ account: MOCK_REWARDS_OBSERVED.proofPresentBeneficiary, adapter }))
    const proof = await result.current.fetchProof(MOCK_REWARDS_OBSERVED.proofPresentEpoch)
    expect(proof).toEqual({
      status: 'available',
      amount: MOCK_REWARDS_OBSERVED.proofPresentAmount,
      claimType: MOCK_REWARDS_OBSERVED.proofPresentClaimType,
      proof: MOCK_REWARDS_OBSERVED.proofPresentMerkleProof,
    })
  })
})

describe('useRewards — the plan builder (M10)', () => {
  it('is undefined before a read lands', () => {
    const adapter = createMockRewardsAdapter()
    const { result } = renderHook(() => useRewards({ account: MOCK_REWARDS_OBSERVED.account, adapter }))
    expect(result.current.buildPlan({ kind: 'flaredrop', recipient: RECIPIENT, month: 5, wrap: false })).toBeUndefined()
  })

  it('surfaces the carried not-verified gate honestly (rewardsVerified is carried false past M10)', async () => {
    const adapter = createMockRewardsAdapter()
    const { result } = renderHook(() =>
      useRewards({ account: MOCK_REWARDS_OBSERVED.account, adapter, reconcile: (account) => adapter.read(account), pollMs: 5 }),
    )
    await waitFor(() => expect(result.current.reads).toBeDefined())
    const plan = result.current.buildPlan({ kind: 'flaredrop', recipient: RECIPIENT, month: 5, wrap: false })
    expect(plan).toEqual({ kind: 'error', error: { kind: 'not-verified' } })
  })

  it('builds a real ftso-delegation plan once verified with a proven reward', async () => {
    const base = createMockRewardsAdapter()
    const adapter = { ...base, deployment: { ...base.deployment, rewardsVerified: true } }
    const claimableReads = reads({ ftso: [reward()] })
    const { result } = renderHook(() =>
      useRewards({ account: MOCK_REWARDS_OBSERVED.account, adapter, reconcile: async () => claimableReads, pollMs: 5 }),
    )
    await waitFor(() => expect(result.current.reads).toBeDefined())
    const plan = result.current.buildPlan({ kind: 'ftso-delegation', recipient: RECIPIENT, wrap: false })
    expect(plan?.kind).toBe('plan')
    if (plan?.kind !== 'plan') throw new Error('expected a plan')
    expect(plan.plan.claimKind).toBe('ftso-delegation')
  })

  it('a reward missing its proof is refused honestly as proof-unavailable, never a claimable plan', async () => {
    const base = createMockRewardsAdapter()
    const adapter = { ...base, deployment: { ...base.deployment, rewardsVerified: true } }
    const claimableReads = reads({ ftso: [reward({ proof: [] })] })
    const { result } = renderHook(() =>
      useRewards({ account: MOCK_REWARDS_OBSERVED.account, adapter, reconcile: async () => claimableReads, pollMs: 5 }),
    )
    await waitFor(() => expect(result.current.reads).toBeDefined())
    const plan = result.current.buildPlan({ kind: 'ftso-delegation', recipient: RECIPIENT, wrap: false })
    expect(plan).toEqual({ kind: 'error', error: { kind: 'proof-unavailable', epoch: 5928 } })
  })
})

describe('useRewards — the submit path (calls go via the host onSubmit) (M10)', () => {
  it('forwards the plan to onSubmit and returns the new operation, never fabricating succeeded', async () => {
    const submitted = submittedClaimRecord({ kind: 'flaredrop', recipient: RECIPIENT, month: 5, wrap: false }, 'await_flaredrop_claim', 'drop1')
    const onSubmit = vi.fn().mockResolvedValue(submitted)
    const { result } = renderHook(() => useRewards({ account: MOCK_REWARDS_OBSERVED.account, adapter: undefined, onSubmit }))
    const plan = { steps: [], calls: [], claimKind: 'flaredrop' as const }
    const outcome = await result.current.submit(plan)
    expect(outcome?.state).toBe('submitted')
    expect(outcome?.state).not.toBe('succeeded')
    expect(onSubmit).toHaveBeenCalledWith(plan)
  })
})

describe('useRewards — three DISTINCT claim kinds, tracked INDEPENDENTLY (R-REWARD-002) (M10)', () => {
  it('ftso reaching succeeded never moves rnat or flaredrop — each kind carries its own operation/state', async () => {
    const ftsoOp = submittedClaimRecord({ kind: 'ftso-delegation', recipient: RECIPIENT, wrap: false }, 'await_ftso_claim', 'ftso1')
    const rnatOp = submittedClaimRecord({ kind: 'rnat', projectIds: [1n], month: 26 }, 'await_rnat_claim', 'rnat1')
    const flaredropOp = submittedClaimRecord({ kind: 'flaredrop', recipient: RECIPIENT, month: 5, wrap: false }, 'await_flaredrop_claim', 'drop1')

    const { result } = renderHook(() =>
      useRewards({
        account: MOCK_REWARDS_OBSERVED.account,
        adapter: undefined,
        pollMs: 5,
        ftso: { operation: ftsoOp, reconcile: async (op) => reconcileClaim(op, true, Date.now()) },
        rnat: { operation: rnatOp, reconcile: async (op) => reconcileClaim(op, false, Date.now()) },
        flaredrop: { operation: flaredropOp }, // no reconcile — never polled, stays exactly as submitted
      }),
    )

    await waitFor(() => expect(result.current.ftso.operation?.state).toBe('succeeded'))
    // rnat, polled with an unconfirmed read, stays awaiting — never dragged to succeeded by ftso's poll.
    await waitFor(() => expect(result.current.rnat.operation?.state).toBe('awaiting_external'))
    expect(result.current.ftso.isSettled).toBe(true)
    expect(result.current.rnat.isSettled).toBe(false)
    // flaredrop was never given a reconcile — it never advances past what the host submitted.
    expect(result.current.flaredrop.operation?.state).toBe('submitted')
    expect(result.current.flaredrop.isSettled).toBe(false)
  })
})
