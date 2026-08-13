# M12 Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development
> (fresh subagent per task + two-stage review) — this milestone is driven
> **real-first against live Coston2 + a Flare-mainnet read lens**: the implementer
> **resolves the existing Flare governance contracts from the registry on both
> networks** and **reads the chain** (governance vote power, delegate, eligibility,
> real mainnet proposals) to write correct code and fixtures. Steps use checkbox
> (`- [ ]`) syntax. Plan location follows the project convention (`.thoughts/plans/`),
> overriding the skill default. This repo is **not** a git repo in this session —
> treat "Checkpoint" steps as markers; skip the `git` call if it errors.

**Goal:** Ship a **governance** console as installable kit surfaces — read the
account's on-chain **governance vote power** and **delegate** it to one address
(all-or-nothing) and **undelegate** it, live-verified on Coston2; **discover** real
Flare **proposals** (mainnet-read, labelled cross-network) with their full lifecycle
state, tallies, quorum/majority and vote-power block, and the account's own
**eligibility** — with the **vote path built but carried** (no live Coston2
proposal), never faked.

**Architecture:** Mirror the M10/M11 stack, all on the C-chain viem substrate.
Governance is **two networks in one milestone**: Coston2 is the write/verify target
(the `GovernanceVotePower` delegate/undelegate round trip that flips
`governanceVerified`), while proposal **content** is an honest read of Flare mainnet.
Governance vote power is a **different contract from M10's FTSO vote power** —
`GovernanceVotePower` (`IGovernanceVotePower`), **all-or-nothing to ONE address**
(`delegate(to)`/`undelegate()`), never M10's `delegate(to, bips)` two-provider split,
and never conflated with `IClaimSetupManager.delegateGovernance`. The delegation
lifecycle reuses the **canonical** `states.ts` + the shared `reconcileTo` walker;
`succeeded` is entered **only** from reading `getDelegateOfAtNow` back. Proposals are
discovered by a **bounded `ProposalCreated` event scan** (respecting the RPC
`eth_getLogs` cap) + `PollingFtso.getLastProposal`, then read by id — honest-empty
where discovery finds none. `portfolio.ts` flips a declared-unbuilt governance
placeholder to a real `observed | unavailable` position **once `governanceVerified`**.
The `castVote` path is built and gated but **carried**; propose/execute are
declared-unbuilt (permissioned). **No new `ClaimKind`** — governance has no reward,
so `ClaimCard` is untouched. Reuse `DelegationCard` for the write card and
`FeedCatalogue`/`AttestationCatalogue` for the proposal reads.

**Tech Stack:** TypeScript, viem (peer — **no new dependency**), React, vitest,
Turborepo/pnpm. `FlareContractRegistry` resolution on Coston2 (114) + Flare mainnet
(14). `IGovernanceVotePower` for the write; `IGovernor` (`PollingFoundation`) +
`IPollingFtso` for the proposal/eligibility reads.

## Global Constraints

- Production source files **< 300 lines**; split before writing (CLAUDE.md).
- **The shipped runtime stays viem-only, with NO new dependency.** Governance is all
  EVM/C-chain — no new peer/dep is added. `publint` + build stay clean.
- **Never fake protocol reality.** A submitted delegate is in-flight/`awaiting_external`,
  **never** `succeeded`; `succeeded` is entered **only** from reading
  `getDelegateOfAtNow` back (→ the target on delegate, → the zero address on
  undelegate). `castVote`/`propose`/`execute` are **carried, never faked** — no
  live `Active` Coston2 proposal exists and the test account holds no mainnet
  governance VP, so a "voted"/"proposed"/"executed" success is never rendered. An
  unknown outcome is never `failed`; an absent read is `unavailable`/`unknown`,
  **never a fabricated zero or proposal**. Mock mode is explicit/labelled, never a
  failure fallback.
- **Governance VP ≠ FTSO VP.** All-or-nothing **single target** (`delegate(to)` /
  `undelegate()`); never M10's bips/two-provider semantics. `GovernanceVotePower.delegate`
  is **never** conflated with `IClaimSetupManager.delegateGovernance` (a different
  contract, a claim-executor feature).
- **Mainnet reads are labelled cross-network, read-only content** — never dressed as
  a Coston2 action. The **write target stays Coston2**; the account has no mainnet
  governance VP, so mainnet is a **read lens only**.
- **Proposal discovery is RPC-bounded and honesty-first.** Discovery is a bounded
  recent-window `ProposalCreated` event scan (respecting the Flare `eth_getLogs` cap,
  the `gasless-adapter.ts`/`bridge-adapter.ts` precedent) + `getLastProposal`. If
  nothing is discoverable within limits (including all of Coston2), the catalogue is
  **honest-empty**; the spec assumes no live proposal exists and renders only what is
  observed.
- **`governanceVerified` gates every write and the portfolio flip.** It starts
  `false` and flips `true` only after the live Coston2 delegate round trip reads
  back. The round trip is **cheap and instantly reversible — no funding wall**
  (unlike M11); with Abu's go it flips true this milestone. **If Abu withholds the
  go**, the write carries declared-unbuilt (`governanceVerified:false`, the
  governance position stays unbuilt) — the honest collapse, nothing faked.
