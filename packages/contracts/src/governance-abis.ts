/**
 * The M12 governance ABIs the `GovernanceCard` / proposal surfaces drive: hand-curated
 * viem fragments of the vendored Flare periphery interfaces
 * (`sources/flare-foundation/flare-foundry-periphery-package/src/coston2/`). The kit
 * drives only the functions the operation lifecycle needs. Three contracts, three ABIs:
 *  - `GOVERNANCE_VOTE_POWER_ABI` — `IGovernanceVotePower`: the all-or-nothing governance
 *    vote-power delegation WNat exposes (distinct from FTSO percentage delegation).
 *  - `GOVERNOR_ABI` — `IGovernor` + `IIGovernorProposer`: the PollingFoundation surface.
 *  - `POLLING_FTSO_ABI` — `IPollingFtso`: the management-group polling surface.
 *
 * Two read shapes were probe-confirmed against the DEPLOYED contracts and differ from the
 * vendored interfaces — see the `getProposalInfo` notes. Getting the output TYPES right so
 * viem decodes the live proposal is mandatory; where a source does not authoritatively
 * name a deployed field, the name is an honest best-effort flagged as such, never a
 * fabricated-certain label. The write calls (`delegate`/`undelegate`, `castVote`) are
 * CONFIRMED LIVE in Task 6 — a wrong write signature surfaces at the live run.
 */

/**
 * `IGovernanceVotePower` — the governance vote power WNat carries. Unlike FTSO `IVPToken`
 * percentage delegation (`delegation-abis.ts`), governance delegation is ALL-OR-NOTHING to
 * a single delegate: `delegate(_to)` moves the caller's entire governance vote power,
 * `undelegate()` reclaims it. The probe read `getDelegateOfAtNow` zero and `getVotes` 0 for
 * the blank-slate account.
 */
