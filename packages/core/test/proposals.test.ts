import { describe, expect, it } from 'vitest'
import { zeroAddress, type Address, type PublicClient } from 'viem'
import { governanceFor } from '@flare-kit/contracts'
import {
  discoverProposals,
  mapProposalState,
  planCastVote,
  readProposalDetail,
  type ProposalSummary,
} from '../src/proposals.js'

// Flare mainnet is the proposal READ LENS; Coston2 is the honest-empty write/verify net.
const FLARE = governanceFor('flare')
const ACCOUNT: Address = '0x00000000000000000000000000000000000000C3'
const PROPOSER: Address = '0x000000000000000000000000000000000000abC1'

type ReadArgs = { address: Address; functionName: string; args?: readonly unknown[] }
type EventArgs = { fromBlock: bigint; toBlock: bigint; eventName: string }

/**
 * A stubbed `PublicClient`. `readContract` dispatches on functionName (the handler also
 * gets `args` + `address` to branch); `getContractEvents` delegates to an `events(from,to)`
 * function so a test can both assert the scanned windows and place a log in its block range.
 */
function fakeClient(opts: {
  reads?: Record<string, (args: readonly unknown[], address: Address) => unknown>
  events?: (fromBlock: bigint, toBlock: bigint) => unknown[]
  latest?: bigint
}): PublicClient {
  return {
    async readContract({ address, functionName, args = [] }: ReadArgs) {
      const h = opts.reads?.[functionName]
      if (!h) throw new Error(`unexpected read ${functionName}`)
      return h(args, address)
    },
    async getBlockNumber() {
      return opts.latest ?? 1000n
    },
    async getContractEvents({ fromBlock, toBlock }: EventArgs) {
      return opts.events?.(fromBlock, toBlock) ?? []
    },
  } as unknown as PublicClient
}

/** A decoded ProposalCreated log at `block`, carrying the vendored event arg shape. */
function foundationLog(id: bigint, block: bigint) {
  return {
    blockNumber: block,
    args: {
      proposalId: id,
      proposer: PROPOSER,
      votePowerBlock: 940n,
      voteTimes: [1000n, 2000n] as const,
      executionTimes: [3000n, 4000n] as const,
      thresholdConditionBIPS: 6600n,
      majorityConditionBIPS: 5000n,
      circulatingSupply: 9999n,
    },
  }
}

// The real deployed FTSO getProposalInfo 8-field shape (Task-2 POLLING_FTSO_ABI), values
// taken from the live mainnet proposal #1 (probe: threshold 6600, majority 5000, Defeated).
const FTSO_INFO = [
  247n, // _noOfEligibleMembers (UNCONFIRMED best-effort)
  '{"name":"Block-latency parameter changes"}',
  PROPOSER,
  1733413499n, // _voteStartTime
  1733586299n, // _voteEndTime
  6600n, // _thresholdConditionBIPS
  5000n, // _majorityConditionBIPS
  5217782567582675528275n, // _totalVotePower (UNCONFIRMED trailing uint — NOT circulatingSupply)
] as const

describe('mapProposalState — the source-dispatched enum (M12-R5, load-bearing)', () => {
  // The FTSO enum (vendored IPollingFtso.sol): Canceled(0) Pending(1) Active(2) Defeated(3)
  // Succeeded(4). Anchored by the live probe: mainnet proposal #1 read state index 3 =
  // Defeated. THIS is the deployed reality for the only real proposal.
  it('FTSO: index 3 -> defeated (probe-anchored), and the full Canceled/Pending/Active/… order', () => {
    expect(mapProposalState('ftso', 3)).toBe('defeated') // <- the load-bearing assertion
    expect(mapProposalState('ftso', 0)).toBe('canceled')
    expect(mapProposalState('ftso', 1)).toBe('pending')
    expect(mapProposalState('ftso', 2)).toBe('active')
    expect(mapProposalState('ftso', 4)).toBe('succeeded')
  })

  // The Foundation enum (vendored IGovernor.sol): Pending(0) Active(1) Defeated(2)
  // Succeeded(3) Queued(4) Expired(5) Executed(6) Canceled(7) — a DIFFERENT order.
  it('Foundation: the IGovernor order — index 2 is Defeated, not index 3', () => {
    expect(mapProposalState('foundation', 0)).toBe('pending')
    expect(mapProposalState('foundation', 1)).toBe('active')
    expect(mapProposalState('foundation', 2)).toBe('defeated')
    expect(mapProposalState('foundation', 3)).toBe('succeeded')
    expect(mapProposalState('foundation', 4)).toBe('queued')
    expect(mapProposalState('foundation', 5)).toBe('expired')
    expect(mapProposalState('foundation', 6)).toBe('executed')
    expect(mapProposalState('foundation', 7)).toBe('canceled')
  })

  it('an out-of-range index -> unknown (never a fabricated state), for both sources', () => {
    expect(mapProposalState('ftso', 5)).toBe('unknown')
    expect(mapProposalState('ftso', -1)).toBe('unknown')
    expect(mapProposalState('foundation', 8)).toBe('unknown')
    expect(mapProposalState('foundation', 99)).toBe('unknown')
  })
})

