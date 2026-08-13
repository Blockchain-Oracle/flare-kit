# Spec: flare-kit milestone 4 — FTSO surfaces, and the debts cleared

Date: 2026-08-04
Milestone: M4 — FTSO (FTSO-01 … FTSO-06), plus every gap carried since M2
Scope authority: `.thoughts/decisions/2026-08-04-m3-scope-fdc-only.md` §1 moved
FTSO-01…06 to M4 intact. Abu, this session: nothing is left behind unless a
decision records why — no decision drops any carried gap, so M4 takes them all.
Status: **accepted 2026-08-04, not built.** Abu accepted the spec as written,
including the three carried debts — M4-R12, M4-R13 and M4-R14 stay in this
milestone rather than moving to a fifth. "M4 done" means all fourteen
requirements, not the eleven FTSO ones.

> **Milestone renumbering.** `.thoughts/decisions/2026-08-04-build-everything-real-first.md:79-80`
> lists M3 as "FDC and FTSO" and M4 as "Swaps, liquidity, vaults". The M3 scope
> decision split that pair, so FTSO is M4 and every later milestone in that table
> shifts by one. The ordering the decision doc owns is unchanged; only the
> numbering moved.

## Objective

After this milestone a developer can discover every feed the selected deployment
actually serves, read its current value at full precision, retrieve and verify a
scaling-feed proof for any round the data-availability host still retains, read
secure randomness under a policy that can refuse an insecure value, and quote,
submit and confirm a Fast Update incentive — with every number carrying its own
decimals, its own timestamp and its own provenance. The voting-round machinery
M3 built for FDC becomes protocol-generic rather than being copied, which is the
whole reason FTSO was deferred out of M3. And the three debts this project has
carried since M2 are closed rather than carried a fourth time.

## What the live probe established

Recorded here because it contradicts the vendored documentation in seven places
and the spec is built on the measured values, not the documented ones. Probed
2026-08-04 against Coston2 (114) and Flare (14) via `node` + `viem`, and against
both data-availability hosts over HTTP.

- **A custom feed id is `0x21` ++ ASCII name, right-zero-padded to 21 bytes** —
  the same encoding as any other feed, only the category byte differs.
  `developer-hub/docs/ftso/guides/create-custom-feed.mdx:75,147` says
  `0x21 + keccak256("BTC/USD-HIST")`. Every deployed feed contradicts it, and
  `FtsoFeedIdConverter.getFeedId(0x21, "sFLR/USD")` reproduces the registered
  mainnet id byte-identically. Treating the trailing 20 bytes as an address
  yields a hex string with no code at it.
- **Coston2 has zero custom feeds; Flare mainnet has exactly three.**
  `FtsoV2.getCustomFeeds()` returns `[]` on Coston2 and `sFLR/USD`, `stXRP/USD`,
  `stFLR/USD` on mainnet. `getSupportedFeedIds()` is 63 on Coston2 and 66 on
  Flare. This is a `Web2Json`-class network asymmetry, but worse: the feature's
  set is empty on the network we build against, not merely one member of it.
- **Registration is Flare Foundation governance.** `addCustomFeeds(address[])`
  is `nonpayable` and governance-gated, and the documented route is a "New Feed
  Request" issue the Foundation reviews. Deploying an `IICustomFeed` yields a
  contract the deployer can read directly; it does **not** yield a feed readable
  through `FtsoV2`. There is no path by which this project creates a custom feed
  on any network, so "deploy a demo feed" was never an available option.
- **`IICustomFeed` has three functions, not five.** The vendored artifact
  `sources/flare-foundation/flare-npm-periphery-package/coston2/artifacts/contracts/customFeeds/interfaces/IICustomFeed.sol/IICustomFeed.json`
  declares `calculateFee() view`, `feedId() view` and `getCurrentFeed() payable`.
  The guide documents `read()` and `decimals()`, which are not in the interface.
- **Every read method is `payable` and free *today*, and that is not a property
  of the surface.** `calculateFeeById(FLR/USD)` is `0` on both networks and
  `FeeCalculator.getCategoryFee(1)` is `0` — but `defaultFee()` is `1 wei`, the
  fee is governance-settable per category and per feed, and
  `FastUpdater.fetchAllCurrentFeeds()` **already costs 1 wei today** because
  index 52 holds an unused zero feed id whose category has no fee and falls
  through to the default. A kit that assumed zero would be broken on a live call
  right now. This is the FDC fee lesson arriving a second time, and it is the
  strongest argument for M4-R2.
- **`FtsoV2.verifyFeedData` reverts on a bad proof; it never returns `false`.**
  Live: a valid proof returns `true`; a value off by one, a shifted round, a
  truncated proof and an empty proof array all revert `merkle proof invalid`.
  `FdcVerification.verifyEVMTransaction(garbage)` on the same chain returns
  `false` **without reverting** — confirmed in the same session. The two
  protocols therefore cannot share a boolean verification abstraction: catching
  FTSO's revert and coercing it to `false` would render "we could not check
  this" as "this is not proven", which is an unknown shown as a negative fact.
- **Anchor and block-latency decimals differ for the same asset.** FLR/USD is
  **6** decimals on the anchor path (`FtsoFeedDecimals.getCurrentDecimals()`,
  and the DA response body) and **8** on the block-latency path
  (`FtsoV2.getFeedById`). BTC/USD is 2 on both. So the two readings are not
  comparable as integers, and a decimals value cached per feed is wrong by two
  orders of magnitude on the first feed anyone looks at.
- **`getFeedIds()` returns 64 entries, one of which is a hole.**
  `FastUpdatesConfiguration.getUnusedIndices()` is `[52]` on both networks, and
  index 52 carries a zero feed id whose decoded name is empty.
  `FtsoV2.getSupportedFeedIds()` returns the 63 real ones and additionally
  covers custom feeds on mainnet. Enumeration uses the latter; the former is a
  storage array with recycled slots, not a feed list.
- **A non-anchor feed id returns HTTP 200 with an empty array**, while a
  non-retained round returns HTTP 400 `{"error":"anchor feeds not found"}`. A
  client that checks only the status code sails straight through the first case
  and renders nothing, silently. `packages/core/src/fdc/client.ts` checks status
  only, which is correct for FDC and would be a silent failure here.
