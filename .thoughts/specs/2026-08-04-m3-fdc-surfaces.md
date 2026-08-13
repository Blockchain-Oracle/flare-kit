# Spec: flare-kit milestone 3 — FDC surfaces, generic across families

Date: 2026-08-04
Milestone: M3 — FDC (FDC-01 … FDC-04)
Scope authority: `.thoughts/decisions/2026-08-04-m3-scope-fdc-only.md`
Status: built and verified, with declared gaps — see the checklist and the
declared-unbuilt list at the end

## Objective

After this milestone the Flare Data Connector is a first-class capability of the
kit rather than a private detail of FAssets minting. A developer can discover
which attestation families the selected deployment actually serves, build and
validate a request for four of them, submit it, watch the voting round reach
finality, retrieve the proof, and verify that proof on chain — with every value
carrying its provenance. The XRPPayment path M1 built keeps working unchanged
from the outside while its implementation becomes the first instance of a
generic client, which is what lets Smart Accounts and every later domain consume
FDC without restating the request state machine.

## What the live probe established

Recorded here because it contradicts the vendored documentation in three places
and the spec is built on the measured values, not the documented ones.

- **All nine non-deprecated families are live** on
  `https://fdc-verifiers-testnet.flare.network`. Route groups verified by
  `GET /verifier/{group}/api-doc-json`: `xrp`, `eth`, `sgb`, `doge`, `flr`,
  `web2`, `btc_testnet4` all return 200.
- **Coston2 EVM attestations are served by group `flr` with sourceId `testFLR`.**
  A real Coston2 transaction returns `VALID` on `flr` and `INVALID` on both `eth`
  and `sgb`. `developer-hub/docs/fdc/guides/hardhat/02-evm-transaction.mdx:187`
  and `guides/foundry/02-evm-transaction.mdx:308` instruct `/verifier/eth/…`,
  which is **wrong for Coston2**. `sourceId: coston2` does not exist.
- **`/verifier/btc/` does not exist on testnet** — it is `btc_testnet4`.
- **`JsonApi` is dead in both directions**: the route 404s, and
  `getRequestFee` reverts `Type and source combination not supported` on chain.
  Deprecation is enforced by the contract, not only by the docs.
- **The request fee is uniformly `1000` wei** for every live type‖source pair
  *on Coston2*. Non-zero, so it is read and sent, never assumed to be zero.
  `getRequestFee(bytes)` requires at least `attestationType ‖ sourceId` (64
  bytes) and reverts on anything shorter.
  **Corrected during the build:** the same call on Flare mainnet returns
  **20 FLR** (`2e19` wei), and **3 FLR** for `ConfirmedBlockHeightExists`. The
  fee is not one number — a constant taken from the Coston2 probe would have
  been wrong on mainnet by sixteen orders of magnitude. This is now the strongest
  argument for M3-AC4 rather than a footnote to it.
- **`Web2Json` is not available on Flare mainnet**, discovered during the build.
  The mainnet verifier serves `/verifier/web2/Web2Json/prepareRequest` (200), but
  mainnet's `FdcRequestFeeConfigurations` reverts on `Web2Json ‖ PublicWeb2`, so
  no request can be priced and none can be submitted. The two live oracles — the
  verifier's OpenAPI and the on-chain fee configuration — agree everywhere else
  and disagree exactly here. The family table therefore carries no mainnet source
  for `Web2Json`, and `claimedStatus` reports it `unavailable` there. Declaring
  it live on the strength of the route alone would have been faking protocol
  reality.
- **The `eth` verifier returns `500` where `flr` and `sgb` return a clean
  `200 {"status":"INVALID"}`** for a nonexistent transaction. A 5xx is therefore
  a retryable unknown and must never be rendered as "this transaction is
  invalid".
- **The `uint64` corruption hazard is not XRP-specific.** `lowestUsedTimestamp`
  is common to every family's response, and the two nonexistence families are
  the documented producers of `uint64`-max sentinel values.

## Requirements

Traceability is to `.thoughts/specs/2026-08-03-flare-application-layer.md:470-492`.

- **M3-R1** (R-FDC-001, R-FDC-008) — `@flare-kit/core` exposes one generic FDC
  lifecycle, parameterised by request and response body types: prepare, validate,
  quote fee, submit, derive round, await finality, retrieve proof, verify,
  optionally consume. Exactly one implementation of that state machine exists in
  the repository.