- **Secrets:** `.secrets/live-run.json` holds the dev key; keys are never logged,
  never in `--json`/evidence. Browser surfaces sign only via the caller's injected
  `walletClient` and never hold a key.
- **Exact values render in the mono face** with full precision (vote power, tallies,
  BIPS, block numbers).

### Harness mechanics (read before Task 0)

- **Never `cd` into a package** — the stage guard resolves the project root from the
  shell cwd and will block source writes. Use `pnpm --filter` from the repo root.
- **SPEC.md `## Files` manifest** (Task 0): every source file must be listed there
  before it is written. The section ends at the next `##`/`###` of any depth — insert
  only flat bullets, never a subheading.
- **Test lock**: each test file's mtime is compared to SPEC.md's; one SPEC.md write
  unlocks every test file once. Batch test-file creation behind the one Task-0 SPEC
  write; never touch SPEC.md just to unlock.
- **react-ui imports `@flare-kit/react` from dist** — a core/hook change needs
  `pnpm build` before react-ui (and any live script that imports core) sees it.
- **`applyTransition` silently drops its patch** on an illegal hop — every reconciler
  must **walk the `states.ts` table** via the shared `reconcileTo` (BFS `pathTo`),
  never jump states. Import `reconcileTo`/`waitSince`/`advance` from `reconcile.ts`;
  do not re-implement (the `delegation-states.ts`/`gasless-states.ts` precedent).
- **No new dependency, no contract deploys this milestone.** The governance contracts
  exist on both networks; Task 1 resolves + snapshots `GovernanceVotePower`,
  `PollingFoundation`, `PollingFtso`, `PollingManagementGroup` from
  `FlareContractRegistry` (`0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`, same address
  on Coston2 and Flare mainnet). Task 2's parity test asserts the snapshot against a
  live registry read **on both networks**. `GovernorReject` is confirmed **absent**
  from the registry (legacy v1, superseded) and is never targeted.
- **Two clients.** The Coston2 client (write/verify) uses
  `https://coston2-api.flare.network/ext/C/rpc`; the mainnet read lens uses the
  already-wired `chains.ts` `flare` `rpcUrl` `https://flare-api.flare.network/ext/C/rpc`.
- **The delegate round trip is carried, not forced.** Task 6 runs the keyless reads
  always; the delegate/undelegate broadcast is gated on **Abu's go** (cheap,
  reversible, no funding floor). If withheld, M12 closes with
  `governanceVerified:false` and the built path (the M11 collapse pattern). Task 12
  records the outcome in `state.json`.
- **state.json bump** at close (Task 12) via a JSON load/mutate/dump script — never
  hand-edit.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `packages/core/scripts/probe-governance.mjs` | read-only resolve (both networks) + VP/delegate/eligibility/proposal-discovery probe (dev, not shipped) | 1 |
| `packages/contracts/src/governance.ts` | governance registry for `coston2` + `flare`, `governanceVerified` | 2 |
| `packages/contracts/src/governance-abis.ts` | `IGovernanceVotePower` / `IGovernor` / `IPollingFtso` viem fragments | 2 |
| `packages/core/src/governance-adapter.ts` | governance-VP + eligibility reads (viem) + delegate/undelegate call builders | 3 |
| `packages/core/src/governance.ts` | intents → `governanceVerified`-gated plan → lifecycle; invariants | 4 |
| `packages/core/src/governance-states.ts` | `reconcileGovernance` (delegate/undelegate spine, succeeded from `getDelegateOfAtNow`) | 4 |
| `packages/core/src/portfolio.ts` | flip governance placeholder → `observed \| unavailable` once `governanceVerified` | 4 |
| `packages/core/src/proposals.ts` | mainnet-read proposal discovery/state + detail + carried `castVote` intent | 5 |
| `packages/core/scripts/live-governance.mjs` | keyless reads always + gated delegate/undelegate round trip | 6 |
| `packages/core/src/mock-governance.ts` | the governance mock, after the real run | 7 |
| `packages/react/src/use-governance.ts` | hook over the delegate/undelegate operation | 8 |
| `packages/react/src/use-proposals.ts` | hook over the mainnet proposal catalogue/detail reads | 8 |
| `packages/react-ui/src/GovernanceCard.tsx` (+ `governance-card-state.ts`) | GOVERNANCE write card (VP + delegate composer + eligibility) | 9 |
| `packages/react-ui/src/governance.css` | `fk-gov` CSS, values from tokens | 9 |
| `packages/react-ui/src/ProposalCatalogue.tsx` | mainnet proposal list (cross-network read) | 10 |
| `packages/react-ui/src/ProposalDetail.tsx` | one proposal, full state + carried vote affordance | 10 |
| `packages/react-ui/gallery/m12-governance-sections.tsx` | AC6 state matrix, both themes (observed states only) | 11 |

---

## Task 0: Declare M12 files in SPEC.md manifest

**Files:** Modify `SPEC.md` (`## Files` section only).

- [ ] **Step 1** Append every M12 source file (the packages files in the File Structure
  table) to SPEC.md's `## Files` section as flat bullets. Do **not** insert any `###`.
- [ ] **Step 2** Verify the `## Files` section still ends at the next `##`. This single
  SPEC.md write is what unlocks the M12 test files (batch all later test creation behind it).
