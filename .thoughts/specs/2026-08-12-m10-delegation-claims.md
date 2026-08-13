# Spec: flare-kit milestone 10 — delegation & claims (WNat wrap + FTSO vote-power delegation + reward/rNat/FlareDrop claims), real-first (DelegationCard + ClaimCard)

> Governed by `.thoughts/decisions/2026-08-04-build-everything-real-first.md`.
> The governing decision's family row after "Gasless, relayers, payments"
> (closed at M9) is **"Governance, delegation, staking, rewards."** That family
> is six surfaces across two substrates; decided with Abu on 2026-08-12 to
> **split it** the way "Swaps, liquidity, vaults" already became M5/M6/M7:
> - **M10 (this spec) — Delegation & claims.** All C-chain EVM, on the viem
>   substrate the kit already runs on, cleanly live-verifiable: WNat
>   wrap/unwrap, FTSO vote-power delegation (the live-verified centrepiece),
>   and the three distinct claim flows (FTSO delegation reward, rNat, FlareDrop).
> - **M11 — Staking.** Its own milestone because staking is a **non-EVM P-chain
>   substrate** (C↔P export/import, `AddPermissionlessDelegator`, the
>   `PChainStakeMirror`, `ValidatorRewardManager` staking rewards). Declared,
>   not dropped.
> - **M12 — Governance.** Proposal discovery/state/snapshot, vote with vote
>   power, `GovernanceVotePower` delegation, the mainnet-read proposal reality
>   and the archive/unknown honesty (R-GOV-002). Declared, not dropped.
>
> Requirements covered: R-DEL-001, R-REWARD-001, R-REWARD-002 (delegation-reward
> half), R-LEGACY-001 from `.thoughts/specs/2026-08-03-flare-application-layer.md`
> §14. R-STAKE-* and R-GOV-* are carried to M11/M12.
>
> Load-bearing grounding (this session, 2026-08-12):
> - **Every M10 primitive resolves and answers on Coston2** —
>   `FlareContractRegistry.getAllContracts()` (registry
>   `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`) returns `WNat`
>   `0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273`, `RewardManager`
>   `0xB4f43E342c5c77e6fe060c0481Fe313Ff2503454` (v2), `FtsoRewardManager`
>   `0x7A0bFB85387314d7F8C0FcCD9D9B74A76115c322` (legacy), `RNat`
>   `0x221D27529e7788B929E13533edc3b00ec1ac5e8A`, `DistributionToDelegators`
>   `0xbd33bDFf04C357F7FC019E72D0504C24CF4Aa010`, `ClaimSetupManager`
>   `0x5Ddb590530EF66775E6225671eaBD94959e9AE0e`.
> - **The signing account is a blank slate.** `0xA4b05cdB…31Bd9` holds
>   ~47.4 C2FLR native, **0 wrapped, no delegation, delegationMode NOTSET,
>   0 vote power, no claimable/unclaimed rewards** on either manager (current
>   reward epoch 5930). So delegation is a clean same-session round-trip, but a
>   real reward can only be **earned by delegating across ≥1 reward epoch first**
>   — the live claim is therefore a **delayed, self-reconciling** operation, the
>   same shape as the M7 Firelight delayed claim, not a same-session claim.
> - **The Coston2 FTSO-reward proof tuples come from an unofficial community
>   mirror**, not a Flare Foundation source. That provenance is carried as
>   registry data and labelled untrusted at every rendering; it is never dressed
>   as official.

## Objective

After this milestone a developer can install the kit and drop a working
**delegation** card and a **claims** card into their own React app, and:

- a person (or an agent with its own key) can **wrap** native C2FLR into WNat,
  **delegate FTSO vote power** to one or two providers (by percentage or by
  explicit amount), read their **current delegate state and vote power** back
  from the chain, then **undelegate** and **unwrap** — a full, reversible,
  live-verified round trip; and
