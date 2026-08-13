import { describe, expect, it } from 'vitest'
import { applyTransition, createOperation } from '../src/operation.js'
import { STAKE_CAPABILITY, reconcileStake } from '../src/stake-states.js'
import { planStake } from '../src/staking.js'
import type { StakeIntent } from '../src/stake-adapter.js'
import { MOCK_STAKE_OBSERVED, createMockStakeReads, mockStakingDeployment } from '../src/index.js'

const OBS = MOCK_STAKE_OBSERVED

describe('mock-stake — reproduces the Task-6 observed keyless reads (M11-R7)', () => {
  it('blank-slate reads match the observed dry run exactly (drives the REAL read functions)', async () => {
    const reads = await createMockStakeReads()

    // Validators are the live-read set (a faithful sample of the observed wire) — never invented.
    expect(reads.validators.length).toBeGreaterThanOrEqual(3)
    expect(reads.validators[0]).toEqual({
      nodeId: 'NodeID-BR9YCsrXGVsc8sUoraVrBkWemnPGRSqYZ',
      startTime: 1_778_834_610n,
      endTime: 1_786_611_061n,
      weight: 5_000_000_000_000_000n * 1_000_000_000n, // 5,000,000 FLR self-stake, wei
    })

    // Live-read limits (verifier Gwei→wei; durations seconds), never a docs literal.
    expect(reads.limits.minAmount).toBe(OBS.minAmountWei)
    expect(reads.limits.maxAmount).toBe(OBS.maxAmountWei)
    expect(reads.limits.minDuration).toBe(OBS.minDurationSeconds)
    expect(reads.limits.maxDuration).toBe(OBS.maxDurationSeconds)

    // The P-chain getMinStake cross-check the probe recorded (verifier === getMinStake.minDelegator).
    expect(reads.minStake.minDelegatorStake).toBe(OBS.minAmountWei)
    expect(reads.minStake.minValidatorStake).toBe(1_000_000n * 10n ** 18n)
    expect(reads.limits.minAmount).toBe(reads.minStake.minDelegatorStake)

    // Honest empty / observed zero — nothing fabricated.
    expect(reads.positions).toEqual([]) // readStakesOf found no position for the account
    expect(reads.mirrorVotePower).toBe(0n) // a genuine on-chain balanceOf zero (a real read)
    expect(reads.stakingReward).toEqual({
      kind: 'staking',
      total: 0n,
      claimed: 0n,
      claimable: 0n,
      expires: false,
    })
  })
})

describe('mock-stake refuses the unobserved — no signable stake was ever verified', () => {
  it('the mock deployment is HONESTLY stakeVerified:false — no broadcast landed', () => {
    expect(mockStakingDeployment().stakeVerified).toBe(false)
  })

  it('planStake against the honest (unverified) mock deployment refuses `unverified`, even for a valid intent', async () => {
    const { deployment, limits, validators } = await createMockStakeReads()
    const now = 1_786_100_000n
    const intent: StakeIntent = {
      nodeId: OBS.chosenValidator,
      amount: OBS.minAmountWei,
      startTime: now,
      endTime: now + OBS.minDurationSeconds,
      rewardAddress: OBS.account,
    }
    const r = planStake({ intent, deployment, limits, validators })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('unverified')
  })

  it('a network the live run never drove throws (never invents mainnet)', () => {
    expect(() => mockStakingDeployment('flare')).toThrow(/refuses to invent/)
  })
})