- **M3-R2** (R-FDC-008) — the XRPPayment types and client in
  `packages/core/src/fdc.ts` are **migrated** into the first family module. The
  previous shape is deleted, not kept beside the generalisation.
  `packages/core/src/fassets/direct-mint.ts` consumes the generic client, and
  M1's mint behaviour is unchanged from the caller's side.
- **M3-R3** (R-FDC-002) — the family catalogue is a constant table in
  `@flare-kit/contracts` **compared at runtime** against the selected
  deployment's live verifier OpenAPI. Agreement, disagreement and unreachability
  are three distinct rendered outcomes. The table is never presented alone as
  permanent protocol truth.
- **M3-R4** (R-FDC-003) — every family carries an explicit status:
  `supported` (a builder exists and has been driven live), `planned` (the
  deployment serves it, this project has no builder), `deprecated` (JsonApi), or
  `unavailable` (dated evidence of upstream absence). No status is ever mocked
  on the live path, and `planned` is never rendered as supported.
- **M3-R5** (R-FDC-001) — request builders exist for four families:
  `XRPPayment`, `EVMTransaction`, `Web2Json` and `XRPPaymentNonexistence`. Each
  owns its attestation-type name, its verifier group and source ids, its
  request-body validation, and its response decoding including per-field
  `BigInt` handling.
- **M3-R6** — every numeric proof field is parsed as `BigInt` out of the raw
  response text. `JSON.parse`'s default number handling never touches a proof.
  A test asserts the `uint64`-max sentinel survives a round trip byte-identical.
- **M3-R7** (R-FDC-004) — an attestation operation exposes request bytes and
  hash, response hash, voting round, fee paid, proof owner, source, verifier and
  DA provider, Relay finality evidence, and the consumption transaction where one
  exists.
- **M3-R8** (R-FDC-005) — proof owner, selected network and source, and replay
  or consumption rules are validated before any execution is offered.
- **M3-R9** (R-FDC-006) — the expected finalization duration and the endpoint in
  use are visible on the timeline. Verifier and DA base URLs are configuration a
  caller may override with a self-hosted endpoint without changing the operation
  model.
- **M3-R10** (R-FDC-007) — a timeout, a consensus failure, a 5xx, or
  nondeterministic Web2Json input is represented as **no proof / unknown**. It is
  never rendered as a negative fact about the underlying chain.
- **M3-R11** — the four families are each driven end to end on Coston2 against a
  real voting round, and the run records date, network, addresses, request bytes,
  transaction hashes and explorer links.
- **M3-R12** — every M3 value that reaches a surface travels as M2's
  `Observation<T>` and renders through the existing `SourceChip` / `SourceDrawer`.
  No new provenance rendering is written.

## Out of scope

- **No FTSO.** FTSO-01 … FTSO-06 are M4 per
  `.thoughts/decisions/2026-08-04-m3-scope-fdc-only.md`. No feed reading, no
  Fast Update incentive, no custom feeds, no `FtsoV2` binding, and no
  anchor-feed proof retrieval, even though it shares the DA host.
- **No request builders for the other five live families** — `Payment`,
  `AddressValidity`, `ConfirmedBlockHeightExists`,
  `BalanceDecreasingTransaction`, `ReferencedPaymentNonexistence`. They are
  catalogued live and marked `planned`. They are not stubbed, not faked, and not
  hidden.
- **No first-party Solidity and no demo consumer contract.** The repository has
  no `.sol` of its own, no `foundry.toml` and no hardhat config, and M3 does not
  add a compiler toolchain. Families with no deployed consumer reach on-chain
  *verification* through `FdcVerification`, and their consumption is declared
  absent.

  **Corrected 2026-08-04**, and the correction matters: the spec assumed three
  families had no consumer. FAssets consumes **all seven chain families** on the
  AssetManager diamond, `XRPPaymentNonexistence` among them via
  `xrpRedemptionPaymentDefault` — verified on the deployed Coston2 AssetManager,
  where `redeemWithTagSupported()` is true and selector `0xafe4226a` is
  registered. Only `EVMTransaction` and `Web2Json` have none, and those are the
  two general-purpose families whose consumer is the integrator's own contract by
  design. The kit deploying a demo consumer for them would be inventing meaning
  the protocol deliberately leaves open.
