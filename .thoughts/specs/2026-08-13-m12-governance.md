# Spec: flare-kit milestone 12 — governance (Flare on-chain governance: `GovernanceVotePower` delegation on Coston2 + mainnet-read proposal reality), real-first (GovernanceCard + ProposalCatalogue/ProposalDetail)

> Governed by `.thoughts/decisions/2026-08-04-build-everything-real-first.md`.
> The governing decision's "Governance, delegation, staking, rewards" family was
> split with Abu (recorded in `.thoughts/specs/2026-08-12-m10-delegation-claims.md`
> and `.thoughts/specs/2026-08-12-m11-staking.md`):
> - **M10 (done) — Delegation & claims.** FTSO/WNat vote-power delegation + the
>   three reward kinds. All C-chain EVM on the viem substrate.
> - **M11 (done) — Staking.** The non-EVM P-chain substrate; built-but-stake-carried.
> - **M12 (this spec) — Governance.** The **final third** of the family. It closes
>   `R-GOV-001/002/003` from `.thoughts/specs/2026-08-03-flare-application-layer.md`.
>
> **Direction, already locked by the accepted M10 spec** (`2026-08-12-m10-delegation-claims.md:249-256`):
> *"Proposal discovery/type/state/snapshot, vote with vote power, `GovernanceVotePower`
> delegation, `PollingFoundation`/`PollingManagementGroup`, and the fact that
> meaningful proposals are **mainnet/Songbird only** (Coston2 has the governor
> contracts but no populated proposal cadence) — which forces the R-GOV-002
> archive/unknown honesty and a **mainnet-read for proposal content while Coston2 is
> the write/verify target**."* M12 does not re-open that direction.
>
> **Depth decision (Abu, this session, 2026-08-13): the FULL governance console.**
> Offered lean (governance-VP only) / medium (VP + proposal reads, no vote path) /
> full, Abu chose **full**: the live Coston2 `GovernanceVotePower` delegate/undelegate
> round trip, a mainnet-read `ProposalCatalogue` + `ProposalDetail` over real Flare
> FIP/STP proposals with the complete proposal state machine, **and** the `castVote`
> path built-but-carried (declared-unbuilt on Coston2, the M11 stake-broadcast shape).
> This matches the M10 pre-commitment word-for-word and the standing quality bar
> (`abu-quality-bar-over-deadlines`, `abu-nothing-left-behind`).
>
> Load-bearing grounding (this session, 2026-08-13; the addresses below are
> asserted from Flare's **generated** registry dump
> `developer-hub/src/features/DataTables/SolidityReference/solidity_reference.generated.json`
> block `FlareTestnetCoston2`, and the vendored periphery interfaces — **NOT yet a
> live repo probe.** M12-R1's `probe-governance.mjs` confirms every name against a
> live `FlareContractRegistry.getAllContracts()` **before** the parity test pins
> them; no address literal is hand-trusted):
> - **Two vote-power systems, and M10 only touched one.** M10's FTSO/WNat vote power
>   (`IVPToken.delegate(to, bips)`) is **percentage-split, up to two providers**.
>   Governance vote power is a **different contract — `GovernanceVotePower`
>   (`IGovernanceVotePower`)** — with **all-or-nothing** semantics: `delegate(address to)`
>   transfers your ENTIRE governance weight to ONE address; `undelegate()` clears it;
>   reads are `getVotes(who)`, `votePowerOfAt(who, block)`, `getDelegateOfAtNow(who)`,
>   `getDelegateOfAt(who, block)`. It is resolved from `WNat.governanceVotePower()` or
>   the registry name. Governance VP is a **WNat balance snapshot at a block** (the
>   randomly-selected Vote Count Block); on mainnet FIPs it is WFLR + staked FLR.
> - **Do NOT conflate** `GovernanceVotePower.delegate` (personal governance-VP
>   transfer, the M12 target) with `IClaimSetupManager.delegateGovernance` (a
>   claim-executor account feature). They are different contracts and different intents.
> - **EVM addresses resolve from `FlareContractRegistry` `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`
>   (same address on Coston2 and Flare mainnet).** Coston2:
>   `GovernanceVotePower` `0x8e4A2c063E1C82C9f5cb96489c0d2b6d78dF0538`,
>   `PollingFoundation` `0x6D7ca85Cb3451b772B87EBB32A9E5cFc500BfA94`,
>   `PollingFtso` `0x0f86aD3D5a910Bd0D6A73f7c256bDae1A8Ff7563`,
>   `PollingManagementGroup` `0x056A8AcdCd2B5D3bF7a4F1d218B8A1660BB4D912`.
>   **`GovernorReject` is NOT a registered name** (legacy v1, superseded by
>   `PollingFoundation`) — M12 never targets it. The Flare **mainnet** governance
>   addresses (for the read lens) are resolved+snapshotted from the mainnet registry
>   by the same probe; the `flare` (chainId 14) network is already wired in
>   `packages/contracts/src/addresses.ts` (`REGISTRIES.flare`).
> - **Proposals are the Foundation's, and permissioned.** `PollingFoundation`
>   (`IGovernor` + `IIGovernorProposer`) proposal state enum is `Pending, Active,
>   Defeated, Succeeded, Queued, Expired, Executed, Canceled`; `getProposalInfo`
>   returns `(proposer, accept, votePowerBlock, voteStartTime, voteEndTime,
>   execStartTime, execEndTime, thresholdConditionBIPS, majorityConditionBIPS,
>   circulatingSupply)`; `getProposalVotes → (for, against)`; `state`, `hasVoted`,
>   `getVotes(voter, block)`. `propose` is gated by `isProposer(address)` — the Flare
>   Foundation, not any VP holder. `PollingFtso`/`PollingManagementGroup`
>   `propose`/`castVote` are gated by `canPropose`/`canVote` (FTSO management-group
>   members / proxy / maintainer). Coston2 has the contracts deployed but **no
>   populated proposal cadence** — meaningful proposals are mainnet/Songbird only.
> - **The Vote Count Block is a random snapshot block** chosen after announcement to
>   stop last-minute vote buying; it surfaces on-chain as `votePowerBlock` in
>   `getProposalInfo`. Governance VP for a proposal is read `getVotes(voter, votePowerBlock)`.
> - **Proposal DISCOVERABILITY is itself unverified and RPC-constrained.** Whether
>   Flare **mainnet** `PollingFoundation` actually exposes on-chain, readable
>   proposals (some FIPs execute via direct governance, not the Governor) is NOT yet
>   probed. Discovery is by `ProposalCreated` event scan, and the Flare RPC caps
>   `eth_getLogs` to a small block range (the M8 rule already handled in
>   `gasless-adapter.ts` / `bridge-adapter.ts`), so discovery is a **bounded
>   recent-window scan** (plus `PollingFtso.getLastProposal` where it applies), then
>   `getProposalInfo`/`state` by id. `probe-governance.mjs` (M12-R1) determines what
>   is really discoverable; if nothing is found within limits the catalogue is
>   **honest-empty on every network**, and the full state machine is a rendering
>   capability exercised against whatever real proposal the probe DID observe (or the
>   mock of it) — never a fabricated proposal. The spec does not assume a live
>   mainnet proposal exists; it renders only what is observed.
> - **The account substrate is live.** The M8/M9/M10/M11 signer
>   `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9` holds ~146 C2FLR and **already
>   wrapped C2FLR→WNat in M10** (governance VP is that WNat balance snapshot). The
>   governance delegate/undelegate round trip is **cheap and instantly reversible —
>   there is NO funding wall** (unlike M11's 50k-FLR / 14-day lock). It flips
>   `governanceVerified` true this milestone with Abu's go, the M10 delegation shape.

## Objective

After this milestone a developer can install the kit and drop a working
**governance** console into their own React app, and:

- a person (or an agent with its own key) can **read** their on-chain
  **governance vote power** and current governance **delegate**, then **delegate**
  their entire governance weight to a single address and **undelegate** it — a
  real, live-verified Coston2 operation whose success is a
  **`getDelegateOfAtNow` read back from the chain** (submitted is never succeeded);
- the same developer can **discover** real Flare governance **proposals**
  (mainnet-read, clearly labelled cross-network) with their full lifecycle state,
  tallies, quorum/majority thresholds and vote-power block, inspect any one
  proposal, and see their **own eligibility** (`isProposer` / `canPropose` /
  `isMember`) read live; and
- the **vote** path is built and invariant-gated but **carried** — there is no
  live `Active` proposal on Coston2 and the test account holds no mainnet
  governance VP, so a cast is never faked, exactly as M11's stake broadcast carried.

Governance is the capability that **spans two networks in one surface** — Coston2
is the write/verify target for vote-power delegation, while proposal *content* is
an honest read of Flare mainnet. It reuses the durable, self-reconciling operation
lifecycle M1 forced into being, the vote-power delegation anatomy M10 established
(on a semantically different contract), and the read-only catalogue anatomy the FDC
and FTSO surfaces established.

## The surfaces, and why they differ

- **The GovernanceCard** is a **vote-power delegation** surface, like M10's
  `DelegationCard`, but the semantics differ and must not be collapsed: governance
  VP is **all-or-nothing to ONE address** (`delegate(to)` / `undelegate()`), not a
  percentage split across two providers. The card reads governance VP + the current
  delegate, composes a single-target delegation, live-verifies it on Coston2, and
  folds in an **eligibility panel** (the account's own `isProposer`/`canPropose`/
  `isMember`).

- **The ProposalCatalogue + ProposalDetail** are **read-only, cross-network**
  surfaces like `FeedCatalogue`/`AttestationCatalogue`, but their content is read
  from **Flare mainnet** (real FIP/STP proposals) and every row is labelled as a
  mainnet read while the write target is Coston2. On Coston2 the same read returns
  an **honest empty** ("no active proposals on this network"), never a fabricated
  proposal. The detail renders the complete state machine, tallies, quorum/majority
  BIPS, `votePowerBlock`, and the account's `getVotes` at that block.

## The honesty it forces

- **A submitted delegation is not a delegation.** `succeeded` is entered **only**
  from reading `getDelegateOfAtNow(account)` back (→ the target on delegate, → the
  zero address on undelegate) — never from the `delegate` submission. A
  submitted-but-unconfirmed delegation renders in-flight.
- **`governanceVerified` gates every write** and the portfolio flip. It starts
  `false` and flips `true` only after the live Coston2 delegate round trip reads
  back — exactly `delegationVerified` (M10). Until then the surface shows the
  configured path but a declared-unbuilt affordance, never a plan.
- **Mainnet reads are labelled cross-network, read-only content** — never dressed
  as a Coston2 action, never as something the account can write to.
- **Archive / unknown honesty for proposals.** Coston2 shows honest-empty; a
  proposal whose state or tallies cannot be read is `unknown`/`unavailable`, never a
  fabricated proposal, tally, or quorum (the `mock-never-fills-unobserved` and
  `state-reachable-from-props` rules the project has been bitten by twice).
- **castVote / propose / execute are carried, never faked.** No live `Active`
  proposal exists on Coston2 and the test account has no mainnet governance VP, so a
  "voted" / "proposed" / "executed" success is **never** rendered. The vote path is
  built and gated; the affordance is declared-unbuilt/awaiting, the M11 shape.
- **Governance VP ≠ FTSO VP.** The card never reuses M10's bips/two-provider
  semantics; it is all-or-nothing single-target. `GovernanceVotePower.delegate` is
  never conflated with `IClaimSetupManager.delegateGovernance`.
- **Never invent a zero.** An absent governance-VP or proposal read (`undefined`)
  is `unavailable`, never a confident zero — the M10 adapter rule.
- **Exact values render in the mono face** — vote power, tallies, BIPS, block
  numbers — with full precision. Files stay < 300 lines; one shared component per
  pattern.

## Requirements

- **M12-R1 — `@flare-kit/contracts` gains the governance registry.**
  `governance.ts` (+ `governance-abis.ts`) carries the `GovernanceVotePower`,
  `PollingFoundation`, `PollingFtso` and `PollingManagementGroup` EVM addresses for
  **both `coston2` (write/verify) and `flare` (mainnet read lens)** as exported
  constants, plus a **`governanceVerified`** flag. Addresses are **resolved offline**
  from `FlareContractRegistry.getAllContracts()` on each network and **snapshotted**,
  verified by extending `manifest-parity.test.ts`; no address literal exists outside
  the registry (the `delegation.ts` / `staking.ts` `<Domain>Deployment` +
  `Readonly<Record<FlareNetworkKey, …>>` + `<domain>For(network)` pattern, addresses
  REUSED via `registryFor(chainId).<field>`). `GovernorReject` is never targeted.
  `governanceVerified` starts `false` and flips `true` only after the confirming
  live Coston2 round trip, exactly as `delegationVerified` did. The `IGovernor` /
  `IGovernanceVotePower` / `IPollingFtso` ABIs are hand-curated viem fragments of
  the vendored periphery interfaces (the `delegation-abis.ts` pattern).

- **M12-R2 — `@flare-kit/core` governance reads + intent.** `governance-adapter.ts`
  reads via **viem**: governance VP (`getVotes`, `getDelegateOfAtNow`,
  `votePowerOfAt`), resolves the `GovernanceVotePower` contract from
  `WNat.governanceVotePower()` or the registry, and builds the **delegate/undelegate
  intent** (`{to}` — single target) and call builders. Reads never fabricate a zero
  on RPC failure (propagate the throw, the `delegation-adapter.ts` rule). A sibling
  `proposals.ts` reads proposal discovery/state from **Flare mainnet**
  (`PollingFoundation` `state`/`getProposalInfo`/`getProposalVotes`/`hasVoted`/
  `getVotes(voter, votePowerBlock)`) and the account's eligibility
  (`isProposer`/`canPropose`/`canVote`/`isMember`), modelling the full state enum and
  the archive/unknown honesty (Coston2 → honest-empty; unreadable → `unknown`).

- **M12-R3 — the delegation lifecycle is durable and self-reconciling.**
  `governance-states.ts` models the delegate/undelegate operation over the
  **canonical** operation states (no new state id), reusing the shared
  `reconcile.ts` table-walk. A submitted delegation persists its evidence and
  reconciles against the chain when the app reopens; there is no Resume button.
  `succeeded` is entered only from the on-chain `getDelegateOfAtNow` read.

- **M12-R4 — invariants enforced before signing.** `governance.ts` maps intents →
  a **`governanceVerified`-gated** plan → the lifecycle, and enforces: a valid,
  non-zero target address, the target ≠ the account (no self-delegation loop where
  the contract forbids it), and — for undelegate — that a current delegate exists.
  `succeeded` is entered only from the on-chain delegate read.

- **M12-R5 — the proposal surface is a mainnet read, honest across networks and
  honest about discoverability.** `proposals.ts` + the read hook **discover**
  proposals by a bounded recent-window `ProposalCreated` event scan (respecting the
  RPC `eth_getLogs` cap, the `gasless-adapter.ts`/`bridge-adapter.ts` pattern) plus
  `PollingFtso.getLastProposal` where it applies, then read each observed proposal's
  full lifecycle state, tallies, quorum (`thresholdConditionBIPS`), majority
  (`majorityConditionBIPS`), `votePowerBlock`, `circulatingSupply`, and `hasVoted`
  from **Flare mainnet**. Every proposal is labelled a **cross-network read**; the
  write target stays Coston2. Where discovery finds nothing within limits (including
  all of Coston2), the surface is **honest-empty**, never a fabricated proposal; an
  unreadable field is `unknown`. The account's eligibility
  (`isProposer`/`canPropose`/`isMember`) is read and rendered as its own (lack of)
  eligibility. The spec does not assume any live proposal exists — it renders only
  what the probe/read actually observes.

- **M12-R6 — the vote path is built and carried, never faked.** The `castVote`
  intent + invariant gate (a proposal in `Active`, the account holds governance VP
  at the `votePowerBlock`) are built over the canonical lifecycle, but the live cast
  is **declared-unbuilt/carried**: no `Active` proposal exists on Coston2 and the
  test account holds no mainnet governance VP. The surface renders the affordance in
  a declared-unbuilt/awaiting state (the M11 stake-broadcast-carried shape); a cast
  success is never rendered. Proposal **submission** and **execution** are out of
  scope (permissioned / unreachable) — see Out of scope.

- **M12-R7 — real-first; the mock copies observed behaviour.** `mock-governance.ts`
  reproduces exactly what the live run(s) observed — the governance-VP reads, the
  delegate/undelegate round trip, and a real mainnet proposal snapshot read during
  grounding — by driving the **real** adapter + plan + `reconcile.ts` against a
  labelled fake `PublicClient`, and **refuses to render anything not observed** (no
  fabricated proposal, no injected active vote). No live code path constructs a mock
  under any error.

- **M12-R8 — GovernanceCard + ProposalCatalogue + ProposalDetail.** `GovernanceCard`
  folds governance-VP read, the single-target delegate composer, the current
  delegate, the eligibility panel, and the operation timeline (delegate → confirm by
  re-reading `getDelegateOfAtNow`). `ProposalCatalogue` lists mainnet proposals with
  their state; `ProposalDetail` renders one proposal's full state machine, tallies,
  BIPS, `votePowerBlock` and the account's `getVotes` at that block, with the carried
  `castVote` affordance. Reuse `DelegationCard`/`delegation-card-state.ts`,
  `FeedCatalogue`/`AttestationCatalogue`, `OperationTimeline`, `card-chrome`,
  `Panel`, `Details`/`DetailRow` — never build chrome inline. **No new `ClaimKind`**
  (governance has no reward); `ClaimCard` is untouched.

- **M12-R9 — `@flare-kit/react` hooks.** `use-governance.ts` drives the governance-VP
  delegate/undelegate lifecycle, polling `getDelegateOfAtNow`; `use-proposals.ts`
  drives the mainnet proposal catalogue/detail reads. Read/plan paths need no key;
  signing uses the caller's viem wallet (a person's or an agent's own key, per the
  agent-facing-surfaces decision). Thin wrappers over the M8 durable-poll hook.

