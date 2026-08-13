// packages/core/src/proposals.ts
import type { PublicClient } from 'viem'
import { type GovernanceDeployment, GOVERNOR_ABI, POLLING_FTSO_ABI } from '@flare-kit/contracts'
import type { GovernanceVoteReads } from './governance-adapter.js'
import {
  mapProposalState,
  PROPOSAL_CREATED_EVENT,
  type ProposalCreatedArgs,
  type ProposalDetailView,
  type ProposalSource,
  type ProposalState,
  type ProposalSummary,
  type ProposalUnknown,
} from './proposal-mapping.js'

/**
 * The M12 proposal READ LENS: discovery + per-proposal state + detail across the two
 * governance surfaces, plus the deliberately-CARRIED `castVote`. Real proposals live on
 * Flare MAINNET (`deployment.chainId` 14); Coston2 is honest-empty (no proposal has ever
 * been created there — probe-confirmed). Nothing here signs or writes: it reads the chain
 * and returns views, or refuses.
 *
 * The two-contract / two-shape / two-ENUM grounding — the load-bearing honesty — lives in
 * `proposal-mapping.ts` alongside the types and the source-dispatched `mapProposalState`.
 * Re-exported here so the proposal surface is one import.
 */

export * from './proposal-mapping.js'

/** Read `state(id)` on the right ABI and map via SOURCE; a throwing read -> `'unknown'`. */
async function readState(
  client: PublicClient,
  d: GovernanceDeployment,
  id: bigint,
  source: ProposalSource,
): Promise<ProposalState> {
  try {
    const raw = (await client.readContract({
      address: source === 'ftso' ? d.pollingFtso : d.pollingFoundation,
      abi: source === 'ftso' ? POLLING_FTSO_ABI : GOVERNOR_ABI,
      functionName: 'state',
      args: [id],
    })) as number | bigint
    return mapProposalState(source, Number(raw))
  } catch {
    return 'unknown'
  }
}

/**
 * Discover proposals across both surfaces:
 *  - a BOUNDED `PollingFoundation.ProposalCreated` scan (windows <= `maxRange`, back at most
 *    `lookbackBlocks` from head — mirrors `gasless-adapter.ts`, since the Flare RPC caps
 *    `eth_getLogs` to ~30 blocks/call) -> `source:'foundation'` summaries from the event args;
 *  - PLUS `PollingFtso.getLastProposal()` -> when it returns a non-zero id, one
 *    `source:'ftso'` summary.
 * Each id's `state` is read + mapped via its source's enum. Deduped by (source,id). Returns
 * `[]` (honest-empty) when neither source yields a proposal — it never invents one.
 */
export async function discoverProposals(
  client: PublicClient,
  d: GovernanceDeployment,
  lookbackBlocks: bigint,
  maxRange: bigint,
): Promise<ProposalSummary[]> {
  const byKey = new Map<string, ProposalSummary>()

  // 1) Bounded PollingFoundation ProposalCreated scan (the ~30-block eth_getLogs cap).
  const latest = await client.getBlockNumber()
  const step = maxRange > 0n ? maxRange : 1n
  let cursor = latest > lookbackBlocks ? latest - lookbackBlocks : 0n
  while (cursor <= latest) {
    const end = cursor + step - 1n > latest ? latest : cursor + step - 1n
    const logs = (await client.getContractEvents({
      address: d.pollingFoundation,
      abi: [PROPOSAL_CREATED_EVENT],
      eventName: 'ProposalCreated',
      fromBlock: cursor,
      toBlock: end,
    })) as readonly { args: ProposalCreatedArgs }[]
    for (const log of logs) {
      const id = log.args.proposalId
      if (typeof id !== 'bigint') continue // an undecodable log is not a real proposal
      const state = await readState(client, d, id, 'foundation')
      byKey.set(`foundation:${id}`, {
        id,
        source: 'foundation',
        state,
        proposer: log.args.proposer as `0x${string}`,
        votePowerBlock: log.args.votePowerBlock,
        voteStart: log.args.voteTimes?.[0] ?? 0n,
        voteEnd: log.args.voteTimes?.[1] ?? 0n,
      })
    }
    cursor = end + 1n
  }

  // 2) The reliable FTSO discovery: getLastProposal. A non-zero id is a real proposal.
  try {
    const [ftsoId] = (await client.readContract({
      address: d.pollingFtso,
      abi: POLLING_FTSO_ABI,
      functionName: 'getLastProposal',
    })) as readonly [bigint, string]
    if (ftsoId > 0n) {
      const info = (await client.readContract({
        address: d.pollingFtso,
        abi: POLLING_FTSO_ABI,
        functionName: 'getProposalInfo',
        args: [ftsoId],
      })) as readonly unknown[]
      const state = await readState(client, d, ftsoId, 'ftso')
      byKey.set(`ftso:${ftsoId}`, {
        id: ftsoId,
        source: 'ftso',
        state,
        proposer: info[2] as `0x${string}`,
        votePowerBlock: undefined, // FTSO shape has no votePowerBlock — never fabricated
        voteStart: info[3] as bigint,
        voteEnd: info[4] as bigint,
      })
    }
  } catch {
    // A throw here loses only the FTSO summary — never fabricates one; foundation results stand.
  }

  return [...byKey.values()]
}