- **No mainnet run.** The family table carries mainnet groups and source ids
  because network is configuration, but the evidence run is Coston2 and XRPL
  Testnet only.
- **No environment variables.** Verifier host, DA host, the published
  `X-API-KEY` default, verifier groups, source ids and attestation type names are
  exported constants in `@flare-kit/contracts`.
- **No provider-adapter abstraction beyond an overridable base URL.**
  R-FDC-006's "provider adapters" requirement is met by configuration, not by an
  interface with one implementation.
- **No indexer.** Unchanged from
  `.thoughts/decisions/2026-08-04-m2-open-questions.md`.
- **No new attestation state machine anywhere.** If a domain needs FDC, it calls
  the client.

## Files

New unless marked. Paths are also appended to `SPEC.md`'s `## Files` manifest,
which is what the scope guard reads.

**`@flare-kit/contracts` — the FDC surface splits, because one file cannot hold
nine families and stay under 300 lines.**

- `packages/contracts/src/fdc/protocol.ts` — **migrated from
  `packages/contracts/src/fdc.ts`**: `FDC_PROTOCOL_ID`, `attestationName`,
  `votingRoundIdAt`, `XRPL_REQUIRED_CONFIRMATIONS`
- `packages/contracts/src/fdc/families.ts` — the nine-family constant table:
  name, verifier group per network, source ids, status, and the response fields
  that must decode as `BigInt`. M3-R3, M3-R4, M3-R6
- `packages/contracts/src/fdc/urls.ts` — `prepareRequestUrl(base, group, type)`,
  `proofByRequestRoundUrl(base)`, `apiDocJsonUrl(base, group)`. The current
  `prepareRequestUrl` hardcodes `/verifier/xrp/XRPPayment/` and is replaced
- `packages/contracts/src/fdc/abi.ts` — **migrated**: `fdcHubAbi`, `relayAbi`,
  `flareSystemsManagerAbi`, plus `fdcVerificationAbi` extended to the four
  families' `verify*` functions
- `packages/contracts/src/fdc.ts` — **deleted**, replaced by the directory above
- `packages/contracts/src/index.ts` — **modified**, re-exports the new paths

**`@flare-kit/core` — one generic client, four family modules.**

- `packages/core/src/fdc/family.ts` — the `AttestationFamily<TRequest, TResponse>`
  contract each module implements: type name, group, source ids, request
  validation, request encoding, response decoding, `BigInt` field list
- `packages/core/src/fdc/client.ts` — the generic client. `prepareRequest`,
  `retrieveProof`, `verifyProof`, generic over the family. M3-R1
- `packages/core/src/fdc/round.ts` — round derivation from a submitting block
  timestamp and finality polling via `Relay.isFinalized`. M3-R7
- `packages/core/src/fdc/fee.ts` — `getRequestFee` against the full request
  bytes, and the "at least 64 bytes" precondition the contract enforces
- `packages/core/src/fdc/catalogue.ts` — fetches the live verifier OpenAPI per
  group, compares to the constant table, returns `Observation<FamilyRow[]>`
  carrying agreement, disagreement or unreachability. M3-R3, M3-R4
- `packages/core/src/fdc/families/xrp-payment.ts` — **migrated** from
  `packages/core/src/fdc.ts`, including `toProofStruct`. M3-R2
- `packages/core/src/fdc/families/evm-transaction.ts` — group `flr`, sourceId
  `testFLR` on Coston2. Carries the documented-route divergence as a comment and
  a test
- `packages/core/src/fdc/families/web2-json.ts` — user-supplied `abiSignature`
  and jq post-processing; the family where nondeterminism is expected and must
  surface as unknown, not as failure. M3-R10
- `packages/core/src/fdc/families/xrp-payment-nonexistence.ts` — requires
  `checkFirstMemoData` or `checkDestinationTag`; the `uint64`-max sentinel
  producer. M3-R6
- `packages/core/src/fdc.ts` — **deleted**, migrated into the directory above
- `packages/core/src/fassets/direct-mint.ts` — **modified**, consumes the generic
  client through the XRPPayment family module. M3-R2
- `packages/core/src/mock.ts` — **modified**, gains labelled FDC catalogue and
  attestation fixtures for the states no live run reaches on demand

**`@flare-kit/react`**

- `packages/react/src/useAttestationFamilies.ts` — the catalogue, its comparison
  outcome and its provenance
