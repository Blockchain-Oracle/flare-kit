# Handoff: M2 complete, M3 ready

Date: 2026-08-04
Milestone closed: **M2 — accounts, signing authority, portfolio and activity**
Governing decision: `.thoughts/decisions/2026-08-04-build-everything-real-first.md`

## State

Every item on the M2 checklist is checked. Gate green:

```
pnpm build && pnpm typecheck && pnpm lint && pnpm test
build:0  typecheck:0  lint:0
contracts 74 (2 skipped) · core 515 · react 18 · react-ui 113
```

481 tests at the M1 handoff; 720 now.

## What M2 added

**A data layer with provenance.** `Observation<T>` is a union, not a struct with
an optional value — the only route to a number is through `isObserved`, so a
renderer cannot reach for `?? 0n` with the compiler's blessing. Five source
classes stay distinct; `chain` and `local` are the only ones with a live
producer, by decision.

**Two identities at once.** `AccountContext` carries an EVM and an XRPL
identity, each with its own connection state and custody class, neither
required for the other. Read-only is reached only by asking for it: `rejected`
and `walletUnavailable` produce no custody class at all, so there is no path
from a refusal into a read-only identity.

**Bound actions.** `useActionBinding` snapshots the accounts at quote time and
gates both `useDirectMint.start` and `useRedeem.start`. A wallet that switches
account or chain between the screen and the button invalidates the action and
names both accounts.

**Six surfaces**, replacing `ConnectButton` with `AccountSheet`, plus two shared
primitives (`SourceChip`, `DataTable`) and a dev-only state gallery.

## Decisions taken during the build

Recorded in `.thoughts/decisions/2026-08-04-m2-open-questions.md`:

- **No indexer adapter.** M2-R4 enumerates what `readPortfolio` returns and an
  indexer is not in it. `indexer`, `provider` and `cache` exist as classes with
  no configured producer; the mock is their only source. Adding one later must
  not change `Observation`'s shape.
- **`AccountSheet` replaces `ConnectButton`.** They were the same screen at six
  states and ten. The old one is deleted and its assertions migrated.

Abu chose, mid-build:

- **A dev-only state gallery** in `packages/react-ui/gallery/` for browser
  verification, rather than bringing `apps/app` forward or continuing test-only.
- **Wire M2-R3 with SH-03**, rather than threading a binding through M1's
  verified mint and redeem paths first.

## What review and the browser caught

A correctness review found five defects in the core layer, one of which
**a test of mine was actively defending**: `isPortfolioEmpty` returned `true`
for a portfolio whose XRPL source never answered, because the fixture connected
both identities but supplied only one position. Also fixed: `coverageFor` used
`some` where M2-AC4 needs `every` (hence the new `partial` coverage value);
`checkBinding` folded case on XRPL addresses, making two different base58
accounts compare equal; wrong-network and account-switch both collapsed into
"no longer connected"; and the secret regex was anchored, so `seedPhrase`,
`walletSeed` and `privateKeyHex` were persisted and exported in full.

The browser pass found six more, all under a green suite —
`.thoughts/verification/2026-08-04-m2-surfaces.md` has them. The two worth
carrying forward as habits:

- **Deleting a component is not deleting its CSS.** `ConnectButton`'s rules sat
  in `compose.css` and silently beat the new ones.
- **An undefined icon renders as a solid black square**, not as nothing, because
  `.fk-i` masks `currentColor`. Two icons were used with no class defined.

## The simplifier pass

