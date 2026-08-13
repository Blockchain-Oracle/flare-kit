import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import { applyTransition, createOperation } from '../src/operation.js'
import { reconcileClaim } from '../src/rewards-states.js'
import { buildRewardsClaimPlan } from '../src/rewards.js'
import type { ClaimIntent } from '../src/rewards.js'
import type { FtsoReward } from '../src/rewards-adapter.js'
import { MOCK_REWARDS_OBSERVED, createMockRewardsAdapter } from '../src/index.js'

// M10 Task 9 + M11 Task 8: the rewards mock, written AFTER the live keyless read pass. It
// reproduces the two OBSERVED contract reverts as real thrown Errors, so the REAL
// adapter's revert-catch (Task 7) runs unmodified — the honest-empty shapes below can
// ONLY come from that catch, because the fake client's getBalancesOf/getClaimableMonths
// handlers never return a value, only throw. The 4th kind (staking) reproduces the OBSERVED
// ValidatorRewardManager.getStateOfRewards (0,0) → honest-empty, non-expiring.

const ACCOUNT = MOCK_REWARDS_OBSERVED.account
const RECIPIENT: Address = '0x00000000000000000000000000000000000000D4'
const FTSO_INTENT: ClaimIntent = { kind: 'ftso-delegation', recipient: RECIPIENT, wrap: false }
const DROP_INTENT: ClaimIntent = { kind: 'flaredrop', recipient: RECIPIENT, month: 1, wrap: false }
const STAKING_INTENT: ClaimIntent = { kind: 'staking', recipient: RECIPIENT, wrap: false }

describe('mock-rewards — reproduces the observed RewardsReads shape (M10-R8)', () => {
  it('blank-slate account: matches the observed live read exactly (via the two reverts, never bypassed)', async () => {
    const adapter = createMockRewardsAdapter()
    const reads = await adapter.read(ACCOUNT)
    expect(reads.currentRewardEpoch).toBe(MOCK_REWARDS_OBSERVED.currentRewardEpoch)
    expect(reads.expireNextEpoch).toBe(MOCK_REWARDS_OBSERVED.expireNextEpoch)
    expect(reads.claimableEpochs).toHaveLength(28)
    expect(reads.claimableEpochs[0]).toBe(MOCK_REWARDS_OBSERVED.claimableEpochStart)
    expect(reads.claimableEpochs[27]).toBe(MOCK_REWARDS_OBSERVED.claimableEpochEnd)
    expect(reads.ftso).toEqual([]) // no-entitlement — empty, never a faked 0
    // The mock's getBalancesOf handler ONLY throws "no RNat account" — it never returns
    // a value — so this resolved hasProject:false PROVES the real revert-catch ran.
    expect(reads.rnat).toEqual({ kind: 'rnat', month: MOCK_REWARDS_OBSERVED.rnatCurrentMonth, wNat: 0n, rnat: 0n, locked: 0n, hasProject: false })
    // Same for getClaimableMonths — the mock only throws "already finished".
    expect(reads.flaredrop).toEqual({ kind: 'flaredrop', claimableMonths: [], amount: 0n, concluded: true })
  })

  it('never fabricates a positive RNat/FlareDrop position — no config knob turns the reverts off', async () => {
    const adapter = createMockRewardsAdapter({ account: ACCOUNT })
    const reads = await adapter.read(ACCOUNT)
    expect(reads.rnat.hasProject).toBe(false)
    expect(reads.flaredrop.concluded).toBe(true)
  })
})

describe('mock-rewards — staking reward: the observed (0,0) read (M11, non-expiring)', () => {
  it('reproduces ValidatorRewardManager.getStateOfRewards (0,0) → honest-empty, expires:false', async () => {
    const adapter = createMockRewardsAdapter()
    const reads = await adapter.read(ACCOUNT)
    // The observed live read for the blank-slate account: total 0, claimed 0 → claimable 0. A
    // real on-chain (0,0), NOT a faked amount and NOT a reverted "no account" — the reward is a
    // delayed leg that only accrues after staking across epochs.
    expect(reads.staking).toEqual({
      kind: 'staking',
      total: MOCK_REWARDS_OBSERVED.stakingReward.total,
      claimed: MOCK_REWARDS_OBSERVED.stakingReward.claimed,
      claimable: 0n,
      expires: false,
    })
    expect(reads.staking).not.toHaveProperty('expiresAtEpoch')
  })

  it('no-entitlement: a verified OVERRIDE + the observed (0,0) staking read → honest empty, never a signable plan', async () => {
    const adapter = createMockRewardsAdapter()
    const reads = await adapter.read(ACCOUNT)
    const verified = { ...adapter.deployment, rewardsVerified: true }
    const r = buildRewardsClaimPlan(adapter, verified, ACCOUNT, STAKING_INTENT, reads)
    expect(r).toEqual({ kind: 'error', error: { kind: 'no-entitlement' } })
  })
})

