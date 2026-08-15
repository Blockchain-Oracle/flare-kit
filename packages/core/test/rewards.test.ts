import { describe, expect, it } from 'vitest'
import type { Address, PublicClient } from 'viem'
import { rewardsFor } from '@flarekit-dev/contracts'
import { type FtsoReward, type RewardsReads, makeRewardsAdapter } from '../src/rewards-adapter.js'
import { type ClaimIntent, buildRewardsClaimPlan } from '../src/rewards.js'

// M10 Task 7 + M11 Task 8: the claim plan builder. Mirrors the vault/delegation Result
// convention (`{ kind: 'plan' } | { kind: 'error' }`). The VERIFIED GATE runs FIRST
// (rewardsVerified is CARRIED false past M10). Then each of the FOUR DISTINCT kinds is gated on
// its OWN reality — never collapsed into a generic claim (R-REWARD-002). The 4th kind (staking)
// is NON-EXPIRING: honest-empty when claimable is 0, else a ValidatorRewardManager.claim plan.

const UNVERIFIED = rewardsFor('coston2')! // rewardsVerified: false in this build (carried)
const VERIFIED = { ...UNVERIFIED, rewardsVerified: true }
const ACCOUNT: Address = '0x00000000000000000000000000000000000000C3'
const RECIPIENT: Address = '0x00000000000000000000000000000000000000D4'

// The build* methods never touch the client, so a bare stub is enough for the plan.
const adapter = makeRewardsAdapter({} as unknown as PublicClient, VERIFIED)
const unverifiedAdapter = makeRewardsAdapter({} as unknown as PublicClient, UNVERIFIED)

function reward(over: Partial<FtsoReward> = {}): FtsoReward {
  return {
    kind: 'ftso-delegation',
    epoch: 5928,
    amount: 5n,
    claimType: 2,
    proof: ['0xaa'],
    expiresAtEpoch: 5902,
    source: VERIFIED.ftsoProofSource,
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
    staking: { kind: 'staking', total: 0n, claimed: 0n, claimable: 0n, expires: false },
    ...over,
  }
}

const FTSO: ClaimIntent = { kind: 'ftso-delegation', recipient: RECIPIENT, wrap: false }
const RNAT: ClaimIntent = { kind: 'rnat', projectIds: [1n], month: 26 }
const DROP: ClaimIntent = { kind: 'flaredrop', recipient: RECIPIENT, month: 5, wrap: false }
const STAKING: ClaimIntent = { kind: 'staking', recipient: RECIPIENT, wrap: false }

describe('buildRewardsClaimPlan — verified gate FIRST, carried past M10 (M10)', () => {
  it('refuses not-verified before any per-kind check, even with a fully claimable reading', () => {
    const claimable = reads({
      ftso: [reward()],
      rnat: { kind: 'rnat', month: 26, wNat: 1n, rnat: 1n, locked: 1n, hasProject: true },
      flaredrop: { kind: 'flaredrop', claimableMonths: [5], amount: 0n, concluded: true },
      staking: { kind: 'staking', total: 9n, claimed: 1n, claimable: 8n, expires: false },
    })
    for (const intent of [FTSO, RNAT, DROP, STAKING]) {
      const r = buildRewardsClaimPlan(unverifiedAdapter, UNVERIFIED, ACCOUNT, intent, claimable)
      expect(r).toEqual({ kind: 'error', error: { kind: 'not-verified' } })
    }
  })
})