export const GOVERNANCE_VOTE_POWER_ABI = [
  // Move ALL governance vote power to `_to` (wholesale, not cumulative). Live in Task 6.
  {
    name: 'delegate',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_to', type: 'address' }],
    outputs: [],
  },
  // Reclaim all delegated governance vote power. Live in Task 6.
  { name: 'undelegate', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  // Governance vote power of `_who` now, including delegations made TO it.
  {
    name: 'getVotes',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_who', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  // Who `_who` delegates governance vote power to now — zero when undelegated (probe read).
  {
    name: 'getDelegateOfAtNow',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_who', type: 'address' }],
    outputs: [{ type: 'address' }],
  },
] as const

/**
 * `IGovernor` (+ `IIGovernorProposer.isProposer`) — the PollingFoundation surface. The
 * proposal-state enum is `Pending(0) Active(1) Defeated(2) Succeeded(3) Queued(4)
 * Expired(5) Executed(6) Canceled(7)` (uint8).
 *
 * `getProposalInfo` pins the VENDORED 10-field shape (no description). The official
 * `flare-tx-sdk` (`network/cchain/contract/polling.ts`) reads the DEPLOYED
 * PollingFoundation with an 11-field variant that appends a trailing `string _description`.
 * The 10 static fields below are a safe decode PREFIX of both encodings — viem reads
 * exactly these 10 head words, identical whether or not a trailing dynamic `_description`
 * follows — so Task 5 gets proposer/timing/threshold/majority/circulatingSupply reliably.
 * The probe could not exercise this live (no PollingFoundation proposal in the scanned
 * window), so the safe prefix is the honest choice.
 */
export const GOVERNOR_ABI = [
  // ProposalState enum as uint8 (see the block comment for the index order).
  {
    name: 'state',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_proposalId', type: 'uint256' }],
    outputs: [{ type: 'uint8' }],
  },
  // Vendored 10-field shape; a safe static prefix of the deployed 11-field variant.
  {
    name: 'getProposalInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_proposalId', type: 'uint256' }],
    outputs: [
      { name: '_proposer', type: 'address' },
      { name: '_accept', type: 'bool' },
      { name: '_votePowerBlock', type: 'uint256' },
      { name: '_voteStartTime', type: 'uint256' },
      { name: '_voteEndTime', type: 'uint256' },
      { name: '_execStartTime', type: 'uint256' },
      { name: '_execEndTime', type: 'uint256' },
      { name: '_thresholdConditionBIPS', type: 'uint256' },
      { name: '_majorityConditionBIPS', type: 'uint256' },
      { name: '_circulatingSupply', type: 'uint256' },
    ],
  },
  {
    name: 'getProposalVotes',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_proposalId', type: 'uint256' }],
    outputs: [
      { name: '_for', type: 'uint256' },
      { name: '_against', type: 'uint256' },
    ],
  },
  {
    name: 'hasVoted',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_proposalId', type: 'uint256' },
      { name: '_voter', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  // Vote power of a voter at a proposal's vote-power block. Same name as
  // IGovernanceVotePower.getVotes but a DIFFERENT signature — hence separate ABIs.
  {
    name: 'getVotes',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_voter', type: 'address' },
      { name: '_blockNumber', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  // IIGovernorProposer — whether `_account` may submit a foundation proposal (probe read
  // false for the blank-slate account; a reliable gate, since `isMember` reverts).
  {
    name: 'isProposer',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_account', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  // Cast a vote: _support 0 = Against, 1 = For. Returns the vote power cast.
  //
  // DELIBERATELY STAGED AHEAD OF ITS CONSUMER — nothing in the kit calls this today. M12-R6
  // requires the vote path be BUILT and CARRIED: core's `planCastVote` refuses
  // unconditionally (no Active proposal is reachable on the write/verify network, and the
  // account holds no verified mainnet governance vote power), so no call is ever encoded
  // against this fragment. It is kept because deleting it would erode "built"; it is NOT
  // evidence that a vote path is live. Unlike this one, ABI fragments with no consumer and
  // no such mandate were removed.
  {
    name: 'castVote',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_proposalId', type: 'uint256' },
      { name: '_support', type: 'uint8' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const

/**
 * `IPollingFtso` — the management-group polling surface (the registry name is `PollingFtso`,
 * but the DEPLOYED contract is the newer management-group polling variant). Its state enum
 * is `Canceled(0) Pending(1) Active(2) Defeated(3) Succeeded(4)` (uint8) — DIFFERENT from
 * `IGovernor`'s.
 *
 * DEPLOYED-vs-VENDORED discrepancy (probe-confirmed, load-bearing for Task 5):
 * `getProposalInfo` on the deployed mainnet contract (`0x84e6790c…B391`, proposal #1)
 * decodes ONLY as the 8-field tuple below —
 *   (uint256, string, address, uint256, uint256, uint256, uint256, uint256).
 * The vendored `IPollingFtso` 7-field `(string,address,uint256×5)` shape does NOT decode
 * (probe `abiFindings`), and the v2 `IPollingManagementGroup` 8-field
 * `(string,address,bool,uint256×5)` shape is string-first — it would misalign (word 0 would
 * be a string offset, not the clean integer 247 the probe read, and no valid proposer
 * address would land at its slot). So the deployed shape matches NEITHER interface and is
 * pinned here from the live decode.
 *
 * Field naming: the SIX middle fields (`_description`, `_proposer`, `_voteStartTime`,
 * `_voteEndTime`, `_thresholdConditionBIPS`, `_majorityConditionBIPS`) align with the
 * vendored NatSpec and keep those names — the live decode confirmed threshold = 6600,
 * majority = 5000, a valid proposer and sensible timestamps. The TWO extra fields have NO
 * authoritative name in their deployed position; they carry honest best-effort names (from
 * the probe) flagged UNCONFIRMED. Only the TYPES are guaranteed — Task 5 must treat these
 * two VALUES as low-confidence (details inline on each field below).
 */
export const POLLING_FTSO_ABI = [
  // (proposalId, description) of the last proposal. Probe read id 0 on Coston2 (honest
  // empty — none ever) and id 1 on mainnet.
  {
    name: 'getLastProposal',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_proposalId', type: 'uint256' },
      { name: '_description', type: 'string' },
    ],
  },
  // ProposalState enum as uint8. Probe read 3 (Defeated) for mainnet proposal #1.
  {
    name: 'state',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_proposalId', type: 'uint256' }],
    outputs: [{ type: 'uint8' }],
  },
  // Probe-confirmed DEPLOYED 8-field shape — see the block comment for the deployed-vs-
  // vendored discrepancy and the two UNCONFIRMED best-effort field names.
  {
    name: 'getProposalInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_proposalId', type: 'uint256' }],
    outputs: [
      // UNCONFIRMED best-effort (probe: leading uint256 = 247). Member-count semantic, but
      // interfaces place noOfEligibleMembers LAST — deployed places it first.
      { name: '_noOfEligibleMembers', type: 'uint256' },
      { name: '_description', type: 'string' },
      { name: '_proposer', type: 'address' },
      { name: '_voteStartTime', type: 'uint256' },
      { name: '_voteEndTime', type: 'uint256' },
      { name: '_thresholdConditionBIPS', type: 'uint256' },
      { name: '_majorityConditionBIPS', type: 'uint256' },
      // UNCONFIRMED best-effort (probe: trailing uint256 ≈ 5217.78e18). 18-decimal
      // magnitude, no interface counterpart — total eligible vote power or supply.
      { name: '_totalVotePower', type: 'uint256' },
    ],
  },
  {
    name: 'getProposalVotes',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_proposalId', type: 'uint256' }],
    outputs: [
      { name: '_for', type: 'uint256' },
      { name: '_against', type: 'uint256' },
    ],
  },
  // Whether `_account` may create a management-group proposal (probe read false for the
  // blank-slate account; a reliable gate).
  {
    name: 'canPropose',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_account', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  // Whether `_account` is a member. NOTE: the probe found this REVERTS on both networks for
  // a non-member — the adapter records that honestly (reverted, not false); `canPropose`/
  // `isProposer` are the reliable gates.
  {
    name: 'isMember',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_account', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
] as const
