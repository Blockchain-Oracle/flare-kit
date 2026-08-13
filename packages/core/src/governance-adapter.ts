// packages/core/src/governance-adapter.ts
import { type Abi, type PublicClient } from 'viem'
import { type GovernanceDeployment, GOVERNANCE_VOTE_POWER_ABI, GOVERNOR_ABI, POLLING_FTSO_ABI } from '@flare-kit/contracts'

/**
 * The governance-VP + eligibility READS and the pure delegate/undelegate call BUILDERS —
 * the M12 reads/call-builder seam, mirroring `delegation-adapter.ts` (M10). Governance
 * vote-power delegation is ALL-OR-NOTHING to a single delegate (`GovernanceVotePower`,
 * `deployment.governanceVotePower`) — unlike FTSO percentage delegation, there is no
 * bips/two-provider shape here.
 *
 * HONESTY (load-bearing, differs from delegation-adapter): `delegation-adapter.ts`
 * PROPAGATES a read failure (the caller maps it to `unavailable`). Here the plan's
 * `| undefined` contract asks the ADAPTER itself to catch a THROW and return `undefined`
 * — never a fabricated `0n`/zero-address. A real blank-slate account genuinely reads
 * `getVotes` 0n and `getDelegateOfAtNow` the zero address (probe-confirmed); those are
 * the real values and are returned as-is, distinct from a transport failure.
 *
 * `Eligibility.isMember` is `boolean | undefined` — a GROUNDING-FORCED deviation from the
 * plan's stale `isMember: boolean`. The Task-1 live probe (CONCERN A) found
 * `PollingFtso.isMember(account)` REVERTS for an arbitrary (non-member) account on BOTH
 * networks. Coercing that revert to `false` would assert "not a member" with a confidence
 * the read never earned — the spec's honesty rule (never invent a confident value) beats
 * the stale type. So `isMember` is read defensively: a revert -> `isMember: undefined`,
 * while `isProposer` (PollingFoundation) and `canPropose` (PollingFtso) are the reliable
 * gates and still surface their real booleans alongside it. If an ESSENTIAL read
 * (`isProposer`/`canPropose`) itself throws (transport failure), the whole `Eligibility`
 * is `undefined` — an unavailable read, not a partial/fabricated one.
 */

/** `getVotes`/`getDelegateOfAtNow` on `GovernanceVotePower` — both real chain values. */
export interface GovernanceVoteReads {
  /** Current governance vote power (wei). A genuine blank-slate account reads 0n. */
  readonly votes: bigint
  /** Who the account currently delegates to — the zero address if none. */
  readonly delegate: `0x${string}`
}

/** `isProposer`/`canPropose` are reliable gates; `isMember` is undefined when the read reverts. */
export interface Eligibility {
  readonly isProposer: boolean
  readonly canPropose: boolean
  /** `undefined` when `PollingFtso.isMember` reverts (probe CONCERN A) — never coerced to `false`. */
  readonly isMember: boolean | undefined
}

/** A structured, unsigned call — no signing, no key, no client call happens here. */
interface GovernanceCall<Fn extends string, Args extends readonly unknown[]> {
  readonly address: `0x${string}`
  readonly abi: Abi
  readonly functionName: Fn
  readonly args: Args
}

/**
 * `GovernanceVotePower.getVotes(account)` + `.getDelegateOfAtNow(account)`. Returns
 * `undefined` when either read THROWS — never a fabricated `0n`/zero-address. A real
 * blank-slate read (0n, zero address) is returned as-is; that IS the real value.
 */
export async function readGovernanceVotes(
  client: PublicClient,
  d: GovernanceDeployment,
  account: `0x${string}`,
): Promise<GovernanceVoteReads | undefined> {
  try {
    const [votes, delegate] = await Promise.all([
      client.readContract({
        address: d.governanceVotePower,
        abi: GOVERNANCE_VOTE_POWER_ABI,
        functionName: 'getVotes',
        args: [account],
      }) as Promise<bigint>,
      client.readContract({
        address: d.governanceVotePower,
        abi: GOVERNANCE_VOTE_POWER_ABI,
        functionName: 'getDelegateOfAtNow',
        args: [account],
      }) as Promise<`0x${string}`>,
    ])
    return { votes, delegate }
  } catch {
    // A throw (transport or otherwise) -> unavailable. Never coerce to a confident zero.
    return undefined
  }
}

/**
 * `PollingFoundation.isProposer` + `PollingFtso.canPropose` (essential, reliable gates) +
 * `PollingFtso.isMember` (guarded — reverts for a non-member, probe CONCERN A). All three
 * reads race in parallel via `Promise.allSettled`: an essential rejection fails the whole
 * read (`undefined`); an `isMember` rejection narrows only that one field to `undefined`
 * while `isProposer`/`canPropose` still surface their real, settled values.
 */
export async function readEligibility(
  client: PublicClient,
  d: GovernanceDeployment,
  account: `0x${string}`,
): Promise<Eligibility | undefined> {
  const [isProposerResult, canProposeResult, isMemberResult] = await Promise.allSettled([
    client.readContract({
      address: d.pollingFoundation,
      abi: GOVERNOR_ABI,
      functionName: 'isProposer',
      args: [account],
    }) as Promise<boolean>,
    client.readContract({
      address: d.pollingFtso,
      abi: POLLING_FTSO_ABI,
      functionName: 'canPropose',
      args: [account],
    }) as Promise<boolean>,
    client.readContract({
      address: d.pollingFtso,
      abi: POLLING_FTSO_ABI,
      functionName: 'isMember',
      args: [account],
    }) as Promise<boolean>,
  ])

  // Essential reads: a rejection here means eligibility itself is unavailable, not partial.
  if (isProposerResult.status === 'rejected' || canProposeResult.status === 'rejected') return undefined

  return {
    isProposer: isProposerResult.value,
    canPropose: canProposeResult.value,
    // Guarded: isMember reverts for an arbitrary/non-member account (probe CONCERN A) ->
    // undefined, NEVER coerced to false.
    isMember: isMemberResult.status === 'fulfilled' ? isMemberResult.value : undefined,
  }
}

/** `GovernanceVotePower.delegate(to)` — moves ALL governance vote power to `to`. Pure: no signing, no client call. */
export function buildDelegateCall(d: GovernanceDeployment, to: `0x${string}`): GovernanceCall<'delegate', readonly [`0x${string}`]> {
  return {
    address: d.governanceVotePower,
    abi: GOVERNANCE_VOTE_POWER_ABI as unknown as Abi,
    functionName: 'delegate',
    args: [to],
  }
}

/** `GovernanceVotePower.undelegate()` — reclaims all delegated governance vote power. Pure: no signing, no client call. */
export function buildUndelegateCall(d: GovernanceDeployment): GovernanceCall<'undelegate', readonly []> {
  return {
    address: d.governanceVotePower,
    abi: GOVERNANCE_VOTE_POWER_ABI as unknown as Abi,
    functionName: 'undelegate',
    args: [],
  }
}