- **FTSO scaling is protocol id 100 on the same Relay as FDC's 200**, with the
  same round numbering and the same epoch parameters
  (`firstVotingRoundStartTs = 1658430000`, `votingEpochDurationSeconds = 90`).
  `Relay.isFinalized(100, r)` and `Relay.isFinalized(200, r)` are both live and
  independent. `packages/core/src/fdc/round.ts:112` hardcodes the FDC id.
- **Anchor-feed history stops at voting round 1130919** — 285,000 rounds, about
  **297 days** — established by a twelve-step bisection with both sides
  confirmed. **CORRECTED 2026-08-05 by the M4-R11 live run: this figure is
  wrong.** Round 1130919 retrieves a value today and the boundary is around
  818368, roughly twice the window. The bisection that produced it believed a
  single absence, and the host intermittently serves an empty 200 for a round it
  holds — see `.thoughts/verification/2026-08-05-live-ftso-flare-testnet-coston2.md`. Below it the DA returns 400. **The Relay's Merkle root outlives the
  data**: at round 1127919 the root is still set while the DA no longer serves
  the leaves. There is therefore a real state in which the chain asserts a
  commitment for a round whose value can no longer be retrieved, and it is not
  an error.
- **`RandomNumberV2` is the Relay** — one address, two registry names, on both
  networks. `getRandomNumberHistorical(round)` reaches back to round 864606,
  about **574 days**, far past the anchor-feed floor.
- **`isSecureRandom = false` genuinely occurs.** Sampling 401 rounds across the
  full retained range on Coston2 found four insecure rounds (872874, 882520,
  951420, 1167766) — roughly 1%, historical rather than current. A surface that
  hardcoded "secure" would eventually lie. The causing condition was not
  established and this spec does not guess at it.
- **A Fast Update incentive's effect is confirmable, and the confirmation is
  not fakeable.** On mainnet tx
  `0x440e884594f088813d2c2fdc49c2160e76ec9879d5d3e73b102b9b1d9a101cdb`
  (block 66637469), `getRange()` at the preceding block versus that block
  differs by exactly the `rangeIncrease` in the transaction's own
  `IncentiveOffered` event. Two caveats: the effect **decays** — mainnet's range
  is back to base hours later, so confirmation must read the offer's own block
  and not a later one — and `sampleSizeIncrease` was **0** in that real offer,
  so an incentive is not a purchase of both.
- **The incentive price is a function of the offer, not a constant.** Bisected
  live on Coston2: a `rangeIncrease` of `getRange()/100` is rejected at
  `366210937499999998` wei and accepted at `366210937499999999` — about
  **0.3662 C2FLR**. Identical minimum on mainnet.
  `getCurrentSampleSizeIncreasePrice()` is 1425 on both. The incentive market on
  Coston2 is dormant — the last `offerIncentive` was 2025-01-19 — so nothing is
  observable there until we make an offer ourselves.
- **`FtsoV2` is an ERC1967 proxy on both networks.** Its explorer ABI is seven
  entries. The usable ABI comes from the vendored interface artifact.
  `FtsoV2Interface` and `TestFtsoV2Interface` resolve to `0x0` in the registry —
  they are Solidity types, not deployments, and `TestFtsoV2Interface` differs
  only by declaring every method `view` instead of `payable`.
- **Four feeds have been renamed** and `FtsoV2.getFeedIdChanges()` is live and
  non-empty on Coston2: `MATIC/USD → POL/USD`, `FTM/USD → S/USD`,
  `DAI/USD → USDS/USD`, `TON/USD → GRAM/USD`.

## Corrections the build probe forced

Recorded during M4-P1 (contracts), 2026-08-04, against both live networks. The
requirements below stand; these change *how* three of them are satisfied. Each
was found by probing before encoding a constant, which is the only reason they
were found at all.

1. **`getCustomFeeds()` is not the custom feed list, and M4-R8 must not use it.**
   It is declared in **no** vendored interface artifact on either network, yet
   the deployment answers it. On mainnet it returns three entries of which one is
   `0x000000000000000000000000d1002f3820ad32145b` — category `0x00`, no decodable
   name, absent from `getSupportedFeedIds()`, and **reverting** on both
   `getFeedById` and `calculateFeeById`. It simultaneously *omits* `stFLR/USD`,
   which `getSupportedFeedIds()` does list. It is to custom feeds exactly what
   `getFeedIds()` is to feeds: a storage array with a hole. The honest custom set
   is `getSupportedFeedIds()` filtered on category `0x21`, which yields precisely
   the three the spec named. `custom-feeds.ts` never calls `getCustomFeeds`.
2. **Two fee oracles disagree, and M4-R2 must quote the binding one.** For the
   same 66 supported mainnet feeds `FtsoV2.calculateFeeByIds` answers `0` and
   `FeeCalculator.calculateFeeByIds` answers `3`. The cause is exact:
   `FeeCalculator.getCategoryFee(0x21)` **reverts** — the custom category has no
   configured fee — so those three feeds fall through to `defaultFee()`, 1 wei
   each. A live `simulateContract` settled which one binds: `FtsoV2.getFeedsById`
   for all 66 succeeds with `value = 0`. The rule is therefore **quote from the
   contract that guards the call you are about to make**, and the surface shows
   `FeeCalculator`'s number only as the explanation of why a fee is what it is.
   This is M3's two-oracle lesson — the verifier's OpenAPI against the on-chain
   fee configuration — arriving on a second protocol.
3. **The DA round parameter is load-bearing and unvalidated.** Only
   `voting_round_id` selects a round. `votingRoundId`, `round_id` and no
   parameter at all each return **HTTP 200 carrying the latest round**, not an
   error. A caller who misspells it receives today's price believing it is the
   historical one it requested. This is a third silent-failure mode on the same
   route, alongside the already-known empty-200. M4-R5 therefore checks the
   returned `votingRoundId` against the requested one rather than trusting the
   status code, and the parameter name is spelled once in `ftso/urls.ts`.