- [ ] **Step 3** Confirm **no new dependency** is required (governance is viem-only) —
  `packages/*/package.json` are untouched this milestone.
- [ ] **Step 4** Checkpoint `chore: declare M12 governance files in SPEC.md manifest`.

**Acceptance:** every file a later task creates is listed; no `###` inside `## Files`;
no package.json change; no new dependency.

---

## Task 1: Read-only probe — resolve addresses (both networks) + governance reality

**Files:** Create `packages/core/scripts/probe-governance.mjs` (dev script, not shipped);
produce `.thoughts/verification/2026-08-13-m12-probe.json`.

- [ ] **Step 1** Resolve from `FlareContractRegistry.getAllContracts()` on **Coston2**
  (`https://coston2-api.flare.network/ext/C/rpc`): `GovernanceVotePower`,
  `PollingFoundation`, `PollingFtso`, `PollingManagementGroup`. Assert `GovernorReject`
  is **absent**. Print the four addresses; assert `GovernanceVotePower` also equals
  `WNat.governanceVotePower()` (cross-check the resolution path).
- [ ] **Step 2** Resolve the same four names from `getAllContracts()` on **Flare mainnet**
  (`https://flare-api.flare.network/ext/C/rpc`) for the read lens; print the addresses.
- [ ] **Step 3** Coston2 account reads (viem, the M8/M10 signer
  `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9`): `GovernanceVotePower.getVotes(account)`
  (current governance VP), `getDelegateOfAtNow(account)` (expect the zero address —
  blank slate), and eligibility `PollingFtso.canPropose(account)` / `isMember(account)`
  + `PollingFoundation`-side `isProposer(account)` (expect all false). Note native C2FLR
  funding (expect ~146).
- [ ] **Step 4** Proposal discovery reality (mainnet, then Coston2): scan
  `PollingFoundation` `ProposalCreated` events over a **bounded recent window**
  (respect the RPC `eth_getLogs` cap — page in ≤ the max range, cap the total lookback)
  and call `PollingFtso.getLastProposal()`. For **any** proposal id found, read
  `state(id)`, `getProposalInfo(id)` (proposer, `votePowerBlock`, vote/exec windows,
  `thresholdConditionBIPS`, `majorityConditionBIPS`, `circulatingSupply`) and
  `getProposalVotes(id)` (for/against). **Record honestly whether any proposal was
  discoverable within limits** — if none, that is the honest-empty reality M12 renders.
- [ ] **Step 5** Write the probe JSON: block numbers (both networks), the resolved
  addresses (both networks), `GovernorReject`-absent, the account VP/delegate/eligibility
  reads, and the proposal-discovery result (the observed proposal(s) with full fields, or
  an explicit "none discoverable within N blocks" record).
- [ ] **Step 6** Checkpoint `chore: M12 read-only governance probe (both networks, discovery reality)`.

**Acceptance:** the four governance contracts resolve on both networks; `GovernorReject`
is absent; `GovernanceVotePower` matches `WNat.governanceVotePower()`; the account is
blank-slate (0 VP, no delegate, not eligible); the proposal-discovery result is recorded
honestly (observed proposal(s) **or** an explicit empty). No product code written.

---

## Task 2: `@flare-kit/contracts` — governance registry + ABIs + parity

**Files:** Create `packages/contracts/src/governance.ts`,
`packages/contracts/src/governance-abis.ts`; Modify `packages/contracts/src/index.ts`;
Modify `packages/contracts/test/manifest-parity.test.ts`; Create
`packages/contracts/test/governance.test.ts`.

**Interfaces — Produces:**
```ts
export interface GovernanceDeployment {
  readonly governanceVotePower: `0x${string}`
  readonly pollingFoundation: `0x${string}`
  readonly pollingFtso: `0x${string}`
  readonly pollingManagementGroup: `0x${string}`
  readonly chainId: number              // 114 coston2 (write/verify) | 14 flare (read lens)
  readonly governanceVerified: boolean  // starts false; only coston2 ever flips
}
export function governanceFor(network: 'coston2' | 'flare'): GovernanceDeployment
export const GOVERNANCE_VOTE_POWER_ABI: Abi  // delegate, undelegate, getVotes, votePowerOfAt, getDelegateOfAt, getDelegateOfAtNow
export const GOVERNOR_ABI: Abi               // PollingFoundation: state, getProposalInfo, getProposalVotes, hasVoted, getVotes(voter,block), isProposer, castVote
export const POLLING_FTSO_ABI: Abi           // getLastProposal, state, getProposalInfo, getProposalVotes, canPropose, canVote, isMember, getManagementGroupMembers
```

- [ ] **Step 1** Write `governance.test.ts`: `governanceFor('coston2')` returns the four
  snapshotted Coston2 addresses (from the Task-1 probe JSON), `chainId:114`,
  `governanceVerified:false`; `governanceFor('flare')` returns the mainnet addresses,
  `chainId:14`, `governanceVerified:false`; the ABIs expose `delegate`, `undelegate`,
  `getDelegateOfAtNow`, `getVotes`; `state`, `getProposalInfo`, `getProposalVotes`,
  `isProposer`; `getLastProposal`, `canPropose`, `isMember`.