describe('mock-rewards fetchFtsoProof — the unofficial mirror, REAL parser (M10-R8)', () => {
  it('returns null for our account on every probed epoch (proof-absent, as observed)', async () => {
    const adapter = createMockRewardsAdapter()
    expect(await adapter.fetchFtsoProof(MOCK_REWARDS_OBSERVED.claimableEpochStart, ACCOUNT)).toBeNull()
    expect(await adapter.fetchFtsoProof(MOCK_REWARDS_OBSERVED.proofPresentEpoch, ACCOUNT)).toBeNull()
    expect(await adapter.fetchFtsoProof(MOCK_REWARDS_OBSERVED.claimableEpochEnd, ACCOUNT)).toBeNull()
  })

  it('parses the REAL observed 5929 tuple for the other beneficiary (proof-present, trailing-n amount handled)', async () => {
    const adapter = createMockRewardsAdapter()
    const proof = await adapter.fetchFtsoProof(MOCK_REWARDS_OBSERVED.proofPresentEpoch, MOCK_REWARDS_OBSERVED.proofPresentBeneficiary)
    expect(proof).toEqual({
      amount: MOCK_REWARDS_OBSERVED.proofPresentAmount,
      claimType: MOCK_REWARDS_OBSERVED.proofPresentClaimType,
      proof: MOCK_REWARDS_OBSERVED.proofPresentMerkleProof,
    })
  })
})

describe('mock-rewards drives the REAL buildRewardsClaimPlan (M10-R8)', () => {
  it('not-verified: the unflipped carried deployment refuses a signable plan first', async () => {
    const adapter = createMockRewardsAdapter()
    expect(adapter.deployment.rewardsVerified).toBe(false) // carried past M10 — never flipped by the mock
    const reads = await adapter.read(ACCOUNT)
    const r = buildRewardsClaimPlan(adapter, adapter.deployment, ACCOUNT, FTSO_INTENT, reads)
    expect(r).toEqual({ kind: 'error', error: { kind: 'not-verified' } })
  })

  it('no-entitlement: a verified OVERRIDE + the observed empty ftso', async () => {
    const adapter = createMockRewardsAdapter()
    const reads = await adapter.read(ACCOUNT)
    const verified = { ...adapter.deployment, rewardsVerified: true }
    const r = buildRewardsClaimPlan(adapter, verified, ACCOUNT, FTSO_INTENT, reads)
    expect(r).toEqual({ kind: 'error', error: { kind: 'no-entitlement' } })
  })

  it('proof-unavailable: a reward whose mirror fetch returned null carries an unmerged (empty) proof', async () => {
    const adapter = createMockRewardsAdapter()
    const reads = await adapter.read(ACCOUNT)
    // Observed: fetchFtsoProof(5929, our account) is null — nothing to merge into proof.
    expect(await adapter.fetchFtsoProof(MOCK_REWARDS_OBSERVED.proofPresentEpoch, ACCOUNT)).toBeNull()
    const reward: FtsoReward = {
      kind: 'ftso-delegation',
      epoch: MOCK_REWARDS_OBSERVED.proofPresentEpoch,
      amount: 1n,
      claimType: 2,
      proof: [], // the null fetch leaves it unmerged — never a fabricated proof
      expiresAtEpoch: reads.expireNextEpoch,
      source: adapter.deployment.ftsoProofSource,
    }
    const verified = { ...adapter.deployment, rewardsVerified: true }
    const r = buildRewardsClaimPlan(adapter, verified, ACCOUNT, FTSO_INTENT, { ...reads, ftso: [reward] })
    expect(r).toEqual({ kind: 'error', error: { kind: 'proof-unavailable', epoch: MOCK_REWARDS_OBSERVED.proofPresentEpoch } })
  })

  it('concluded: a verified OVERRIDE + the observed empty (revert-mapped) flaredrop months', async () => {
    const adapter = createMockRewardsAdapter()
    const reads = await adapter.read(ACCOUNT)
    const verified = { ...adapter.deployment, rewardsVerified: true }
    const r = buildRewardsClaimPlan(adapter, verified, ACCOUNT, DROP_INTENT, reads)
    expect(r).toEqual({ kind: 'error', error: { kind: 'concluded' } })
  })
})

describe('mock-rewards drives the REAL reconcileClaim — succeeded ONLY from an explicit confirmation (M10-R8)', () => {
  const NOW = 1_700_000_000

  function submittedClaimRecord() {
    const base = createOperation({ capability: 'rewards_claim', network: 114, intent: { kind: 'ftso-delegation' }, now: NOW, id: 'mockclaim1' })
    const steps = [
      { id: 'call-0', type: 'claim', actor: 'your_wallet', state: 'pending', attempts: 0 },
      { id: 'record', type: 'await_ftso_claim', actor: 'flare', state: 'pending', attempts: 0 },
    ] as const
    const executing = applyTransition(base, { to: 'executing', at: NOW, patch: { steps: [...steps] } }).record
    return applyTransition(executing, { to: 'submitted', at: NOW }).record
  }

  it('an un-run (unconfirmed) claim stays awaiting_external, NEVER succeeded', () => {
    const r = reconcileClaim(submittedClaimRecord(), false, NOW + 1000)
    expect(r.state).toBe('awaiting_external')
    expect(r.state).not.toBe('succeeded')
  })

  it('reaches succeeded ONLY when the caller explicitly asserts confirmed:true (an observed on-chain read)', () => {
    const r = reconcileClaim(submittedClaimRecord(), true, NOW + 2000)
    expect(r.state).toBe('succeeded')
    expect(r.steps.every((s) => s.state === 'done')).toBe(true)
  })
})

describe('mock-rewards refuses the unobserved (M10-R8)', () => {
  it('a read for any account other than the one driven live THROWS (never invents its state)', async () => {
    const other: Address = '0x00000000000000000000000000000000000000FF'
    const adapter = createMockRewardsAdapter()
    await expect(adapter.read(other)).rejects.toThrow(/unobserved account/)
  })

  it('a network the live run never drove throws (never invents one)', () => {
    expect(() => createMockRewardsAdapter({}, 'flare')).toThrow(/refuses to invent/)
  })
})