4. **`getFeedsById` silently resolves a renamed id, so a reading must be
   labelled by what came back rather than by what was asked for.** Confirmed
   live on Coston2: `getFeedsById([MATIC/USD, POL/USD])` returns `74335` for
   **both** — `FtsoV2` maps the retired id to the current feed before reading.
   A caller that labels each reading with the id it supplied therefore renders
   POL/USD's price under the name `MATIC/USD`. That is a value shown under a
   name it does not belong to, which CLAUDE.md forbids outright, and it is
   invisible in testing because the number is a real price. M4-R10's "one feed
   carrying a former name" is the *correct* rendering; `readFeeds` must consult
   `getFeedIdChanges` and resolve to the current feed, carrying the requested id
   as the former name.
5. **A payable read needs an account, not just a value.** `simulateContract`
   with a `value` and no `account` runs the `eth_call` as `from = 0x0`, and
   go-flare checks `balance >= value` — so the call fails with an
   insufficient-funds error rather than returning the feed, on any network where
   the fee is non-zero. This is why the earlier mainnet probe at `value = 3`
   reported "total cost exceeds balance". The zero-fee case on Coston2 hides it
   completely, so `ReadFeedsInput` takes an `account` and a non-zero fee without
   one is refused rather than attempted.

Two spec claims were also **confirmed** rather than corrected, and one was a
probe error rather than a finding: the feed-id codec is byte-identical to
`FtsoFeedIdConverter` for categories `0x01` and `0x21` on both networks; FLR/USD
really is 6 decimals on the anchor path and 8 on the block-latency path on both.
`calculateFeeById` does exist — on `FtsoV2`, not on `FeeCalculator`, whose
vendored interface declares only `calculateFeeByIds` and `calculateFeeByIndices`.

## Requirements

Traceability is to `.thoughts/specs/2026-08-03-flare-application-layer.md:503-520`.

- **M4-R1** (R-FTSO-001) — `@flare-kit/core` exposes typed block-latency feed
  reads through `FtsoV2.getFeedsById`. Every value carries **its own** decimals,
  timestamp and staleness; decimals are never cached per feed, never inferred,
  and never shared between the anchor and block-latency readings of one asset.
  Enumeration is `FtsoV2.getSupportedFeedIds()`. `getFeedIds()` is never the feed
  list, and the unused index it exposes never becomes a row.
- **M4-R2** (R-FTSO-001) — every feed read quotes its own fee through
  `calculateFeeById` / `calculateFeeByIds` and passes the result as `value`. Zero
  is a measured result, never an assumption. A read that would cost more than a
  caller-supplied ceiling refuses rather than spending.
- **M4-R3** (R-FTSO-003) — scaling-feed proofs are retrieved from the
  data-availability host and verified on chain through `FtsoV2.verifyFeedData`.
  The verification result is a **three-valued** type — proven, not proven,
  could-not-check — and a revert maps to could-not-check, never to not-proven.
  A direct block-latency read and a proven anchor value are never rendered as
  the same fact.
- **M4-R4** — the voting-round machinery becomes protocol-generic. Exactly one
  implementation of round derivation and finality exists in the repository, and
  `isRoundFinalized` takes the protocol id (FTSO 100, FDC 200). The shared part
  moves out of `fdc/`; the submission-shaped part stays. M3's FDC behaviour is
  unchanged from the caller's side.
- **M4-R5** (R-FTSO-002) — anchor-feed history is queried per voting round
  across a caller-supplied range, with the retention boundary discovered rather
  than assumed. **Committed-on-chain-but-no-longer-retrievable is a first-class
  state**, distinct from both a missing value and an error: the Relay root is
  present, the leaf is gone, and the surface says exactly that.
- **M4-R6** (R-FTSO-007) — secure randomness exposes value, timestamp and
  `isSecure`, current and historical. A `requireSecure` option on the read
  returns a typed refusal carrying the reason instead of the value when the
  random is insecure. No policy engine is built; the option is the policy
  surface this milestone owns.
- **M4-R7** (R-FTSO-006) — a Fast Update incentive is quoted for the **specific
  offer** the caller is about to make, submitted, and confirmed by comparing
  `getRange()` at the transaction's own block against the `rangeIncrease` in that
  transaction's own `IncentiveOffered` event. The limited duration is stated, the
  decay is stated, and a `sampleSizeIncrease` of zero is rendered as what it is.
  A late read that shows no effect is never rendered as a failed offer.
- **M4-R8** (R-FTSO-005) — custom feeds are read-only and their trust class is
  never presented as protocol-equivalent. The surface names the network it read.
  Coston2's empty set renders as an honest empty state with dated evidence, not
  as an error and not as an absence of the feature. Creation is declared
  **BLOCKED** with the governance evidence.
- **M4-R9** (R-FTSO-008) — every M4 value that reaches a surface travels as M2's
  `Observation<T>` and renders through the existing `SourceChip` / `SourceDrawer`.
  No new provenance rendering is written.
- **M4-R10** — feed ids are encoded and decoded offline, with a test asserting
  byte-identity against `FtsoFeedIdConverter` for both category `0x01` and
  category `0x21`. Renamed feeds are presented as one feed with a former name,
  never as two feeds.
- **M4-R11** — every FTSO capability is driven end to end on Coston2 against real
  voting rounds, including a real `offerIncentive` submission, and the run records
  date, network, addresses, round ids, transaction hashes and explorer links. The
  three mainnet custom feeds are read live and recorded as a separate, labelled
  mainnet observation.
- **M4-R12** — a WCAG 2.2 AA pass runs against **rendered** pixels across every
  surface in the package, M1's through M4's, reading computed styles rather than
  judging screenshots. Carried since M2 and closed here.
- **M4-R13** — `MintFXRP`, `RedeemFXRP` and `RecoveryPanel` get the
  state-by-state gallery audit that M2's and M3's surfaces received. They have
  had one browser look, taken before the design system settled. Carried since M2
  and closed here.
- **M4-R14** — the three FDC items the M3 audit declared unbuilt are **defined**
  and then either built or re-declared with the definition attached:
  FDC-04 `expired`, the `quota limited` states on FDC-02/03, and the
  source-aware asset for an `EVMTransaction` `value`. Each lacked a definition
  rather than effort; M4 supplies the definition.

## Out of scope