- [ ] **Step 2** Run `pnpm --filter @flare-kit/contracts test` — expect FAIL (missing modules).
- [ ] **Step 3** Write the two files from the probe JSON; addresses **reused** via
  `registryFor(chainId)` where they already exist, else snapshotted as constants sourced
  from the probe. Export from `index.ts`. Extend `manifest-parity.test.ts` to assert the
  snapshotted governance addresses match a live `getAllContracts()` read **on both
  networks**, and that `GovernorReject` is absent.
- [ ] **Step 4** Run the tests — expect PASS. Then `pnpm --filter @flare-kit/contracts build`.
- [ ] **Step 5** Checkpoint `feat(contracts): M12 governance registry + ABIs + parity (both networks)`.

**Acceptance:** the addresses match the live registry on both networks (parity green);
`governanceVerified` starts `false`; no address literal exists outside the registry; the
ABIs are minimal hand-curated fragments of the vendored periphery interfaces;
`GovernorReject` is never referenced.

---

## Task 3: `@flare-kit/core` — `governance-adapter.ts` (VP + eligibility reads + call builders)

**Files:** Create `packages/core/src/governance-adapter.ts`; Modify
`packages/core/src/index.ts`; Test `packages/core/test/governance-adapter.test.ts`.

**Interfaces — Consumes:** `GovernanceDeployment`, the three ABIs (Task 2).
**Produces:**
```ts
export interface GovernanceVoteReads {
  votes: bigint                     // getVotes(account) — current governance VP (wei)
  delegate: `0x${string}`           // getDelegateOfAtNow(account) — zero address if none
}
export interface Eligibility { isProposer: boolean; canPropose: boolean; isMember: boolean }
export function readGovernanceVotes(
  client: PublicClient, d: GovernanceDeployment, account: `0x${string}`,
): Promise<GovernanceVoteReads | undefined>   // undefined if a read THROWS — never a fabricated zero
export function readEligibility(
  client: PublicClient, d: GovernanceDeployment, account: `0x${string}`,
): Promise<Eligibility | undefined>
export function buildDelegateCall(d: GovernanceDeployment, to: `0x${string}`):
  { address: `0x${string}`; abi: Abi; functionName: 'delegate'; args: readonly [`0x${string}`] }
export function buildUndelegateCall(d: GovernanceDeployment):
  { address: `0x${string}`; abi: Abi; functionName: 'undelegate'; args: readonly [] }
```

- [ ] **Step 1** Write `governance-adapter.test.ts` against a **stubbed `PublicClient`**:
  `readGovernanceVotes` maps `getVotes`→`votes` (bigint wei) and `getDelegateOfAtNow`→
  `delegate`, and returns **`undefined` when a read throws** (an unavailable read is
  `undefined`, never `0n`/zero-address); `readEligibility` maps the three boolean reads;
  `buildDelegateCall` targets `GovernanceVotePower` with `functionName:'delegate'`,
  `args:[to]`; `buildUndelegateCall` uses `'undelegate'`, `args:[]`.
- [ ] **Step 2** Run `pnpm --filter @flare-kit/core test governance-adapter` — expect FAIL.
- [ ] **Step 3** Implement `governance-adapter.ts` (< 300 lines): the viem `multicall`/
  `readContract` reads + the two pure call builders (no signing). Export from `index.ts`.
- [ ] **Step 4** Run — expect PASS.
- [ ] **Step 5** Checkpoint `feat(core): governance adapter — VP + eligibility reads + delegate/undelegate builders`.

**Acceptance:** reads return `undefined` on a failed read (never a fabricated zero or
zero-address); the call builders are pure (no signing); `delegate` is single-target
(`args:[to]`), never a bips/two-provider shape.

---

## Task 4: `@flare-kit/core` — `governance.ts` + `governance-states.ts` + portfolio flip

**Files:** Create `packages/core/src/governance.ts`,
`packages/core/src/governance-states.ts`; Modify `packages/core/src/portfolio.ts`,
`packages/core/src/index.ts`; Test `packages/core/test/governance.test.ts`,
`packages/core/test/governance-states.test.ts`, `packages/core/test/portfolio.test.ts`
(extend).

**Interfaces — Consumes:** `GovernanceVoteReads` (Task 3); `GovernanceDeployment`
(Task 2); the canonical operation states + `reconcileTo`/`waitSince`/`advance` from
`states.ts`/`reconcile.ts`. **Produces:**
```ts
export type GovernanceOpKind = 'delegate' | 'undelegate'
export interface GovernanceIntent { kind: GovernanceOpKind; to?: `0x${string}` }  // `to` required for delegate
export type GovernanceInvariantError =
  | { code: 'unverified' }
  | { code: 'invalid_target' }     // missing/zero/malformed `to` for a delegate
  | { code: 'self_delegation' }    // to === account
  | { code: 'no_delegate' }        // undelegate with no current delegate
export function planGovernance(args: {
  intent: GovernanceIntent; deployment: GovernanceDeployment;
  reads: GovernanceVoteReads; account: `0x${string}`
}): { ok: true; plan: GovernancePlan } | { ok: false; error: GovernanceInvariantError }
export type GovernancePositionView =
  | { status: 'observed'; votes: bigint; delegate: `0x${string}` }
  | { status: 'unavailable' }
export function governancePosition(reads: GovernanceVoteReads | undefined): GovernancePositionView
export function reconcileGovernance(op: GovernanceOperation, reads: { delegate: `0x${string}` }): GovernanceOperation
```