- **M12-R10 — network is configuration; the portfolio governance position flips;
  reuse; files < 300 lines.** Addresses/config come from `@flare-kit/contracts`
  (M12-R1); testnet-first, mainnet-capable with no source rewrite (the mainnet lens
  uses the already-wired `flare` registry + the existing mainnet C-chain RPC
  `chains.ts` `https://flare-api.flare.network/ext/C/rpc`). `packages/core/src/portfolio.ts` gains a governance position
  (governance VP + current delegate) as a real **`observed | unavailable`** view
  **once `governanceVerified`**; until then it **stays declared-unbuilt**, exactly
  as `stake` does. Reuse the shared components; split any module approaching 300
  lines before writing. Exact values render in the mono face with full precision.

- **M12-R11 — honesty gates end-to-end.** `governanceVerified` gates every write and
  the position flip; `succeeded` is only the on-chain delegate read; mainnet reads
  are labelled cross-network; proposals are archive/unknown-honest (Coston2 empty,
  unreadable → `unknown`, never fabricated); castVote/propose/execute are carried,
  never faked; governance VP is never collapsed into M10's bips semantics nor
  conflated with `IClaimSetupManager.delegateGovernance`; an absent read is
  `unavailable`, never a zero.

## Out of scope (M12)

- **Casting a live vote.** No `Active` proposal exists on Coston2 and the test
  account holds no mainnet governance VP, so a live cast cannot be verified. The
  vote path is **built and carried** (M12-R6), not dropped. Content is a mainnet read.
