import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Address, PublicClient } from 'viem'
import { DISTRIBUTION_ABI, REWARD_MANAGER_ABI, RNAT_ABI, VALIDATOR_REWARD_MANAGER_ABI, rewardsFor, stakingFor } from '@flare-kit/contracts'
import { makeRewardsAdapter, rewardsAbiFor } from '../src/rewards-adapter.js'

// M10 Task 7 + M11 Task 8: the rewards adapter — now FOUR DISTINCT claim reads + call
// builders. The read gates `claimableEpochs` on the `rewardsHash` signed-epoch gate, maps the
// two probe-confirmed HONEST-EMPTY reverts ("no RNat account" / "already finished") to declared-
// empty state (never a faked zero), and RETHROWS a transport error (unknown ≠ empty). The
// FTSO proof comes from an explicitly-unofficial mirror; a miss/404/parse-error is `null`. The
// 4th kind (staking) reads `ValidatorRewardManager.getStateOfRewards → (total, claimed)` and is
// NON-EXPIRING — claimable = total − claimed, honest-empty when total === claimed.

const DEPLOYMENT = rewardsFor('coston2')!
const ACCOUNT: Address = '0x00000000000000000000000000000000000000C3'
const RECIPIENT: Address = '0x00000000000000000000000000000000000000D4'
const ZERO32 = `0x${'00'.repeat(32)}`
const HASH = `0x${'11'.repeat(32)}`

// The staking (4th) kind reads getStateOfRewards on the ValidatorRewardManager — a DIFFERENT
// contract than RewardManager v2, sharing the function NAME but returning a (total, claimed)
// tuple instead of the FTSO 2D array. The stub must dispatch by address, never by name alone.
const VALIDATOR = stakingFor('coston2')!.validatorRewardManager
const VALIDATOR_LC = VALIDATOR.toLowerCase()

type ReadArgs = { address?: Address; functionName: string; args?: readonly unknown[] }
type Handlers = Record<string, (args: readonly unknown[], address?: Address) => unknown>

/** Stub client dispatching by functionName (same shape as delegation-adapter.test.ts), plus an
 *  address route for the ValidatorRewardManager's getStateOfRewards (the 4th, staking, kind). */
function fakeClient(handlers: Handlers): PublicClient {
  return {
    async readContract({ address, functionName, args = [] }: ReadArgs) {
      if (functionName === 'getStateOfRewards' && String(address).toLowerCase() === VALIDATOR_LC) {
        const staking = handlers.getStakingState
        if (!staking) throw new Error('unexpected staking read getStateOfRewards')
        return staking(args, address)
      }
      const h = handlers[functionName]
      if (!h) throw new Error(`unexpected read ${functionName}`)
      return h(args, address)
    },
  } as unknown as PublicClient
}

const noRnatAccount = () => {
  throw new Error('The contract function "getBalancesOf" reverted with the following reason:\nno RNat account')
}
const alreadyFinished = () => {
  throw new Error('The contract function "getClaimableMonths" reverted with the following reason:\nalready finished')
}

/** A blank-slate handler set (matches the probe); individual tests override. The staking read
 *  defaults to the observed (0,0) → honest-empty; a funded case overrides `getStakingState`. */
function baseHandlers(over: Handlers = {}): Handlers {
  return {
    getCurrentRewardEpochId: () => 5930,
    getRewardEpochIdsWithClaimableRewards: () => [5927n, 5929n],
    getRewardEpochIdToExpireNext: () => 5902n,
    getStateOfRewards: () => [[], [], []],
    getStakingState: () => [0n, 0n],
    rewardsHash: ([epoch]) => (Number(epoch) === 5929 ? ZERO32 : HASH),
    getCurrentMonth: () => 26n,
    getBalancesOf: noRnatAccount,
    getClaimableMonths: alreadyFinished,
    ...over,
  }
}

