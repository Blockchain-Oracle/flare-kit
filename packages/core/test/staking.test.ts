import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import { type StakingDeployment, stakingFor } from '@flarekit-dev/contracts'
import type { StakeIntent, StakeLimits } from '../src/stake-adapter.js'
import type { ValidatorInfo } from '../src/pchain-rpc.js'
import { planStake } from '../src/staking.js'

// M11: the stake plan builder. Mirrors the M10 delegation Result convention
// (`{ ok:true, plan } | { ok:false, error }`). The VERIFIED GATE runs FIRST — before any
// invariant — and every bound is enforced from the LIVE-read `StakeLimits` (never a
// hardcoded 50k/14-day literal). The irreversible ≥14-day value-lock is surfaced as
// explicit plan data before signing.

const BASE = stakingFor('coston2')!
const VERIFIED: StakingDeployment = { ...BASE, stakeVerified: true }
const UNVERIFIED: StakingDeployment = { ...BASE, stakeVerified: false }

// The LIVE-read bounds (as `readStakeLimits` would return them): amounts in wei,
// durations in seconds. Deliberately NOT the doc literals — the builder must read these.
const LIMITS: StakeLimits = {
  minAmount: 50_000n * 10n ** 18n,
  maxAmount: 200_000_000n * 10n ** 18n,
  minDuration: 1_209_600n, // 14 days
  maxDuration: 31_536_000n, // 365 days
}

const NODE = 'NodeID-P7oB2McjBGgW2NXXWVYjV8JEDFoW9xDE5'
const REWARD: Address = '0x00000000000000000000000000000000000000A1'
const START = 1_800_000_000n
const DURATION = 2_000_000n // within [14d, 365d]
const VALID_END = START + DURATION

// A validator whose active window comfortably contains the stake window.
const VALIDATORS: ValidatorInfo[] = [
  { nodeId: NODE, startTime: 1_700_000_000n, endTime: 1_900_000_000n, weight: 0n },
]

function intent(over: Partial<StakeIntent> = {}): StakeIntent {
  return {
    nodeId: NODE,
    amount: LIMITS.minAmount,
    startTime: START,
    endTime: VALID_END,
    rewardAddress: REWARD,
    ...over,
  }
}

function plan(over: Partial<StakeIntent> = {}, validators = VALIDATORS, deployment = VERIFIED) {
  return planStake({ intent: intent(over), deployment, limits: LIMITS, validators })
}

describe('planStake — verified gate FIRST (M11)', () => {
  it('refuses with unverified when stakeVerified is false, producing no plan', () => {
    const result = plan({}, VALIDATORS, UNVERIFIED)
    expect(result).toEqual({ ok: false, error: { code: 'unverified' } })
  })

  it('the gate wins over an otherwise-invalid intent — checked before any bound', () => {
    // amount below min AND unverified → still unverified, never amount_below_min.
    const result = plan({ amount: 0n }, VALIDATORS, UNVERIFIED)
    expect(result).toEqual({ ok: false, error: { code: 'unverified' } })
  })
})

describe('planStake — live-read amount bounds (M11)', () => {
  it('rejects an amount below the live minimum with amount_below_min carrying the bound', () => {
    const result = plan({ amount: LIMITS.minAmount - 1n })
    expect(result).toEqual({ ok: false, error: { code: 'amount_below_min', min: LIMITS.minAmount } })
  })

  it('accepts exactly the minimum (the bound is inclusive)', () => {
    const result = plan({ amount: LIMITS.minAmount })
    expect(result.ok).toBe(true)
  })

  it('rejects an amount above the live maximum with amount_above_max carrying the bound', () => {
    const result = plan({ amount: LIMITS.maxAmount + 1n })
    expect(result).toEqual({ ok: false, error: { code: 'amount_above_max', max: LIMITS.maxAmount } })
  })
})

describe('planStake — live-read duration bounds (M11)', () => {
  it('rejects a duration below the live minimum with duration_below_min', () => {
    const result = plan({ endTime: START + LIMITS.minDuration - 1n })
    expect(result).toEqual({ ok: false, error: { code: 'duration_below_min', min: LIMITS.minDuration } })
  })

  it('rejects a duration above the live maximum with duration_above_max', () => {
    // A validator wide enough that the duration bound — not the window — is what trips.
    const wide: ValidatorInfo[] = [
      { nodeId: NODE, startTime: START, endTime: START + LIMITS.maxDuration + 10n, weight: 0n },
    ]
    const result = plan({ endTime: START + LIMITS.maxDuration + 1n }, wide)
    expect(result).toEqual({ ok: false, error: { code: 'duration_above_max', max: LIMITS.maxDuration } })
  })
})

describe('planStake — the stake cannot outlive its validator (M11)', () => {
  it('rejects when the chosen validator ends before the stake ends (ends_after_validator)', () => {
    const shortWindow: ValidatorInfo[] = [
      { nodeId: NODE, startTime: 1_700_000_000n, endTime: VALID_END - 1n, weight: 0n },
    ]
    const result = plan({}, shortWindow)
    expect(result).toEqual({ ok: false, error: { code: 'ends_after_validator', validatorEnd: VALID_END - 1n } })
  })

  it('rejects a stake to a validator absent from the live set (no active window to honor)', () => {
    const result = plan({ nodeId: 'NodeID-not-in-the-live-set' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a rejection')
    expect(result.error.code).toBe('ends_after_validator')
  })
})

describe('planStake — a valid intent surfaces the irreversible value-lock (M11)', () => {
  it('returns { ok:true, plan } whose plan carries the ≥14-day value-lock as explicit data', () => {
    const result = plan()
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected a plan')
    // The irreversible lock is stated BEFORE signing: amount committed, when it unlocks,
    // how long it is locked, and that it cannot be exited early.
    expect(result.plan.valueLock).toEqual({
      amount: LIMITS.minAmount,
      unlockAt: VALID_END,
      lockSeconds: DURATION,
      irreversible: true,
    })
    expect(result.plan.intent).toEqual(intent())
    expect(result.plan.steps.length).toBeGreaterThan(0)
  })
})