- **No wiring of feed values into the portfolio or the mint quote.** Abu, this
  session: standalone FTSO surfaces only, on the condition that the wiring
  happens in a later milestone. It is therefore **deferred, not dropped** —
  `PortfolioTable` keeps showing bare balances and M1's quote keeps showing only
  XRP and FXRP. The first milestone that consumes a price for a user-facing
  valuation owns it, and R-FTSO-008's "supplied to quotes" clause is carried
  forward explicitly rather than silently satisfied.
- **No chart primitive.** Abu chose a table. History renders as a dense mono
  table of exact points; a missing interval is an explicit row, never an
  interpolated line. No sparkline, no axes, no hover readout.
- **No policy engine.** M4-R6 is one option on one read. No policy objects, no
  policy configuration surface, no registry of rules for callers that do not yet
  exist.
- **No Solidity, no deployed contract, no governance request.** Confirmed
  impossible rather than merely undesirable: `addCustomFeeds` is governance-gated
  and the Foundation reviews a feed request off-chain. This extends
  `.thoughts/decisions/2026-08-04-no-first-party-proof-consumer.md` to FTSO
  unchanged.
- **No FTSO rewards, delegation or staking.** `RewardManager` is live and
  reachable, but claiming takes Merkle proofs from the reward distribution tree —
  a different off-chain source from the anchor-feed DA route, unprobed. It is a
  separate protocol surface and belongs to the governance/delegation/staking
  milestone with its own research pass.
- **No FTSOv1.** `FtsoManager`, `FtsoRegistry`, `PriceSubmitter` and
  `FtsoInflationConfigurations` still resolve in the registry. They are v1 and
  nothing here touches them.
- **No `getFeedByIdInWei`.** It returns `value × 10^18` with the decimals
  dropped, which destroys the asset-and-full-precision property DESIGN.md
  requires. The kit reads the decimals-bearing form and does its own scaling.
- **No indexer adapter.** Unchanged from
  `.thoughts/decisions/2026-08-04-m2-open-questions.md` §1: `indexer`,
  `provider` and `cache` remain declared with no configured producer.
- **No environment variables.** RPC URLs, chain ids, DA hosts and contract
  addresses are exported constants in `@flare-kit/contracts`. The only secret is
  the signing key for the M4-R11 incentive submission, and it is never committed,
  logged or printed.
- **No `apps/`, no docs site, no agent tools.** All later milestones by
  `.thoughts/decisions/2026-08-04-build-everything-real-first.md` §5.

## Files

New and changed paths only. Paths already admitted by `SPEC.md`'s globs
(`packages/*/src/index.ts`, `packages/*/test/**`,
`packages/react-ui/src/primitives/*.tsx`, `packages/react-ui/gallery/**`) are not
repeated. Files are split before writing, not after — CLAUDE.md caps production
source at 300 lines.

**`@flare-kit/contracts`**

- `packages/contracts/src/ftso/addresses.ts` — the FTSO members of
  `NetworkRegistry` for both networks: `ftsoV2`, `fastUpdater`,
  `fastUpdatesConfiguration`, `fastUpdateIncentiveManager`, `feeCalculator`,
  `ftsoFeedDecimals`, `ftsoFeedIdConverter`. `relay` and `flareSystemsManager`
  already exist and are reused. `randomNumberV2` is deliberately **not** a new
  field: it is the Relay, and a second field holding the same address would
  invite them to drift.
- `packages/contracts/src/ftso/abis.ts` — the FTSO ABIs, taken from the vendored
  interface artifacts and never from the proxy.
- `packages/contracts/src/ftso/feed-id.ts` — the `bytes21` codec and the feed
  category vocabulary.
- `packages/contracts/src/ftso/urls.ts` — the anchor-feed DA URL builder. Kept
  apart from `fdc/urls.ts`: different API version, different route, and the round
  travels in the query string rather than the body.
- `packages/contracts/src/ftso/protocol.ts` — `FTSO_PROTOCOL_ID = 100`, beside
  FDC's 200.

**`@flare-kit/core`**

- `packages/core/src/voting-round.ts` — **new**, M4-R4. The protocol-generic
  half of `fdc/round.ts`: `readVotingEpochs`, `votingRoundIdAt`, and
  `isRoundFinalized(reader, chainId, protocolId, round)`.
- `packages/core/src/fdc/round.ts` — **reduced**, M4-R4. Keeps
  `roundForSubmission` and `awaitRoundFinality`, which are submission-shaped and
  have no FTSO analogue; imports the shared half. The old copies are deleted, not
  left beside the generalisation.
- `packages/core/src/ftso/feeds.ts` — M4-R1, M4-R2. Block-latency reads, fee
  quotation, enumeration through `getSupportedFeedIds`, rename reconciliation.
- `packages/core/src/ftso/fee.ts` — M4-R2. Fee quotation and the spend ceiling,
  kept separate because it is the piece most likely to change under governance.
- `packages/core/src/ftso/anchor.ts` — M4-R3. The DA client for
  `anchor-feeds-with-proof`: batched request, query-string round, and the
  **empty-200** case checked explicitly by array length and per-feed presence.
- `packages/core/src/ftso/verify.ts` — M4-R3. `verifyFeedData` and the
  three-valued result. The revert string is captured and surfaced, never
  swallowed.
- `packages/core/src/ftso/history.ts` — M4-R5. Range queries, the discovered
  retention boundary, and the committed-but-unretrievable state.
- `packages/core/src/ftso/random.ts` — M4-R6. Current and historical reads, and
  the `requireSecure` refusal.
- `packages/core/src/ftso/incentive.ts` — M4-R7. Offer quotation, submission and
  the block-pinned effect confirmation.
- `packages/core/src/ftso/custom-feeds.ts` — M4-R8. `getCustomFeeds`, the
  per-feed `IICustomFeed` read, and the trust-class shape.
- `packages/core/src/ftso/catalogue.ts` — M4-R1. The catalogue model FTSO-01
  renders, including the unused-index hole and the rename set.
- `packages/core/src/mock-ftso.ts` — the mock, written **after** the live path
  and reproducing its observed behaviour.
- `packages/core/scripts/live-ftso-run.mjs` — M4-R11. `.mjs` under plain node:
  `tsx` is not installed anywhere in the workspace and `eslint.config.js` scopes
  the script globals to `packages/*/scripts/**/*.mjs`.