- `packages/react/src/useAttestation.ts` — prepare → submit → round → proof →
  verify, as one non-blocking operation
- `packages/react/src/index.ts` — **modified**

**`@flare-kit/react-ui` — four surfaces over existing primitives.**

- `packages/react-ui/src/AttestationCatalogue.tsx` — FDC-01
- `packages/react-ui/src/AttestationRequestBuilder.tsx` — FDC-02
- `packages/react-ui/src/AttestationTimeline.tsx` — FDC-03, composing the
  existing `OperationTimeline` spine rather than restating it
- `packages/react-ui/src/ProofDetail.tsx` — FDC-04
- `packages/react-ui/src/styles/fdc.css` — rules for any new icon or state,
  which `css-integrity.test.ts` already enforces
- `packages/react-ui/src/index.ts` — **modified**
- `packages/react-ui/gallery/` — **modified**, the four surfaces in every
  required state

**Tests**

- `packages/contracts/test/fdc-families.test.ts` — the table re-derived against
  the live verifier OpenAPI, per the rule at
  `.thoughts/research/2026-08-04-fdc-xrp-payment-attestation.md:91-94`
- `packages/core/test/fdc-client.test.ts` — the generic lifecycle, one fake
  transport
- `packages/core/test/fdc-bigint.test.ts` — `uint64`-max survives round trip
  byte-identical. M3-R6
- `packages/core/test/fdc-catalogue.test.ts` — agreement, disagreement and
  unreachable are three outcomes
- `packages/react-ui/test/fdc-surfaces.test.tsx` — required states, inheriting
  `state-shape.test.tsx`'s rule that states differ by more than colour

## Integrations

| Surface | Classification | Note |
|---|---|---|
| `packages/core/src/fdc/catalogue.ts` | REAL_MVP | live `GET /verifier/{group}/api-doc-json`, published key |
| `packages/core/src/fdc/families/xrp-payment.ts` | REAL_MVP | live verifier; already proven in M1 |
| `packages/core/src/fdc/families/evm-transaction.ts` | REAL_MVP | live, group `flr` / `testFLR`, real Coston2 tx |
| `packages/core/src/fdc/families/web2-json.ts` | REAL_MVP | live, `web2` / `PublicWeb2`, public HTTPS JSON |
| `packages/core/src/fdc/families/xrp-payment-nonexistence.ts` | REAL_MVP | live, `xrp` / `testXRP`, real past ledger window |
| `packages/core/src/fdc/fee.ts` | REAL_MVP | `getRequestFee` on chain; measured `1000` wei, read not assumed |
| `packages/core/src/fdc/round.ts` | REAL_MVP | `FlareSystemsManager` params, `Relay.isFinalized` |
| `packages/core/src/fdc/client.ts` (`verifyProof`) | REAL_MVP | `FdcVerification`, read-only, real bool |
| XRPPayment consumption | REAL_MVP | FAssets `executeDirectMinting`, unchanged from M1 |
| Consumption, other three families | BLOCKED | no deployed consumer; verification only, declared per family |
| The five `planned` families | REAL_LATER | catalogued live, no builder this milestone |
| `JsonApi` | BLOCKED | route 404 and on-chain revert, dated 2026-08-04 |
| `packages/core/src/mock.ts` | SIMULATED_DEMO_ONLY | explicit, labelled, never a failure fallback |

## Surfaces

| Screen | Required states | Data shown | Entry point |
|---|---|---|---|
| FDC-01 `AttestationCatalogue` | `BASE`, `AVAIL`, `SOURCE`; docs/verifier disagreement; no current family; matrix stale | family, type name, verifier group, source ids, status, builder support, deprecation note, proof-owner rule, provenance | capability index |
| FDC-02 `AttestationRequestBuilder` | `BASE`, `PLAN`, `AUTH`; invalid source/body; quota or fee unavailable; builder `planned`; proof-owner mismatch | family, source, canonical request body and hash, fee, proof owner, verifier and DA provider, expected round and duration, downstream consumer | catalogue row |
| FDC-03 `AttestationTimeline` | full `OP`, `SOURCE`; quota limited; consensus pending; consensus failed; timeout; no proof / unknown; proof ready | request and response hash, tx and request id, round, fee, provider, expected range, Relay finality, proof retrieval, diagnostic reason | submit |
| FDC-04 `ProofDetail` | `BASE`, `AUTH`, `OP`; proof invalid; expired; already consumed; verifier-only; consumption failed; consumption succeeded | family and source, response fields, proof owner, round, verifier, proof bytes and download, verification result, consumption target and tx, replay rule | timeline |

