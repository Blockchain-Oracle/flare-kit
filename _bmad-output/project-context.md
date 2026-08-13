---
project_name: 'flare'
user_name: 'Abu'
date: '2026-08-05'
sections_completed: ['technology_stack']
existing_patterns_found: 0
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **pnpm 10.33.0 workspaces + Turborepo 2.10.8** — `packages/*` publish
  (contracts, core, react, react-ui); `apps/*` deploy and do not exist yet, by
  decision. Never run package scripts by `cd`-ing into a package — always
  `pnpm --filter <pkg>` from the root (the stage-guard hook infers project
  state from the shell cwd and will block source writes otherwise).
- **TypeScript 5.9.3**, strict, plus `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`.
  `exactOptionalPropertyTypes` is **false** — but the codebase still spreads
  optionals conditionally (`...(x === undefined ? {} : { x })`) by convention.
- **viem 2.21** (contracts, core). Two viem gotchas are load-bearing:
  `readContract` silently drops `value` (payable views must go through
  `simulateContract`), and events are decoded with `decodeEventLog`, never by
  indexing `topics`.
- **React 18.3 || 19 is a peerDependency only** — react, wagmi, viem and query
  libraries are never bundled. react-ui imports @flarekit-dev/react **from dist**,
  so a hook change needs `pnpm build` before react-ui tests see it.
- **Build/test**: tsup 8.5.1 (dual ESM/CJS, must pass publint), vitest 4.1.10
  (jsdom for react-ui), ESLint 10 flat config, prettier 3.9, changesets.
- **Node >= 21.** Workspace scripts are plain `.mjs` under `packages/*/scripts/`
  — tsx is not installed anywhere.
- **Version constraint that matters:** imports use `.js` extensions in TS source
  (`verbatimModuleSyntax` + Bundler resolution); type-only imports must use
  `import type`.

## Critical Implementation Rules

### Language-Specific Rules

- **bigint end-to-end for every chain value.** A `uint64` through `Number` is
  the exact corruption this kit exists to prevent. `JSON.stringify` needs a
  bigint replacer (`(_k, v) => typeof v === 'bigint' ? v.toString() : v`);
  seconds→ms conversion multiplies in bigint space first
  (`Number(seconds * 1_000n)`).
- **Money is `Amount` (`{ value: bigint, decimals, asset }`), never a float.**
  `formatExact` renders every stored digit with the asset (`250.000000 XRP`,
  never `250`); `parseAmount` **throws** on excess precision rather than
  rounding. `addAmounts`/`subAmounts` assert same asset+decimals — so guard
  cross-unit comparisons *before* arithmetic or it throws during React render.
- **`Observation<T>` is a union, not `{ value?: T }`.** The only route to a
  value is `isObserved()`; an unavailable observation carries a `reason` and no
  value, so `?? 0n` cannot compile. Never render unavailable as zero/empty.
- **Refusals are values, not exceptions.** A read that declines (e.g.
  `requireSecure` on an insecure round) returns a typed refusal carrying the
  reason and *no value field at all* — throwing would make "no, and here's why"
  indistinguishable from the RPC being down.
- **Verification results are three-valued** (`proven | not_proven |
  could_not_check`) with no boolean accessor. A revert maps to
  `could_not_check`, never `not_proven` — an unknown must never render as a
  negative fact.
- **Errors are `FlareKitError`** with `code`, `domain`, `recovery`
  (`safe_to_retry | wait | terminal | ...`) and `valueMoved: 'yes' | 'no'`.
  Extract revert reasons via viem's `shortMessage` first, message first-line
  as fallback — and surface the string, never swallow it.
- **Returned records are `Object.freeze`d**; optional fields are spread
  conditionally (`...(x === undefined ? {} : { x })`), never set to
  `undefined`.

### Framework-Specific Rules (React)