**`@flare-kit/react`**

- `packages/react/src/useFeeds.ts` — FTSO-01, FTSO-02 current values.
- `packages/react/src/useFeedHistory.ts` — FTSO-02.
- `packages/react/src/useAnchorProof.ts` — FTSO-03.
- `packages/react/src/useSecureRandom.ts` — FTSO-04.
- `packages/react/src/useIncentiveOffer.ts` — FTSO-05.
- `packages/react/src/useCustomFeeds.ts` — FTSO-06.

**`@flare-kit/react-ui`**

- `packages/react-ui/src/FeedCatalogue.tsx` — FTSO-01.
- `packages/react-ui/src/FeedDetail.tsx` — FTSO-02.
- `packages/react-ui/src/FeedHistoryTable.tsx` — FTSO-02's history, split out to
  stay under the cap and because the retention states carry real logic.
- `packages/react-ui/src/ScalingProofDetail.tsx` — FTSO-03.
- `packages/react-ui/src/SecureRandomPanel.tsx` — FTSO-04.
- `packages/react-ui/src/IncentiveComposer.tsx` — FTSO-05.
- `packages/react-ui/src/CustomFeedReview.tsx` — FTSO-06.
- `packages/react-ui/src/ftso.css` — beside `fdc.css`, `data.css` and
  `accounts.css`, where every other stylesheet lives.

**Changed by M4-R12 / R13 / R14**

- `packages/react-ui/test/accessibility.test.tsx` — extended to every surface.
  177 lines today; it will need splitting per surface family well before it
  carries twenty-one surfaces.
- `packages/react-ui/src/ProofDetail.tsx` — FDC-04 `expired`, per M4-R14.
  **Already 328 lines, over CLAUDE.md's cap**, so M4 splits it rather than
  adding to it: the proof body, the verification result and the consumption
  block are three separable regions. Splitting is part of M4-R14, not a
  follow-up.
- `packages/contracts/src/fdc/family-table.ts` — the source-aware asset, per
  M4-R14. **In `contracts`, not `core`** — verified against the tree; there is no
  `packages/core/src/fdc/family-table.ts`. `core`'s neighbouring file is
  `fdc/family.ts`, which is the type contract, not the table.
- `packages/core/src/fdc/client.ts` — the `quota limited` definition, per M4-R14.
  257 lines; the definition lands beside the existing status handling and must
  not push it over the cap.

**Already over the cap and untouched by M4**, recorded so the next milestone that
opens one of them splits it rather than discovering this again:
`packages/core/src/fdc/operation.ts` (327), `packages/core/src/fassets/direct-mint.ts`
(304), `packages/core/src/mock.ts` (exactly 300).
- `SPEC.md` `## Files` — every path above added to the repository-wide manifest
  the scope guard reads. The section ends at the next heading of any depth, so no
  `###` is introduced inside it.

## Integrations

| Surface | Classification | Note |
|---|---|---|
| `packages/core/src/ftso/feeds.ts` | REAL_MVP | `FtsoV2.getFeedsById` live on Coston2, 63 feeds |
| `packages/core/src/ftso/fee.ts` | REAL_MVP | `calculateFeeByIds`; measured `0`, read not assumed |
| `packages/core/src/ftso/anchor.ts` | REAL_MVP | live DA `POST /api/v0/ftso/anchor-feeds-with-proof` |
| `packages/core/src/ftso/verify.ts` | REAL_MVP | `FtsoV2.verifyFeedData` on chain, real revert captured |
| `packages/core/src/ftso/history.ts` | REAL_MVP | live DA, retention floor discovered at run time |
| `packages/core/src/ftso/random.ts` | REAL_MVP | `RandomNumberV2` (= Relay), current and historical |
| `packages/core/src/ftso/incentive.ts` | REAL_MVP | real `offerIncentive` on Coston2, ~0.37 C2FLR, signed |
| `packages/core/src/ftso/custom-feeds.ts` (mainnet) | REAL_MVP | Flare mainnet's three feeds, read live and labelled |
| `packages/core/src/ftso/custom-feeds.ts` (Coston2) | BLOCKED | empty set, dated 2026-08-04; not an error state |
| Custom feed **creation** | BLOCKED | `addCustomFeeds` governance-gated; Foundation review off-chain |
| FTSO rewards / delegation | REAL_LATER | live but proof-shaped from a different source; own milestone |
| Feed values in portfolio / quote | REAL_LATER | deferred by Abu this session, on the record, not dropped |
| `packages/core/src/mock-ftso.ts` | SIMULATED_DEMO_ONLY | explicit, labelled, never a failure fallback |

## Surfaces

| Screen | Required states | Data shown | Entry point |
|---|---|---|---|
| FTSO-01 `FeedCatalogue` | `BASE`, `AVAIL`, `SOURCE`; no feed; stale metadata; custom updater degraded; unused-index hole; renamed feed | feed id and symbol, category, class/trust, decimals, current value, timestamp/round, staleness, updater/provider, history and proof support, former name | capability index |
| FTSO-02 `FeedDetail` + `FeedHistoryTable` | `BASE`, `SOURCE`; missing range; partial history; **committed on chain, no longer retrievable**; stale; provider conflict; retention boundary reached | exact value with its own units and decimals, round/timestamp, source and security metadata, table points, retention boundary, missing intervals | catalogue row |
| FTSO-03 `ScalingProofDetail` | `BASE`, `SOURCE`; proof pending; proof unavailable; **proof could not be checked** (revert); verification succeeded; verification failed | feed and round, anchor and source, proof provider, proof hashes, verification result, observed and valid time, consumer context | feed detail |
| FTSO-04 `SecureRandomPanel` | `BASE`, `SOURCE`; `isSecure=false`; stale; policy accepted; policy rejected; historical round below floor | value, timestamp, `isSecure`, network and source, policy requirement, rejection reason | capability index |
| FTSO-05 `IncentiveComposer` | `BASE`, `AVAIL`, `PLAN`, `AUTH`, `OP`; not eligible; fee stale; effect expired; effect confirmed; `sampleSizeIncrease` zero | feed/effect, current update state, quoted fee for this exact offer, duration, payer, expected effect window, tx and finality, receipt, measured range delta | capability index |
| FTSO-06 `CustomFeedReview` | `BASE`, `AVAIL`, `AUTH`, `SOURCE`; invalid metadata; updater unavailable; activation pending; degraded/disabled; **empty set on this network**; creation blocked | feed id/name/decimals, updater authority, source/method, update frequency, **network read**, consumers, availability, trust class, activation effect, provenance | capability index |