describe('rewards adapter read — the signed-epoch gate (M10)', () => {
  it('excludes an unsigned epoch (rewardsHash 0) from claimableEpochs', async () => {
    const a = makeRewardsAdapter(fakeClient(baseHandlers()), DEPLOYMENT)
    const reads = await a.read(ACCOUNT)
    // range (5927,5929); 5929 is unsigned (hash 0) → excluded.
    expect(reads.claimableEpochs).toEqual([5927, 5928])
    expect(reads.claimableEpochs).not.toContain(5929)
    expect(reads.currentRewardEpoch).toBe(5930)
    expect(reads.expireNextEpoch).toBe(5902)
  })
})

describe('rewards adapter read — honest-empty reverts vs transport (M10)', () => {
  it('maps the blank-slate account to empty ftso, honest-empty rnat, concluded flaredrop', async () => {
    const a = makeRewardsAdapter(fakeClient(baseHandlers()), DEPLOYMENT)
    const reads = await a.read(ACCOUNT)
    expect(reads.ftso).toEqual([])
    expect(reads.rnat).toEqual({ kind: 'rnat', month: 26, wNat: 0n, rnat: 0n, locked: 0n, hasProject: false })
    expect(reads.flaredrop).toEqual({ kind: 'flaredrop', claimableMonths: [], amount: 0n, concluded: true })
  })

  it('maps a funded RNat account (getBalancesOf returns) to hasProject:true with the balances', async () => {
    const a = makeRewardsAdapter(fakeClient(baseHandlers({ getBalancesOf: () => [100n, 40n, 25n] })), DEPLOYMENT)
    const reads = await a.read(ACCOUNT)
    expect(reads.rnat).toEqual({ kind: 'rnat', month: 26, wNat: 100n, rnat: 40n, locked: 25n, hasProject: true })
  })

  it('RETHROWS a transport error from getBalancesOf (unknown is never rendered empty)', async () => {
    const a = makeRewardsAdapter(
      fakeClient(
        baseHandlers({
          getBalancesOf: () => {
            throw new Error('HTTP request failed: ECONNREFUSED')
          },
        }),
      ),
      DEPLOYMENT,
    )
    await expect(a.read(ACCOUNT)).rejects.toThrow(/ECONNREFUSED/)
  })

  it('RETHROWS a transport error from getClaimableMonths (unknown is never rendered concluded)', async () => {
    const a = makeRewardsAdapter(
      fakeClient(
        baseHandlers({
          getClaimableMonths: () => {
            throw new Error('fetch failed')
          },
        }),
      ),
      DEPLOYMENT,
    )
    await expect(a.read(ACCOUNT)).rejects.toThrow(/fetch failed/)
  })

  it('decodes a non-empty getStateOfRewards into distinct FtsoReward entries', async () => {
    const a = makeRewardsAdapter(
      fakeClient(
        baseHandlers({
          getStateOfRewards: () => [
            [{ rewardEpochId: 5928, beneficiary: ACCOUNT, amount: 7n, claimType: 2, initialised: true }],
            [],
          ],
        }),
      ),
      DEPLOYMENT,
    )
    const reads = await a.read(ACCOUNT)
    expect(reads.ftso).toHaveLength(1)
    expect(reads.ftso[0]).toMatchObject({ kind: 'ftso-delegation', epoch: 5928, amount: 7n, claimType: 2, proof: [] })
    expect(reads.ftso[0]!.expiresAtEpoch).toBe(5902)
    expect(reads.ftso[0]!.source).toBe(DEPLOYMENT.ftsoProofSource)
  })
})