describe('discoverProposals — bounded scan + getLastProposal (M12-R5)', () => {
  it('pages getContractEvents in windows <= maxRange, stops at lookbackBlocks, maps event + state(id)', async () => {
    const windows: Array<{ from: bigint; to: bigint }> = []
    const client = fakeClient({
      latest: 1000n,
      events: (from, to) => {
        windows.push({ from, to })
        return from <= 950n && 950n <= to ? [foundationLog(7n, 950n)] : []
      },
      reads: {
        getLastProposal: () => [0n, ''], // no FTSO proposal on this net
        state: () => 1, // foundation index 1 -> active
      },
    })

    const found = await discoverProposals(client, FLARE, 100n, 30n)

    // Bounded: no window exceeds maxRange, none reaches before latest-lookback, none past latest.
    expect(windows.length).toBeGreaterThan(0)
    for (const w of windows) {
      expect(w.to - w.from + 1n).toBeLessThanOrEqual(30n)
      expect(w.from).toBeGreaterThanOrEqual(900n)
      expect(w.to).toBeLessThanOrEqual(1000n)
    }
    expect(windows[0]?.from).toBe(900n) // stops at lookbackBlocks

    expect(found).toEqual([
      {
        id: 7n,
        source: 'foundation',
        state: 'active',
        proposer: PROPOSER,
        votePowerBlock: 940n,
        voteStart: 1000n,
        voteEnd: 2000n,
      },
    ])
  })

  it('returns [] (honest-empty) when there are no events AND getLastProposal id is 0 — invents nothing', async () => {
    const client = fakeClient({
      latest: 1000n,
      events: () => [],
      reads: { getLastProposal: () => [0n, ''] },
    })
    const found = await discoverProposals(client, FLARE, 100n, 30n)
    expect(found).toEqual([])
  })

  it('includes the getLastProposal FTSO proposal (source:ftso) when the id is non-zero; votePowerBlock undefined', async () => {
    const client = fakeClient({
      latest: 1000n,
      events: () => [],
      reads: {
        getLastProposal: () => [1n, 'desc'],
        getProposalInfo: () => FTSO_INFO,
        state: () => 3, // FTSO index 3 -> defeated (matches the live probe)
      },
    })
    const found = await discoverProposals(client, FLARE, 100n, 30n)
    expect(found).toEqual([
      {
        id: 1n,
        source: 'ftso',
        state: 'defeated',
        proposer: PROPOSER,
        votePowerBlock: undefined, // FTSO shape has NO votePowerBlock — never fabricated
        voteStart: 1733413499n,
        voteEnd: 1733586299n,
      },
    ])
    expect(found[0]?.votePowerBlock).toBeUndefined()
  })

  it('a throwing state(id) read -> that summary is state:unknown, real event fields intact (never fabricated)', async () => {
    const client = fakeClient({
      latest: 1000n,
      events: (from, to) => (from <= 950n && 950n <= to ? [foundationLog(7n, 950n)] : []),
      reads: {
        getLastProposal: () => [0n, ''],
        state: () => {
          throw new Error('execution reverted')
        },
      },
    })
    const found = await discoverProposals(client, FLARE, 100n, 30n)
    expect(found).toEqual([
      { id: 7n, source: 'foundation', state: 'unknown', proposer: PROPOSER, votePowerBlock: 940n, voteStart: 1000n, voteEnd: 2000n },
    ])
  })
})