describe('mock-stake drives the REAL planStake invariants under an explicit verified OVERRIDE', () => {
  // An EXPLICIT test override — NOT the shipped state (which stays stakeVerified:false). It
  // proves the live-read bounds + the value-lock disclosure; it never fabricates a succeeded stake.
  const now = 1_786_100_000n
  const valid = (over: Partial<StakeIntent> = {}): StakeIntent => ({
    nodeId: OBS.chosenValidator,
    amount: OBS.minAmountWei,
    startTime: now,
    endTime: now + OBS.minDurationSeconds,
    rewardAddress: OBS.account,
    ...over,
  })

  it('a valid intent yields the plan + the irreversible 14-day, 50,000-FLR value-lock', async () => {
    const { limits, validators } = await createMockStakeReads()
    const deployment = { ...mockStakingDeployment(), stakeVerified: true }
    const r = planStake({ intent: valid(), deployment, limits, validators })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.plan.valueLock.amount).toBe(OBS.minAmountWei)
      expect(r.plan.valueLock.lockSeconds).toBe(OBS.minDurationSeconds)
      expect(r.plan.valueLock.irreversible).toBe(true)
    }
  })

  it('below the live 50,000-FLR minimum → amount_below_min', async () => {
    const { limits, validators } = await createMockStakeReads()
    const deployment = { ...mockStakingDeployment(), stakeVerified: true }
    const r = planStake({ intent: valid({ amount: OBS.minAmountWei - 1n }), deployment, limits, validators })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('amount_below_min')
  })

  it('below the live 14-day minimum → duration_below_min', async () => {
    const { limits, validators } = await createMockStakeReads()
    const deployment = { ...mockStakingDeployment(), stakeVerified: true }
    const r = planStake({ intent: valid({ endTime: now + OBS.minDurationSeconds - 1n }), deployment, limits, validators })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('duration_below_min')
  })

  it('an end past the chosen validator window → ends_after_validator', async () => {
    const { limits, validators } = await createMockStakeReads()
    const deployment = { ...mockStakingDeployment(), stakeVerified: true }
    const r = planStake({ intent: valid({ endTime: OBS.chosenValidatorEnd + 1n }), deployment, limits, validators })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('ends_after_validator')
  })
})

describe('mock-stake drives the REAL reconcileStake — never conjures a succeeded stake', () => {
  const NOW = 1_786_100_000

  function submittedStakeRecord() {
    const intent: StakeIntent = {
      nodeId: OBS.chosenValidator,
      amount: OBS.minAmountWei,
      startTime: BigInt(NOW),
      endTime: BigInt(NOW) + OBS.minDurationSeconds,
      rewardAddress: OBS.account,
    }
    const base = createOperation({ capability: STAKE_CAPABILITY, network: 114, intent, now: NOW, id: 'mockstk1' })
    const steps = [
      { id: 'export', type: 'transfer_to_p', actor: 'your_wallet', state: 'pending', attempts: 0 },
      { id: 'delegate', type: 'delegate', actor: 'your_wallet', state: 'pending', attempts: 0 },
      { id: 'record', type: 'await_stake', actor: 'flare', state: 'pending', attempts: 0 },
    ] as const
    const executing = applyTransition(base, { to: 'executing', at: NOW, patch: { steps: [...steps] } }).record
    return applyTransition(executing, { to: 'submitted', at: NOW }).record
  }

  it('the observed blank-slate position ([] → undefined) stays awaiting_external, NEVER succeeded', async () => {
    const { positions } = await createMockStakeReads()
    // The live run observed no position — the honest in-flight read the reconciler receives is `undefined`.
    const stakePosition = positions[0]
    expect(stakePosition).toBeUndefined()
    const r = reconcileStake(submittedStakeRecord(), { leg: 'stake', now: NOW + 1000, stakePosition })
    expect(r.state).toBe('awaiting_external')
    expect(r.state).not.toBe('succeeded')
  })
})

describe('mock-stake — the mirror is unavailable, never a fabricated zero', () => {
  it('a reverting mirror read surfaces as undefined (unavailable), never 0n', async () => {
    const { mirrorVotePower } = await createMockStakeReads({ mirrorUnavailable: true })
    expect(mirrorVotePower).toBeUndefined()
    expect(mirrorVotePower).not.toBe(0n)
  })
})