Six deletions applied, all verified against the gate afterwards:
`coverageOf` and `holdingsFor` (accessors over a public readonly field, no
production caller), `usePortfolio`'s `refreshMs` and its `setInterval` branch
(a second polling clock beside the provider's `pollMs`), `useActivity`'s `now`
option (inert — its own comment excluded it from the memo deps),
`SkeletonRows`' `rows` prop, and the `export` on `mockIndexedPositions`.

**Kept, deliberately**, against the simplifier's candidate list:

- `usePortfolio`'s `compareWith` / `conflicts`. It is the only React join to
  USER-03's required conflict state. No producer today, but that is the
  no-indexer decision, not speculation.
- `Observation`'s per-observation `freshFor` override. `DEFAULT_FRESH_FOR` is a
  per-class default; a producer that knows its claim's lifetime better must be
  able to say so without changing the type. Same reasoning as "adding an indexer
  later must not change `Observation`'s shape".
- `connecting(family)`. Deleting one member of a symmetric state-constructor set
  for a named SH-02 state is churn, not simplification.
- `className` / `theme` on the M2 primitives and surfaces: a package-wide
  convention every M1 component follows. Removing it from only the new ones
  would break the convention rather than simplify it.

**One judgement worth carrying:** "zero callers" proves little in this repo,
because `apps/app` does not exist yet — nothing consumes *any* hook. The test
that discriminates is redundancy: does another mechanism already do this?
`refreshMs` duplicated `pollMs`; `compareWith` duplicated nothing. Same evidence,
opposite verdicts.

`webSocketUrl` and `faucetUrl` in `chains.ts` have no reader anywhere. They
predate M2, so they were left alone — worth a look when a milestone touches the
network registry.

## The invariants that close the gap

Seven defects survived a green suite this milestone; one survived all of M1
including a live mint. They share a shape — **the rendered form did not reflect
the state, and every test read only text.** Two checks now run across all
surfaces rather than per-surface:

**`css-integrity.test.ts`** — static, no renderer. Every `icon="x"` has a
`.fk-i-x` rule; every rule points at a vendored file; and **no stylesheet
defines a class no component references**. That last one is the
delete-dead-code rule with teeth: it fails when a component is deleted and its
CSS is not. On its first run it found five orphans — `fk-card`, `fk-spine-sub`,
`fk-eyebrow`, `fk-muted`, `fk-faint` — all removed.

**`state-shape.test.tsx`** — renders each surface across its states and
compares a signature built only from glyph modifiers, `data-state`,
`data-status` and which controls are disabled. Deliberately blind to colour and
prose, because DESIGN.md forbids colour being the first signal: a surface whose
states differ only in hue fails here, as it should.

It caught a regression I introduced in M2 on its first run: **`ready` and
`read-only` rendered an identical shape** in `AccountSheet`. `ConnectButton`
had a distinct "Read only" chip; I collapsed it into `ready` plus a custody
line, leaving custody carried by prose alone on the one surface whose job is
making custody legible. Restored as its own chip and glyph.

It also pins the M1 spine collision directly: `submitted` and `succeeded` must
not render alike.

**What these do not cover.** Copy quality (the "1 need you" pluralisation),
semantic wrongness that is still visually distinct (offering "Connect" to a
wallet on the wrong chain), and anything about contrast or layout. Those still
need a person looking at a screen. The invariants narrow what a screenshot has
to catch; they do not replace it.

## Evidence

- `.thoughts/verification/2026-08-04-m2-surfaces.md` — six surfaces, every
  required state, both themes, screenshots in the sibling directory.
- `.thoughts/verification/2026-08-04-coston2-live-portfolio.md` — real balances
  on Coston2 and XRPL Testnet with sources labelled, and the M1 identifiers
  looked up live.

The live portfolio read used **no signing key**. It supplies both addresses as
read-only identities, which is R-WALLET-003's path and the agent-facing rule
from `.thoughts/decisions/2026-08-03-agent-facing-surfaces.md` exercised for
real.

## Caveats a fresh session should know

1. **M1's own mint evidence disagrees with itself.**
   `2026-08-04-coston2-live-mint.json` says `outcome: "incomplete"`; the `.md`
   says succeeded. Both are right about different things — the *script* stopped
   when a third-party executor got there first and our `executeDirectMinting`
   reverted with `PaymentAlreadyConfirmed()`; the *protocol* credited
   24.800000 FTestXRP. Read the `.md`, and treat the chain as the authority.
   The live portfolio arithmetic closes exactly: 34.8 after the mint, minus the
   10.0 the redemption burned, equals the 24.8 read live.

2. **M1's four composed surfaces are now in the gallery, and the spine defect
   they exposed is FIXED.**

   Every step glyph used to render `unknown` in every state, including
   `succeeded` — a completed mint showed five "outcome unknown" markers. The
   cause was upstream of the UI: `initialSteps()` ran once at quote time and
   `steps` was never patched again, in the mock *or* the live path.

   `advanceSteps(steps, {done, current}, at)` in `operation.ts` now moves the
   spine, and each capability maps its own state onto it —
   `directMintStepProgress` and `redeemStepProgress`. Progress is derived from
   **chain evidence**, not from the operation state alone: a step is `done`
   only when something observed says it happened. A step never regresses,
   because readings arrive duplicated and backfilled (R-LIFE-005).

   Verified in the browser:

   ```
   ready              unknown,unknown,unknown,unknown,unknown
   submitted          done,working,unknown,unknown,unknown
   awaiting external  done,done,working,unknown,unknown
   action required    done,done,done,action,unknown
   succeeded          done,done,done,done,done
   ```

   Pinned by `packages/react-ui/test/timeline-glyphs.test.tsx`, which asserts
   the glyph per state — the assertion that never existed and let this survive
   all of M1, including the live Coston2 mint.

   `MintFXRP`, `RedeemFXRP` and `RecoveryPanel` render correctly at a first
   look; they have not been examined in the same detail.

3. **No accessibility pass in a real browser.** `accessibility.test.tsx` covers
   `AccountSheet` under jsdom only. Contrast in particular has never been
   checked against rendered pixels.

4. **The M1 operation states in the live activity run are asserted, not
   re-derived.** They come from cross-checked evidence rather than from running
   the kit's reconciler over restored records. Noted in the evidence file.

5. **`BLOCKED` and `REJECTED` redemption outcomes** are still mapped to
   `action_required` because what happens to the burned FAsset was never
   verified. Carried forward from M1, unresolved deliberately.

## Harness behaviours worth not rediscovering

- **Never `cd` into a package directory.** The stage guard resolves the project
  root from the shell cwd, so `cd packages/core` makes it infer `orient` and
  block every source write. Use `pnpm --filter` from the root.
- **The test lock unlocks for exactly one edit per `SPEC.md` write**, comparing
  mtimes. Batch test edits. Never touch `SPEC.md` merely to unlock — make the
  spec change that justifies the test change, or leave the test alone.
- **The test lock held under a subagent, and a changed mtime does not mean a
  changed test.** The simplifier attempted to delete test blocks in
  `packages/core/test/portfolio.test.ts`, the guard refused, and it restored the
  file — which left a fresh mtime on an unchanged file. Reading that mtime alone
  suggested the guard had failed; it had not. The M2-AC4 assertions were checked
  by hand afterwards and are intact. Verify content, not timestamps.
- **A subagent that edits code can leave the tree broken.** The simplifier
  removed `usePortfolio`'s clock injection but left a call to it, so
  `pnpm typecheck` failed with `TS2552`. Always run the gate yourself after a
  subagent applies changes; do not take "green" in its report on trust.
- **`SPEC.md`'s `## Files` section ends at the next heading of any depth.** A
  `###` subheading inside it makes everything below invisible to the scope
  guard.
- `@flare-kit/react-ui` imports `@flare-kit/react` from `dist`, so a change to a
  hook needs `pnpm build` before react-ui's tests see it.

## Next

M3 per the governing decision. `SPEC.md` remains the M1 spec plus the
repository-wide file manifest the scope guard reads; per-milestone specs live in
`.thoughts/specs/`.
