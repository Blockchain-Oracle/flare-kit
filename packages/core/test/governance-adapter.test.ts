import { describe, expect, it } from 'vitest'
import { zeroAddress, type Address, type PublicClient } from 'viem'
import { governanceFor, GOVERNANCE_VOTE_POWER_ABI } from '@flarekit-dev/contracts'
import { buildDelegateCall, buildUndelegateCall, readEligibility, readGovernanceVotes } from '../src/governance-adapter.js'

const DEPLOYMENT = governanceFor('coston2')
const ACCOUNT: Address = '0x00000000000000000000000000000000000000C3'
const DELEGATE: Address = '0x00000000000000000000000000000000000000A1'

type ReadArgs = { functionName: string; args?: readonly unknown[] }

/** Same stubbed-`readContract` style as delegation-adapter.test.ts, dispatching on functionName. */
function fakeClient(reads: Record<string, (args: readonly unknown[]) => unknown>): PublicClient {
  return {
    async readContract({ functionName, args = [] }: ReadArgs) {
      const h = reads[functionName]
      if (!h) throw new Error(`unexpected read ${functionName}`)
      return h(args)
    },
  } as unknown as PublicClient
}

describe('readGovernanceVotes (M12)', () => {
  it('maps getVotes -> votes (bigint) and getDelegateOfAtNow -> delegate', async () => {
    const client = fakeClient({
      getVotes: () => 42_000000000000000000n,
      getDelegateOfAtNow: () => DELEGATE,
    })
    const reads = await readGovernanceVotes(client, DEPLOYMENT, ACCOUNT)
    expect(reads).toEqual({ votes: 42_000000000000000000n, delegate: DELEGATE })
  })

  it('returns the REAL blank-slate zero values as-is (0n, zero address) — not undefined', async () => {
    const client = fakeClient({
      getVotes: () => 0n,
      getDelegateOfAtNow: () => zeroAddress,
    })
    const reads = await readGovernanceVotes(client, DEPLOYMENT, ACCOUNT)
    expect(reads).toEqual({ votes: 0n, delegate: zeroAddress })
  })

  it('returns undefined when a read THROWS — never a fabricated 0n/zero-address', async () => {
    const client = fakeClient({
      getVotes: () => {
        throw new Error('rpc down')
      },
      getDelegateOfAtNow: () => DELEGATE,
    })
    const reads = await readGovernanceVotes(client, DEPLOYMENT, ACCOUNT)
    expect(reads).toBeUndefined()
    // Guard against a regression that silently coerces the throw into a confident zero.
    expect(reads).not.toEqual({ votes: 0n, delegate: zeroAddress })
  })
})

describe('readEligibility (M12)', () => {
  it('maps isProposer + canPropose + isMember when all three succeed', async () => {
    const client = fakeClient({
      isProposer: () => false,
      canPropose: () => false,
      isMember: () => true,
    })
    const eligibility = await readEligibility(client, DEPLOYMENT, ACCOUNT)
    expect(eligibility).toEqual({ isProposer: false, canPropose: false, isMember: true })
  })

  it('isMember revert -> isMember undefined, while isProposer/canPropose still surface real booleans (load-bearing, probe CONCERN A)', async () => {
    const client = fakeClient({
      isProposer: () => true,
      canPropose: () => false,
      isMember: () => {
        throw new Error('execution reverted')
      },
    })
    const eligibility = await readEligibility(client, DEPLOYMENT, ACCOUNT)
    expect(eligibility).toEqual({ isProposer: true, canPropose: false, isMember: undefined })
    // Never coerced to false.
    expect(eligibility?.isMember).not.toBe(false)
  })

  it('an essential-read throw (isProposer) -> the whole Eligibility is undefined, not a partial object', async () => {
    const client = fakeClient({
      isProposer: () => {
        throw new Error('rpc down')
      },
      canPropose: () => false,
      isMember: () => false,
    })
    const eligibility = await readEligibility(client, DEPLOYMENT, ACCOUNT)
    expect(eligibility).toBeUndefined()
  })

  it('an essential-read throw (canPropose) -> the whole Eligibility is undefined', async () => {
    const client = fakeClient({
      isProposer: () => true,
      canPropose: () => {
        throw new Error('rpc down')
      },
      isMember: () => false,
    })
    const eligibility = await readEligibility(client, DEPLOYMENT, ACCOUNT)
    expect(eligibility).toBeUndefined()
  })
})

describe('governance call builders (M12)', () => {
  it('buildDelegateCall targets GovernanceVotePower, single-target args (never bips/two-provider)', () => {
    const call = buildDelegateCall(DEPLOYMENT, DELEGATE)
    expect(call.address.toLowerCase()).toBe(DEPLOYMENT.governanceVotePower.toLowerCase())
    expect(call.abi).toBe(GOVERNANCE_VOTE_POWER_ABI)
    expect(call.functionName).toBe('delegate')
    expect(call.args).toEqual([DELEGATE])
  })

  it('buildUndelegateCall targets GovernanceVotePower with no args', () => {
    const call = buildUndelegateCall(DEPLOYMENT)
    expect(call.address.toLowerCase()).toBe(DEPLOYMENT.governanceVotePower.toLowerCase())
    expect(call.abi).toBe(GOVERNANCE_VOTE_POWER_ABI)
    expect(call.functionName).toBe('undelegate')
    expect(call.args).toEqual([])
  })
})