- **Submitting a proposal (`PollingFoundation.propose`).** Gated by
  `isProposer(account)` — the Flare Foundation. A hackathon account is not a
  proposer → cannot execute. **Declared-unbuilt (permissioned).** The account's own
  `isProposer` is read and shown honestly (M12-R5).
- **`PollingFtso` / `PollingManagementGroup` propose / castVote.** Gated by
  `canPropose` / `canVote` (FTSO management-group member / proxy / maintainer). A
  generic account is not a member → cannot execute. **Declared-unbuilt (permissioned).**
  Eligibility is read and shown.
- **Executing a passed proposal.** Only reachable from `Succeeded` → `Queued`;
  unreachable without a passing live proposal. **Carried.**
- **Mainnet governance *writes*.** The account has no mainnet FLR / governance VP;
  the mainnet network is a **read lens only**. Writes stay Coston2.
- **Songbird.** The mechanism is identical (STPs/SIPs); Songbird addresses slot into
  the same registry with no source rewrite when a live run needs them. Not built here.
- **A new `ClaimKind`.** Governance has no reward to claim; `ClaimCard` is untouched.

## Files (added to SPEC.md's `## Files` manifest before writing)

`@flare-kit/contracts`:
- `packages/contracts/src/governance.ts` — `GovernanceVotePower` / `PollingFoundation`
  / `PollingFtso` / `PollingManagementGroup` registry for `coston2` + `flare`,
  `governanceVerified`. M12-R1.