- [ ] **Step 1** Write the tests:
  - `governance.test.ts`: `planGovernance` returns `{ok:false, error:{code:'unverified'}}`
    when `deployment.governanceVerified` is false; with `governanceVerified:true`, a
    `delegate` with a missing/zero `to` → `invalid_target`; `to === account` →
    `self_delegation`; a valid `delegate` → `{ok:true, plan}`; an `undelegate` with
    `reads.delegate === zeroAddress` → `no_delegate`, and with a real current delegate →
    `{ok:true, plan}`.
  - `governance-states.test.ts`: a submitted delegate is in-flight/`awaiting_external`,
    **never** `succeeded`; `succeeded` is entered **only** when `reads.delegate` equals
    the intent target (delegate) or the zero address (undelegate); assert the ids come
    from `states.ts` (no new state id) and the walk uses `reconcileTo` (no
    `applyTransition` jump).
  - `portfolio.test.ts` (extend): with `governanceVerified:false`, the governance
    position stays in `UNBUILT_POSITION_TYPES`; with a present read, `governancePosition`
    → `observed` (even zero votes / no delegate is observed-empty); with `undefined`,
    → `unavailable`.
- [ ] **Step 2** Run `pnpm --filter @flare-kit/core test governance governance-states portfolio` — expect FAIL.
- [ ] **Step 3** Implement `governance.ts`, `governance-states.ts` (reuse `reconcileTo`;
  < 300 lines each); add a governance placeholder to `portfolio.ts`'s
  `UNBUILT_POSITION_TYPES` and a `governancePosition` `observed | unavailable` view
  **gated on `governanceVerified`** (keep it unbuilt until then). Export from `index.ts`.
- [ ] **Step 4** Run — expect PASS.
- [ ] **Step 5** Checkpoint `feat(core): governance ops (verified-gated) + delegate/undelegate lifecycle + portfolio flip`.

**Acceptance:** the plan gates on `governanceVerified` first; single-target invariants
hold; `succeeded` derives only from the `getDelegateOfAtNow` read; the governance
position is `observed | unavailable`, never a fabricated zero, and stays unbuilt until
`governanceVerified`.

---

## Task 5: `@flare-kit/core` — `proposals.ts` (mainnet-read discovery/state + carried castVote)

**Files:** Create `packages/core/src/proposals.ts`; Modify `packages/core/src/index.ts`;
Test `packages/core/test/proposals.test.ts`.

**Interfaces — Consumes:** `GovernanceDeployment` + `GOVERNOR_ABI`/`POLLING_FTSO_ABI`
(Task 2); `Eligibility` (Task 3). **Produces:**
```ts
export type ProposalState =
  | 'pending' | 'active' | 'defeated' | 'succeeded'
  | 'queued' | 'expired' | 'executed' | 'canceled' | 'unknown'
export interface ProposalSummary {
  id: bigint; state: ProposalState; proposer: `0x${string}`;
  votePowerBlock: bigint; voteStart: bigint; voteEnd: bigint
}
export interface ProposalDetailView extends ProposalSummary {
  for: bigint; against: bigint; thresholdBIPS: number; majorityBIPS: number;
  circulatingSupply: bigint; hasVoted: boolean; accountVotes: bigint
}
export function discoverProposals(
  client: PublicClient, d: GovernanceDeployment, lookbackBlocks: bigint, maxRange: bigint,
): Promise<ProposalSummary[]>   // bounded event scan + getLastProposal; [] = honest-empty
export function readProposalDetail(
  client: PublicClient, d: GovernanceDeployment, id: bigint, account: `0x${string}`,
): Promise<ProposalDetailView | { id: bigint; state: 'unknown' }>
// castVote is BUILT but CARRIED — it never returns an executable plan on Coston2:
export function planCastVote(args: { proposal: ProposalSummary; reads: GovernanceVoteReads }):
  { ok: false; error: { code: 'carried'; reason: string } }
```

- [ ] **Step 1** Write `proposals.test.ts` against a **stubbed `PublicClient`**:
  - `discoverProposals` pages `getContractEvents` in windows ≤ `maxRange`, stops at
    `lookbackBlocks`, maps each `ProposalCreated` + `state(id)` to a `ProposalSummary`,
    and returns **`[]` (honest-empty)** when the stub yields no events (assert it does
    **not** invent a proposal).
  - the state mapper turns the on-chain enum index into the `ProposalState` union, and an
    out-of-range/failed `state` read → `'unknown'` (never a fabricated state).
  - `readProposalDetail` maps `getProposalInfo` + `getProposalVotes` + `hasVoted` +
    `getVotes(account, votePowerBlock)` to `ProposalDetailView`; a failed read →
    `{id, state:'unknown'}`.
  - `planCastVote` **always** returns `{ok:false, error:{code:'carried'}}` (the vote path
    is built + gated but never executable on Coston2) — assert no branch returns `ok:true`.