describe('buildRewardsClaimPlan — ftso-delegation (distinct: epoch/proof/expiry) (M10)', () => {
  it('empty ftso → no-entitlement (the account earned nothing)', () => {
    const r = buildRewardsClaimPlan(adapter, VERIFIED, ACCOUNT, FTSO, reads({ ftso: [] }))
    expect(r).toEqual({ kind: 'error', error: { kind: 'no-entitlement' } })
  })

  it('a reward missing its proof → proof-unavailable carrying the epoch', () => {
    const r = buildRewardsClaimPlan(adapter, VERIFIED, ACCOUNT, FTSO, reads({ ftso: [reward({ proof: [] })] }))
    expect(r).toEqual({ kind: 'error', error: { kind: 'proof-unavailable', epoch: 5928 } })
  })

  it('a reward with its proof → a plan whose call claims on the reward manager', () => {
    const r = buildRewardsClaimPlan(adapter, VERIFIED, ACCOUNT, FTSO, reads({ ftso: [reward()] }))
    expect(r.kind).toBe('plan')
    if (r.kind !== 'plan') throw new Error('expected a plan')
    expect(r.plan.claimKind).toBe('ftso-delegation')
    expect(r.plan.calls[0]!.abiKind).toBe('reward-manager')
    expect(r.plan.calls[0]!.functionName).toBe('claim')
    expect(r.plan.steps.length).toBeGreaterThan(0)
  })
})

describe('buildRewardsClaimPlan — rnat (distinct: locked/burn) (M10)', () => {
  it('!hasProject → no-entitlement (no project assigned rewards)', () => {
    const r = buildRewardsClaimPlan(adapter, VERIFIED, ACCOUNT, RNAT, reads())
    expect(r).toEqual({ kind: 'error', error: { kind: 'no-entitlement' } })
  })

  it('hasProject → a claimRewards plan', () => {
    const withProject = reads({ rnat: { kind: 'rnat', month: 26, wNat: 1n, rnat: 1n, locked: 1n, hasProject: true } })
    const r = buildRewardsClaimPlan(adapter, VERIFIED, ACCOUNT, RNAT, withProject)
    if (r.kind !== 'plan') throw new Error('expected a plan')
    expect(r.plan.claimKind).toBe('rnat')
    expect(r.plan.calls[0]!.functionName).toBe('claimRewards')
  })

  it('the withdraw intent → the withdrawAll (50%-burn) plan, not claimRewards', () => {
    const withProject = reads({ rnat: { kind: 'rnat', month: 26, wNat: 1n, rnat: 1n, locked: 1n, hasProject: true } })
    const intent: ClaimIntent = { kind: 'rnat', projectIds: [], month: 26, withdraw: true, wrap: false }
    const r = buildRewardsClaimPlan(adapter, VERIFIED, ACCOUNT, intent, withProject)
    if (r.kind !== 'plan') throw new Error('expected a plan')
    expect(r.plan.calls[0]!.functionName).toBe('withdrawAll')
    expect(r.plan.calls[0]!.args).toEqual([false])
  })
})

describe('buildRewardsClaimPlan — flaredrop (distinct: concluded/month) (M10)', () => {
  it('empty claimableMonths → concluded', () => {
    const r = buildRewardsClaimPlan(adapter, VERIFIED, ACCOUNT, DROP, reads())
    expect(r).toEqual({ kind: 'error', error: { kind: 'concluded' } })
  })

  it('a claimable month → a distribution claim plan', () => {
    const dropReads = reads({ flaredrop: { kind: 'flaredrop', claimableMonths: [5], amount: 0n, concluded: true } })
    const r = buildRewardsClaimPlan(adapter, VERIFIED, ACCOUNT, DROP, dropReads)
    if (r.kind !== 'plan') throw new Error('expected a plan')
    expect(r.plan.claimKind).toBe('flaredrop')
    expect(r.plan.calls[0]!.abiKind).toBe('distribution')
  })
})

