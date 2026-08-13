import { describe, expect, it } from 'vitest'
import type { Address, PublicClient } from 'viem'
import { delegationFor, IWNAT_ABI, IVPTOKEN_ABI } from '@flare-kit/contracts'
import { delegationAbiFor, makeDelegationAdapter } from '../src/delegation-adapter.js'

const DEPLOYMENT = delegationFor('coston2')!
const A: Address = '0x00000000000000000000000000000000000000A1'
const B: Address = '0x00000000000000000000000000000000000000B2'
const ACCOUNT: Address = '0x00000000000000000000000000000000000000C3'

type ReadArgs = { functionName: string; args?: readonly unknown[] }

/** Same stub shape as gasless-adapter.test.ts, plus a getBalance for the native read. */
function fakeClient(opts: {
  reads?: Record<string, (args: readonly unknown[]) => unknown>
  native?: bigint
}): PublicClient {
  return {
    async readContract({ functionName, args = [] }: ReadArgs) {
      const h = opts.reads?.[functionName]
      if (!h) throw new Error(`unexpected read ${functionName}`)
      return h(args)
    },
    async getBalance() {
      return opts.native ?? 0n
    },
  } as unknown as PublicClient
}

describe('delegation adapter reads (M10)', () => {
  it('zips a two-delegate delegatesOf positionally, bounded by count, with mode + balances', async () => {
    const a = makeDelegationAdapter(
      fakeClient({
        native: 47_000000000000000000n,
        reads: {
          balanceOf: () => 12n,
          delegationModeOf: () => 1n,
          votePowerOf: () => 100n,
          undelegatedVotePowerOf: () => 30n,
          delegatesOf: () => [[A, B], [3000n, 7000n], 2n, 1n],
        },
      }),
      DEPLOYMENT,
    )
    const reads = await a.read(ACCOUNT)
    expect(reads.delegates).toEqual([
      { address: A, bips: 3000 },
      { address: B, bips: 7000 },
    ])
    expect(reads.mode).toBe(1)
    expect(reads.wrappedBalance).toBe(12n)
    expect(reads.nativeBalance).toBe(47_000000000000000000n)
    expect(reads.votePower).toBe(100n)
    expect(reads.undelegatedVotePower).toBe(30n)
  })

  it('truncates delegatesOf arrays longer than count (never trusts the stale tail)', async () => {
    const a = makeDelegationAdapter(
      fakeClient({
        reads: {
          balanceOf: () => 0n,
          delegationModeOf: () => 1n,
          votePowerOf: () => 0n,
          undelegatedVotePowerOf: () => 0n,
          // three entries in the arrays, but count says ONE — trust count.
          delegatesOf: () => [[A, B, ACCOUNT], [3000n, 7000n, 1n], 1n, 1n],
        },
      }),
      DEPLOYMENT,
    )
    const reads = await a.read(ACCOUNT)
    expect(reads.delegates).toEqual([{ address: A, bips: 3000 }])
  })

  it('propagates a read failure (never swallows it into a confident zero)', async () => {
    const a = makeDelegationAdapter(
      fakeClient({
        reads: {
          balanceOf: () => {
            throw new Error('rpc down')
          },
          delegationModeOf: () => 0n,
          votePowerOf: () => 0n,
          undelegatedVotePowerOf: () => 0n,
          delegatesOf: () => [[], [], 0n, 0n],
        },
      }),
      DEPLOYMENT,
    )
    await expect(a.read(ACCOUNT)).rejects.toThrow('rpc down')
  })
})

describe('delegation adapter call builders (M10)', () => {
  it('buildWrap builds a payable WNat deposit carrying the amount as value', () => {
    const a = makeDelegationAdapter(fakeClient({}), DEPLOYMENT)
    const call = a.buildWrap(5_000000000000000000n)
    expect(call).toMatchObject({
      abiKind: 'wnat',
      functionName: 'deposit',
      args: [],
      value: 5_000000000000000000n,
    })
    expect(call.address.toLowerCase()).toBe(DEPLOYMENT.wnat.toLowerCase())
  })

  it('buildUnwrap builds a WNat withdraw with the amount, no value', () => {
    const a = makeDelegationAdapter(fakeClient({}), DEPLOYMENT)
    const call = a.buildUnwrap(2n)
    expect(call.abiKind).toBe('wnat')
    expect(call.functionName).toBe('withdraw')
    expect(call.args).toEqual([2n])
    expect(call.value).toBeUndefined()
  })

  it('buildDelegate targets vptoken and encodes bips as bigint', () => {
    const a = makeDelegationAdapter(fakeClient({}), DEPLOYMENT)
    const call = a.buildDelegate(A, 10000)
    expect(call.abiKind).toBe('vptoken')
    expect(call.functionName).toBe('delegate')
    expect(call.args).toEqual([A, 10000n])
  })

  it('buildBatchDelegate builds parallel address/bips arrays (bips as bigint, in order)', () => {
    const a = makeDelegationAdapter(fakeClient({}), DEPLOYMENT)
    const call = a.buildBatchDelegate([
      { to: A, bips: 3000 },
      { to: B, bips: 7000 },
    ])
    expect(call.abiKind).toBe('vptoken')
    expect(call.functionName).toBe('batchDelegate')
    expect(call.args).toEqual([
      [A, B],
      [3000n, 7000n],
    ])
  })

  it('buildDelegateExplicit passes the amount through unchanged', () => {
    const a = makeDelegationAdapter(fakeClient({}), DEPLOYMENT)
    const call = a.buildDelegateExplicit(A, 42n)
    expect(call.abiKind).toBe('vptoken')
    expect(call.functionName).toBe('delegateExplicit')
    expect(call.args).toEqual([A, 42n])
  })

  it('buildUndelegateAll builds a no-arg vptoken call', () => {
    const a = makeDelegationAdapter(fakeClient({}), DEPLOYMENT)
    const call = a.buildUndelegateAll()
    expect(call.abiKind).toBe('vptoken')
    expect(call.functionName).toBe('undelegateAll')
    expect(call.args).toEqual([])
  })

  it('delegationAbiFor maps the discriminator to the right ABI', () => {
    expect(delegationAbiFor('wnat')).toBe(IWNAT_ABI)
    expect(delegationAbiFor('vptoken')).toBe(IVPTOKEN_ABI)
  })

  it('exposes the deployment (Task 4 reads delegationVerified off it)', () => {
    const a = makeDelegationAdapter(fakeClient({}), DEPLOYMENT)
    expect(a.deployment).toBe(DEPLOYMENT)
  })
})