describe('readProposalDetail — FTSO source (M12-R5)', () => {
  it('maps getProposalInfo + getProposalVotes; leaves votePowerBlock/hasVoted/accountVotes undefined', async () => {
    const client = fakeClient({
      reads: {
        getProposalInfo: () => FTSO_INFO,
        getProposalVotes: () => [2354308387975507843417n, 0n],
        state: () => 3,
      },
    })
    const detail = await readProposalDetail(client, FLARE, 1n, 'ftso', ACCOUNT)
    expect(detail).toEqual({
      id: 1n,
      source: 'ftso',
      state: 'defeated',
      proposer: PROPOSER,
      votePowerBlock: undefined,
      voteStart: 1733413499n,
      voteEnd: 1733586299n,
      for: 2354308387975507843417n,
      against: 0n,
      thresholdBIPS: 6600,
      majorityBIPS: 5000,
      totalVotePower: 5217782567582675528275n,
      hasVoted: undefined,
      accountVotes: undefined,
    })
    // The three FTSO-absent fields are undefined, NEVER fabricated.
    if ('votePowerBlock' in detail) {
      expect(detail.votePowerBlock).toBeUndefined()
      expect(detail.hasVoted).toBeUndefined()
      expect(detail.accountVotes).toBeUndefined()
      // The trailing uint is carried as totalVotePower (UNCONFIRMED), never a definitive circulatingSupply.
      expect(detail.totalVotePower).toBe(5217782567582675528275n)
      expect('circulatingSupply' in detail).toBe(false)
    }
  })

  it('a failed read -> { id, source, state: unknown } with no fabricated fields', async () => {
    const client = fakeClient({
      reads: {
        getProposalInfo: () => {
          throw new Error('rpc down')
        },
        getProposalVotes: () => [0n, 0n],
        state: () => 3,
      },
    })
    const detail = await readProposalDetail(client, FLARE, 1n, 'ftso', ACCOUNT)
    expect(detail).toEqual({ id: 1n, source: 'ftso', state: 'unknown' })
    expect('for' in detail).toBe(false)
    expect('proposer' in detail).toBe(false)
  })
})

describe('readProposalDetail — Foundation source (M12-R5)', () => {
  it('maps the IGovernor shape: real votePowerBlock, hasVoted and getVotes(account, block)', async () => {
    const client = fakeClient({
      reads: {
        // Foundation getProposalInfo: proposer, accept, votePowerBlock, voteStart, voteEnd,
        // execStart, execEnd, thresholdBIPS, majorityBIPS, circulatingSupply.
        getProposalInfo: () => [PROPOSER, true, 940n, 1000n, 2000n, 3000n, 4000n, 6600n, 5000n, 8888n],
        getProposalVotes: () => [10n, 20n],
        state: () => 1, // foundation index 1 -> active
        hasVoted: () => true,
        getVotes: () => 123n,
      },
    })
    const detail = await readProposalDetail(client, FLARE, 5n, 'foundation', ACCOUNT)
    expect(detail).toEqual({
      id: 5n,
      source: 'foundation',
      state: 'active',
      proposer: PROPOSER,
      votePowerBlock: 940n,
      voteStart: 1000n,
      voteEnd: 2000n,
      for: 10n,
      against: 20n,
      thresholdBIPS: 6600,
      majorityBIPS: 5000,
      totalVotePower: 8888n,
      hasVoted: true,
      accountVotes: 123n,
    })
  })
})

describe('planCastVote — ALWAYS carried, never executable (M12-R5/R6)', () => {
  const summary = (over: Partial<ProposalSummary> = {}): ProposalSummary => ({
    id: 1n,
    source: 'ftso',
    state: 'active',
    proposer: PROPOSER,
    votePowerBlock: undefined,
    voteStart: 0n,
    voteEnd: 0n,
    ...over,
  })

  it('returns { ok:false, error:{ code:carried } } for an Active proposal + non-zero vote power', () => {
    const res = planCastVote({ proposal: summary({ state: 'active' }), reads: { votes: 5n, delegate: zeroAddress } })
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('carried')
    expect(typeof res.error.reason).toBe('string')
  })

  it('is carried for every input — no branch ever returns ok:true (defeated, foundation, zero VP)', () => {
    const cases: ProposalSummary[] = [
      summary({ state: 'defeated' }),
      summary({ state: 'active', source: 'foundation', votePowerBlock: 940n }),
      summary({ state: 'succeeded' }),
      summary({ state: 'unknown' }),
    ]
    for (const proposal of cases) {
      for (const votes of [0n, 5n, 42_000000000000000000n]) {
        const res = planCastVote({ proposal, reads: { votes, delegate: zeroAddress } })
        expect(res.ok).toBe(false)
        expect(res.error.code).toBe('carried')
      }
    }
  })
})
