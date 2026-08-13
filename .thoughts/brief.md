# Brief: M3 — FDC surfaces, at the build boundary

Date: 2026-08-04

Supersedes the 15:07 brief of the same name, which was written before Abu's M3
scope decision (15:27) and the M3 spec (15:44). Both of its headline unknowns
are now answered; they are recorded as resolved below rather than dropped.

## Objective

Orient before M3 is built. Establish what the decision and spec settled, what
code exists, and what is still genuinely open.

## Already true

- `/Users/abu/dev/hackathon/flare` **is not a git repository** — `git status`
  exits 128. File mtimes are the only chronology.
- **The previous brief's unknowns #1 and #2 are answered by Abu** in
  `.thoughts/decisions/2026-08-04-m3-scope-fdc-only.md` (15:27, adopted): M3 is
  **FDC only** (FDC-01…04); FTSO-01…06 move to M4 intact, because FTSO-03's
  anchor-feed proof sits on the same DA host as FDC and must inherit a settled
  path. And `createFdcClient` **becomes generic** over request/response bodies
  with per-family typed modules — XRPPayment is **migrated**, not duplicated.
- `.thoughts/specs/2026-08-04-m3-fdc-surfaces.md` (15:44) is the current spec.
  Status line: *"specified, not built"*. M3-R1…R12, M3-AC1…AC9, an explicit
  out-of-scope list, a file manifest, and four surfaces with required states.
- **`SPEC.md`'s `## Files` manifest already carries every M3 path.** Diffing the
  spec's file list against `SPEC.md:92-405` leaves only three `index.ts` entries,
  covered by the `packages/*/src/index.ts` glob at `SPEC.md:52`. Both old
  `fdc.ts` files appear marked **deleted in M3** (`SPEC.md:350,371`). No `###`
  sits inside `## Files`, so the scope guard sees all of it.