- [ ] **Step 2** Run `pnpm --filter @flare-kit/core test proposals` — expect FAIL.
- [ ] **Step 3** Implement `proposals.ts` (< 300 lines — if the ABI-field mapping pushes
  the limit, extract a small pure `proposal-mapping` helper, declared in the manifest):
  the bounded event scan (respect `maxRange`, the `gasless-adapter.ts` paging precedent),
  the state mapper, the detail reader, and the carried `planCastVote`. Export from `index.ts`.
- [ ] **Step 4** Run — expect PASS.
- [ ] **Step 5** Checkpoint `feat(core): proposals — mainnet-read discovery/state + carried castVote (honest-empty)`.

**Acceptance:** discovery is bounded and returns honest-empty (never a fabricated
proposal); unreadable state/fields → `unknown`; `planCastVote` is never executable
(carried); no live cast is ever produced.

---

## Task 6: LIVE — keyless reads (always) + gated delegate/undelegate round trip

**Files:** Create `packages/core/scripts/live-governance.mjs`; produce
`.thoughts/verification/2026-08-13-m12-governance.md` +
`coston2-live-governance.json` (or the read-only JSON if the round trip carries).

> **GATE:** the delegate/undelegate broadcast needs **Abu's go** (cheap, reversible,
> **no funding floor**). The keyless reads run **always**; the broadcast runs **only**
> on the gate.

- [ ] **Step 1** **read pass (keyless, always):** run the Task-3 reads live on Coston2
  (governance VP, current delegate, eligibility) and the Task-5 mainnet proposal
  discovery/detail; print + record them (the honest-empty proposal reality if that is
  what Task 1 found). Confirm the Task-4 plan gates + invariants against the live reads.