- the same developer can discover and, where a real entitlement exists, **claim**
  three **distinct** kinds of reward — an **FTSO delegation reward** (Merkle
  proof, 25-epoch expiry), an **rNat** monthly project reward (locked balance,
  50% early-exit burn), and a legacy **FlareDrop** month (distribution concluded
  2026-01-30) — each rendered with its own reward-type, epoch/month, proof
  source, expiry rule, recipient, fee and penalty semantics, never collapsed
  into one generic "claim."

Delegation is the first capability whose success is a **relationship state read
back from the chain** (`delegatesOf`), not a value transfer. The FTSO reward
claim is the first whose plan depends on an **off-chain Merkle proof from an
explicitly untrusted source**. Both reuse the durable, self-reconciling
operation lifecycle M1 forced into being and the surface anatomy M5–M9
established, and both extend the project's spine rule — a submitted thing is
never a succeeded thing — to a **delegation read** (not the delegate tx) and a
**claim confirmation** (not the claim submission).

## The surfaces, and why they differ

Two cards, because two shapes of operation:

- **Delegation** is a **stateful, reversible relationship.** Wrapping mints
  WNat; delegating assigns vote power; both are read back from the chain as the
  source of truth. The account is locked into one delegation **mode**
  (percentage or explicit amount) once it delegates, and must fully undelegate
  before switching — an invariant the card must enforce, because `delegate` and
  `delegateExplicit` silently no-op against the wrong mode.

- **Claiming** is **three different one-shot entitlements** that R-REWARD-002
  forbids collapsing. An FTSO delegation reward is a **Merkle-proof claim** that
  **expires** after 25 reward epochs. A staking reward (M11) does **not** expire
  — so the two must never share a "rewards expire" statement. An rNat reward is
  **monthly, project-scoped, and penalised** on early exit (50% of locked
  burned). A FlareDrop is a **concluded legacy** entitlement. Each has a
  different discovery read, a different proof/source, and a different set of
  facts that must be visible before signing.

## The honesty it forces

The signature this project keeps re-learning, applied to M10:

- **A delegate transaction is not a delegation.** `succeeded` is entered **only**
  from reading `delegatesOf` / `votePowerOf` back on-chain — never from the
  submission receipt. A submitted-but-unconfirmed delegate renders in-flight.