- `packages/contracts/src/governance-abis.ts` — `IGovernanceVotePower` / `IGovernor`
  (PollingFoundation) / `IPollingFtso` viem fragments. M12-R1.
- `packages/contracts/src/index.ts` — export the above.
- `packages/contracts/test/manifest-parity.test.ts` — extend to assert the
  snapshotted governance addresses match `getAllContracts()` on both networks. M12-R1.

`@flare-kit/core`:
- `packages/core/src/governance-adapter.ts` — governance-VP reads + delegate/undelegate
  builders. M12-R2.
- `packages/core/src/governance.ts` — intents → verified-gated plan → lifecycle;
  invariants. M12-R2/R4.
- `packages/core/src/governance-states.ts` — the durable delegate/undelegate
  lifecycle over canonical states. M12-R3.
- `packages/core/src/proposals.ts` — mainnet-read proposal discovery/state + eligibility;
  archive/unknown honesty; the carried `castVote` intent. M12-R5/R6.
- `packages/core/src/mock-governance.ts` — copies observed, refuses unobserved. M12-R7.
- `packages/core/src/portfolio.ts` — add a governance `observed | unavailable`
  position once `governanceVerified`; unbuilt until then. M12-R10.
- `packages/core/src/index.ts` — export the above.
- `packages/core/scripts/probe-governance.mjs` — keyless probe: confirm the registry
  names live on both networks, read VP + delegate + a real mainnet proposal +
  eligibility. Verification / M12-R1.