describe('rewards adapter read — staking reward, the 4th kind, NON-EXPIRING (M11)', () => {
  it('reads (total, claimed) off ValidatorRewardManager.getStateOfRewards; claimable = total − claimed', async () => {
    const a = makeRewardsAdapter(fakeClient(baseHandlers({ getStakingState: () => [500n, 200n] })), DEPLOYMENT)
    const reads = await a.read(ACCOUNT)
    expect(reads.staking).toEqual({ kind: 'staking', total: 500n, claimed: 200n, claimable: 300n, expires: false })
  })

  it('honest-empty when total === claimed (claimable 0n) — a delayed leg, never a faked amount', async () => {
    const a = makeRewardsAdapter(fakeClient(baseHandlers({ getStakingState: () => [0n, 0n] })), DEPLOYMENT)
    const reads = await a.read(ACCOUNT)
    expect(reads.staking).toEqual({ kind: 'staking', total: 0n, claimed: 0n, claimable: 0n, expires: false })
  })

  it('carries expires:false and NO epoch-expiry field — never the 25-epoch delegation window', async () => {
    const a = makeRewardsAdapter(fakeClient(baseHandlers({ getStakingState: () => [9n, 1n] })), DEPLOYMENT)
    const reads = await a.read(ACCOUNT)
    expect(reads.staking.expires).toBe(false)
    // The staking kind must never carry an epoch expiry the way FtsoReward does.
    expect(reads.staking).not.toHaveProperty('expiresAtEpoch')
    expect(reads.staking).not.toHaveProperty('expireNextEpoch')
  })

  it('reads the staking reward from the ValidatorRewardManager address (staking registry), not the RewardManager', async () => {
    // The FTSO 2D read stays on the RewardManager; the staking (total,claimed) read is on the
    // ValidatorRewardManager. If the two were conflated the FTSO override below would corrupt staking.
    const a = makeRewardsAdapter(
      fakeClient(baseHandlers({ getStateOfRewards: () => [[], []], getStakingState: () => [42n, 2n] })),
      DEPLOYMENT,
    )
    const reads = await a.read(ACCOUNT)
    expect(reads.ftso).toEqual([])
    expect(reads.staking).toEqual({ kind: 'staking', total: 42n, claimed: 2n, claimable: 40n, expires: false })
  })
})

describe('rewards adapter fetchFtsoProof — the unofficial mirror (M10)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('parses a present beneficiary, STRIPPING the trailing "n" from amount (case-insensitive match)', async () => {
    const body = {
      rewardEpochId: 5929,
      network: 'coston2',
      appliedMinConditions: false,
      rewardClaims: [
        {
          merkleProof: ['0xaa', '0xbb'],
          body: { beneficiary: ACCOUNT.toLowerCase(), claimType: 1, amount: '50815468086706127518231n', rewardEpochId: 5929 },
        },
      ],
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))
    const a = makeRewardsAdapter(fakeClient(baseHandlers()), DEPLOYMENT)
    const proof = await a.fetchFtsoProof(5929, ACCOUNT)
    expect(proof).toEqual({ amount: 50815468086706127518231n, claimType: 1, proof: ['0xaa', '0xbb'] })
  })

  it('returns null when the account is not among rewardClaims (earned nothing)', async () => {
    const body = {
      rewardClaims: [{ merkleProof: ['0xaa'], body: { beneficiary: RECIPIENT.toLowerCase(), claimType: 0, amount: '1n', rewardEpochId: 5929 } }],
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))
    const a = makeRewardsAdapter(fakeClient(baseHandlers()), DEPLOYMENT)
    expect(await a.fetchFtsoProof(5929, ACCOUNT)).toBeNull()
  })

  it('returns null on a 404 (proof file absent) — declared-unavailable, not a throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    const a = makeRewardsAdapter(fakeClient(baseHandlers()), DEPLOYMENT)
    expect(await a.fetchFtsoProof(5929, ACCOUNT)).toBeNull()
  })

  it('returns null on a network error (NEVER throws into the caller, NEVER fabricates a proof)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    const a = makeRewardsAdapter(fakeClient(baseHandlers()), DEPLOYMENT)
    expect(await a.fetchFtsoProof(5929, ACCOUNT)).toBeNull()
  })
})