- **Gate green.** `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
  exits 0 — contracts 82 (+2 skipped), core 527, react 18, react-ui 131 = **758**.
  Unchanged since the previous brief.
- **Zero M3 code exists.** `packages/core/src/fdc/` and
  `packages/contracts/src/fdc/` do not exist; `packages/contracts/src/fdc.ts`
  (163 lines) and `packages/core/src/fdc.ts` (207 lines) are still the
  pre-migration XRPPayment-only shape. `packages/react/src/` has no
  `useAttestation*`; `packages/react-ui/src/` has none of the four surfaces.
  No `apps/` directory. The gallery is `packages/react-ui/gallery/`.
- **The spec's three load-bearing probe claims re-verified live today,
  independently of the spec session:**
  - Verifier route groups on `fdc-verifiers-testnet.flare.network`:
    `xrp`, `eth`, `sgb`, `doge`, `flr`, `web2`, `btc_testnet4` → **200**;
    `btc` → **404**. Confirms the docs' `/verifier/eth/` instruction is wrong
    for Coston2 and that `btc` is `btc_testnet4` on testnet.
  - `getRequestFee` at `0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e` returns
    **1000 wei** for `EVMTransaction|testFLR`, `Payment|testXRP`,
    `Web2Json|PublicWeb2`, `ReferencedPaymentNonexistence|testXRP`,
    `AddressValidity|testBTC`, `ConfirmedBlockHeightExists|testDOGE`.
  - `JsonApi` is dead in both directions: `prepareRequest` → **404**, and
    `getRequestFee` **reverts** on chain.

## Current shape

Four packages, no app. `contracts` holds addresses, ABIs, chains, funding and
the FDC surface; `core` the lifecycle, FAssets mint/redeem, XRPL and FDC I/O,
`Observation`, accounts, portfolio, activity and the mock; `react` a provider
plus hooks; `react-ui` ten surfaces over eight primitives plus the gallery.
M3 splits both `fdc.ts` files into directories, adds four family modules, two
hooks and four surfaces, and rewires `fassets/direct-mint.ts` onto the generic
client. M2's `Observation` / `SourceChip` / `SourceDrawer` are reused, not
rebuilt (M3-R12).

## Genuine unknowns

1. **`.thoughts/state.json` is stale and now contradicts the adopted decision.**
   It reads `milestone: "M2"`, `current_spec` = the M2 spec, and
   `next_authorized_action` = "Choose M3 … and run `/abu-harness:spec`". Both
   were done hours ago. Nothing has repointed it, and the harness reads it.
2. **Two carried-forward gaps that state.json flags and the M3 spec does not
   carry.** `state.json:8` names them "worth folding into M3 or doing first":
   `MintFXRP` / `RedeemFXRP` / `RecoveryPanel` got only a first look in a browser
   (`…m2-complete-m3-ready.md:203`), and no accessibility or contrast pass has
   run against rendered pixels (ibid:205-207). M3's checklist has neither.
3. **Consumption is BLOCKED for three of the four families.** The spec ships
   verifier-only for `EVMTransaction`, `Web2Json` and `XRPPaymentNonexistence`
   because no consumer is deployed and M3 adds no Solidity toolchain. Whether
   verifier-only is an acceptable shipped end state for FDC-04 is not recorded
   as an Abu decision — it is a spec inference.
4. **No Web2Json target is identified.** M3-R11 requires the family driven live
   through a real consensus round, and M3-R10 requires nondeterminism to surface
   as unknown. Which public HTTPS JSON endpoint is deterministic enough to reach
   consensus on Coston2 is unchosen.
5. **`BLOCKED` / `REJECTED` redemption outcomes** stay mapped to
   `action_required` because the burned FAsset's fate was never verified.
   Deliberately unresolved since M1; the M3 decision states it does not touch it.

## Constraints discovered

- **`tsx` is not installed** — no `tsx` in `node_modules/.bin`, none in
  `packages/core/package.json`. The spec's verification command is
  `pnpm --filter @flare-kit/core exec tsx scripts/live-fdc-run.ts`, and
  `SPEC.md:398` manifests a `.ts` script. Every existing evidence script
  (`live-mint`, `live-redeem`, `live-portfolio`, `verify-reconcile`) is `.mjs`
  under plain node.
- **The lint exemption for scripts is `.mjs`-only** —
  `eslint.config.js` scopes the `process`/`console` globals and the
  `process.env` opt-out to `packages/*/scripts/**/*.mjs`. A `.ts` live script
  falls outside that glob and will fail lint as written.
- **`packages/core/src/fassets/direct-mint.ts` is 304 lines** — already over
  CLAUDE.md's 300-line rule, and M3-R2 modifies it. Nothing enforces the limit;
  there is no `max-lines` rule anywhere.
- `packages/core/test/flare-kit.test.ts:133-137` — the live kit may contain no
  textual reference to the mock. Real integration first, mock derived after.
- `packages/react-ui/test/css-integrity.test.ts` and `…/state-shape.test.tsx`
  are cross-surface invariants M3's four surfaces inherit: every icon needs a
  rule, no stylesheet may define an unreferenced class, and states must differ
  by more than colour.
- Harness behaviours still live (`…m2-complete-m3-ready.md:217-239`): never `cd`
  into a package directory or `sources/`; the test lock unlocks one edit per
  real `SPEC.md` write; `## Files` ends at the next heading of any depth;
  `@flare-kit/react-ui` imports `@flare-kit/react` from `dist`, so a hook change
  needs `pnpm build` first.

## Next authorized action

Build M3 against `.thoughts/specs/2026-08-04-m3-fdc-surfaces.md`. Mutation is
safe: the gate is green, `SPEC.md`'s manifest already admits every M3 path, and
the migration's one behavioural risk (M1's mint) is pinned by M3-AC8.
`.thoughts/state.json` needs repointing to the M3 decision and spec.

## Sources

- `CLAUDE.md`, `DESIGN.md`, `SPEC.md`, `.harness.json`, `eslint.config.js`
- `.thoughts/decisions/2026-08-04-m3-scope-fdc-only.md`;
  `.thoughts/decisions/2026-08-04-build-everything-real-first.md`
- `.thoughts/specs/2026-08-04-m3-fdc-surfaces.md`
- `.thoughts/handoffs/2026-08-04-m2-complete-m3-ready.md`, `.thoughts/state.json`
- `.thoughts/research/2026-08-04-fdc-xrp-payment-attestation.md` (the FDC flow;
  not to be re-researched)
- Commands run: `git status` (exit 128); the full gate (exit 0, 758 passing);
  eight `api-doc-json` route probes; seven live `getRequestFee` reads and a
  `JsonApi` `prepareRequest` probe against Coston2