- `packages/core/scripts/live-governance.mjs` — the gated delegate/undelegate round
  trip (keys from env, never logged); flips `governanceVerified`. Verification.

`@flare-kit/react`:
- `packages/react/src/use-governance.ts` — governance-VP delegate/undelegate lifecycle. M12-R9.
- `packages/react/src/use-proposals.ts` — mainnet proposal catalogue/detail reads. M12-R9.
- `packages/react/src/index.ts` — export the above.

`@flare-kit/react-ui`:
- `packages/react-ui/src/GovernanceCard.tsx` (+ `governance-card-state.ts`) — M12-R8.
- `packages/react-ui/src/ProposalCatalogue.tsx` — mainnet proposal list. M12-R8.
- `packages/react-ui/src/ProposalDetail.tsx` — one proposal, full state + carried vote. M12-R8.
- `packages/react-ui/src/governance.css` — new `fk-gov` classes, `@import`-ed into `styles.css`. M12-R8.
- `packages/react-ui/gallery/m12-governance-sections.tsx` — drive every state. M12-AC6.
- `packages/react-ui/src/index.ts` — export the above.

## Acceptance criteria

- **M12-AC1 — keyless reads, live on Coston2 (+ the mainnet read lens).** The five
  governance registry names resolve live from `getAllContracts()` on Coston2 (and
  the mainnet governance addresses from the `flare` registry); the account's
  governance VP (`getVotes`), current delegate (`getDelegateOfAtNow`) and eligibility
  (`isProposer`/`canPropose`/`isMember`) read live. Proposal **discovery** runs
  (bounded event scan + `getLastProposal`); **any proposal it observes** reads with
  its full state/tallies/BIPS/`votePowerBlock`. If discovery finds none within RPC
  limits, the catalogue is honest-empty on every network; absent reads are
  `unavailable`/`unknown`, never a fabricated proposal or zero.

