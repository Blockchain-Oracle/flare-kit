# Handoff: M3 complete, M4 (FTSO) ready to spec

Date: 2026-08-04
Milestone closed: M3 — FDC surfaces, generic across families
Spec: `.thoughts/specs/2026-08-04-m3-fdc-surfaces.md` (status: built and verified)
Scope authority: `.thoughts/decisions/2026-08-04-m3-scope-fdc-only.md`

## What is true now

The Flare Data Connector is a capability of the kit rather than a private
detail of FAssets minting. There is **one** implementation of the attestation
lifecycle in the repository — `packages/core/src/fdc/client.ts` — and four
family modules that parameterise it. M1's mint is now the first *instance* of
that client rather than its owner.

Gate: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` exits 0.
**828 passing** — contracts 96 (+2 skipped), core 545, react-ui 169, react 18.

Two independent bodies of evidence, because neither alone is sufficient:

- **Live, on chain.** `.thoughts/verification/2026-08-04-coston2-live-fdc.md`.
  All four families prepared against the live verifier, priced by
  `getRequestFee`, submitted through `FdcHub`, finalized in Coston2 voting round
  **1415859**, retrieved from the DA layer, and **verified `true` on chain** by
  `FdcVerification`. Transaction hashes and explorer links are in the file.
- **Rendered, in a browser.**
  `.thoughts/verification/2026-08-04-m3-fdc-surfaces.md` plus screenshots. All
  29 required states across the four surfaces, console clean.

## What the build discovered that the spec did not know

Four things, each of which changed the implementation.

1. **The request fee is not one number.** The spec recorded "uniformly 1000 wei"
   from a Coston2 probe. Mainnet returns **20 FLR** — and 3 FLR for
   `ConfirmedBlockHeightExists`. A constant taken from the testnet probe would
   have been wrong by sixteen orders of magnitude on the network where it costs
   real money.
2. **`Web2Json` is unavailable on Flare mainnet.** The mainnet verifier serves
   the route (200) but the on-chain fee configuration reverts on
   `Web2Json ‖ PublicWeb2`. The verifier's OpenAPI and the fee configuration are
   two independent oracles for what a deployment serves; they agree everywhere
   else and disagree exactly here. Checking only the route would have reported an
   unsubmittable family as supported. The family table carries no mainnet source
   for it.
3. **`Relay.isFinalized` and "the proof can be fetched" are two moments.** The
   first live run retrieved once immediately after `isFinalized` returned true
   and got nothing for all four requests; all four were retrievable minutes
   later. `AttestationTimeline` renders `finalize` and `retrieve` as separate
   steps because of this, and any caller must poll rather than conclude "no
   proof" from a single absence.
4. **`applyTransition` silently drops its patch on an illegal transition.**
   `reconcileAttestation` originally jumped `ready → awaiting_external`, which
   the table in `states.ts` forbids; the transition was refused, the step patch
   went with it, and every step stayed `pending` on exactly the operations that
   had progressed furthest. There was no error and no failing unit test — a
   surface test caught it. `fdc/operation.ts` now walks the table with a
   breadth-first search. **Any future reconciler must do the same.**

## Corrections made to the spec's own file list

The spec named files the repository contradicted. Each is recorded in `SPEC.md`
with its reason:

- M3-R2 named `packages/core/src/fassets/direct-mint.ts` as the client's
  consumer. It is not — that file is pure state-machine code and imports nothing
  from `fdc.ts`. The real consumers are `fassets/flare-kit.ts` and
  `fassets/read-chain-state.ts`, and those were rewired. The requirement was
  unchanged; only the file was wrong.
- `live-fdc-run.ts` became `.mjs`: `tsx` is not installed anywhere in the
  workspace and `eslint.config.js` scopes the script globals to
  `packages/*/scripts/**/*.mjs`.
- `src/styles/fdc.css` became `src/fdc.css`, where every other stylesheet lives.
- Six files were split to stay under the line cap, each declared with its reason:
  `family-table.ts`, `execution-gate.ts`, `mock-fdc.ts`, `fdc-fixtures.ts`,
  `fdc-shapes.tsx`, `fdc-proof-surfaces.test.tsx`.

## What M4 inherits from the M3 design audit

The review gate ran a design audit and a simplifier over M3. Both CRITICALs are
fixed (the step marker and the self-contradicting unknown, both above), and the
important findings were then worked through rather than carried:

- Identifiers on FDC-02 and FDC-04 now render through `EvidenceChip` and are
  copyable, in the one evidence anatomy. `PreparedSummary` was deleted in favour
  of core's own `PreparedRequest`, which now carries the request `keccak256`
  M3-R7 asked for.
- FDC-03 carries a `SourceChip` (M3-R12).
- XRPL amounts render as `25.000012 XRP` — the family table declares which
  response fields are amounts and in what unit.
- FDC-02 shows the request hash, the expected round, and the wait as a **range**
  rather than a point, and tells "the fee could not be read" apart from "the fee
  has not been read yet".
- `.fk-row-v-sub` renders prose in the sans face on its own line; `.fk-linkish`
  meets the 24px target.

What genuinely remains is at the end of the M3 spec. Each item lacks a
*definition* rather than effort: FDC-04's `expired` (an FDC proof carries no
expiry), the `quota limited` states (no 429 was ever observed), and an EVM
`value`'s asset (source-dependent within one table row).

## Defects only the rendered screen and the audit caught

Recorded in full in the browser verification. Summarised because they are the
argument for the rule:

1. The catalogue's "Consumed by" column clipped mid-word. The table went from
   five columns to three.
2. The `JsonApi` deprecation note rendered as a one-word-per-line sliver.
3. `RecoveryPanel` told every attestation "Your payment is recorded" — copy
   inherited from direct minting and untrue of a request that moves no funds.
   The sentence is now derived from the evidence.
4. A proof that failed verification marked `verify` **done** and `consume`
   failed — naming a step that never ran as the one that broke, and silently
   suppressing the "did not verify" note, which keys off `verify`'s state.
5. An unknown outcome showed a passed deadline, "nothing for you to do" and
   "the request can be made again" at once (see above).
6. `mock-fdc.ts` re-implemented `claimedStatus` and `familyFor` — two copies of
   the status rules, one of which nothing would have updated.
7. **Every primary button in the package rendered flat**, M1's and M2's
   included. `.fk :where(button)` scored `(0,1,0)` from `.fk`, tying with
   `.fk-btn-primary` and winning on source order. Rewritten as
   `:where(.fk button)`, which scores `(0,0,0)`. Three milestones of browser
   verification missed it, because a flat button still looks like a button — it
   took reading `getComputedStyle().backgroundImage`. **Check computed styles,
   not just screenshots, when DESIGN.md specifies a treatment.**

None could fail the tests as written. Three were legible DOM with correct text;
two produced distinct shapes, which is all the shape test asks for; one agreed
with the original exactly until the day it would not.

## Open, and deliberately so

- **Consumption is verifier-only for exactly two families, and that is settled.**
  The spec assumed three. It was wrong: FAssets consumes all seven chain
  families, `XRPPaymentNonexistence` included, through
  `xrpRedemptionPaymentDefault` — verified on the deployed Coston2 AssetManager.
  Only `EVMTransaction` and `Web2Json` have no deployed consumer, and for those
  the consumer is the integrator's own contract by design: a proof of an
  arbitrary EVM transaction or an arbitrary JSON endpoint has no meaning until
  somebody's own logic gives it one. **This kit should never deploy a demo
  consumer for them** — it would be a toy that proves nothing about real
  integration, and it would put a first-party address and a Solidity toolchain
  into a repository whose whole point is that it has neither.
  `ProofDetail` now derives verifier-only from `family.hasDeployedConsumer`
  rather than from whether a caller passed a handler, so a screen that simply has
  not wired consumption no longer claims none exists.

  **Built rather than deferred:** `ProofHandoff` on FDC-04 gives the integrator
  the next step's inputs — the ABI-ready struct as a paste-able TypeScript
  literal with `bigint` suffixes, the Solidity type (`I{Family}.Proof`), and the
  `FdcVerification` call already made. It says the contract should verify again
  itself, because this kit's check is a pre-flight and not a substitute. The
  snippet is TypeScript rather than JSON deliberately: JSON renders a `uint64`
  as a string or, worse, as a `number`, which would reintroduce the exact
  corruption this kit exists to prevent at the last possible moment.
  `CodeWindow` was added as the primitive DESIGN.md already specified.
- **`BLOCKED` / `REJECTED` redemption outcomes** stay mapped to
  `action_required`. Unresolved since M1; M3 did not touch it.
- **No accessibility pass against rendered pixels** has run for any milestone.
  Carried forward from M2's handoff and still carried forward.
- **M1's three composed surfaces** have had one browser look and no state-by-state
  audit. Also carried forward from M2.

## The next authorized action

M4 is **FTSO** (FTSO-01 … FTSO-06), deferred out of M3 by the scope decision so
that FTSO-03's anchor-feed proof could inherit a settled DA path. It now can:
the DA host, the round derivation, the finality poll and the retrieval shape are
all built, live-verified and shared. Run `/abu-harness:spec` for it.

Mutation is safe. The gate is green, `SPEC.md`'s manifest admits every path, and
M1's mint is pinned unchanged by its own e2e suite plus a repository-wide check
that no reference to the pre-migration client survives.