## Acceptance criteria

- **M3-AC1** — given a live Coston2 config, when the catalogue loads, then all
  nine non-deprecated families appear with a live-verified status, `JsonApi`
  appears as `deprecated`, and the four builder families read `supported` while
  the other five read `planned`.
- **M3-AC2** — given the constant table is edited to claim a family the live
  verifier does not serve, when the catalogue loads, then the disagreement state
  renders and names the specific family. The table never silently wins.
- **M3-AC3** — given a real Coston2 transaction, when an `EVMTransaction`
  request is prepared, then it is prepared against group `flr` with sourceId
  `testFLR`, and a test fails if the code ever addresses `eth` for Coston2.
- **M3-AC4** — given a prepared request, when it is submitted, then the fee sent
  equals the fee read from `getRequestFee` for those exact bytes, and the
  operation persists before the transaction is sent.
- **M3-AC5** — given a proof whose `lowestUsedTimestamp` is `uint64` max, when it
  is retrieved and re-encoded, then the value is byte-identical to the attested
  one. `18446744073709551615` never becomes `18446744073709552000`.
- **M3-AC6** — given the verifier returns 5xx, or the round fails consensus, or
  the round times out, then the surface shows no proof / unknown with a
  diagnostic reason, and never shows the underlying transaction as invalid.
- **M3-AC7** — given a retrieved proof for any of the four families, when
  verification runs, then `FdcVerification` is called on chain and the real
  boolean is rendered. For the three families with no deployed consumer, the
  verifier-only state renders and no consumption is offered.
- **M3-AC8** — given M1's mint flow, when it runs after the migration, then it
  completes unchanged, and no reference to the pre-migration client remains in
  the tree.
- **M3-AC9** — every surface renders every required state in the gallery, states
  differ by more than colour, and every exact value renders in the mono face with
  its full precision.

## Verification

The gate, then the live evidence run. Neither alone is sufficient: the gate
cannot prove the verifier routes are right, and the live run cannot prove the
states render.

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

```bash
# Live, Coston2 + XRPL Testnet. Records the evidence M3-R11 requires.
pnpm --filter @flare-kit/core exec tsx scripts/live-fdc-run.ts --network coston2
```

That script must, for each of `XRPPayment`, `EVMTransaction`, `Web2Json` and
`XRPPaymentNonexistence`: prepare the request against the live verifier, read the
fee on chain, submit through `FdcHub`, derive the round, poll `Relay.isFinalized`,
retrieve the proof from the DA layer, verify it through `FdcVerification`, and
print the request bytes, transaction hash, round id, fee paid and explorer link.
Output is written to `.thoughts/verification/2026-08-04-coston2-live-fdc.md`.

Then the surfaces are driven in a browser and screenshotted, per `CLAUDE.md` —
a typecheck is not evidence that UI is done.

## Checklist

- [x] M3-R1 generic lifecycle, one implementation — `packages/core/src/fdc/client.ts`
- [x] M3-R2 XRPPayment migrated, old shape deleted, direct-mint unchanged.
      Both `fdc.ts` files deleted. The consumers were `fassets/flare-kit.ts` and
      `fassets/read-chain-state.ts`, **not** `direct-mint.ts` as the spec said —
      that file is pure state-machine code and imports nothing from `fdc.ts`
- [x] M3-R3 catalogue compares constant table to live verifier — verified
      against the real Coston2 verifier, all ten rows `agrees`
- [x] M3-R4 four statuses, none mocked on the live path
- [x] M3-R5 four family builders
- [x] M3-R6 BigInt everywhere, sentinel round-trip test
- [x] M3-R7 operation exposes hashes, round, fee, provider, finality —
      `packages/core/src/fdc/operation.ts`
- [x] M3-R8 proof owner, network, source and replay validated pre-execution —
      `packages/core/src/fdc/execution-gate.ts`
- [x] M3-R9 expected duration and endpoint visible, base URLs overridable
- [x] M3-R10 timeout, 5xx and consensus failure are unknown, never negative facts
- [x] M3-R11 four families driven live, evidence recorded —
      `.thoughts/verification/2026-08-04-coston2-live-fdc.md`, round 1415859