Every surface inherits `BASE` per
`.thoughts/design/2026-08-03-product-surface-map.md:162`. Every state is reached
in the gallery, and states differ by more than colour.

### Recorded exceptions

The surface map at `:155-159` requires the design contract to record a state that
is structurally inapplicable rather than silently omit it. Two apply, both found
by the P7 audit and recorded here rather than in a code comment.

- **FTSO-01 `AVAIL` covers `supported`, `degraded`, `not_answered` and
  `not_read` only.** `planned` and `experimental` need a forward-looking registry
  to read them from and there is none — `getSupportedFeedIds()` answers what is
  served *now*, so a feed the deployment does not serve is absent from the list
  rather than listed as planned. `unavailable with dated upstream evidence` is
  likewise unreachable: the kit never observes a feed being withdrawn, only its
  absence. `deprecated with a migration note` **is** reachable and is rendered —
  a renamed feed carries its former name and the sentence that the old id now
  resolves here.
- **FTSO-02's `provider conflict` is declared UNBUILT.** The surface renders both
  read paths as two claims and reconciles neither, which is the requirement that
  matters. It does not *compute* a conflict, because the two readings are taken
  at different moments at different exponents from different paths, so any
  threshold separating "expected difference" from "disagreement" would be
  invented rather than measured — and an invented threshold on a price is exactly
  what CLAUDE.md forbids. A real cross-provider conflict needs a second provider
  for the same path, which this milestone does not have: `indexer` and `provider`
  remain declared with no configured producer per
  `.thoughts/decisions/2026-08-04-m2-open-questions.md` §1. The first milestone
  that configures a second producer owns this. The gallery case is named for what
  it shows — two paths differing widely — and no longer claims to be a conflict.

## Acceptance criteria

- **M4-AC1** — given a live Coston2 config, when the catalogue loads, then 63
  feeds appear from `getSupportedFeedIds()`, the unused index is not a row, and
  the four renamed feeds appear once each carrying their former name.
- **M4-AC2** — given FLR/USD, when both readings are shown, then the anchor value
  renders at 6 decimals and the block-latency value at 8, each scaled by its own
  exponent, and a test fails if either decimals value is ever taken from the
  other path.
- **M4-AC3** — given any feed read, when it executes, then the fee sent equals
  the fee returned by `calculateFeeByIds` for those exact ids. A test asserts a
  non-zero quoted fee is actually paid, so the zero-today case cannot hide an
  assumption.
- **M4-AC4** — given a tampered anchor proof, when verification runs, then
  `FtsoV2.verifyFeedData` reverts, the surface renders **could not be checked**
  with the revert reason, and a test fails if a revert is ever mapped to
  not-proven.
- **M4-AC5** — given a voting round below the retention floor whose Relay root is
  still set, then the surface renders committed-on-chain-but-unretrievable, and
  never an error and never a missing value.
- **M4-AC6** — given `requireSecure` and a historical round whose `isSecure` is
  false — round 872874, 882520, 951420 or 1167766 on Coston2 — then the read
  returns a typed refusal naming the reason, and no value is rendered.
- **M4-AC7** — given a real `offerIncentive` submitted on Coston2, when the
  effect is confirmed, then `getRange()` at the transaction's own block minus the
  preceding block equals the `rangeIncrease` in that transaction's
  `IncentiveOffered` event, and a read taken after the duration elapses renders
  as expired rather than as failed.
- **M4-AC8** — given the Coston2 config, when FTSO-06 loads, then the empty set
  renders with its date and the reason, and creation renders blocked with the
  governance evidence. Given the mainnet config, the three real custom feeds
  render with the network named on the surface.
- **M4-AC9** — given M3's FDC flows, when they run after the M4-R4 migration,
  then they complete unchanged, `Relay.isFinalized` is called with 200 for FDC
  and 100 for FTSO, and no reference to the pre-migration round module remains.
- **M4-AC10** — every surface in the package, M1's included, passes a WCAG 2.2 AA
  check against computed styles in a real browser: contrast against the token's
  own background, a visible 2px focus ring at 2px offset, and interactive targets
  at least 24×24 CSS px.
- **M4-AC11** — every FTSO surface renders every required state in the gallery,
  states differ by more than colour, and every exact value renders in the mono
  face with its full precision and its asset.

## Verification

The gate, then the live evidence run, then the browser. None alone is
sufficient: the gate cannot prove the DA route is right, the live run cannot
prove the states render, and a screenshot cannot prove a contrast ratio.

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

```bash
# Live, Coston2. Records the evidence M4-R11 requires, including a real
# signed offerIncentive submission (~0.37 C2FLR from the faucet account).
pnpm --filter @flare-kit/core exec node scripts/live-ftso-run.mjs --network coston2

# The three real custom feeds, read on mainnet and labelled as such.
pnpm --filter @flare-kit/core exec node scripts/live-ftso-run.mjs --network flare --custom-feeds-only
```

That script must: enumerate feeds through `getSupportedFeedIds`; quote and pay
the fee for a batched `getFeedsById`; retrieve an anchor proof for a named round
and verify it on chain; tamper one field and record the revert; bisect and record
the current retention floor; read a current and a historical secure random
including one known-insecure round; quote, submit and block-pin-confirm one real
incentive offer; and read the three mainnet custom feeds. Output is written to
`.thoughts/verification/2026-08-04-coston2-live-ftso.md` with round ids,
transaction hashes and explorer links.

Then every surface is driven in the gallery and screenshotted, and the
accessibility pass reads `getComputedStyle` rather than judging the screenshot —
three milestones of browser verification missed a flat primary button because a
flat button still looks like a button.

## Checklist

- [x] M4-R1 typed block-latency reads, per-value decimals, `getSupportedFeedIds`
      — `ftso/feeds.ts`, `ftso/catalogue.ts`. Live: 63 feeds, three different
      exponents in one batch (8, 9, 2), unused index 52 stated not rendered.