- **You cannot claim a reward you have not earned.** The account earns nothing
  until it has delegated across ≥1 reward epoch, so the live FTSO-reward claim is
  a **delayed, self-reconciling** operation (delegate now → claim when the
  epoch's reward and proof land), exactly the M7 Firelight shape. `rewardsVerified`
  flips to `true` only on a **real** claim, not on the reads.
- **The proof source is labelled, not trusted.** The Coston2 FTSO-reward tuples
  come from an unofficial community mirror; that provenance is registry data
  (`proofSource.official: false`) surfaced at every rendering. Where an epoch's
  tuples are absent, the claim is **declared unavailable, not faked**.
- **Delegation-reward expiry and staking-reward non-expiry are distinct.** M10
  states the 25-epoch delegation-reward expiry; it never implies staking rewards
  expire (they don't — M11).
- **rNat early exit destroys value.** `withdrawAll` burning 50% of locked is
  surfaced as real value destruction before signing; the locked/unlocked split
  is never hidden.
- **FlareDrop is finished.** New distributions ended 2026-01-30; the surface is a
  legacy read-only archive with no "new drop" affordance. An empty state reads
  "distribution concluded," never "check back."
- **An empty entitlement is an honest empty, never a fabricated amount.** rNat
  with no assigned project and FlareDrop with nothing left render the reason —
  never a plausible zero or invented claimable value (the
  `mock-never-fills-unobserved` rule, applied to reads).
- **The mock copies only what the live run observed** and refuses the unobserved.

## Requirements

- **M10-R1 — `@flare-kit/contracts` gains the delegation and rewards registries.**
  `delegation.ts` (+ `delegation-abis.ts`) carries the WNat wrap/unwrap + IVPToken
  delegation fragments and reuses the existing `wrappedNative` (WNat) address
  snapshot; it carries a `delegationVerified` flag. `rewards.ts` (+
  `rewards-abis.ts`) carries the `RewardManager` (v2), `RNat` and
  `DistributionToDelegators` registries, a `rewardsVerified` flag, per-claim-kind
  metadata, and the FTSO-reward `proofSource` as registry data with an explicit
  `official: false` for Coston2 (so its untrusted provenance cannot drift into a
  hand-typed label). Addresses are **resolved offline** from
  `FlareContractRegistry.getAllContracts()` and **snapshotted**, then verified by
  a parity test — the `ftso/addresses.ts` pattern, not a live per-session
  resolve; no address literal exists outside the registries. Both `*Verified`
  flags start `false` and flip to `true` only after their confirmed live read,
  exactly as `bridgeVerified` / `gaslessVerified` did. Until then the surfaces
  show the configured path but a declared-unbuilt affordance, never a plan.

- **M10-R2 — `@flare-kit/core` delegation operation.** `delegation-adapter.ts`
  reads native + WNat balance, `delegatesOf`, `votePowerOf`, `delegationModeOf`,
  `undelegatedVotePowerOf`, and builds the wrap (`deposit`), unwrap (`withdraw`),
  `delegate`/`delegateExplicit`, `batchDelegate` and
  `undelegateAll`/`undelegateAllExplicit` calls. `delegation.ts` maps intents → a
  `delegationVerified`-gated plan → the lifecycle, and **enforces the invariants
  before signing**: ≤ 2 delegatees, Σ bips ≤ 10000, and **mode-exclusivity**
  (refuse a percentage↔explicit switch until fully undelegated — the silent-no-op
  trap). `succeeded` is entered only from the on-chain `delegatesOf` / balance
  read.

- **M10-R3 — the delegation lifecycle is durable and self-reconciling.**
  `delegation-states.ts` models the wrap and delegate as distinct signed spine
  steps over the **canonical** operation states (no new state id), reusing the
  shared `reconcile.ts` table-walk (`reconcileTo` / `waitSince` / `advance`) —
  never re-implementing it. A submitted wrap or delegate persists its evidence
  and reconciles against the chain when the app reopens; there is no Resume
  button. Undelegate and unwrap are the reverse lifecycle.

- **M10-R4 — three distinct claim flows, never collapsed (R-REWARD-002).**
  `rewards-adapter.ts` + `rewards.ts` + `rewards-states.ts` implement three claim
  **kinds** with distinct semantics — FTSO delegation reward, rNat, FlareDrop —
  each carrying reward-type, epoch/month, proof/source, expiry rule, recipient,
  fee and penalty. A generic "claim" state is forbidden. Every plan gates on
  `rewardsVerified`. The reconcilers reuse `reconcile.ts` and the canonical
  states; `succeeded` is entered only from an on-chain confirmation read (the
  `Claimed`/balance read), never from the submission.

- **M10-R5 — the FTSO reward claim is proof-carrying; its Coston2 source is
  labelled untrusted.** The claim reads the claimable epoch range on-chain
  (`getRewardEpochIdsWithClaimableRewards`, keeping only epochs where
  `FlareSystemsManager.rewardsHash(epoch) != bytes32(0)`), fetches that epoch's
  tuples from the configured source, extracts the Merkle proof + body
  (`{rewardEpochId, beneficiary, amount, claimType}`, ClaimType DIRECT/WNAT), and
  submits `RewardManager.claim(...)`. On Coston2 the tuples come from an
  **unofficial community mirror**, surfaced and registry-flagged as not-official;
  where an epoch's tuples are absent the claim is **declared unavailable, not
  faked**. Reward-epoch duration and the 25-epoch expiry are **derived on-chain**
  (`getRewardEpochIdToExpireNext`, `FlareSystemsManager`), never hardcoded from
  mainnet's 3.5-day figure. Because the account earns nothing until it has
  delegated across ≥1 epoch, the live claim is a **delayed self-reconciling**
  operation (M10-AC4).

- **M10-R6 — rNat honesty: locked/penalty, honest-empty.** `RNat` reads
  `getBalancesOf` → `(wNatBalance, rNatBalance, lockedBalance)`, `getCurrentMonth`
  and `claimRewards(projectIds, month)`; withdrawal is `withdraw(amount, wrap)`
  for unlocked and `withdrawAll(wrap)` which **burns 50% of any still-locked
  balance** — surfaced as real value destruction before signing. rNat is
  project/distributor-scoped, so where no project has assigned rewards to the
  account (the current reality) the surface renders an honest empty/locked state
  with the reason, never a fabricated claimable amount.

- **M10-R7 — FlareDrop is legacy, read-only (R-LEGACY-001).**
  `DistributionToDelegators` reads `getCurrentMonth`, `getClaimableMonths`,
  `getClaimableAmount(Of)`; `claim(rewardOwner, recipient, month, wrap)` runs only
  where a live unclaimed entitlement actually exists. The surface states new
  distributions **ended 2026-01-30** and renders a legacy archive — no "new drop"
  affordance; an empty state reads "distribution concluded."

- **M10-R8 — real-first; the mock copies observed behaviour.** `mock-delegation.ts`
  and `mock-rewards.ts` are derived from the live runs (M10 Verification): they
  reproduce what the real contracts did and refuse to render anything not
  observed. No live code path constructs a mock under any error.

- **M10-R9 — DelegationCard.** One card folding wrap/unwrap, delegate/undelegate,
  and the current delegate/vote-power state. Composer: amount to wrap/unwrap, one
  or two provider addresses with per-provider bips (percentage) or explicit
  amounts, the mode indicator, and the ≤2 / Σ≤10000 / mode-exclusivity rules
  rendered honestly (a disallowed mode switch is shown as "undelegate first," not
  a silent no-op). State panel: wrapped balance, delegatees + bips + mode, vote
  power — all in the mono face with full precision. Timeline: the wrap → delegate
  spine, `succeeded` only from the on-chain read.

- **M10-R10 — ClaimCard.** **One** shared claim component, parameterised by kind,
  rendering the three kinds **distinctly**: reward-type, epoch/month, proof/source
  (with the untrusted-source label for the Coston2 FTSO reward), expiry rule,
  recipient, fee, penalty (the rNat 50% burn), and the FlareDrop concluded
  notice. Reuses `LegTimeline` (discover → prove → claim), `Details`/`DetailRow`
  and the card chrome. Honest empty/legacy states where no entitlement exists.

- **M10-R11 — `@flare-kit/react` hooks.** `use-delegation.ts` drives the
  delegation lifecycle, polling the on-chain delegate/balance reads;
  `use-rewards.ts` drives the claim lifecycles, polling the claimable reads and
  the claim confirmation. Both are thin wrappers over the M8 `useBridge`
  durable-poll hook. Read/plan paths need no key; signing uses the caller's key
  (agent-usable, per the agent-facing-surfaces decision).

- **M10-R12 — network is configuration; the portfolio placeholder is flipped;
  reuse; files < 300 lines.** Addresses come from `@flare-kit/contracts` (M10-R1);
  testnet-first, mainnet-capable with no source rewrite. `packages/core/src/portfolio.ts`
  flips its `delegation` `UNBUILT_POSITION_TYPES` entry to a **real observed
  position** (wrapped balance + delegatees + vote power); the `stake` placeholder
  **stays declared-unbuilt** until M11. Reuse `SwapLeg`, `LegTimeline`,
  `OperationTimeline`, `card-chrome` and `Panel` — one shared component per
  pattern; never build a card/badge/pill inline. Split any module approaching 300
  lines before writing. Exact values render in the mono face with their asset and
  full precision.

## Out of scope (M10)

- **Staking (R-STAKE-001/002/003) → M11.** The P-chain substrate — C→P
  export/import, validator discovery, `AddPermissionlessDelegator`, the
  `PChainStakeMirror` reads, `ValidatorRewardManager` (non-expiring) staking-reward
  claim, and the durable C↔P lock/return journey — is its own milestone because
  it is **not a C-chain contract action** (needs the P-chain flow, a real
  validator NodeID, and an irreversible multi-week lock that cannot close
  in-window). Declared, not dropped. The `portfolio.ts` `stake` placeholder stays
  declared-unbuilt until then.
- **Governance (R-GOV-001/002/003) → M12.** Proposal discovery/type/state/snapshot,
  vote with vote power, `GovernanceVotePower` delegation,
  `PollingFoundation`/`PollingManagementGroup`, and the fact that meaningful
  proposals are **mainnet/Songbird only** (Coston2 has the governor contracts but
  no populated proposal cadence) — which forces the R-GOV-002 archive/unknown
  honesty and a mainnet-read for proposal content while Coston2 is the
  write/verify target. Its own milestone. Declared, not dropped.
- **A same-session live FTSO reward claim.** The account earns nothing until it
  has delegated across ≥1 reward epoch, so the live claim is a **delayed,
  self-reconciling** operation (M10-AC4), the M7 Firelight shape. M10 builds the
  claim path and live-verifies the reads; the actual claim flips `rewardsVerified`
  when a real reward + proof land. It is never faked as claimed same-session.
- **Fabricated rNat / FlareDrop entitlements.** Reads are live-verified; a claim
  runs only where a real entitlement exists. Where none does (the current
  account reality), the surface renders the honest empty/legacy state.
- **Mainnet delegation / rewards.** Testnet-first; mainnet addresses slot into the
  same registries with no source rewrite when a live run verifies them.

## Files (added to SPEC.md's `## Files` manifest before writing)

`@flare-kit/contracts`:
- `packages/contracts/src/delegation.ts` — WNat wrap/unwrap + IVPToken delegation
  registry (reuses `wrappedNative`), `delegationVerified`. M10-R1.
- `packages/contracts/src/delegation-abis.ts` — IWNat + IVPToken fragments. M10-R1.
- `packages/contracts/src/rewards.ts` — RewardManager v2 + RNat +
  DistributionToDelegators registry, `rewardsVerified`, per-kind metadata,
  `proofSource.official:false` for Coston2. M10-R1/R5.
- `packages/contracts/src/rewards-abis.ts` — RewardManager / RNat /
  DistributionToDelegators fragments. M10-R1.
- `packages/contracts/src/index.ts` — export the above.
- `packages/contracts/test/manifest-parity.test.ts` — extend to assert the
  snapshotted delegation/rewards addresses match `FlareContractRegistry`. M10-R1.

`@flare-kit/core`:
- `packages/core/src/delegation-adapter.ts` — balances, delegate/vote-power reads,
  wrap/unwrap/delegate/undelegate call builders. M10-R2.
- `packages/core/src/delegation-states.ts` — the durable lifecycle. M10-R3.
- `packages/core/src/delegation.ts` — intents → verified-gated plan → lifecycle;
  invariant enforcement. M10-R2.
- `packages/core/src/mock-delegation.ts` — copies observed, refuses unobserved. M10-R8.
- `packages/core/src/rewards-adapter.ts` — the three claim reads + call builders
  (incl. Merkle-proof assembly + `rewardsHash` gate). M10-R4/R5.
- `packages/core/src/rewards-states.ts` — the three claim lifecycles. M10-R4.
- `packages/core/src/rewards.ts` — intents → verified-gated plans → lifecycles. M10-R4.
- `packages/core/src/mock-rewards.ts` — copies observed, refuses unobserved. M10-R8.
- `packages/core/src/portfolio.ts` — flip the `delegation` placeholder to a real
  observed position; leave `stake` declared-unbuilt. M10-R12.
- `packages/core/src/index.ts` — export the above.
- `packages/core/scripts/live-delegation.mjs` — the live wrap/delegate/undelegate/
  unwrap + reads run (keys from env; never logged). M10 Verification.

`@flare-kit/react`:
- `packages/react/src/use-delegation.ts` — delegate/balance poll. M10-R11.
- `packages/react/src/use-rewards.ts` — claimable + confirmation poll. M10-R11.
- `packages/react/src/index.ts` — export the above.

`@flare-kit/react-ui`:
- `packages/react-ui/src/DelegationCard.tsx` (+ `delegation-card-state.ts`) — M10-R9.
- `packages/react-ui/src/ClaimCard.tsx` (+ `claim-card-state.ts`) — M10-R10.
- `packages/react-ui/src/delegation.css` — new `fk-delegation` / `fk-claim`
  classes, `@import`-ed into `styles.css`. M10-R9/R10.
- `packages/react-ui/gallery/m10-delegation-sections.tsx`,
  `packages/react-ui/gallery/m10-claims-sections.tsx` — drive every state. M10-AC6.
- `packages/react-ui/src/index.ts` — export the above.

## Acceptance criteria

- **M10-AC1 — wrap/unwrap, live on Coston2.** From the signer's native C2FLR, a
  small amount is wrapped into WNat and later unwrapped; both transactions are
  recorded and the WNat `balanceOf` moves accordingly (read back on-chain). The
  wrap is a first-class signed step, never smoothed away.

- **M10-AC2 — FTSO delegation, live and verified.** The signer delegates FTSO
  vote power to **one or two real Coston2 providers** (percentage mode, and the
  explicit-amount mode exercised at least in the gallery/live reads), with
  ≤2 delegatees and Σ bips ≤ 10000 enforced before signing; `delegatesOf` /
  `votePowerOf` are read back as the source of truth; `undelegateAll` is run live.
  Mode-exclusivity is honored (a percentage↔explicit switch is refused until fully
  undelegated). `delegationVerified` flips to `true`.

- **M10-AC3 — the delegation lifecycle traverses honestly.** The operation walks
  its wrap → delegate spine with `succeeded` entered **only** from the on-chain
  `delegatesOf` / balance read. A submitted-but-unconfirmed delegate renders
  in-flight, never `succeeded`; the submission receipt alone never advances it.

- **M10-AC4 — reward-claim path: reads live, claim self-reconciling, source
  labelled.** The claim reads run live on Coston2 — the claimable epoch range, the
  `rewardsHash` signed-epoch gate, `getStateOfRewards` — and are shown honestly
  (empty for the blank-slate account). The claim is wired as a **delayed,
  self-reconciling** operation (delegate now → claim when the epoch's reward +
  proof land, the M7 Firelight shape); `rewardsVerified` flips to `true` only on a
  **real** claim, not on the reads. The Coston2 FTSO-reward **proof source is
  rendered as an unofficial mirror** in every surface and in the registry;
  reward-epoch duration and the 25-epoch expiry are derived on-chain.

- **M10-AC5 — claims are distinct; empty is honest.** The three claim kinds render
  with distinct semantics (never a collapsed generic "claim"): the rNat surface
  shows the locked/unlocked split and the **50% early-exit burn** before signing
  and renders an honest empty state where no project reward exists; the FlareDrop
  surface renders the **concluded-2026-01-30** legacy archive with no "new drop"
  affordance. No fabricated claimable amount appears anywhere.

- **M10-AC6 — surfaces, browser-verified, both themes.** DelegationCard and
  ClaimCard are driven in a real browser through every required state via the
  gallery, in light and dark; exact values (WNat, bips, vote power, epoch, amount)
  render in the mono face with asset + full precision; the a11y audit reports zero
  new `fk-delegation`/`fk-claim` issues. The `portfolio.ts` `delegation`
  placeholder is flipped to a real observed position and shown. Screens recorded.

- **M10-AC7 — gate green; mock honest; reviewed.** `pnpm build && pnpm typecheck
  && pnpm lint && pnpm test` exits 0. `mock-delegation`/`mock-rewards` reproduce
  the live runs and refuse the unobserved; no live path constructs a mock.
  Review-gate subagents (correctness, honest-rendering/silent-failure,
  simplification) run over the M10 diff and every critical/important finding is
  fixed and tested.

## Verification

Real-first, on Coston2 (114), reusing the M8/M9 signer
`0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9`. **Signing needs Abu's go** (the
standard prior-milestone live-run gate); the reads are keyless.

1. **Resolve + snapshot addresses.** Resolve `WNat`, `RewardManager`, `RNat`,
   `DistributionToDelegators` (and their read deps `FlareSystemsManager`,
   `ClaimSetupManager`) offline from `FlareContractRegistry.getAllContracts()`;
   snapshot into `delegation.ts` / `rewards.ts`; assert against the registry in
   the parity test.
2. **Delegation (M10-AC1/AC2/AC3).** Wrap a small slice of C2FLR → WNat (record
   the tx + the WNat balance move); delegate to one or two real Coston2 FTSO
   providers (record `delegatesOf` / `votePowerOf`); read back as the source of
   `succeeded`; `undelegateAll`; unwrap. Capture the lifecycle traversal. Flip
   `delegationVerified`.
3. **FTSO reward reads + self-reconciling claim (M10-AC4).** With the delegation
   in place, read the claimable epoch range, the `rewardsHash` gate and
   `getStateOfRewards` (expect empty for the current epoch); verify the reads and
   the claim wiring live; **carry the actual claim** until a reward + its
   (unofficial-mirror) proof land in a later reward epoch — then
   `packages/core/scripts/live-delegation.mjs claim` claims it and flips
   `rewardsVerified:true` (the Firelight pattern).
4. **rNat + FlareDrop reads (M10-AC5).** Read `RNat.getBalancesOf` / current month
   and `DistributionToDelegators.getClaimableMonths` / claimable amount for the
   account (expect empty/legacy); confirm the honest empty and concluded states.
5. Write `mock-delegation.ts` / `mock-rewards.ts` from the observed runs. Run the
   full gate and the review gate.

Evidence recorded under `.thoughts/verification/2026-08-12-m10-delegation-claims.md`
(+ `coston2-live-delegation.json`, a read probe JSON, and `m10-screens/`), with
date, network, addresses, transaction hashes and explorer links.

## Sources

Grounding probes, this session (2026-08-12):
- Live Coston2 registry + account probe — `FlareContractRegistry.getAllContracts()`
  (registry `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`), the resolved addresses
  above, and the blank-slate account reads (0 WNat, NOTSET, 0 vote power, no
  claimable rewards, reward epoch 5930).
- Codebase pattern probe — the M8/M9 house shape (registry + `*Verified` → core
  adapter/ops/states/mock importing `reconcile.ts` → `useBridge`-wrapper hook →
  card + card-state + `fk-*` css); the `portfolio.ts` `delegation`/`stake`
  declared-unbuilt placeholders and the `wrappedNative` snapshot already in
  `addresses.ts`.

Flare protocol docs (repo `developer-hub/docs`, `sources/flare-foundation`):
- Delegation: `IVPToken` `delegate`/`delegateExplicit`/`batchDelegate`
  (Σ bips ≤ 10000)/`undelegateAll`, `delegatesOf` (mode NOTSET/PERCENTAGE/AMOUNT),
  `votePowerOf`; `IWNat` `deposit`/`withdraw`; the "one or two providers" cap
  (`docs/network/flare-tx-sdk/2-cookbook.mdx`), `docs/network/guides/wnat.mdx`,
  `docs/network/solidity-reference/IWNat.md`.
- FTSO rewards: `RewardManager` v2 claim + `RewardClaimWithProof`
  (ClaimType DIRECT/FEE/WNAT/MIRROR/CCHAIN), the `rewardsHash` signed-epoch gate,
  **25-epoch delegation-reward expiry vs non-expiring staking rewards**, the
  Coston2 tuples served by an **unofficial community mirror**
  (`docs/network/fsp/guides/claiming-rewards.mdx`,
  `docs/network/fsp/solidity-reference/IRewardManager.md`,
  `docs/network/solidity-reference/RewardsV2Interface.md`).
- rNat: `IRNat` `getBalancesOf`, `claimRewards`, `withdrawAll` **50% burn on
  locked** (`docs/network/solidity-reference/IRNat.md`).
- FlareDrop: `DistributionToDelegators` claim/discovery; distributions **ended
  2026-01-30** (`docs/network/_flaredrops.mdx`,
  `docs/network/guides/manage-flaredrops.mdx`).
- Deferred (M11/M12) grounding: staking is a P-chain flow, mainnet params only,
  Coston2 supports it via the stake tool/SDK; governance proposals are
  mainnet/Songbird only (`docs/network/guides/using-flare-stake-tool.mdx`,
  `docs/network/3-governance.mdx`).