- **M12-AC2 — the delegation path is built and invariant-gated.** The plan gates on
  `governanceVerified`, enforces a valid non-zero single target and (for undelegate)
  an existing delegate, and traverses the canonical lifecycle; `succeeded` is entered
  **only** from the `getDelegateOfAtNow` read; a submitted-but-unconfirmed delegation
  renders in-flight.

- **M12-AC3 — the live governance-VP round trip (gated), flips `governanceVerified`.**
  With Abu's go (cheap, reversible, no funding wall): `live-governance.mjs` broadcasts
  `delegate(to)` on Coston2, reads `getDelegateOfAtNow` back (→ target),
  `governanceVerified` flips `true`, then `undelegate()` reads back the zero address.
  Transaction hashes + explorer links recorded. (If Abu withholds the go, the reads
  are recorded and the write carries declared-unbuilt with the portfolio governance
  position still unbuilt — the honest collapse, nothing faked.)

- **M12-AC4 — the proposal surface is mainnet-read and honest.** `ProposalCatalogue`
  + `ProposalDetail` render **every proposal discovery actually observed** with the
  full state machine, labelled cross-network; where discovery finds none the surface
  is honest-empty (never a fabricated proposal); the account's eligibility is shown;
  the `castVote` affordance is present but **carried** (never a faked cast).