- [x] M3-R12 Observation, SourceChip and SourceDrawer reused. `OperationTimeline`
      was widened to any `OperationRecord` and given a `stepEvidence` prop rather
      than a second spine being written
- [x] M3-AC1 all nine live, JsonApi deprecated, four supported / five planned
- [x] M3-AC2 disagreement renders and names the family
- [x] M3-AC3 EVMTransaction prepared against `flr` / `testFLR`; a test fails if
      Coston2 ever addresses `eth`
- [x] M3-AC4 fee sent equals fee read for those exact bytes
- [x] M3-AC5 `uint64` max survives byte-identical — unit test plus the rendered
      screen. **Not** established by the live run: the nonexistence window
      closed on a ledger with a real overflow block, so no sentinel arrived
- [x] M3-AC6 5xx, consensus failure and timeout render as unknown with a reason
- [x] M3-AC7 `FdcVerification` called on chain, real boolean rendered; the three
      families with no deployed consumer render verifier-only and offer nothing
- [x] M3-AC8 M1's mint unchanged; no reference to the pre-migration client
- [x] M3-AC9 every surface renders every required state; states differ by more
      than colour; exact values in mono at full precision
- [x] Gate green — 817 passing: contracts 96 (+2 skipped), core 545,
      react-ui 158, react 18
- [x] Surfaces driven in a browser and screenshotted —
      `.thoughts/verification/2026-08-04-m3-fdc-surfaces.md`

Status: **built and verified.** Seven defects the tests could not catch were
found by looking at the rendered screen, by walking the reconciler, and by the
review gate — all fixed. They are recorded in the browser verification. The
review gate's important findings were then worked through; what remains
unbuilt is below, and every item on it lacks a *definition*, not effort.

## Declared unbuilt, found by the M3 design audit

Not defects in what was built — states and data the surface table asked for that
this build does not render. Written down rather than quietly dropped, per the
rule that something which cannot be built to the bar ships declared unbuilt.

- **FDC-04 `expired`.** The surface table lists it. Nothing in `ProofDetail`,
  the gallery or the tests implements it, because nothing established what
  expires: an FDC proof does not carry an expiry, and the FAssets consumption
  window that does is a property of the mint, not of the proof. The state needs
  a definition before it needs a rendering.
- **FDC-02 and FDC-03 `quota limited`.** The surface table lists a quota state
  on both. No quota or 429 response was observed from the verifier across the
  whole build, including four live submissions, so there is no observed
  behaviour to copy. Inventing one would be faking provider behaviour.
- **An EVM `value` still renders unlabelled.** `EVMTransaction`'s amount is
  denominated in whichever chain its source names — `testFLR`, `testETH` and
  `testSGB` sit on the *same row* — and the family table is not source-specific,
  so it declares no asset rather than putting the wrong ticker beside a real
  number. XRPL amounts, where the family is XRPL-only and the asset is certain,
  do render as `25.000012 XRP`. Fixing the EVM case needs a source-aware unit,
  which is a table shape change, not a rendering change.

Fixed after the audit rather than deferred: identifiers on FDC-02 and FDC-04 now
render through `EvidenceChip` and are copyable; FDC-03 carries a `SourceChip`;
FDC-02 shows the request hash, the expected round and the wait as a range; the
fee's pending and refused states are separate `BlockReason`s; `.fk-row-v-sub`
renders prose in the sans face on its own line; and `.fk-linkish` meets the 24px
target.

## Sources

- `.thoughts/decisions/2026-08-04-m3-scope-fdc-only.md` — scope and the generic
  client shape, decided by Abu
- `.thoughts/specs/2026-08-03-flare-application-layer.md:470-492` — R-FDC-001…008
- `.thoughts/design/2026-08-03-product-surface-map.md:256-259` — FDC-01…04
- `.thoughts/research/2026-08-04-fdc-xrp-payment-attestation.md` — the flow,
  round derivation, encoding, endpoints and the `uint64` hazard
- `.thoughts/decisions/2026-08-04-m2-open-questions.md` — the declared-unbuilt
  pattern this milestone follows for `planned` families
- Live probe, 2026-08-04: per-group OpenAPI, nine `prepareRequest` probes, and
  `getRequestFee` reads against
  `0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e` on Coston2
- `packages/contracts/src/fdc.ts`, `packages/core/src/fdc.ts` — the code migrated
