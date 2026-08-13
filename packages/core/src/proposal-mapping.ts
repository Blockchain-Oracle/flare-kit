// packages/core/src/proposal-mapping.ts
/**
 * The pure mapping layer for the M12 proposal read lens (`proposals.ts` builds on it): the
 * proposal view types, the SOURCE-dispatched state enum, and the local `ProposalCreated`
 * event fragment for the discovery scan. No client, no async, no I/O.
 *
 * GROUNDING — two contracts, two SHAPES, two ENUMS (the load-bearing honesty of this file):
 *
 *  1. There is NO single "OpenZeppelin" proposal-state enum on Flare. The vendored source
 *     carries TWO distinct enums, one per contract, and they DISAGREE on the index order:
 *       - `IPollingFtso.sol`  (source:'ftso')       -> Canceled(0) Pending(1) Active(2)
 *                                                       Defeated(3) Succeeded(4)
 *       - `IGovernor.sol`     (source:'foundation') -> Pending(0) Active(1) Defeated(2)
 *                                                       Succeeded(3) Queued(4) Expired(5)
 *                                                       Executed(6) Canceled(7)
 *     The ONLY real proposal is the FTSO one (mainnet id #1), which the Task-1 probe read as
 *     state index 3 = Defeated — matching the FTSO table EXACTLY (and the Task-2 ABI block
 *     comments, which document both enums). Mapping index 3 with the wrong (foundation)
 *     table would render that Defeated proposal as "Succeeded" — a protocol-reality
 *     violation. So the mapper DISPATCHES ON SOURCE; the FTSO index-3-is-Defeated live
 *     observation is the ground truth. Provenance: vendored IPollingFtso.sol / IGovernor.sol
 *     + `.thoughts/verification/2026-08-13-m12-probe.json` (id 1 -> state 3 -> Defeated).
 *
 *  2. The deployed FTSO `getProposalInfo` shape (Task-2 `POLLING_FTSO_ABI`) has NO
 *     `votePowerBlock`, NO `hasVoted`, NO per-voter `getVotes`. Those fields on an FTSO
 *     proposal are therefore `undefined` (downstream renders "—"), NEVER fabricated. The
 *     `source` discriminator is a grounding-forced addition so `readProposalDetail` decodes
 *     with the right ABI/shape. The trailing FTSO uint is carried as `totalVotePower`
 *     (UNCONFIRMED best-effort per Task-2), never relabelled as a definitive circulating
 *     supply.
 */

export type ProposalState =
  | 'pending'
  | 'active'
  | 'defeated'
  | 'succeeded'
  | 'queued'
  | 'expired'
  | 'executed'
  | 'canceled'
  | 'unknown'

/** Which contract/shape a proposal came from — drives the enum table AND the detail decode. */
export type ProposalSource = 'ftso' | 'foundation'

export interface ProposalSummary {
  readonly id: bigint
  readonly source: ProposalSource
  readonly state: ProposalState
  readonly proposer: `0x${string}`
  /** `undefined` for FTSO proposals — the deployed FTSO shape has no votePowerBlock. */
  readonly votePowerBlock: bigint | undefined
  readonly voteStart: bigint
  readonly voteEnd: bigint
}

export interface ProposalDetailView extends ProposalSummary {
  readonly for: bigint
  readonly against: bigint
  readonly thresholdBIPS: number
  readonly majorityBIPS: number
  /**
   * The trailing supply/vote-power uint the contract returns. FTSO: the UNCONFIRMED
   * `_totalVotePower` best-effort (Task-2) — NOT a definitive circulatingSupply. Foundation:
   * the named `_circulatingSupply`. `undefined` only when a read never returned it.
   */
  readonly totalVotePower: bigint | undefined
  /** `undefined` for FTSO (no hasVoted on the deployed shape) — never fabricated. */
  readonly hasVoted: boolean | undefined
  /** `undefined` for FTSO (no per-voter getVotes on the deployed shape) — never fabricated. */
  readonly accountVotes: bigint | undefined
}

/** The minimal shape returned when a proposal's essential reads fail — no fabricated fields. */
export type ProposalUnknown = { readonly id: bigint; readonly source: ProposalSource; readonly state: 'unknown' }

// The two DEPLOYED enums, pinned index->name from the vendored source + live probe (see the
// file header). Position IS the on-chain uint8; an out-of-range index falls through to unknown.
const FTSO_STATES: readonly ProposalState[] = ['canceled', 'pending', 'active', 'defeated', 'succeeded']
const FOUNDATION_STATES: readonly ProposalState[] = [
  'pending',
  'active',
  'defeated',
  'succeeded',
  'queued',
  'expired',
  'executed',
  'canceled',
]

/**
 * Map an on-chain `state()` enum index to a `ProposalState`, using the table for the
 * proposal's SOURCE. An out-of-range / non-integer index -> `'unknown'` (never fabricated).
 */
export function mapProposalState(source: ProposalSource, index: number): ProposalState {
  const table = source === 'ftso' ? FTSO_STATES : FOUNDATION_STATES
  return table[index] ?? 'unknown'
}

/**
 * `IGovernor.ProposalCreated` — defined locally (from vendored `IGovernor.sol`, byte-for-byte
 * as the Task-1 probe) because the shared `GOVERNOR_ABI` carries only the FUNCTIONS the
 * lifecycle calls; the discovery-scan event is a read-lens concern. The FULL param list is
 * required so viem computes the correct topic0.
 */
export const PROPOSAL_CREATED_EVENT = {
  type: 'event',
  name: 'ProposalCreated',
  inputs: [
    { name: 'proposalId', type: 'uint256', indexed: true },
    { name: 'proposer', type: 'address', indexed: false },
    { name: 'targets', type: 'address[]', indexed: false },
    { name: 'values', type: 'uint256[]', indexed: false },
    { name: 'calldatas', type: 'bytes[]', indexed: false },
    { name: 'description', type: 'string', indexed: false },
    { name: 'accept', type: 'bool', indexed: false },
    { name: 'voteTimes', type: 'uint256[2]', indexed: false },
    { name: 'executionTimes', type: 'uint256[2]', indexed: false },
    { name: 'votePowerBlock', type: 'uint256', indexed: false },
    { name: 'thresholdConditionBIPS', type: 'uint256', indexed: false },
    { name: 'majorityConditionBIPS', type: 'uint256', indexed: false },
    { name: 'circulatingSupply', type: 'uint256', indexed: false },
  ],
} as const

/** The subset of decoded `ProposalCreated` args the summary reads. */
export type ProposalCreatedArgs = {
  proposalId?: bigint
  proposer?: `0x${string}`
  votePowerBlock?: bigint
  voteTimes?: readonly bigint[]
}