- **M12-AC5 — the shipped runtime stays viem-only, honest, and reused.** No new peer
  dependency; `pnpm build` + `publint` clean. Governance VP is all-or-nothing
  single-target (never M10's bips), and `GovernanceVotePower.delegate` is not
  conflated with `IClaimSetupManager.delegateGovernance`. `ClaimCard` is untouched.

- **M12-AC6 — surfaces, browser-verified, both themes.** `GovernanceCard`,
  `ProposalCatalogue` and `ProposalDetail` are driven in a real browser through every
  required state via the gallery, in light and dark; exact values (VP, tallies, BIPS,
  block numbers) render in the mono face with full precision; the a11y audit reports
  zero new `fk-gov` issues. The gallery renders only states the live run observed: no
  fabricated `Active` Coston2 proposal, no invented cast/success. Screens recorded.

- **M12-AC7 — gate green; mock honest; reviewed.** `pnpm build && pnpm typecheck &&
  pnpm lint && pnpm test` exits 0. `mock-governance` reproduces the live run(s) and
  refuses the unobserved; no live path constructs a mock. Review-gate subagents
  (correctness, honest-rendering/silent-failure, simplification) run over the M12 diff
  and every critical/important finding is fixed and tested.

## Verification

Real-first, on Coston2 (114) with the Flare mainnet (14) read lens, reusing the
M8/M9/M10/M11 signer `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9`. The reads are
keyless; the delegate/undelegate round trip **needs Abu's go** (the standard
prior-milestone live-run gate) — but is **cheap and reversible, with no funding
floor** (the account already holds C2FLR and wrapped WNat in M10).

