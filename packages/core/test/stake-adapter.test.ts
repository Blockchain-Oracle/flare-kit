import { describe, expect, it } from 'vitest'
import type { Address, PublicClient } from 'viem'
import { stakingFor } from '@flarekit-dev/contracts'
import { readMirrorVotePower, readStakeLimits, readStakingReward } from '../src/stake-adapter.js'

const DEPLOYMENT = stakingFor('coston2')!
const ACCOUNT: Address = '0x00000000000000000000000000000000000000C3'

type ReadArgs = { functionName: string; args?: readonly unknown[] }

/**
 * The same stubbed-`PublicClient` shape as delegation-adapter.test.ts: `readContract`
 * dispatches on `functionName`; a missing handler is an unexpected read (fail loud), a
 * throwing handler models an RPC/decoding fault the adapter must surface honestly.
 */
function fakeClient(reads: Record<string, (args: readonly unknown[]) => unknown>): PublicClient {
  return {
    async readContract({ functionName, args = [] }: ReadArgs) {
      const h = reads[functionName]
      if (!h) throw new Error(`unexpected read ${functionName}`)
      return h(args)
    },
  } as unknown as PublicClient
}

describe('readStakeLimits (M11)', () => {
  it('maps the four verifier fields: amounts gwei→wei (×1e9), durations seconds', async () => {
    const limits = await readStakeLimits(
      fakeClient({
        minStakeAmountGwei: () => 50_000_000_000_000n, // 50,000 FLR expressed in Gwei
        maxStakeAmountGwei: () => 200_000_000_000_000_000n, // 200,000,000 FLR in Gwei
        minStakeDurationSeconds: () => 1_209_600n, // 14 days
        maxStakeDurationSeconds: () => 31_536_000n, // 365 days
      }),
      DEPLOYMENT.pChainStakeMirrorVerifier,
    )
    // Amounts are Gwei (1e-9 FLR) → wei is ×1_000_000_000n.
    expect(limits.minAmount).toBe(50_000_000_000_000n * 1_000_000_000n)
    expect(limits.maxAmount).toBe(200_000_000_000_000_000n * 1_000_000_000n)
    // Durations are already seconds — carried through as bigint, untouched.
    expect(limits.minDuration).toBe(1_209_600n)
    expect(limits.maxDuration).toBe(31_536_000n)
  })
})

describe('readMirrorVotePower (M11)', () => {
  it('returns the mirrored vote power read from balanceOf', async () => {
    const power = await readMirrorVotePower(
      fakeClient({ balanceOf: () => 123_456n }),
      DEPLOYMENT.pChainStakeMirror,
      ACCOUNT,
    )
    expect(power).toBe(123_456n)
  })

  it('returns a genuine on-chain zero as 0n (an observed zero is a real read)', async () => {
    const power = await readMirrorVotePower(
      fakeClient({ balanceOf: () => 0n }),
      DEPLOYMENT.pChainStakeMirror,
      ACCOUNT,
    )
    expect(power).toBe(0n)
  })

  it('returns undefined when the read THROWS — an unavailable mirror is never a fabricated 0n', async () => {
    const power = await readMirrorVotePower(
      fakeClient({
        balanceOf: () => {
          // votePowerOf reverts on Coston2; a reverting/unreachable balanceOf read
          // must surface as `unavailable`, never a confident zero.
          throw new Error('Execution reverted for an unknown reason.')
        },
      }),
      DEPLOYMENT.pChainStakeMirror,
      ACCOUNT,
    )
    expect(power).toBeUndefined()
    expect(power).not.toBe(0n)
  })
})

describe('readStakingReward (M11)', () => {
  it('returns { total, claimed } from getStateOfRewards', async () => {
    const reward = await readStakingReward(
      fakeClient({ getStateOfRewards: () => [100n, 40n] }),
      DEPLOYMENT.validatorRewardManager,
      ACCOUNT,
    )
    expect(reward).toEqual({ total: 100n, claimed: 40n })
  })

  it('carries a blank-slate (0,0) state through unchanged', async () => {
    const reward = await readStakingReward(
      fakeClient({ getStateOfRewards: () => [0n, 0n] }),
      DEPLOYMENT.validatorRewardManager,
      ACCOUNT,
    )
    expect(reward).toEqual({ total: 0n, claimed: 0n })
  })

  it('propagates a read failure (never swallows it into a confident zero)', async () => {
    await expect(
      readStakingReward(
        fakeClient({
          getStateOfRewards: () => {
            throw new Error('rpc down')
          },
        }),
        DEPLOYMENT.validatorRewardManager,
        ACCOUNT,
      ),
    ).rejects.toThrow('rpc down')
  })
})