- [x] M4-R2 fee quoted and paid per read, ceiling honoured — `ftso/fee.ts`.
      Quotes from FtsoV2 (the binding oracle), reports FeeCalculator's
      disagreement, refuses above a ceiling and refuses a paid read with no payer.
- [x] M4-R3 anchor retrieval and three-valued on-chain verification —
      `ftso/anchor.ts`, `ftso/verify.ts`. Live: valid proof `proven`; all four
      tamper cases `could_not_check`, never `not_proven`.
- [x] M4-R4 protocol-generic voting round, one implementation, FDC unchanged —
      `core/src/voting-round.ts`; `fdc/round.ts` reduced to the submission half.
      13 tests in `core/test/voting-round.test.ts`, which is also the first
      coverage `roundForSubmission` and `awaitRoundFinality` have ever had. The
      definitive M4-AC9 check is the live FDC re-run in M4-R11.
- [x] M4-R5 history with discovered retention floor and the unretrievable state
      — `ftso/history.ts`. Live: boundary discovered at round 1127919 with
      1127920 retrievable, classified by asking the Relay for the root.
- [x] M4-R6 secure random, current and historical, `requireSecure` refusal —
      `ftso/random.ts`. Live: all four known-insecure Coston2 rounds refused with
      no value; a secure round returns one.
- [~] M4-R7 incentive **quoted and confirmable**; the real submission is M4-R11.
      `ftso/incentive.ts` + `ftso/incentive-effect.ts`. The price is
      `rangeIncrease * rangeIncreasePrice / (getPrecision() * 64)`, fitted to four
      live bisections and matching all four exactly; the live quote reproduces the
      spec's 366210937499999999 wei and the contract accepts it in a dry run,
      refusing one wei less.
- [x] M4-R8 custom feeds read-only, network labelled, creation blocked —
      `ftso/custom-feeds.ts`. Derived from `getSupportedFeedIds()` filtered on
      category 0x21, never `getCustomFeeds()`. Live: Coston2 empty as an honest
      dated state, mainnet's three correct.
- [x] M4-R9 `Observation` on **every** path that reaches a surface, rendered
      through `SourceChip`. FTSO-01 and FTSO-06 carry **two** chips, because the
      feed list and the values are separately dated claims and one chip would let
      a fresh list vouch for stale numbers.
      The anchor and history halves were carried out of P7 after the design audit
      found them non-compliant, and closed here: `fetchAnchorFeeds` returns
      `Observation<AnchorFeedsResult>` and `readFeedHistory`
      `Observation<FeedHistory>`, both classed **`provider`** rather than `chain`
      — the host serves the leaves, the Relay publishes the root they hash to, so
      a retrieved proof is a provider's claim until `verifyFeedData` accepts it.
      Both hand-written provenance blocks are deleted; verified absent from the
      rendered DOM. Two states became reachable that could not exist before:
      FTSO-02's required `stale` for the history, which had no `observedAt` to
      hang on, and a history the host could not be asked for at all.
      `FeedHistoryTable` also names its feed in the caption — it was a column of
      exact prices with no subject.
- [x] M4-R10 feed id codec byte-identical to `FtsoFeedIdConverter`, renames
      merged — `contracts/ftso/feed-id.ts`. Byte-identity asserted for both
      categories on both networks. Renames resolved in `readFeeds`, which review
      found is mandatory: `getFeedsById` silently maps a retired id to its
      current feed, so a reading is labelled by what came back.
- [x] M4-R11 live Coston2 run recorded, including the **real** `offerIncentive`.
      Evidence: `.thoughts/verification/2026-08-05-live-ftso-flare-testnet-coston2.md`.
      Read half (no key, no spend): 63 feeds / 4 renamed; fee 0 wei measured with
      exponents 8, 9 and 2 in one batch; anchor proof `proven` and all four
      tampers `could_not_check` with `merkle proof invalid`; `requireSecure`
      refused round 872874 withholding the value; Coston2's custom set empty and
      dated.
      **Submission — Abu ran it himself, 2026-08-05.** tx
      `0x542f15d2f07ad7502b8f198c47a525249207182918d866539823ab889b8eec54`,
      block 33654765, 366210937499999999 wei — the exact amount the dry run
      accepted and refused one wei below. **M4-AC7 satisfied:** `getRange()` at
      the transaction's own block minus the preceding block is
      `2433889152438200450873670154321`, identical to the `rangeIncrease` in that
      transaction's own `IncentiveOffered` event. `sampleSizeIncrease` is `0`,
      matching the real mainnet offer — an incentive buys a widening, not both
      dimensions.
      **A decode bug was caught and corrected in the record.** The first write
      said `confirmed: false` with `eventRangeIncrease` 5902, because the
      submission path read `topics[1]` blind — and only `rewardEpochId` is
      indexed on `IncentiveOffered`, so 5902 is the epoch id. The offer had
      always worked; the record was wrong. Re-derived from the same receipt
      through `decodeEventLog` with no re-spend, and `live-ftso-submit.mjs` now
      decodes through the ABI. Rendering a successful transaction as unconfirmed
      is the same class of error as rendering an unknown as a failure.
      Mainnet custom feeds still to record separately.
- [x] **The glyph vocabulary corrected.** `waiting` and `unknown` were the same
      8x8 dashed ring separated only by `opacity: 0.6` — a colour-channel signal
      distinguishing two of DESIGN.md's seven marks, on the glyph that carries
      every "we could not check this" (35 uses on these surfaces, second only to
      `done`). Abu chose the dotted ring, 2026-08-05. All seven marks now differ
      by shape; no glyph is dimmed. DESIGN.md updated.
- [x] M4-R12 WCAG 2.2 AA against computed styles, every surface M1–M4.
      **Zero** contrast, target-size and focus failures in both themes. The
      checker is `gallery/a11y-audit.ts`, exposed as `window.__auditA11y()` so it
      is re-runnable rather than a transcript artefact, and calibrated against a
      known-failing element before its output is trusted. Fixed three real
      defects: `--fk-text-faint` measured 4.48/4.46 against `surface` and failed
      AA across eighteen classes (DESIGN.md's published ratios were computed
      against `bg`, the most flattering of the three backgrounds); `.fk-src-age`
      composited to 3.36:1 on every `SourceChip`; `.fk-ev-link` was 40x18 against
      the 24x24 minimum. The primary button sits on a gradient and is reported
      un-measurable by design — verified by hand at 4.61:1 against its lightest
      stop. Evidence: `.thoughts/verification/2026-08-05-m4-r12-accessibility.md`