- **Every surface takes its state as data (props), never as internal-only
  state.** Required states must be reachable from props alone — a state
  reachable only by typing passes jsdom and has never been *seen* (this shipped
  AC7's refusal unrendered for four milestones). Composers take uncontrolled
  seed props (`defaultAmountXrp`, `defaultLots`) as `useState` initialisers.
- **The clock is a prop (`now` / `nowMs`), never `Date.now()` in render.**
  Time-gated states become unreachable and tests non-deterministic otherwise.
  In the gallery, the clock must be `MOCK_EPOCH`-derived — the mock kit quotes
  at a fixed epoch, so both a hardcoded date *and* `Date.now()` read as
  "quote expired" on every case.
- **Async reads go through `use-observed-read.ts`** — one hook, written once:
  `loading` is the absence of a result (never a result full of zeroes), a
  refresh never clears what is on screen, and the reader lives in a ref so an
  inline-constructed reader cannot restart the effect every render.
- **Hooks read; they never spend.** A hook that could submit a transaction is
  a hook a component could spend from by rendering. Quoting is a hook;
  submission belongs to the caller's wallet flow.
- **Every surface root carries the `fk` scope class** (tokens are declared on
  `.fk` — a standalone component without it resolves every `var(--fk-*)` to
  nothing in a host page) **and `data-*` attributes for its states**
  (`data-stale`, `data-blocked`, `data-expired`…). A state that exists only as
  a paragraph cannot be styled by a host or targeted by a test. `Panel`
  forwards `data-*` to its root.
- **One shared component per pattern, from `primitives/`.** Never build a
  card, badge, pill, chip, timestamp or evidence row inline in a screen.
  Addresses/hashes render through `EvidenceChip` (truncated 6/4 or 10/6, full
  value on the copy control); instants through `Timestamp` (ISO-to-second,
  mono, UTC, machine `dateTime` carries the offset).
- **Theme is runtime `data-theme`**, honoured both as `.fk[data-theme='dark']`
  and `[data-theme='dark'] .fk`. When *measuring* theme styles, drive the
  app's real toggle — flipping the attribute from script and reading computed
  styles in the same task reports stale colours (a fake 1.05:1 "bug" came
  from exactly this).
- **JSX comments cannot sit in expression slots** (`{cond ? ({/* … */} <X/>) :
  null}` is a parse error) — this bit twice in one session; put the comment
  above the expression.

### Testing Rules

- **The test lock is real.** Editing an existing test file is blocked by a
  hook; one SPEC.md write unlocks each test file *once*. If a requirement
  genuinely changed, record it in SPEC.md first — that is what unlocks the
  test — and batch all test edits behind one real SPEC.md change. Never touch
  SPEC.md just to unlock.
- **Tests are written as the requirement, not a mirror of the code.** A unit
  test written against a wrong formula passes — the incentive price was wrong
  by ~5,500x behind a green test. For anything priced or protocol-shaped,
  bisect against the live chain and put the *measured* numbers in as fixtures
  (they live once, in `mock-ftso.ts` as `OBSERVED_INCENTIVE_PRICING`).
- **Drive the real functions against the mock reader** (`createMockKit`,
  `createMockFtsoReader`) — never hand-write `Observation` fixtures. The mock
  is a *reader* the real code runs against, and it **refuses what it never
  observed**: an earlier version filled unknown feed ids with `0n` and three
  real mainnet feeds rendered `0 USD` as their price past a green suite.
- **State distinctness is asserted structurally** (`shapeOf` /
  `ftsoShapeOf`): glyphs, `data-*` attributes, chip *words*, empty-row copy
  and skeleton counts — deliberately blind to colour and body prose. Two
  required states that differ only in hue or footnote wording fail, as they
  should.
- **CSS integrity is tested in both directions**: every class a stylesheet
  defines must be referenced by a component, and every `fk-` class a component
  applies must have a rule (`css-referenced-defined.test.ts`, with an explicit
  allowlist for scope-only hooks). The second direction caught three surface
  roots that styled nothing under a green suite.
- **jsdom is not verification.** Never claim UI done from typecheck or tests —
  drive the gallery, read `getComputedStyle`, screenshot, and *look*. The
  a11y audit is `window.__auditA11y()` on the gallery page; calibrate any
  change to it against a known-opacity element before trusting output
  (`getComputedStyle().color` never includes `opacity`).
- **Build core before react-ui tests** when a hook changed — react-ui imports
  @flarekit-dev/react from `dist`.
- **Tabular data is a real `<table>`** — div grids with ARIA break
  row/column navigation in screen readers, and the tests assume table
  semantics.

### Code Quality & Style Rules

- **Production source stays under 300 lines — split *before* writing.** A
  hook blocks over-cap writes, but scripted (python/sed) edits bypass it, so
  check `wc -l` after any scripted edit. Split at real seams (the proof body
  vs the consumption block), never by line-count surgery.
- **Public values are exported constants, never environment variables.** RPC
  URLs, chain ids, contract addresses, DA hosts — all constants in
  @flarekit-dev/contracts. ESLint bans `process.env` outside scripts. The only
  secret is the signing key in `.secrets/`, never committed, logged, or
  printed in output.
- **DESIGN.md outranks every default, taste skill and component library.**
  Exact values (amounts, addresses, hashes, rounds, deadlines) render in
  JetBrains Mono with tabular numerals — *a number in the body face is a bug*.
  Amounts always carry asset + full stored precision. Addresses truncate
  first-6/last-4, hashes first-10/last-6, full value always copyable.
- **The seven glyph shapes are an operation-outcome vocabulary** (filled disc,
  ring, dashed ring, filled square, half disc, cross, dotted ring). Only
  outcomes carry them — a label chip (mode badge, property badge) takes its
  word and no mark. No state is distinguished from another by colour, weight
  or opacity alone.
- **Never reuse a semantically-named class for a look-alike case.**
  `.fk-conflict` means *two sources disagree* and tints amber; borrowing it
  for the normal two-path display painted the happy path as a warning —
  invisible in a screenshot, provable only by computed background.
- **CSS discipline:** everything scoped under `.fk`, every custom property
  `--fk-`-prefixed, nothing declared on `html`/`body`/`*`. `:where()` must
  wrap the *whole* selector — `.fk :where(button)` still scores (0,1,0) and
  beat the primary button's class for three milestones. In harness/gallery
  CSS, use child combinators (`.g-section > h2`) — a bare descendant selector
  restyled every panel title in the package and corrupted three milestones of
  screenshots.
- **Skeletons, never spinners**; no shimmer (an animation promises an arrival
  the source may never make). Pills are tags, never buttons. The primary
  button's gradient is the one permitted gradient in the system.
- **Comments state constraints the code cannot show** — why a value is what it
  is, with the measured evidence and date — never what the next line does.
- **Delete dead code as you migrate.** One implementation per pattern; never
  two versions of the same screen.

### Development Workflow Rules

- **This project is NOT a git repository.** There is no branch/commit/PR
  workflow. The progress record that survives context resets is
  `SPEC.md`'s checklist plus `.thoughts/state.json` — keep both current as
  you work, not at the end.
- **Two knowledge systems coexist; `.thoughts/` is authoritative.**
  Decisions live in `.thoughts/decisions/`, per-milestone specs in
  `.thoughts/specs/`, evidence in `.thoughts/verification/`, session truth in
  `.thoughts/state.json`. BMad's `_bmad-output/` is secondary — never let a
  BMad artifact silently contradict a `.thoughts/` decision.
- **`SPEC.md` is the repository-wide file manifest, not total scope.** Scope
  is governed by `.thoughts/decisions/2026-08-04-build-everything-real-first.md`.
  The scope guard reads SPEC.md's `## Files` section, which **ends at the next
  heading of any depth** — never introduce a `###` inside it. New paths must
  be added there (with a real reason) before writing them.
- **The gate is `pnpm build && pnpm typecheck && pnpm lint && pnpm test`** —
  run from the root, and always *show the command and its output*; never
  assert success. Chain-touching work additionally records date, network,
  addresses, tx hashes and explorer links in `.thoughts/verification/`.
- **Real integration first; the mock is written afterwards** and copies
  observed behaviour. The docs site and `apps/` come **last** — they consume
  the packages, and building them early hides which package doesn't work.
- **Stop only for three things:** credentials/funding you cannot obtain,
  irreversible actions (spend, deploy, publish — e.g. anything
  `offerIncentive`-shaped needs Abu's explicit yes), and taste judgements
  only Abu can make. Everything else: decide, record why, continue.
- **Review cadence:** every two-to-three features, dispatch review subagents
  and fix critical/important findings before continuing; after each phase run
  the simplifier — correctness review will not catch unrequested
  configuration, because it works.
- **Never fake protocol reality.** `submitted` is never rendered `succeeded`;
  an unknown outcome is never rendered failed; mock mode is explicit and
  labelled, never a fallback on failure. If something cannot be built to the
  bar, ship it **declared unbuilt** with the reason recorded — never built
  badly, and never dropped silently.