- [ ] **Step 2 (gated on Abu's go)** **broadcast pass:** with the signer's local
  `Account` from `.secrets/live-run.json` (never logged), send `delegate(to)` on Coston2
  to a chosen target address (a secondary controlled/dev address, recorded in evidence);
  poll `getDelegateOfAtNow(account)` until it equals the target; record the tx hash +
  explorer link + the read-back.
- [ ] **Step 3 (broadcast only)** **flip verification** — set `governanceVerified:true`
  for **Coston2** in `governance.ts`; rerun `pnpm --filter @flare-kit/contracts test`
  (parity + flag) and the core tests.
- [ ] **Step 4 (broadcast only)** **restore:** send `undelegate()`; poll
  `getDelegateOfAtNow(account)` until it equals the zero address; record the tx hash +
  the read-back (the round trip is closed and reversible — no residual delegation).
- [ ] **Step 5 (no-go path)** If the gate is not met: record the reads + the built path
  in the evidence MD, keep `governanceVerified:false`, keep the governance placeholder
  unbuilt, and note the carry — **no fabrication of a delegation**.
- [ ] **Step 6** Checkpoint `feat(core): M12 live governance — keyless reads + gated delegate/undelegate (or carried)`.

**Acceptance (AC1/AC2/AC3):** the keyless reads land live and render honest
empty/observed/unavailable states; the proposal discovery result is recorded honestly;
**if Abu gives the go**, a real `delegate` lands, `getDelegateOfAtNow` reads back the
target, `governanceVerified` flips `true`, and `undelegate` restores the zero address;
**if not**, the write carries declared-unbuilt with nothing faked. Keys never logged.

---

## Task 7: `@flare-kit/core` — `mock-governance.ts` (after the real run)

**Files:** Create `packages/core/src/mock-governance.ts`; Modify
`packages/core/src/index.ts`; Test `packages/core/test/mock-governance.test.ts`.

- [ ] **Step 1** Write `mock-governance.test.ts`: the mock drives the **real**
  `governance-adapter` + `planGovernance` + `reconcileTo` against a labelled fake
  `PublicClient`, reproducing exactly what Task 6 observed (the reads always; the
  delegate/undelegate round trip **only if** the broadcast landed) and **refuses the
  unobserved** — if no broadcast landed, the mock exposes no `succeeded` delegation
  (returns the reads + a declared-unbuilt affordance, never an invented delegate); it
  fabricates no proposal beyond what discovery observed; a non-coston2 mock never flips
  `governanceVerified`.
- [ ] **Step 2** Run `pnpm --filter @flare-kit/core test mock-governance` — expect FAIL.
- [ ] **Step 3** Implement `mock-governance.ts` from the Task-6 evidence; export from
  `index.ts`. No live path constructs the mock.
- [ ] **Step 4** Run — expect PASS.
- [ ] **Step 5** Checkpoint `feat(core): governance mock — copies observed, refuses unobserved`.

**Acceptance:** the mock mirrors the live evidence; it fabricates no delegation or
proposal the live run did not observe; mock mode is explicit, never a failure fallback.

---

## Task 8: `@flare-kit/react` — `use-governance.ts` + `use-proposals.ts`

**Files:** Create `packages/react/src/use-governance.ts`,
`packages/react/src/use-proposals.ts`; Modify `packages/react/src/index.ts`; Test
`packages/react/test/use-governance.test.tsx`, `packages/react/test/use-proposals.test.tsx`.

**Interfaces — Consumes:** the core governance op + call builders (Task 3/4); the
proposals reads (Task 5); the durable-poll hook. **Produces:**
```ts
export function useGovernance(args: {
  deployment: GovernanceDeployment; account: `0x${string}`;
  publicClient: PublicClient; walletClient?: WalletClient
}): { reads; position; plan; delegate(to): void; undelegate(): void; operation }
export function useProposals(args: {
  readDeployment: GovernanceDeployment;   // the `flare` (mainnet) deployment
  publicClient: PublicClient;             // a mainnet client
  account: `0x${string}`
}): { proposals; detailOf(id): ProposalDetailView | undefined; loading }
```

- [ ] **Step 1** Write the hook tests: `useGovernance` read/plan paths need **no**
  `walletClient` (keyless reads + `planGovernance`); `delegate`/`undelegate` require the
  injected `walletClient`; the hook polls `getDelegateOfAtNow` and advances the lifecycle;
  `succeeded` appears only when the read-back matches. `useProposals` reads the mainnet
  catalogue + a detail, and renders **honest-empty** when discovery returns `[]` (never a
  fabricated row).
- [ ] **Step 2** Run `pnpm --filter @flare-kit/react test use-governance use-proposals` — expect FAIL.
- [ ] **Step 3** Implement both hooks (thin durable-poll wrappers); export from
  `index.ts`. Run `pnpm --filter @flare-kit/react build`.
- [ ] **Step 4** Run — expect PASS.
- [ ] **Step 5** Checkpoint `feat(react): use-governance + use-proposals hooks (keyless reads, injected wallet)`.

**Acceptance:** reads/plan are keyless; writes use the injected `walletClient`;
`useProposals` renders honest-empty on `[]`; the governance hook drives the
delegate/undelegate lifecycle with `succeeded` only from the read-back.

---

## Task 9: `@flare-kit/react-ui` — `GovernanceCard`

**Files:** Create `packages/react-ui/src/GovernanceCard.tsx`, `governance-card-state.ts`,
`packages/react-ui/src/governance.css`; Modify `packages/react-ui/src/index.ts`,
`packages/react-ui/src/styles.css` (`@import`); Test
`packages/react-ui/test/GovernanceCard.test.tsx`.

**Interfaces — Consumes:** `useGovernance` (Task 8, from dist); the shared
`OperationTimeline`, `card-chrome`, `Panel`, `Details`/`DetailRow`, and the
`DelegationCard` composer pattern.

- [ ] **Step 1** Write `GovernanceCard.test.tsx`: the VP panel renders the account's
  governance vote power + current delegate in the **mono face** with full precision; the
  composer takes a **single** target address (assert there is no bips/second-provider
  field — governance VP is all-or-nothing) and offers undelegate when a delegate exists;
  the eligibility panel renders `isProposer`/`canPropose`/`isMember` honestly (the
  account's own lack of eligibility, submit affordance declared-unbuilt); the timeline
  renders the delegate/undelegate spine; `succeeded` shows only from the read-back; an
  `unavailable` VP read renders "—", never `0`.
- [ ] **Step 2** Run `pnpm --filter @flare-kit/react-ui test GovernanceCard` — expect FAIL.
- [ ] **Step 3** Implement `GovernanceCard.tsx` + `governance-card-state.ts` (< 300 lines
  each) + `governance.css` (`fk-gov` classes, values from tokens — no literals); reuse the
  shared chrome (no inline card/badge/pill). `@import` the css; export from `index.ts`.
- [ ] **Step 4** Run — expect PASS.
- [ ] **Step 5** Checkpoint `feat(react-ui): GovernanceCard — VP + single-target delegate composer + eligibility`.

**Acceptance:** VP + delegate render mono + full precision; the composer is single-target
(no bips); eligibility renders honestly; `succeeded` only from the read-back; unavailable
→ "—"; shared chrome reused.

---

## Task 10: `@flare-kit/react-ui` — `ProposalCatalogue` + `ProposalDetail`

**Files:** Create `packages/react-ui/src/ProposalCatalogue.tsx`,
`packages/react-ui/src/ProposalDetail.tsx`; Modify `packages/react-ui/src/index.ts`,
`packages/react-ui/src/governance.css` (extend); Test
`packages/react-ui/test/ProposalCatalogue.test.tsx`,
`packages/react-ui/test/ProposalDetail.test.tsx`.

**Interfaces — Consumes:** `useProposals` (Task 8, from dist); the shared
`FeedCatalogue`/`AttestationCatalogue` row + `Details`/`DetailRow` chrome.

- [ ] **Step 1** Write the tests: `ProposalCatalogue` renders each discovered proposal's
  id + state with a **cross-network "Flare mainnet" label**, and renders an **honest-empty**
  ("no active proposals on this network") when `proposals` is `[]` — never a fabricated
  row. `ProposalDetail` renders the full state machine, for/against tallies, quorum +
  majority BIPS, `votePowerBlock`, `circulatingSupply` and the account's `getVotes` at
  that block in the **mono face**; the `castVote` affordance is present but **carried**
  (assert it renders a declared-unbuilt/awaiting state, never a "voted"/success state);
  an `unknown` proposal renders "—"/unknown, never a fabricated tally.
- [ ] **Step 2** Run `pnpm --filter @flare-kit/react-ui test ProposalCatalogue ProposalDetail` — expect FAIL.
- [ ] **Step 3** Implement both (< 300 lines each), reusing the catalogue + detail chrome
  (no inline card); extend `governance.css`. Export from `index.ts`.
- [ ] **Step 4** Run — expect PASS.
- [ ] **Step 5** Checkpoint `feat(react-ui): ProposalCatalogue + ProposalDetail — mainnet-read, carried vote`.

**Acceptance:** proposals are labelled cross-network; honest-empty on `[]`; the detail
renders the full state/tallies/BIPS/block mono + full precision; `castVote` is carried,
never a faked success; `unknown` → "—".

---

## Task 11: `@flare-kit/react-ui` — gallery state matrix (both themes)

**Files:** Create `packages/react-ui/gallery/m12-governance-sections.tsx`; Modify the
gallery index.

- [ ] **Step 1** Drive `GovernanceCard`, `ProposalCatalogue` and `ProposalDetail` through
  every state the live run **observed**: the VP/delegate/eligibility reads (blank-slate
  observed-empty), the single-target composer, the in-flight delegate spine, the
  `succeeded` delegate/undelegate states **only if** the round trip landed (else the
  declared-unbuilt affordance), the proposal catalogue (real mainnet proposal(s) if
  discovery found any, else honest-empty), the proposal detail with the **carried**
  castVote affordance, and the portfolio governance position (`observed` if verified, else
  honestly still-unbuilt). **Do not fabricate a `succeeded` delegation or an `Active`
  Coston2 proposal or a cast** (state-reachable-from-props rule).
- [ ] **Step 2** Drive both themes; run the a11y audit; capture screenshots to
  `.thoughts/verification/m12-screens/`.
- [ ] **Step 3** Checkpoint `test(react-ui): M12 gallery state matrix, both themes`.

**Acceptance:** every observed state renders in both themes; zero new `fk-gov` a11y
issues; no state is shown that the live run did not observe.

---

## Task 12: Full gate + browser verify + evidence + review gate + state.json bump

**Files:** Modify `.thoughts/state.json` (via a load/mutate/dump script); finalize
`.thoughts/verification/2026-08-13-m12-governance.md`.

- [ ] **Step 1** Run the full gate from the repo root: `pnpm build && pnpm typecheck &&
  pnpm lint && pnpm test`. Fix anything red. Confirm `publint` is clean and **no new
  dependency** entered any shipped surface.
- [ ] **Step 2** Browser-verify the gallery (both themes) and confirm the AC6 screens exist.
- [ ] **Step 3** **Review gate:** dispatch correctness, honest-rendering/silent-failure,
  and simplification review subagents over the M12 diff; fix every critical/important
  finding and re-test. (Honest-rendering must confirm: `succeeded` only from the
  `getDelegateOfAtNow` read; unavailable ≠ 0; castVote/propose/execute carried, never
  faked; proposals honest-empty/unknown, never fabricated; mainnet reads labelled
  cross-network; governance VP single-target, never conflated with
  `IClaimSetupManager.delegateGovernance`.)
- [ ] **Step 4** Finalize the evidence MD (date, both networks, addresses, the
  proposal-discovery reality, tx hashes/explorer links if the round trip landed; the
  carried legs if not).
- [ ] **Step 5** Bump `state.json` via a script: `milestone`/`next_authorized_action` →
  **M12 complete** (with the honest go/carried outcome recorded); **carry** the castVote /
  propose / execute legs (and the standing M11 stake broadcast + P→C return + staking
  reward, M10 FTSO-reward, M7 Firelight, M8 MINT carries); `current_spec` →
  the M12 spec; next = the next family in the governing decision
  (**XRPL-controlled Smart Accounts**). Record any new protocol gotcha (e.g. the
  proposal-discovery `eth_getLogs` bound, governance-VP all-or-nothing semantics).
- [ ] **Step 6** Checkpoint `chore: M12 governance complete — gate green, evidence, state bump`.

**Acceptance (AC5/AC6/AC7):** the full gate exits 0; no new dependency in the shipped
surface; the gallery is browser-verified both themes; the review gate is applied and
criticals fixed; `state.json` records the honest outcome (go → `governanceVerified:true`
+ closed round trip; no-go → carried declared-unbuilt) and points to the next family.

---

## Self-review (against the spec)

- **Coverage:** M12-R1→T2; R2→T3/T5; R3→T4; R4→T4; R5→T5; R6→T5/T10 (castVote built +
  carried); R7→T7; R8→T9/T10; R9→T8; R10→T4; R11→T4/T5/T6/T7/T9/T10. AC1→T1/T6;
  AC2→T4/T6; AC3→T6; AC4→T5/T10; AC5→T2/T3/T12; AC6→T9/T10/T11; AC7→T12. No spec section
  without a task.
- **Placeholders:** none — every task carries concrete files, interface signatures, and
  test assertions.
- **Type consistency:** `GovernanceDeployment`, `GovernanceVoteReads`, `Eligibility`,
  `GovernanceIntent`/`GovernanceOpKind`, `GovernanceInvariantError`,
  `GovernancePositionView`, `ProposalState`/`ProposalSummary`/`ProposalDetailView`,
  `discoverProposals`/`readProposalDetail`/`planCastVote` are used with the same
  names/signatures across Tasks 2–11. The write is single-target `delegate(to)`
  everywhere (never a bips shape), and `governanceVerified` is the one write gate
  throughout.