1. **Resolve + snapshot addresses.** `probe-governance.mjs` resolves the five
   governance names from `getAllContracts()` on Coston2 **and** the mainnet
   governance addresses from the `flare` registry; snapshot into `governance.ts`;
   assert against the registry in the parity test. Confirm `GovernorReject` is absent.
2. **Keyless reads (M12-AC1).** Read the account's governance VP, current delegate and
   eligibility on Coston2; read a real Flare mainnet proposal's full state/tallies/BIPS;
   confirm the honest empty/observed/unavailable/unknown states.
3. **Delegation path + invariants (M12-AC2).** Verify the plan gates on
   `governanceVerified` and the invariants, and that the lifecycle enters `succeeded`
   only from the `getDelegateOfAtNow` read.
4. **Live round trip (M12-AC3), gated.** With Abu's go: `delegate(to)` on Coston2 →
   read back → flip `governanceVerified` → `undelegate()` → read back the zero
   address. Record tx hashes + explorer links. Without the go: record the reads and
   carry the write declared-unbuilt (governance position stays unbuilt) — no fabrication.
5. Write `mock-governance.ts` from the observed run. Run the full gate and the review gate.

Evidence recorded under `.thoughts/verification/2026-08-13-m12-governance.md`
(+ `coston2-live-governance.json` or the read-probe JSON if the write carries, and
`m12-screens/`), with date, networks, addresses, proposal ids, transaction hashes and
explorer links. **Secrets rule:** signing keys are never logged, printed in `--json`,
or included in evidence.

## Sources

Grounding, this session (2026-08-13):
- Live-reality map — `.thoughts` grounding over `developer-hub/docs/network/3-governance.mdx`
  (proposal types FIP/STP/SIP, lifecycle, management group, Vote Count Block),
  `developer-hub/src/features/DataTables/SolidityReference/solidity_reference.generated.json`
  (Coston2 governance addresses + registry), the vendored periphery interfaces
  `sources/flare-foundation/flare-foundry-periphery-package/src/coston2/{IGovernor.sol,
  IGovernanceVotePower.sol, IPollingFtso.sol, governance/interfaces/IIPollingFoundation.sol,
  governance/interfaces/IIGovernorProposer.sol}`, `developer-hub/docs/network/solidity-reference/
  {IGovernanceVotePower.md,IWNat.md,IClaimSetupManager.md,IFlareContractRegistry.md}`, and the
  flare-tx-sdk cookbook `developer-hub/docs/network/flare-tx-sdk/2-cookbook.mdx` governance section.
- Codebase pattern probe — the M10/M11 house shape: the `<Domain>Deployment` +
  `Readonly<Record<FlareNetworkKey, …>>` + `<domain>Verified` registry
  (`packages/contracts/src/delegation.ts`, `staking.ts`), the plan `not-verified`
  gate (`packages/core/src/delegation.ts:114`), the `observed | unavailable` /
  never-a-fabricated-zero portfolio shape (`packages/core/src/portfolio.ts:52-135`),
  the `DelegationCard`/`FeedCatalogue`/`AttestationCatalogue` reuse targets, the
  probe/live/mock triad, and the already-wired `flare` mainnet registry
  (`packages/contracts/src/addresses.ts:98-124`).
- Pre-commitment provenance — `.thoughts/specs/2026-08-12-m10-delegation-claims.md:249-256`
  (the M12 direction: proposal discovery/state, vote with vote power, `GovernanceVotePower`
  delegation, mainnet-read while Coston2 write/verify, archive/unknown honesty) and
  `.thoughts/specs/2026-08-12-m11-staking.md:236-239,414-415` (governance → M12, mainnet-only cadence).