/**
 * Read one proposal's full detail, decoding with the ABI/shape its `source` demands. FTSO
 * leaves `votePowerBlock`/`hasVoted`/`accountVotes` `undefined` (the deployed shape has no
 * such fields). Any essential read failing -> `{ id, source, state:'unknown' }`, never a
 * fabricated field.
 */
export async function readProposalDetail(
  client: PublicClient,
  d: GovernanceDeployment,
  id: bigint,
  source: ProposalSource,
  account: `0x${string}`,
): Promise<ProposalDetailView | ProposalUnknown> {
  const address = source === 'ftso' ? d.pollingFtso : d.pollingFoundation
  const abi = source === 'ftso' ? POLLING_FTSO_ABI : GOVERNOR_ABI
  try {
    const [info, votes] = (await Promise.all([
      client.readContract({ address, abi, functionName: 'getProposalInfo', args: [id] }),
      client.readContract({ address, abi, functionName: 'getProposalVotes', args: [id] }),
    ])) as [readonly unknown[], readonly [bigint, bigint]]
    const state = await readState(client, d, id, source)

    if (source === 'ftso') {
      // [noOfEligibleMembers, description, proposer, voteStart, voteEnd, thresholdBIPS,
      //  majorityBIPS, totalVotePower]
      return {
        id,
        source,
        state,
        proposer: info[2] as `0x${string}`,
        votePowerBlock: undefined,
        voteStart: info[3] as bigint,
        voteEnd: info[4] as bigint,
        for: votes[0],
        against: votes[1],
        thresholdBIPS: Number(info[5] as bigint),
        majorityBIPS: Number(info[6] as bigint),
        totalVotePower: info[7] as bigint,
        hasVoted: undefined,
        accountVotes: undefined,
      }
    }

    // foundation: [proposer, accept, votePowerBlock, voteStart, voteEnd, execStart, execEnd,
    //  thresholdBIPS, majorityBIPS, circulatingSupply]
    const votePowerBlock = info[2] as bigint
    const [hasVoted, accountVotes] = await readFoundationAccountReads(client, address, id, account, votePowerBlock)
    return {
      id,
      source,
      state,
      proposer: info[0] as `0x${string}`,
      votePowerBlock,
      voteStart: info[3] as bigint,
      voteEnd: info[4] as bigint,
      for: votes[0],
      against: votes[1],
      thresholdBIPS: Number(info[7] as bigint),
      majorityBIPS: Number(info[8] as bigint),
      totalVotePower: info[9] as bigint,
      hasVoted,
      accountVotes,
    }
  } catch {
    return { id, source, state: 'unknown' }
  }
}

/** Foundation per-account reads, defensive: a throw narrows the field to `undefined`, never fabricated. */
async function readFoundationAccountReads(
  client: PublicClient,
  address: `0x${string}`,
  id: bigint,
  account: `0x${string}`,
  votePowerBlock: bigint,
): Promise<[boolean | undefined, bigint | undefined]> {
  const [voted, votes] = await Promise.allSettled([
    client.readContract({ address, abi: GOVERNOR_ABI, functionName: 'hasVoted', args: [id, account] }) as Promise<boolean>,
    client.readContract({ address, abi: GOVERNOR_ABI, functionName: 'getVotes', args: [account, votePowerBlock] }) as Promise<bigint>,
  ])
  return [voted.status === 'fulfilled' ? voted.value : undefined, votes.status === 'fulfilled' ? votes.value : undefined]
}

/**
 * The castVote path is BUILT and gated but UNCONDITIONALLY CARRIED this milestone: it never
 * returns an executable plan. Grounding (probe): Coston2 (the write/verify net) hosts NO
 * proposals, and the account holds ZERO mainnet governance vote power — there is no Active
 * proposal reachable to cast against. No branch ever returns `ok:true`; the reason names the
 * proposal so the surface can explain the refusal honestly.
 */
export function planCastVote(args: {
  proposal: ProposalSummary
  reads: GovernanceVoteReads
}): { ok: false; error: { code: 'carried'; reason: string } } {
  const { proposal, reads } = args
  return {
    ok: false,
    error: {
      code: 'carried',
      reason:
        `castVote for the ${proposal.source} proposal ${proposal.id} is carried this milestone: ` +
        `no Active proposal is executable on the write/verify network (Coston2 hosts none) and ` +
        `the account's ${reads.votes} governance vote power is not verified for a live cast — the ` +
        `vote path is built and gated, never signable until a live run confirms it.`,
    },
  }
}