- [x] M4-R13 `MintFXRP`, `RedeemFXRP`, `RecoveryPanel` state-by-state audit —
      audited 2026-08-05 and the critical findings fixed. Evidence:
      `.thoughts/verification/2026-08-05-m4-r13-m1-surface-audit.md`, screenshot
      in `m4-screens/m1-mint-states.png`.
      **C1 closed: `defaultAmountXrp` / `defaultLots` seed props.** The amount was
      internal `useState` with no way in, so from props alone only `loading` and
      an empty form were reachable, and **AC7's below-minimum refusal — the one
      that prevents a total unrecoverable loss — had never been rendered in a
      browser.** It now is, with its figure in the mono face.
      **C3 closed:** `RedeemQuote` gained `expiresAt` (it could not express expiry
      at all), both composers take `now`, render a `Quote expires` row, and
      disable the action on stale terms.
      **I1 closed:** the three cases named for states their props could not
      express are renamed or given amounts; eight new mint cases and four new
      redeem cases, each reaching a distinct state.
      Also fixed in this pass: C7 (the gallery restyled every panel title), C6
      (an expired recovery window read as "nothing is at risk"), C4 (a paused
      asset manager read as "Amount too small"), C2 (the XRPL memo was absent
      from the last screen before signing), C5, I4, I6.
      **All carried items closed 2026-08-05.** I2: the four raw addresses now
      render through `EvidenceChip` — truncated first-6/last-4 with the full
      value on the copy control, the one anatomy DESIGN.md specifies. I3:
      `RecoveryPanel` renders preconditions, signs/broadcasts, next state and
      the availability deadline, so SH-06 gets 7 of 9 rather than 3. I5: the
      `movesNewValue: true` duplicate-value branch is rendered for the first
      time, hand-built because no M1 flow produces one. I11: the cross-unit
      bigint comparison is guarded on asset **and** decimals — it could
      previously compare wrong silently and then **throw during render**.
      M4 (inline spacing) folded into `.fk-recovery-action` on the token scale.
- [~] M4-R14 the three FDC gaps **defined** — two built, one re-declared with its
      definition attached. `.thoughts/decisions/2026-08-05-fdc-expired-and-quota-definitions.md`.
      `expired` is now "the Relay no longer holds the merkle root for this
      proof's round", measured: protocol 200's root is SET at 1130919 and ZERO at
      900000, so a proof genuinely becomes permanently unverifiable — built, and
      rendered `att` rather than `bad` because nothing failed. The EVM `value`
      unit now belongs to the **source**: `FamilySource.nativeUnit` plus
      `nativeUnitResponseFields`, with a bare integer as the honest fallback when
      no source is known. `quota limited` is **defined and still unbuilt** — no
      quota response has ever been observed from either verifier, and rendering
      one would mean inventing a provider message; the definition is ready for
      the first real observation.
      `ProofDetail.tsx` was split at the seam the spec named (328 → 297 lines,
      `ProofResponseFields.tsx` at 83) — it was the last production file over the
      cap. **Still open:** gallery cases and tests for `expired` and the
      source-aware `value`.
- [x] M4-AC1, AC2, AC4, AC5, AC6, AC7, AC8, AC11 — asserted in the surface
      tests against fixtures driven through the real core functions.
- [~] M4-AC3 — the fee is quoted, shown and paid, and a non-zero quote is
      exercised through `readFeeds` with a payer. The live half is M4-R11.
- [ ] M4-AC9 — the definitive check is the live FDC re-run in M4-R11.
- [ ] M4-AC10 — WCAG 2.2 AA against computed styles. **M4-R12 owns this.** An
      ad-hoc sweep run during P7 reported failures around 4.46:1 on the faint
      tier, but its arithmetic disagreed with a hand calculation of the same
      token pair (4.80:1), so nothing was changed on its evidence. R12 needs a
      vetted contrast implementation, not a second ad-hoc one.
- [x] Gate green — build, typecheck, lint, 954 tests
      (contracts 111 + 2 skipped, core 623, react-ui 202, react 18)
- [x] FTSO surfaces driven in a browser and screenshotted —
      `.thoughts/verification/m4-screens/`, light and dark, 57 gallery cases,
      zero clipped tables and no horizontal page overflow at any measured width

## Sources

- `.thoughts/decisions/2026-08-04-m3-scope-fdc-only.md:15-44` — FTSO deferred to
  M4 intact, and the three FTSO unknowns it refused to guess at, all three
  answered by the probe above
- `.thoughts/decisions/2026-08-04-no-first-party-proof-consumer.md` — extended to
  FTSO-06 unchanged
- `.thoughts/decisions/2026-08-04-build-everything-real-first.md` — nothing
  dropped for time; real integration before the mock
- `.thoughts/specs/2026-08-03-flare-application-layer.md:503-520` — R-FTSO-001…008
- `.thoughts/design/2026-08-03-product-surface-map.md:261-269` — FTSO-01…06 and
  their required states; `:162` the universal state contract
- `.thoughts/handoffs/2026-08-04-m3-complete-m4-ready.md` — the inherited DA
  path, the `applyTransition` rule, and the carried debts M4-R12/R13 close
- `.thoughts/specs/2026-08-04-m3-fdc-surfaces.md:378-399` — the three FDC gaps
  M4-R14 defines
- Abu, this session: nothing left behind absent a recorded reason; portfolio and
  quote wiring deferred to a later milestone; history as a table, no chart;
  FTSO-06 reads mainnet's three with the network labelled; secure random as a
  read-level guard
- Live probe, 2026-08-04, Coston2 (114) and Flare (14): registry dump, feed
  enumeration on three disagreeing sources, fee reads on both networks,
  `verifyFeedData` on valid and four tampered inputs, a twelve-step retention
  bisection, 401 sampled random rounds, an `offerIncentive` price bisection, and
  a decoded mainnet incentive transaction