describe('rewards adapter call builders — FOUR DISTINCT kinds (M10/M11, R-REWARD-002)', () => {
  const a = makeRewardsAdapter(fakeClient(baseHandlers()), DEPLOYMENT)

  it('buildRnatWithdrawAll(false) encodes RNat.withdrawAll(false) (the 50%-burn path)', () => {
    const call = a.buildRnatWithdrawAll(false)
    expect(call.abiKind).toBe('rnat')
    expect(call.functionName).toBe('withdrawAll')
    expect(call.args).toEqual([false])
    expect(call.address.toLowerCase()).toBe(DEPLOYMENT.rnat.toLowerCase())
  })

  it('buildFtsoClaim assembles claim(owner, recipient, maxEpoch, wrap, proofs[]) on the reward manager', () => {
    const rewards = [
      { kind: 'ftso-delegation' as const, epoch: 5928, amount: 5n, claimType: 2, proof: ['0xaa'] as `0x${string}`[], expiresAtEpoch: 5902, source: DEPLOYMENT.ftsoProofSource },
    ]
    const call = a.buildFtsoClaim(ACCOUNT, RECIPIENT, rewards, true)
    expect(call.abiKind).toBe('reward-manager')
    expect(call.functionName).toBe('claim')
    expect(call.address.toLowerCase()).toBe(DEPLOYMENT.rewardManager.toLowerCase())
    expect(call.args[0]).toBe(ACCOUNT) // owner
    expect(call.args[1]).toBe(RECIPIENT) // recipient
    expect(call.args[2]).toBe(5928) // max epoch to claim up to
    expect(call.args[3]).toBe(true) // wrap
    const proofs = call.args[4] as { merkleProof: `0x${string}`[]; body: Record<string, unknown> }[]
    expect(proofs).toHaveLength(1)
    expect(proofs[0]!.merkleProof).toEqual(['0xaa'])
    expect(proofs[0]!.body).toMatchObject({ rewardEpochId: 5928, beneficiary: ACCOUNT, amount: 5n, claimType: 2 })
  })

  it('buildRnatClaim / buildFlareDropClaim target their OWN contracts (never a shared claim)', () => {
    const rnat = a.buildRnatClaim([1n, 2n], 26)
    expect(rnat.abiKind).toBe('rnat')
    expect(rnat.functionName).toBe('claimRewards')
    expect(rnat.args).toEqual([[1n, 2n], 26n])

    const drop = a.buildFlareDropClaim(ACCOUNT, RECIPIENT, 5, false)
    expect(drop.abiKind).toBe('distribution')
    expect(drop.functionName).toBe('claim')
    expect(drop.address.toLowerCase()).toBe(DEPLOYMENT.distribution.toLowerCase())
    expect(drop.args).toEqual([ACCOUNT, RECIPIENT, 5n, false])
  })

  it('buildStakingClaim assembles ValidatorRewardManager.claim(owner, recipient, amount, wrap) on its OWN contract', () => {
    const call = a.buildStakingClaim(ACCOUNT, RECIPIENT, 300n, true)
    expect(call.abiKind).toBe('validator-reward-manager')
    expect(call.functionName).toBe('claim')
    expect(call.address.toLowerCase()).toBe(VALIDATOR_LC)
    expect(call.args).toEqual([ACCOUNT, RECIPIENT, 300n, true])
  })

  it('rewardsAbiFor maps each discriminator to its ABI', () => {
    expect(rewardsAbiFor('reward-manager')).toBe(REWARD_MANAGER_ABI)
    expect(rewardsAbiFor('rnat')).toBe(RNAT_ABI)
    expect(rewardsAbiFor('distribution')).toBe(DISTRIBUTION_ABI)
    expect(rewardsAbiFor('validator-reward-manager')).toBe(VALIDATOR_REWARD_MANAGER_ABI)
  })

  it('exposes the deployment (rewards.ts reads rewardsVerified off it)', () => {
    expect(a.deployment).toBe(DEPLOYMENT)
  })
})