describe('buildRewardsClaimPlan — staking (distinct: NON-EXPIRING, ValidatorRewardManager) (M11)', () => {
  it('claimable 0 (total === claimed) → no-entitlement (honest empty, a delayed leg)', () => {
    const r = buildRewardsClaimPlan(adapter, VERIFIED, ACCOUNT, STAKING, reads())
    expect(r).toEqual({ kind: 'error', error: { kind: 'no-entitlement' } })
  })

  it('claimable > 0 → a plan claiming (owner, recipient, claimable, wrap) on the ValidatorRewardManager', () => {
    const staked = reads({ staking: { kind: 'staking', total: 500n, claimed: 200n, claimable: 300n, expires: false } })
    const r = buildRewardsClaimPlan(adapter, VERIFIED, ACCOUNT, STAKING, staked)
    if (r.kind !== 'plan') throw new Error('expected a plan')
    expect(r.plan.claimKind).toBe('staking')
    expect(r.plan.calls[0]!.abiKind).toBe('validator-reward-manager')
    expect(r.plan.calls[0]!.functionName).toBe('claim')
    // amount = the claimable delta (total − claimed) read off-chain, never a fabricated figure.
    expect(r.plan.calls[0]!.args).toEqual([ACCOUNT, RECIPIENT, 300n, false])
    expect(r.plan.steps.length).toBeGreaterThan(0)
  })

  it('is NON-EXPIRING: the staking read carries expires:false and NO epoch expiry (never the 25-epoch line)', () => {
    const staked = reads({ staking: { kind: 'staking', total: 5n, claimed: 0n, claimable: 5n, expires: false } })
    expect(staked.staking.expires).toBe(false)
    expect(staked.staking).not.toHaveProperty('expiresAtEpoch')
    // The plan for the staking kind never references an expiry epoch the way ftso does.
    const r = buildRewardsClaimPlan(adapter, VERIFIED, ACCOUNT, STAKING, staked)
    if (r.kind !== 'plan') throw new Error('expected a plan')
    expect(r.plan.calls[0]!.args).not.toContain(staked.expireNextEpoch)
  })
})

describe('buildRewardsClaimPlan — the four kinds carry DISTINCT shapes, never one generic claim (M10/M11)', () => {
  it('the ftso / rnat / flaredrop / staking plans target different contracts and carry different facts', () => {
    const ftsoPlan = buildRewardsClaimPlan(adapter, VERIFIED, ACCOUNT, FTSO, reads({ ftso: [reward()] }))
    const rnatPlan = buildRewardsClaimPlan(
      adapter,
      VERIFIED,
      ACCOUNT,
      RNAT,
      reads({ rnat: { kind: 'rnat', month: 26, wNat: 1n, rnat: 1n, locked: 1n, hasProject: true } }),
    )
    const dropPlan = buildRewardsClaimPlan(
      adapter,
      VERIFIED,
      ACCOUNT,
      DROP,
      reads({ flaredrop: { kind: 'flaredrop', claimableMonths: [5], amount: 0n, concluded: true } }),
    )
    const stakePlan = buildRewardsClaimPlan(
      adapter,
      VERIFIED,
      ACCOUNT,
      STAKING,
      reads({ staking: { kind: 'staking', total: 7n, claimed: 0n, claimable: 7n, expires: false } }),
    )
    if (ftsoPlan.kind !== 'plan' || rnatPlan.kind !== 'plan' || dropPlan.kind !== 'plan' || stakePlan.kind !== 'plan') {
      throw new Error('expected four plans')
    }
    // distinct claimKind discriminators
    expect(new Set([ftsoPlan.plan.claimKind, rnatPlan.plan.claimKind, dropPlan.plan.claimKind, stakePlan.plan.claimKind]).size).toBe(4)
    // distinct target contract per kind
    expect(ftsoPlan.plan.calls[0]!.abiKind).toBe('reward-manager')
    expect(rnatPlan.plan.calls[0]!.abiKind).toBe('rnat')
    expect(dropPlan.plan.calls[0]!.abiKind).toBe('distribution')
    expect(stakePlan.plan.calls[0]!.abiKind).toBe('validator-reward-manager')
    // distinct read-state facts (a generic claim would flatten these away)
    expect(reward()).toHaveProperty('expiresAtEpoch')
    expect(reads().rnat).toHaveProperty('locked')
    expect(reads().flaredrop).toHaveProperty('concluded')
    expect(reads().staking).toHaveProperty('expires', false)
  })
})
