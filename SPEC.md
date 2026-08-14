> **STATUS — read this first.**
>
> **This file is the M1 specification and it is COMPLETE.** Every item in its
> checklist is done and verified live on Coston2 + XRPL Testnet. Do not start
> work from it.
>
> **Scope is governed by**
> `.thoughts/decisions/2026-08-04-build-everything-real-first.md`, which
> supersedes this file as a statement of total scope. The full product is 21
> capability families and 137 surfaces; ten components exist.
>
> **M1 and M2 are both done.** M2 — accounts, signing authority, portfolio and
> activity — is specified and checked off in
> `.thoughts/specs/2026-08-04-m2-accounts-portfolio-activity.md`.
>
> **M3 is specified and not yet built.** Start here:
> `.thoughts/specs/2026-08-04-m3-fdc-surfaces.md` — FDC surfaces FDC-01…04, a
> generic attestation client, and builders for four families. Its scope is fixed
> by `.thoughts/decisions/2026-08-04-m3-scope-fdc-only.md`: **FDC only. FTSO is
> M4.** Per-milestone specs and checklists live in `.thoughts/specs/`, never in
> this file.
>
> **This file's `## Files` section is the repository-wide manifest** the scope
> guard reads, so it spans milestones even though the requirements above do not.
>
> Session state, open caveats and the process rules that are not obvious from
> the code: `.thoughts/handoffs/2026-08-04-m2-complete-m3-ready.md`.

# Spec: flare-kit milestone 1 — the FXRP onboarding path, real

## Objective

After this milestone, a developer can install two packages and put a working
XRP-to-FXRP mint into their own React app, and a person can complete that mint
for real on Coston2 and XRPL Testnet, watch it across the 8 to 15 minute wait,
and recover it if the executor is late without paying twice. This is the
bounty's stated priority asset and the hardest operation in the product, so
every later capability reuses the lifecycle engine it forces us to build.

## Requirements

- R1 — A pnpm + Turborepo workspace publishing dual ESM/CJS packages that pass
  `publint`, with changesets configured for release.
- R2 — `@flarekit-dev/contracts` exports typed ABIs and one address registry for
  Coston2. No address is hardcoded anywhere else.
- R3 — `@flarekit-dev/core` exposes a durable operation lifecycle: immutable
  intent, quote, unsigned plan, execution, canonical states, typed errors, and
  a recovery matrix that distinguishes reusing prior evidence from creating a
  new payment.
- R4 — `@flarekit-dev/core` implements `directMint`: quote XRP to FXRP with exact
  fees, produce the XRPL payment to sign, track XRPL finality, FDC request and
  proof, executor execution, and the FXRP credit.
- R5 — Operation records persist and resume by ID across reload and process
  restart, through a storage adapter with an in-memory default.
- R6 — `createMockKit()` reproduces the full state machine with configurable
  timings and no wallet, key or network.
- R7 — `@flarekit-dev/react` exposes `FlareProvider`, `useDirectMint`,
  `useOperation`, accepting either a live config or a mock kit.
- R8 — `@flarekit-dev/react-ui` ships `MintFXRP`, `OperationTimeline` and
  `ConnectButton` supporting simultaneous EVM and XRPL accounts, styled from
  DESIGN.md tokens and themeable through CSS custom properties.
- R9 — Every component renders every state in its required-state list against
  the mock, including delayed, action-required and recovered.
- R10 — Recovery for a delayed mint reuses the existing payment and proof and
  is idempotent by XRPL transaction ID.
- R11 — WCAG 2.2 AA on kit-controlled surfaces: keyboard operation, visible
  focus, status conveyed by text and shape as well as colour.

## Out of scope

- No swap, bridge, vault, stake, governance, payment-request, liquidity, FCC or
  Smart Account implementation. Specified, deliberately unbuilt this milestone.
- No agent tools, MCP server, CLI or scaffolder yet. They consume this core, so
  they follow it rather than lead it.
- No documentation site build. The accepted specimens under
  `.thoughts/design/fable5-direction-return/` remain the visual reference.
- No environment variables for public values. RPC URLs, chain IDs and contract
  addresses are exported constants in `@flarekit-dev/contracts`. A signing key for
  the demo is the only secret, and it is never committed.
- No npm publish, no domain registration, no deployment in this milestone.
- No `apps/funding-api` yet. A funder-held faucet service is required before
  anyone else can use the app, and its shape is already proven in the owner's
  prior project: status and request endpoints, per-address and per-IP rate
  limits, a short-circuit when the account already holds enough, and the web
  client reaching it through core rather than calling it directly. It follows
  milestone 1 rather than blocking it, because a developer with their own
  funded testnet account does not need it.
- No conventional collateral-reservation mint path. Direct mint only.
- No custom UI framework, component library or CSS-in-JS. Hand-written CSS
  using the DESIGN.md tokens, matching the accepted specimens.

## Files

- `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` — workspace root
- `.changeset/config.json` — release configuration
- `eslint.config.js` — one flat config at the root; R1 needs a lint gate and
  it is where the "no environment variables for public values" law is enforced
- `.gitignore`, `.prettierrc.json`, `.prettierignore` — workspace
  hygiene R1 implies: workspace linking, and keeping the vendored `sources/`
  and `developer-hub/` clones out of our tree and our formatters
- `packages/*/package.json`, `packages/*/tsconfig.json`, `packages/*/tsup.config.ts`,
  `packages/*/vitest.config.ts` — per-package manifests and build config; R1's
  dual ESM/CJS and publint requirement lives here, not in the root
- `README.md` — the repository README. Contributor-facing, and the only surface
  that may carry mermaid: npm renders none of it
- `packages/*/README.md` — the npm-facing README per package, on the R-DIST-007
  skeleton; `contracts` diverges long because a registry package has no
  docs-site page to link to
- `LICENSE`, `packages/*/LICENSE` — every package declares MIT, so every
  published tarball must carry the text. npm packs only from within a package
  directory, so the root copy alone would ship none of them
- `brand/flare-kit-mark.svg`, `brand/flare-kit-logo.svg`,
  `brand/flare-kit-banner.svg` — the identity. One crimson, theme-neutral:
  `<picture>` dark-mode switching is structurally broken on npm, so a single
  file must survive both grounds. Wordmarks are outlined paths, never `<text>`,
  because camo's CSP forbids a font load
- `brand/packages.svg`, `brand/architecture.svg` — hand-authored diagrams that
  keep live `<text>` on a system stack, because a diagram must stay editable
- `brand/build.mjs` — regenerates the three identity files from the vendored
  Bricolage and Hanken faces. Run by hand; its two tools are deliberately not
  workspace dependencies
- `apps/site/**` — `flare-kit.xyz`: the landing page and the documentation, one
  Next.js App Router application. Specified in
  `.thoughts/specs/2026-08-13-docs-site.md`; the framework is chosen in
  `.thoughts/decisions/2026-08-13-docs-site-framework.md`. `apps/*` deploys and
  never publishes, so it is outside the publint and dual-format rules
- `packages/contracts/src/chains.ts` — network + underlying-chain constants (ids,
  RPCs, explorers); split from the address registry because it is what makes
  "mainnet-capable with no source rewrite" true
- `packages/contracts/src/addresses.ts` — Coston2 registry, single source of truth
- `packages/contracts/src/direct-minting-abi.ts` — the `IXRPPayment.Proof`
  struct, the delay-state enum, and the direct-minting function, event and
  settings fragments; split from `abis.ts` because the proof tuple alone is a
  third of the file
- `packages/contracts/src/fdc/` — the Flare Data Connector surface: attestation
  name encoding, voting-round derivation, the family table, and the
  Relay/FdcHub/FdcVerification fragments. In contracts rather than core because
  it is protocol constants and addresses, which R2 says live in exactly one
  place. Was a single `fdc.ts` through M2; split into a directory in M3, and the
  M3 entries below are the current list
- `packages/contracts/src/direct-minting-errors.ts` — the protocol's named
  revert reasons, so a refusal has a name instead of being an opaque blob; the
  recovery matrix maps each to a safe action or to none
- `packages/contracts/src/settings-reader.ts` — positional decoding of the
  60-field `getSettings()` struct, which has no per-field getters. Validates
  each value against its plausible range so a struct reordering throws instead
  of returning a wrong fee
- `packages/contracts/src/redemption-abi.ts` — the redemption surface (M1-R1):
  `redeem`, request info, the default-to-collateral path and every named
  outcome event. Separate file because redemption is a different shape from
  minting, not a variation of it
- `packages/contracts/src/abis.ts` — typed ABIs for AssetManager and the FAsset
- `packages/contracts/src/dex.ts` — M5-R2. The V2 swap venue per network: router,
  factory and the swappable token set, plus the minimal V2 + ERC-20 ABIs. Coston2
  = BlazeSwap, Flare = SparkDEX V2; addresses grounded by the R1 on-chain probe
  (`.thoughts/verification/2026-08-09-m5-r1-coston2-swap-venue.md`). No swap address
  is hardcoded elsewhere.
- `packages/core/src/swap-quote.ts` — M5-R4. A router `getAmountsOut` quote and the
  price impact from pool reserves; quoting is never a reserves+fee formula because
  BlazeSwap's pricing carries FTSO-reward mechanics. Split from the operation at the
  quote/execute seam.
- `packages/core/src/swap.ts` — M5-R3. The swap operation: immutable intent, the
  unsigned plan (approve-when-short + swapExactTokensForTokens with amountOutMin),
  and the canonical-state transitions, reusing the M1 lifecycle engine.
- `packages/core/src/mock-swap.ts` — M5-R5. The mock, written after the real path,
  reproducing observed quotes and failure shapes.
- `packages/core/src/states.ts` — the sixteen canonical states, the actors that
  own a step, and the legal-transition table; split out so the vocabulary every
  surface shares is readable on one screen
- `packages/core/src/recovery.ts` — recovery action, attempt log and awaiting
  descriptor: the R-REC-004 matrix and the R-OP-008 reuse-versus-new-value
  declaration, which are one cohesive idea and not the state machine
- `packages/core/src/operation.ts` — durable operation record and state machine
  (re-exports the two modules above, so consumers import one entry point)
- `packages/core/src/errors.ts` — typed error taxonomy with recovery classes
- `packages/core/src/storage.ts` — storage adapter interface and memory default
- `packages/core/src/amounts.ts` — the exact typed amount R-OP-001 requires
  (bigint base units plus asset and decimals) and its full-precision formatter;
  split out so `operation.ts` stays under the 300-line cap
- `packages/core/src/evidence.ts` — the one evidence-item anatomy DESIGN.md
  mandates everywhere, plus duplicate-tolerant merging for R-LIFE-005
- `packages/*/src/index.ts` — each package's public entry point
- `packages/*/test/**` — the checks; each requirement is tested before it is built
- `packages/core/scripts/live-mint.mjs` — the evidence-gathering run against
  Coston2 and XRPL Testnet. Dev-only tooling: it may use `xrpl` for signing,
  which the shipped package never does
- `.thoughts/verification/2026-08-04-coston2-live-redeem.md` — the M1-AC2
  evidence: hashes, balances, the state sequence, and the defect the run found
- `packages/core/scripts/live-redeem.mjs` — the M1-AC2 evidence run: burns
  FTestXRP and waits for an agent to pay XRP. Every state decision goes through
  the kit; the script only signs and polls
- ~~`packages/core/scripts/resume-mint.mjs`~~ — **deleted 2026-08-04.** It was a
  Resume button, which CLAUDE.md forbids. Its job is now done by
  `createFlareKit(...).reconcile()`, which reads chain state and resolves an
  already-settled mint without submitting anything
- `packages/core/src/fassets/redeem.ts` — the redemption operation and spine
  (M1-R6). Same durable record and reducer as the mint; the difference is that
  every step after the burn belongs to a counterparty
- `packages/core/src/fassets/read-redeem-state.ts` — live redemption reads
  (M1-R6): the protocol snapshot via positional settings decoding, and the
  request state where a deleted request reads as success
- `packages/core/src/fassets/quote-redeem.ts` — the redemption quote (M1-R2):
  lot-based, names the agent as the payer, and states the collateral premium
  before the user commits
- `packages/core/src/fassets/redeem-recovery.ts` — the redemption recovery
  matrix (M1-R3). Separate from the mint's because the counterparty is a named
  agent with a deadline, and a deleted request means success, not absence
- `packages/core/src/fassets/direct-mint-quote.ts` — the quote as a pure
  function over a fetched protocol snapshot, so the arithmetic AC7 depends on is
  testable with no network
- `packages/core/src/fassets/direct-mint-recovery.ts` — the R-REC-004 matrix as
  a pure function of observed chain state; separate because "what is safe to do
  now" is the part AC3, AC4 and AC8 all turn on and must be readable alone
- `packages/core/src/fassets/read-protocol-state.ts` — fills the quote's
  snapshot from live contract reads; the only file in the mint path that does
  chain I/O, so everything deciding safety stays pure
- `packages/core/src/fassets/read-chain-state.ts` — the live producer of
  `DirectMintChainState`, twin of the mock's `chainAt()`. Without it
  `planRecovery` was reachable only from the mock (M0a)
- `packages/core/src/fassets/flare-kit.ts` — `createFlareKit`, the live
  `DirectMintKit`. R7 requires the provider accept a live kit or a mock; this is
  the live half. It must never import the mock (M0b)
- `packages/core/src/fassets/direct-mint.ts` — quote, plan, execute, track, recover
- `packages/core/src/json.ts` — BigInt-safe parsing of protocol responses; the
  FDC proof carries uint64 values that `JSON.parse` silently corrupts, which
  would submit a different proof from the one attested
- `packages/core/src/fassets/fees.ts` — the exact fee arithmetic mirrored from
  `DirectMintingFacet._computeFees`, including the below-minimum case AC7 blocks
- `packages/core/src/xrpl-rpc.ts` — XRPL JSON-RPC reads (tx finality, account,
  ledger); split from payment construction because one is pure and the other is
  I/O, and only the pure half belongs in a quote
- `packages/core/src/xrpl.ts` — payment construction and finality reads
- `packages/core/src/fdc/` — attestation request, round wait, proof retrieval and
  on-chain verification, generic over the attestation family. Was a single
  `fdc.ts` through M2; split into a directory in M3
- `packages/core/src/mock-redeem.ts` — the simulated redemption world: where an
  agent sits relative to its deadline. Split out so `mock.ts` holds two
  capabilities and still stays under the line cap
- `packages/core/src/mock-config.ts` — what the mock simulates: scenarios,
  stage timings and the fake protocol settings. Split out so `mock.ts` has room
  for more than one capability
- `packages/core/src/mock.ts` — `createMockKit`
- `packages/react/src/store.ts` — the synchronous operation registry with
  subscriptions that `useSyncExternalStore` renders from; separate from the
  durable async `OperationStore` because React needs a tear-free snapshot
- `packages/react/src/provider.tsx` — `FlareProvider`, live or mock
- `packages/react/src/use-redeem.ts` — `useRedeem` (M1-R7). A separate hook, not
  a mode on the mint hook: the intents, quotes and waits differ, and sharing one
  would put a union type at every call site
- `packages/react/src/hooks.ts` — `useDirectMint`, `useOperation`
- `packages/react-ui/src/styles.css` — tokens exported from DESIGN.md
- `packages/react-ui/src/primitives.css` — controls and containers ported from
  the accepted specimen: button, card, panel, detail row, note, skeleton
- `packages/react-ui/src/state.css` — how state and evidence are shown: the
  state chip, DESIGN.md's seven-glyph vocabulary, and the one evidence-chip
  anatomy. Split from the controls because it is the part every surface shares
  verbatim, and CLAUDE.md forbids re-coding any of it inline in a screen
- `packages/react-ui/src/fonts/*.woff2`, `packages/react-ui/src/icons/*.svg` —
  vendored from the accepted specimen; DESIGN.md forbids CDN font links, and an
  embedded widget that inherits the host's face breaks the exactness rule
- `packages/react-ui/src/assets/*.svg`, `packages/react-ui/src/assets/*.png`,
  `packages/react-ui/src/assets/ATTRIBUTION.md` — official asset, network and
  wallet marks, vendored so `AssetLogo`/`NetworkLogo`/`ConnectModal` resolve a
  symbol to a bundled mark with no network request: a widget's CSP forbids a
  remote logo host, and hotlinking one leaks which assets a user views.
  Referenced by `background-image`, not a `mask`, because a mask would strip the
  colour the mark exists for. Sources (all in ATTRIBUTION.md): Flare dev-hub
  marks (MIT); FTSO crypto majors from Trust Wallet Assets (MIT); wallet brand
  marks from each vendor's own repo, used nominatively. Per the 2026-08-09 re-cut
  (`.thoughts/decisions/2026-08-09-uniswap-recut-direction.md`)
- `packages/react-ui/src/state-visuals.ts` — the single map from canonical
  state to glyph, tone and word. One place, so `submitted` can never render as
  `succeeded` on one surface and correctly on another
- `packages/react-ui/src/primitives/*.tsx` — one component per shared pattern
- `packages/react-ui/src/primitives/ExplorerLink.tsx`,
  `packages/react-ui/src/primitives/CopyButton.tsx` — the re-cut link + copy
  atoms (2026-08-09). `ExplorerLink` is the one link anatomy: a shortened
  identifier that links to its explorer with a trailing external glyph, and
  **degrades to plain text when no explorer indexes it** — `core/src/links.ts`
  (M2-R6) returns the reason, so the atom never dresses a 404 up as a link and
  never renders a disabled/error state. `CopyButton` is the copy control lifted
  out of `EvidenceChip` so a wallet address — identity, not operation evidence —
  gets a copy affordance without being shoehorned into an `EvidenceKind` chip.
  `EvidenceChip` composes both, so there is exactly one link anatomy and one copy
  anatomy across ProofDetail, ScalingProofDetail, SecureRandomPanel,
  FeedHistoryTable and AccountSheet
- `packages/react-ui/src/compose.css` — the amount-entry anatomy (leg, amount
  field, balance row) ported from the accepted specimen's swap/bridge layout,
  which is the shape users already have muscle memory for
- `packages/react-ui/src/RedeemFXRP.tsx` — the redemption composer (M1-R7):
  lot-based, and it says on screen that an agent pays you and what happens if
  that agent does not
- `packages/react-ui/src/MintFXRP.tsx` — the mint composer
- `packages/react-ui/src/spine.css` — the signature component's own CSS; it is
  the one piece of layout no other surface shares, and it carries the wait block
  that states stage, expected end, awaited actor and safe action
- `packages/react-ui/src/RecoveryPanel.tsx` — what moved, what remains, reuse
  versus new payment; SPEC's Surfaces table lists it and the timeline needs it
- `packages/react-ui/src/OperationTimeline.tsx` — the spine
- `packages/react-ui/src/ConnectButton.tsx` — simultaneous EVM and XRPL.
  **Deleted in M2**, absorbed by `AccountSheet`; see
  `.thoughts/decisions/2026-08-04-m2-open-questions.md`
- `apps/app/` — the application, three modes (renamed from "demo" 2026-08-04)

**M2 — accounts, portfolio and activity.** Requirements and acceptance for the
files below live in
`.thoughts/specs/2026-08-04-m2-accounts-portfolio-activity.md`. They are listed
here because this section is the repository-wide manifest the scope guard reads,
not because M1's scope grew. (Kept flat rather than under a sub-heading: the
guard's `## Files` section ends at the next heading of any depth.)

- `packages/core/src/observation.ts` — M2-R1. A value with its source class,
  provider, network and observation time; a union so an unavailable source
  cannot be read as a number
- `packages/core/src/account.ts` — M2-R2. Simultaneous EVM and XRPL identity,
  each with a custody class and its own connection state
- `packages/core/src/account-binding.ts` — M2-R3. Binds a quote, approval or
  execution to the account and chain it was made for; separate file because
  invalidation is a rule about actions, not a property of an identity
- `packages/core/src/portfolio.ts` — M2-R4. The portfolio model: positions as
  observations, and position types declared unbuilt rather than shown as zero
- `packages/core/src/fassets/read-portfolio.ts` — M2-R4. The live chain reads
  that produce those observations; split from the model so the model is
  testable without a network
- `packages/core/src/activity.ts` — M2-R5. Operation-centric activity entries
  that keep an XRPL payment, an FDC round and a Flare execution as three
  identifiers
- `packages/core/src/links.ts` — M2-R6. Explorer links derived from an
  operation's actual network and identifiers, over the base URLs already in
  `contracts/src/chains.ts`. Also `accountExplorerLink` (re-cut 2026-08-09): a
  wallet address is identity, not operation evidence, so it links its EVM
  address without an `EvidenceKind`; the XRP Ledger identity carries no chain id
  and stays copy-only rather than linking to a guessed ledger.
- `packages/core/src/mock-portfolio.ts` — M2-AC1. Labelled mock portfolio and
  activity, the only producer of indexer, provider and cache observations
- `packages/core/scripts/live-portfolio.mjs` — M2-AC2 and M2-AC3 evidence
  against the funded Coston2 and XRPL Testnet accounts
- `packages/react/src/use-accounts.ts` — M2-R2 and M2-R3 as hooks
- `packages/react/src/use-portfolio.ts` — M2-R4 as a hook
- `packages/react/src/use-activity.ts` — M2-R5 and SH-10 as hooks
- `packages/react-ui/src/AccountSheet.tsx` — SH-02, replacing `ConnectButton`
- `packages/react-ui/src/ConnectModal.tsx` — the re-cut wallet picker
  (2026-08-09). Presentational and wallet-agnostic: the host owns the
  connection and passes the discovered wallets (each with its own EIP-6963
  icon); the modal renders the choice with real wallet + network marks and
  calls back on selection, so the kit still never claims custody it lacks
- `packages/react-ui/src/NetworkResolutionSheet.tsx` — SH-03, where wrong
  network and wrong account are repaired
- `packages/react-ui/src/PortfolioTable.tsx` — USER-01
- `packages/react-ui/src/ActivityTable.tsx` — USER-02
- `packages/react-ui/src/SourceDrawer.tsx` — USER-03
- `packages/react-ui/src/PendingTray.tsx` — SH-10
- `packages/react-ui/src/primitives/SourceChip.tsx` — one anatomy for source
  class and freshness everywhere it appears
- `packages/react-ui/src/primitives/DataTable.tsx` — the shared table shell the
  portfolio and activity surfaces both use; built once, per the reuse rule
- `packages/react-ui/src/data.css` — the table, source-chip, unbuilt, tray and
  drawer CSS: values and where they came from
- `packages/react-ui/src/accounts.css` — the `AccountSheet` and
  `NetworkResolutionSheet` CSS: identity and authority. Split from `data.css`
  because one file for both ran past the line cap and the two vocabularies
  share nothing
- `packages/contracts/src/funding.ts` — the address of the funder-held faucet
  service (`apps/funding-api`, still unbuilt): production host, local host and
  the dev port, fixed now so the service and its callers cannot each invent
  their own. Carries `deployed: false`; nothing may render it as a live link
  until that flips
- `packages/*/test/**` — the checks for each of the above
- `packages/react-ui/gallery/**` — a dev-only state gallery rendering every
  required state of every M2 surface, so CLAUDE.md's "drive it in a browser,
  screenshot it, and look at the screenshot" can be met before `apps/app`
  exists. Not published (excluded from `files`), not a product surface, and
  **not** DEV-06: the shipped widget playground is still a later milestone.
  Abu chose this over bringing `apps/app` forward, 2026-08-04

`Portfolio` is read through its own fields. `coverageOf(portfolio, family)` and
`holdingsFor(portfolio, family)` were removed after the M2 simplifier pass found
neither had a production caller — `PortfolioTable` reads `portfolio.coverage.evm`
directly, and a filter by family is one expression. Accessors over a public
readonly field are API surface a published package has to keep working, bought
for nothing.

Counted copy is pluralised, never templated over a bare number. The M2 browser
pass found `PendingTray` rendering "1 need you"; a count in a sentence needs
both forms written out. Recorded here because it is a rule for every future
surface, not a one-off fix.

M2-AC4 was clarified on 2026-08-04 after review found `isPortfolioEmpty`
reporting `no assets` for an account whose XRPL source never answered: "no
assets" is a confident claim, so it requires full coverage. See the M2 spec's
acceptance criteria.

The same review found `coverageFor` reporting `covered` when one of a family's
two reads failed. `Coverage` therefore gains a fourth value, `partial`: a Flare
identity has both a native and an FAsset balance, and one of them being
unreadable is neither full coverage nor total silence.

It also found `PendingOperation` carrying no source, inconsistent with M2-R1's
"every portfolio and activity value is one [Observation]" and leaving SH-10's
required `degraded source` state with no field to render. It now carries an
`ObservationSource` of class `local`, as `ActivityEntry` already did.

**M3 — FDC surfaces, generic across families.** Requirements and acceptance for
the files below live in `.thoughts/specs/2026-08-04-m3-fdc-surfaces.md`; scope is
governed by `.thoughts/decisions/2026-08-04-m3-scope-fdc-only.md`. Listed here
because this section is the repository-wide manifest the scope guard reads, not
because M1's scope grew. (Flat, like M2: the guard's `## Files` section ends at
the next heading of any depth.)

- `packages/contracts/src/fdc/protocol.ts` — M3-R1. `FDC_PROTOCOL_ID`,
  `attestationName`, `votingRoundIdAt`, `XRPL_REQUIRED_CONFIRMATIONS`, migrated
  out of `packages/contracts/src/fdc.ts`
- `packages/contracts/src/fdc/families.ts` — M3-R3, M3-R4, M3-R6. The family
  *type contract*: status vocabulary, source shape, and the pure `claimedStatus`
  / `sourceFor` helpers that take a row as an argument
- `packages/contracts/src/fdc/family-table.ts` — M3-R3, M3-R4, M3-R6. The ten
  rows themselves: name, verifier group per network, source ids, status, the
  response fields that must decode as `BigInt`, which of them are amounts and in
  what unit, and **`hasDeployedConsumer`**. That last one is a boolean rather
  than a phrase in `consumer`, because a surface decides whether to offer
  consumption at all from it. Corrected 2026-08-04: FAssets consumes **all seven
  chain families** on the AssetManager diamond — including
  `XRPPaymentNonexistence`, verified live on the deployed Coston2 AssetManager
  (`redeemWithTagSupported()` is true and selector `0xafe4226a`,
  `xrpRedemptionPaymentDefault`, is registered). Only `EVMTransaction` and
  `Web2Json` have no deployed consumer, and for those the consumer is the
  integrator's own contract by design. Split from `families.ts` because
  the two go stale on different clocks — the type contract never does, and the
  table is a dated claim the catalogue exists to re-check. Keeping them together
  put the file at 274 lines
- `packages/contracts/src/fdc/urls.ts` — M3-R5. `prepareRequestUrl(base, group,
  type)`, `proofByRequestRoundUrl`, `apiDocJsonUrl`. Replaces the current
  `prepareRequestUrl`, which hardcodes `/verifier/xrp/XRPPayment/`
- `packages/contracts/src/fdc/abi.ts` — `fdcHubAbi`, `relayAbi`,
  `flareSystemsManagerAbi`, and `fdcVerificationAbi` extended to four families
- `packages/contracts/src/fdc.ts` — **deleted in M3**, split into the directory
  above; nine families in one file cannot stay under 300 lines
- `packages/core/src/fdc/family.ts` — M3-R5. The
  `AttestationFamily<TRequest, TResponse>` contract each family module implements
- `packages/core/src/fdc/client.ts` — M3-R1. The one generic request state
  machine: prepare, retrieve, verify. `PreparedRequest` carries the request
  bytes **and their `keccak256`**, which M3-R7 asks for — 960 bytes of hex is not
  something a person can compare across two screens. It is the type the UI
  imports; a surface must never redeclare its own copy of this shape
- `packages/core/src/fdc/round.ts` — M3-R7. Round derivation and
  `Relay.isFinalized` polling
- `packages/core/src/fdc/fee.ts` — M3-R7. `getRequestFee` against the full
  request bytes; measured at 1000 wei and read rather than assumed
- `packages/core/src/fdc/catalogue.ts` — M3-R3. Live verifier OpenAPI compared
  to the constant table; agreement, disagreement and unreachable are distinct
- `packages/core/src/fdc/operation.ts` — **new in M3**, M3-R7 and M3-R8. The
  attestation operation record over core's existing `OperationRecord`: the six
  steps, the evidence M3-R7 enumerates, `reconcileAttestation`, and the
  pre-execution validation of proof owner, network, source and replay. Its own
  file because it is the analogue of `fassets/direct-mint.ts` — the lifecycle
  around the client, not the client — and `useAttestation` cannot be
  non-blocking and self-reconciling without a record to reconcile
- `packages/core/src/fdc/execution-gate.ts` — **new in M3**, M3-R8. The
  pre-execution refusals: proof owner, network, source and replay. Split from
  `operation.ts`, which reached 306 lines carrying both; it is a gate on a proof,
  not part of the record's lifecycle, and an agent calls it without ever holding
  an operation
- `packages/core/src/fdc/families/xrp-payment.ts` — M3-R2. Migrated from
  `packages/core/src/fdc.ts`, including `toProofStruct`
- `packages/core/src/fdc/families/evm-transaction.ts` — M3-R5, M3-AC3. Group
  `flr`, sourceId `testFLR`; the vendored guides say `eth`, which is wrong for
  Coston2
- `packages/core/src/fdc/families/web2-json.ts` — M3-R5, M3-R10. User-supplied
  `abiSignature`; nondeterminism surfaces as unknown, never as failure
- `packages/core/src/fdc/families/xrp-payment-nonexistence.ts` — M3-R5, M3-R6.
  The documented `uint64`-max sentinel producer
- `packages/core/src/fdc.ts` — **deleted in M3**, migrated into the directory
  above. M1's XRPPayment shape does not survive beside its own generalisation
- `packages/core/src/fassets/flare-kit.ts` — **modified in M3**, constructs the
  generic client bound to the XRPPayment family module
- `packages/core/src/fassets/read-chain-state.ts` — **modified in M3**, retrieves
  and re-encodes the proof through that family module.
  These two, not `direct-mint.ts`, are M3-R2's real consumers: `direct-mint.ts`
  is pure state-machine code and imports nothing from `fdc.ts`. The requirement
  is unchanged — M1's mint behaviour must be identical from the caller's side —
  only the file the spec named was wrong
- `packages/core/src/mock-fdc.ts` — **new in M3**, the labelled catalogue and
  attestation fixtures for states no live run reaches on demand: consensus
  failure, round timeout, catalogue disagreement and unreachability, a false
  verification, and a proof carrying the `uint64`-max sentinel the live run did
  not produce. Its own file because `mock.ts` is already 291 lines, following
  `mock-redeem.ts` / `mock-portfolio.ts` / `mock-config.ts`
- `packages/core/src/mock.ts` — **modified in M3**, re-exports the above
- `packages/react/src/useAttestationFamilies.ts` — M3-R3. The catalogue, its
  comparison outcome and its provenance
- `packages/react/src/useAttestation.ts` — M3-R1. Prepare, submit, round, proof,
  verify as one non-blocking operation
- `packages/react-ui/src/AttestationCatalogue.tsx` — FDC-01
- `packages/react-ui/src/AttestationRequestBuilder.tsx` — FDC-02
- `packages/react-ui/src/AttestationTimeline.tsx` — FDC-03, composing the
  existing `OperationTimeline` spine rather than restating it
- `packages/react-ui/src/ProofDetail.tsx` — FDC-04
- `packages/react-ui/src/ProofHandoff.tsx` — **new**, FDC-04. What a developer
  needs to take a verified proof into their own contract: the ABI-ready struct as
  a paste-able TypeScript literal with `bigint` suffixes, the Solidity type, and
  the verification call. Exists because
  `.thoughts/decisions/2026-08-04-no-first-party-proof-consumer.md` rules out a
  demo consumer — without it, verifier-only reads as a cul-de-sac rather than as
  the last step this kit owns
- `packages/react-ui/src/primitives/CodeWindow.tsx` — **new**. The code window
  DESIGN.md > Components already specifies: `rounded.lg` frame, `surface` title
  bar with a mono filename, copy control, horizontal scroll in its own container.
  A primitive because the moment two surfaces render code the two will drift
- `packages/react-ui/src/fdc.css` — rules for any new icon or state, which
  `css-integrity.test.ts` already enforces. Flat in `src/`, not `src/styles/`:
  every other stylesheet in the package sits there and is `@import`ed by
  `styles.css`, and one file in a directory of its own would be the only one
- `packages/contracts/test/fdc-families.test.ts` — the table re-derived against
  the live verifier OpenAPI
- `packages/core/test/fdc-fixtures.ts` — the shared FDC test fixtures: services,
  sources, and one full data-availability proof body carrying the `uint64`
  sentinel. Not a test file. Three test files assert against it, and three copies
  would be three chances for one to be quietly corrected into passing
- `packages/core/test/fdc-client.test.ts` — the generic lifecycle over a fake
  transport. Replaces `packages/core/test/fdc.test.ts`, **deleted in M3**, whose
  every assertion is carried forward here
- `packages/core/test/fdc-bigint.test.ts` — M3-AC5. `uint64` max survives a round
  trip byte-identical
- `packages/core/test/fdc-catalogue.test.ts` — agreement, disagreement and
  unreachable as three outcomes
- `packages/react-ui/test/fdc-shapes.tsx` — the shared shape signature and
  fixtures the two FDC surface tests assert against. Not a test file
- `packages/react-ui/test/fdc-surfaces.test.tsx` — FDC-01 and FDC-02 required
  states, inheriting the rule that states differ by more than colour
- `packages/react-ui/test/fdc-proof-surfaces.test.tsx` — FDC-03 and FDC-04
  required states. Split from the above, which reached 415 lines carrying all
  four surfaces
- `packages/react-ui/test/proof-handoff.test.tsx` — the handoff snippet. Its one
  way of being subtly useless is emitting integers a reader would paste back as
  `number`, so the `bigint` suffix and the `uint8` narrowing are both pinned
- `packages/core/scripts/live-fdc-run.mjs` — M3-R11. The live Coston2 evidence
  run for all four families. `.mjs`, not `.ts`: `tsx` is not installed anywhere
  in the workspace, and `eslint.config.js` scopes the `process`/`console` globals
  and the `process.env` opt-out to `packages/*/scripts/**/*.mjs`, so a `.ts`
  script would fail lint. All four existing evidence scripts are `.mjs`
- `.thoughts/specs/2026-08-04-m3-fdc-surfaces.md`,
  `.thoughts/decisions/2026-08-04-m3-scope-fdc-only.md`,
  `.thoughts/verification/2026-08-04-coston2-live-fdc.md` — M3's spec, its scope
  decision and the evidence the live run writes. Listed because the guard reads
  this section for every path, including harness artifacts
- `.thoughts/decisions/2026-08-04-no-first-party-proof-consumer.md` — Abu's
  decision that verifier-only is the permanent end state for `EVMTransaction` and
  `Web2Json`, and that this project never ships a demo consumer contract. It
  closes what was a spec inference, and it is why `ProofHandoff` exists instead
- `.thoughts/handoffs/2026-08-04-m3-complete-m4-ready.md` — M3's closing handoff
  and the state a fresh session reads before M4. It carries the M3 design
  audit's declared-unbuilt list, which is work M4 inherits rather than work that
  was skipped
- `.thoughts/verification/2026-08-04-m3-fdc-surfaces.md` and
  `.thoughts/verification/m3-screens/**` — M3-AC9. The browser run of the four
  surfaces and its screenshots. A separate record from the live chain run
  because they establish different things: the chain run cannot prove a state
  renders, and the browser run cannot prove a verifier route is right

**M4 — FTSO surfaces, and the debts cleared.** Requirements and acceptance for
these live in `.thoughts/specs/2026-08-04-m4-ftso-surfaces.md`, not here.

- `packages/contracts/src/ftso/addresses.ts` — the FTSO members of
  `NetworkRegistry` on both networks. `randomNumberV2` is deliberately absent:
  the registry lists that name at the Relay's own address, and a second field
  holding the same value is a drift waiting to happen
- `packages/contracts/src/ftso/abis.ts` — `FtsoV2Interface`, the protocol's own
  facade, from the vendored interface artifact. Never from `FtsoV2` itself,
  which is an ERC1967 proxy whose published ABI is seven entries
- `packages/contracts/src/ftso/support-abis.ts` — **split from `abis.ts` in
  M4**, which reached 296 lines in one file. The seam is that `FtsoV2` is the
  one facade a caller talks to and these are what it delegates to or sits
  beside: `FeeCalculator`, `FtsoFeedDecimals`, `FtsoFeedIdConverter`, and the
  Relay's `getRandomNumber` / `merkleRoots`
- `packages/contracts/src/ftso/fast-update-abis.ts` — **split from `abis.ts` in
  M4.** `FastUpdater`, `FastUpdatesConfiguration` and
  `FastUpdateIncentiveManager` are a different protocol surface from the
  anchor/scaling path — different contracts, different cadence, and the only
  part of M4 that spends money
- `packages/contracts/src/ftso/feed-id.ts` — the `bytes21` codec. Category byte
  ++ ASCII name, right-zero-padded — including custom feeds at `0x21`, which the
  developer-hub guide wrongly documents as `0x21 + keccak256(name)`
- `packages/contracts/src/ftso/urls.ts` — the anchor-feed DA URL builder. A
  separate file from `fdc/urls.ts` rather than a parameter on it: different API
  version (`v0` against `v1`), different route, and the voting round travels in
  the query string instead of the body
- `packages/contracts/src/ftso/protocol.ts` — `FTSO_PROTOCOL_ID = 100`, beside
  FDC's 200. Both roots are published on the same Relay for the same rounds
- `packages/core/src/voting-round.ts` — **new in M4**, M4-R4. The
  protocol-generic half of `fdc/round.ts`, extracted because FTSO finalizes on
  the same Relay under a different protocol id. `isRoundFinalized` takes that id
  rather than hardcoding FDC's
- `packages/core/src/fdc/round.ts` — **reduced in M4.** Keeps
  `roundForSubmission` and `awaitRoundFinality`, which derive a round from the
  block that carried a submission and have no FTSO analogue — FTSO has no
  request. The shared half is deleted here, not duplicated
- `packages/core/src/ftso/feeds.ts` — M4-R1. Block-latency reads and
  enumeration through `getSupportedFeedIds()`. Not `getFeedIds()`, which returns
  64 entries including an unused zero-id slot at index 52. **It also resolves
  renames, which review found is not optional**: `getFeedsById` silently maps a
  retired id to its current feed — `[MATIC/USD, POL/USD]` returns `74335` for
  both on Coston2 — so labelling a reading with the id the caller supplied would
  print POL/USD's price under the name `MATIC/USD`. It carries `requestedFeedId`
  and `formerName` instead. And a paid read takes an `account`: a call carrying
  `value` with no `from` runs as `0x0`, which has no balance
- `packages/core/src/ftso/fee.ts` — M4-R2. Every read is `payable` and quotes
  `calculateFeeByIds`. Zero is measured, never assumed:
  `fetchAllCurrentFeeds()` already costs 1 wei today because the unused slot has
  no category fee and falls through to `defaultFee()`
- `packages/core/src/ftso/anchor.ts` — M4-R3. The DA client. Checks array length
  and per-feed presence, not just status: an unknown feed id returns `200 []`
  while only a missing round returns 400.
  Returns **`Observation<AnchorFeedsResult>`**, not a bare result — M4-R9, closed
  in P8 after the P7 audit found this path carried no provenance and three
  surfaces hand-wrote it as prose instead. The source class is `provider`, not
  `chain`: the host serves the leaves and the Relay publishes the root they hash
  to, so a retrieved proof is a provider's claim until `verifyFeedData` accepts
  it
- `packages/core/src/ftso/verify.ts` — M4-R3. `verifyFeedData` and a three-valued
  result. It **reverts** on a bad proof where `FdcVerification` returns `false`,
  so a shared boolean would turn "could not check" into "not proven"
- `packages/core/src/ftso/history.ts` — M4-R5. Range queries and the
  committed-on-chain-but-unretrievable state: the Relay root outlives the DA's
  ~297-day leaf retention.
  Returns **`Observation<FeedHistory>`** for the same M4-R9 reason as
  `anchor.ts`, and it is what makes FTSO-02's required `stale` reachable for the
  history at all — without an `observedAt` nothing could age a table of rounds
  read hours ago
- `packages/core/src/ftso/random.ts` — M4-R6. Current and historical reads from
  `RandomNumberV2`, which is the Relay, plus the `requireSecure` refusal
- `packages/core/src/ftso/incentive.ts` — M4-R7. Quotation for the specific
  offer. **The price is `rangeIncrease * rangeIncreasePrice / (getPrecision() *
  64)`**, fitted by bisecting `offerIncentive` against the live contract at four
  different increases and matching the minimum accepted amount exactly at all
  four. Pricing against `getRange()` — the obvious reading — overstates by about
  5,500x, which a unit test written against the same wrong formula cannot catch.
  Because the divisor is fitted rather than derived from Solidity this repo does
  not vendor, `verifyOfferAmount` dry-runs the real call before anything is
  signed
- `packages/core/src/ftso/incentive-effect.ts` — **split from `incentive.ts` in
  M4** at the seam between pricing an offer and confirming one: quoting reads
  current state to decide what to send, confirming reads historical state at a
  fixed block to establish what happened. Confirmation is pinned to the
  transaction's own block — the effect decays, so a later read shows nothing and
  must never read as a failed offer
- `packages/core/src/ftso/custom-feeds.ts` — M4-R8. Read-only. Coston2's set is
  empty and creation is Flare Foundation governance
- `packages/core/src/ftso/catalogue.ts` — M4-R1. The catalogue model, including
  the four renamed feeds `getFeedIdChanges()` reports, shown as one feed each
- `packages/core/src/mock-ftso.ts` — written after the live path, reproducing
  observed behaviour, per the real-integration-first decision
- `packages/core/scripts/live-ftso-report.mjs` — **new in M4-P8.** Writes M4-R11's
  evidence file. Split from the run script so the probes stay readable and so
  nothing in the writer can reach the network: a report able to re-query could
  record something the run never observed
- `packages/core/scripts/live-ftso-submit.mjs` — **new in M4-P8.** The one FTSO
  call that spends. Its own module, imported lazily and only under
  `--submit-incentive`, so the whole spending surface is on one screen and a
  read-only run never loads the signing key. Written, never executed
- `packages/core/scripts/live-ftso-run.mjs` — M4-R11. `.mjs` for the same reason
  every other evidence script is
- `packages/react/src/useFeeds.ts`, `useFeedHistory.ts`, `useAnchorProof.ts`,
  `useSecureRandom.ts`, `useIncentiveOffer.ts`, `useCustomFeeds.ts` — the six
  hooks FTSO-01…06 consume
- `packages/react/src/use-observed-read.ts` — **new in M4.** All six hooks above
  are the same shape: run a read, hold the result, keep showing it while the
  next read is in flight, never let a failed read become an empty result.
  Written once rather than six times, because six copies is six chances for one
  of them to start rendering a failure as an absence
- `packages/react-ui/src/FeedCatalogue.tsx`, `FeedDetail.tsx`,
  `FeedHistoryTable.tsx`, `ScalingProofDetail.tsx`, `SecureRandomPanel.tsx`,
  `IncentiveComposer.tsx`, `CustomFeedReview.tsx` — FTSO-01…06.
  `FeedHistoryTable` is split from `FeedDetail` to stay under the line cap and
  because the retention states carry real logic of their own
- `packages/react-ui/src/FeedCatalogueRow.tsx` — **split from `FeedCatalogue.tsx`
  in M4-P7** at 291 lines. The row carries the two judgements a reader acts on —
  what class of feed this is and whether it answered — while the surface carries
  provenance and the sentences a table cannot say in a cell
- `packages/react-ui/src/IncentiveEffectPanel.tsx` — **split from
  `IncentiveComposer.tsx` in M4-P7** on the same seam core already split on:
  quoting reads current state to decide what to send, confirming reads historical
  state at a fixed block to establish what happened
- `packages/react-ui/src/ftso-visuals.ts` — **new in M4-P7.** The FTSO half of
  what `state-visuals.ts` is for the operation lifecycle: one table mapping trust
  class, feed availability, proof availability, verification outcome and history
  status to a tone, a glyph and a word. Four surfaces render these, and separate
  copies are how `could not check` starts reading as a failure on one screen and
  an unknown on another.
  `FeedAvailability` has **four** members, not three. `not_answered` was added
  by the P7 audit and is load-bearing: a values read that was attempted and
  failed previously rendered as `not_read`, whose stated meaning is that nobody
  asked and nothing is claimed either way — an observed failure shown as an
  absence of observation, on a screen whose own note said the read had failed.
  The two are distinct words, distinct tones and distinct rows
- `packages/react-ui/src/ftso.css` — beside `fdc.css`, `data.css` and
  `accounts.css`, where every stylesheet lives
- `packages/core/src/evidence.ts` — `ftso_round` and `ftso_proof` added to
  `EvidenceKind`, with `links.ts` carrying their no-explorer reasons. FTSO
  scaling and the Data Connector settle on the same Relay under protocol ids 100
  and 200 and finalize independently, so labelling an anchor-feed proof
  `fdc_proof` would name the wrong protocol on a value about to be verified
- `packages/react-ui/src/ProofDetail.tsx` — **split in M4**, M4-R14. It is 328
  lines, already over the cap, and M4-R14 adds FDC-04's `expired` state to it.
  The proof body, the verification result and the consumption block separate
  cleanly
- `packages/contracts/src/fdc/family-table.ts` — M4-R14's source-aware asset for
  an `EVMTransaction` `value`. In `contracts`, not `core`: `core/src/fdc/family.ts`
  is the type contract, and the table itself has always lived here
- `packages/react-ui/test/accessibility.test.tsx` — M4-R12, extended from M1–M3's
  surfaces to all of them, and read against computed styles rather than markup
- `.thoughts/specs/2026-08-04-m4-ftso-surfaces.md` — M4's spec, and the record of
  the live probe that contradicts the vendored docs in seven places
- `.thoughts/verification/2026-08-04-coston2-live-ftso.md`,
  `.thoughts/verification/2026-08-04-m4-ftso-surfaces.md` and
  `.thoughts/verification/m4-screens/**` — the chain run, the browser run and its
  screenshots, kept separate for the reason M3's are
- `packages/core/src/liquidity-quote.ts` — M6-R3. Pool reserves + LP supply → the
  ratio-locked add quote (paired amount, expected LP, pool share), the per-asset
  remove quote, and the live position read; minimums from slippage. Split from the
  operation at the quote/execute seam, as `swap-quote.ts` is.
- `packages/core/src/liquidity.ts` — M6-R2. The add/remove operation: immutable
  intents, the unsigned plans (approve-when-short + addLiquidity/removeLiquidity
  with amountAMin/amountBMin), and the canonical-state transitions, reusing the M1
  lifecycle engine.
- `packages/core/src/mock-liquidity.ts` — M6-R5. The mock reader, written after the
  real path, reproducing observed reserves, LP math and failure shapes.
- `packages/core/scripts/probe-liquidity.mjs` — a read-only probe (no key) of the
  FXRP/USD₮0 pool's reserves, token0 and LP totalSupply, recorded as the fixtures
  the quote tests use.
- `packages/core/scripts/live-liquidity.mjs` — the M6-AC1 evidence run: a real
  add→remove round trip on Coston2 through the kit, signing with a dev key.
- `packages/react-ui/src/AddLiquidityCard.tsx`, `packages/react-ui/src/add-liquidity-state.ts`
  — M6-R6. Two ratio-locked supply legs, pool share, the risk statement, and the
  approve(s)→add steps on the operation spine.
- `packages/react-ui/src/PositionCard.tsx`, `packages/react-ui/src/position-card-state.ts`
  — M6-R7. The live LP-balance position, current composition, partial removal by
  percent, and the LP-approve→remove steps on the spine.
- `packages/react-ui/src/primitives/PercentPills.tsx` — M6-R9, the partial-removal
  control, built once if no existing primitive covers it.
- `packages/react-ui/src/liquidity.css` — the liquidity surfaces' CSS, values from
  tokens.
- `.thoughts/verification/2026-08-11-m6-liquidity.md` — the M6 evidence: the live
  add→remove round trip's hashes, balances and explorer links, and the browser run.
- `packages/react-ui/src/PoolCatalogue.tsx` — M6-R10, LIQ-04. The pool catalogue as
  a declared-unbuilt surface: present, disabled and reasoned (one live Coston2 pool
  today; a multi-pool, multi-venue catalogue is a later milestone), never faked and
  never silently omitted — the DESIGN.md precedent for a surface that cannot honestly act.
- `packages/contracts/src/vaults.ts` — M7-R1. The network-keyed ERC-4626 vault
  registry: per network, each vault's address, protocol (`firelight`|`upshift`),
  asset key, share-token identity (self vs separate LP address) and a
  `withdrawVerified` flag (Coston2 true after the M7 live run; unverified networks
  false). Addresses grounded by the M7 probe
  (`.thoughts/verification/2026-08-11-m7-vault-probe.json`). No vault address
  hardcoded elsewhere.
- `packages/contracts/src/vault-abis.ts` — M7-R1. The two vault ABIs (Firelight
  self-share + period; Upshift `ITokenizedVault` separate-LP + lag/calendar-epoch
  + instant), split from `abis.ts` to stay under 300 lines.
- `packages/core/src/vault.ts` — M7-R2/R3. Deposit + withdraw operations: immutable
  intents → adapter dispatch → unsigned plan → execution → canonical states, the
  durable request→wait→claim lifecycle self-reconciling against the chain, reusing
  the M1 lifecycle engine and walking the states table.
- `packages/core/src/vault-adapter.ts` — M7-R2. The `VaultAdapter` interface and
  the Firelight / Upshift adapters (per-vault ABI + withdraw model behind one
  lifecycle) — the shared thing is the lifecycle, not one ABI.
- `packages/core/src/vault-quote.ts` — M7-R4. Live rate/preview → expected
  shares/assets net of the route's fee, minimums from slippage, the position read;
  split at the quote/execute seam as `swap-quote.ts`/`swap.ts` are.
- `packages/core/src/mock-vault.ts` — M7-R6. The mock reader, written after the real
  path, reproducing observed rates, both withdraw models, fees/cap/pause and
  failure shapes; refuses anything it never observed.
- `packages/core/scripts/live-vault.mjs` — the M7-AC1 evidence run: a real deposit→
  withdraw-request→claim round trip on Coston2 for both vaults (two-phase across the
  1-day period/lag), plus Upshift instant once, signing with a dev key.
- `packages/react-ui/src/VaultCatalogue.tsx`, `packages/react-ui/src/vault-catalogue-state.ts`
  — M7-R7, LIQ-01. The configured vaults for the active network with live
  rate/fee/mode/pause/cap reads; a not-`withdrawVerified` vault shows reads but a
  declared-unbuilt withdraw affordance.
- `packages/react-ui/src/DepositCard.tsx`, `packages/react-ui/src/deposit-card-state.ts`
  — M7-R8, LIQ-02. The deposit/receive legs, expected shares at the live rate, the
  exact minimum, and the approve(s)→deposit steps on the operation spine.
- `packages/react-ui/src/WithdrawCard.tsx`, `packages/react-ui/src/withdraw-card-state.ts`
  — M7-R9, LIQ-03. The live share-balance position, partial withdrawal by percent,
  the instant/delayed route choice with real fees, and the durable request→wait
  (live countdown)→claimable→claim timeline on the spine.
- `packages/react-ui/src/primitives/Countdown.tsx` — M7-R9, the live-countdown
  primitive for the durable withdraw timeline, built once if no existing primitive
  covers it.
- `packages/react-ui/src/vault.css` — the vault surfaces' CSS, values from tokens.
- `packages/react-ui/gallery/m7-vault-sections.tsx` — the M7-AC5 state matrix in
  both themes.
- `.thoughts/verification/2026-08-11-m7-vaults.md` — the M7 evidence: the live
  deposit→withdraw→claim round trip's hashes, balances and explorer links (both
  vaults, both phases), and the browser run.
- `packages/contracts/src/bridge.ts` — M8-R1. The network-keyed cross-chain route
  registry: per route (source network → destination), the source OFT adapter, the
  `dstEid`, the destination peer OFT (for delivery reads), the composer, per-route
  executor/compose gas, the FXRP asset key, and a `bridgeVerified` flag (Coston2 →
  Sepolia true after the M8 live run; unverified routes false). No address, EID or
  gas constant hardcoded outside this registry.
- `packages/contracts/src/bridge-abis.ts` — M8-R1. The IOFT adapter ABI (`token`,
  `quoteOFT`, `quoteSend`, `send`, `OFTSent`), the destination-OFT read ABI
  (`balanceOf`, `decimals`, `OFTReceived`), and the FAssetRedeemComposer fragments,
  split from `abis.ts` to stay under 300 lines.
- `packages/core/src/bridge-adapter.ts` — M8-R2. The `CrossChainAdapter` over a
  source and a destination viem client — one lifecycle, two chains; `BridgeReads` /
  `BridgeWrites`, `makeBridgeAdapter`, and `buildSendParam`.
- `packages/core/src/bridge-options.ts` — M8-R2. The type-3 executor/compose option
  encoder (the one place options are encoded), split off if the adapter exceeds 300
  lines; byte-identical to the LayerZero utilities fixture.
- `packages/core/src/bridge-quote.ts` — M8-R4/R3. `quoteSend`/`quoteOFT` → real
  `nativeFee`, dust-adjusted `amountReceivedLD`, and the protected minimum from
  slippage; honest unknowns render `—`, never `0`.
- `packages/core/src/bridge-delivery.ts` — M8-R3. The destination-read delivery
  reconciler (split off from `bridge-quote.ts`/`bridge.ts` if either exceeds 300
  lines): delivery truth is a destination-chain read by `guid`, never a source
  receipt, never a failure inferred from absence.
- `packages/core/src/bridge.ts` — M8-R2/R3. Bridge + redeem operations: immutable
  intents → adapter dispatch → unsigned plan → execution → canonical states, the
  durable submit→await-delivery→delivered lifecycle self-reconciling against the
  destination chain, reusing the M1 lifecycle engine and walking the states table.
- `packages/core/src/bridge-states.ts` — M8-R3. The pure cross-chain state map /
  transition-table extension, split off if `bridge.ts` exceeds 300 lines.
- `packages/core/src/mock-bridge.ts` — M8-R6. The mock reader, written after the real
  path, reproducing the observed fee shape, `amountReceivedLD`/dust behaviour, the
  two-leg redeem lifecycle and the failure shapes; refuses anything it never observed.
- `packages/core/scripts/probe-bridge.mjs` — a read-only probe (no key) of the OFT
  adapter's `token`/`peers`/`sharedDecimals`, a `quoteSend`/`quoteOFT` for 1 FXRP,
  and funding on Coston2 + Sepolia + XRPL, recorded before any build.
- `packages/core/scripts/live-bridge.mjs` — the M8-AC1 evidence run: a real bridge
  Coston2 → Sepolia with a destination-confirmed delivery, then the compose-redeem
  Sepolia → Coston2 → native XRP on XRPL, signing with a dev key.
- `packages/react/src/use-bridge.ts` — M8-R8. The `useBridge` hook over the operation
  (read/quote need no key; `send` goes out via the host's `onSubmit`), with the live
  delivery state polled on a host-controlled interval.
- `packages/react-ui/src/RouteCatalogue.tsx`, `packages/react-ui/src/route-catalogue-state.ts`
  — M8-R7. The configured cross-chain routes for the active network with, per route,
  the source/destination chains, the primitive, the live `nativeFee` and the verified
  state; a not-`bridgeVerified` route shows its config but a declared-unbuilt bridge
  affordance.
- `packages/react-ui/src/BridgeCard.tsx`, `packages/react-ui/src/bridge-card-state.ts`
  — M8-R8/R9. The you-send/you-receive legs, the real `quoteSend` fee and exact
  minimum, the approve(s)→send steps, and the durable delivery timeline
  (submitted → awaiting-delivery → delivered), source-network aware for the
  deliver-as-native-XRP redeem route (delivered → awaiting-redemption → redeemed).
- `packages/react-ui/src/bridge.css` — the cross-chain surfaces' CSS, values from
  tokens.
- `packages/react-ui/gallery/m8-bridge-sections.tsx` — the M8-AC5 state matrix in
  both themes.
- `.thoughts/verification/2026-08-11-m8-cross-chain.md` — the M8 evidence: the live
  bridge delivered and confirmed on Sepolia, the compose-redeem / XRPL settlement
  (staged if it spans the session), quote-vs-actual, and the browser run.
- `reference/contracts/contracts/GaslessPaymentForwarder.sol` — M9-R8. The gasless
  forwarder (nonces, `authorizedRelayers`, `executePayment`, EIP-712 domain
  `("GaslessPaymentForwarder","1")`), adapted from the documented example and deployed
  to Coston2; a Hardhat project, not a JS workspace member.
- `reference/contracts/contracts/MockUSDT0.sol` — M9-R7/R8. The demo ERC-20 with
  EIP-3009 `transferWithAuthorization` + a public `mint`, 6 decimals; the only EIP-3009
  substrate on Coston2, labelled a demo token everywhere it surfaces.
- `reference/contracts/contracts/X402Facilitator.sol` — M9-R6/R8. Verifies/settles
  EIP-3009 authorizations (`verifyPayment`, `settlePayment`) with supported-token config,
  adapted from the doc.
- `reference/contracts/scripts/deploy-gasless.ts`,
  `reference/contracts/scripts/deploy-x402.ts` — M9-R8. Deploy the three contracts,
  authorize the operator relayer, add MockUSDT0 as the facilitator's supported token,
  mint the demo balance, and record every address.
- `reference/contracts/hardhat.config.ts`, `reference/contracts/package.json`,
  `reference/contracts/tsconfig.json`, `reference/contracts/README.md` — the Hardhat
  project scaffold; the Coston2 network from the constant RPC + the dev key.
- `reference/contracts/deployments/coston2.json` — the recorded live-deploy addresses
  the `@flarekit-dev/contracts` registries read from; no address hardcoded elsewhere.
- `services/relayer/src/index.ts` (+ `services/relayer/src/relayer-execute.ts` split
  < 300 lines) — M9-R5. The fee-free gasless relayer (`GET /nonce/:addr`, `POST
  /execute`): recovers the signer via core's `recoverPaymentSigner`, validates
  balance/allowance/nonce/deadline, `staticCall`-simulates, submits `executePayment`
  with the operator key; imports the EIP-712 types from `@flarekit-dev/core` (no
  re-declaration); absorbs its own gas, adds no fee/quota, logs no key.
- `services/x402-server/src/index.ts` (+ `services/x402-server/src/x402-settle.ts`
  split < 300 lines) — M9-R6/R7. The single-endpoint x402 fixture (`GET /api/demo`):
  `402` with a demo-labelled requirement, then decode → `verifyPayment` →
  `settlePayment` → `X-Payment-Response` + an obviously-synthetic payload with no
  fabricated data; imports the EIP-3009 types from `@flarekit-dev/core`; `GET /health`
  reports config (addresses only, no key).
- `services/relayer/package.json`, `services/relayer/tsconfig.json`,
  `services/relayer/README.md`, `services/x402-server/package.json`,
  `services/x402-server/tsconfig.json`, `services/x402-server/README.md`,
  `services/*/vitest.config.ts` — the service manifests/config; `pnpm-workspace.yaml`
  gains the `services/*` glob (the services are workspace members; `reference/contracts`
  is not).
- `packages/contracts/src/gasless.ts` — M9-R1. The network-keyed gasless registry: the
  forwarder address, the resolved FXRP asset, the reference relayer base URL, and a
  `gaslessVerified` flag (Coston2 true only after the M9 live payment; unverified paths
  false). No forwarder/relayer address hardcoded outside this file.
- `packages/contracts/src/gasless-abis.ts` — M9-R1. The `FORWARDER_ABI` (`fxrp`,
  `getNonce`, `executePayment`, `PaymentExecuted`) plus the FXRP ERC-20 fragments, split
  from `abis.ts` to stay under 300 lines.
- `packages/contracts/src/x402.ts` — M9-R1/R7. The network-keyed x402 registry:
  MockUSDT0 (`demoToken: true`) + facilitator + payee addresses, the reference server
  URL and resource path, and an `x402Verified` flag (false until the M9 live settle).
  The demo-token label is registry data, never a hand-typed string that could drift.
- `packages/contracts/src/x402-abis.ts` — M9-R1. The `FACILITATOR_ABI` (`verifyPayment`,
  `settlePayment`) and `EIP3009_ABI` (`authorizationState`, `DOMAIN_SEPARATOR`,
  `transferWithAuthorization`) fragments, verified against the Task-2 contracts, split to
  stay under 300 lines.
- `packages/core/src/gasless-eip712.ts` — M9-R2. The canonical `PaymentRequest` EIP-712
  type + domain + sign/recover helpers (viem) — the single source of truth
  `services/relayer` imports, so the crypto cannot drift from the client.
- `packages/core/src/gasless-adapter.ts` — M9-R2. The forwarder/FXRP reads (nonce,
  balance, allowance, chunked ≤25-block `paymentSince` transfer read), the unsigned
  `approve(forwarder,·)` call, and the relay POST that never throws into the caller.
- `packages/core/src/gasless.ts` — M9-R2/R3. Intents → a `gaslessVerified`-gated plan
  (the approval step only when allowance is 0) → the lifecycle; refuses a plan on an
  unverified forwarder, a short balance, or an expired deadline.
- `packages/core/src/reconcile.ts` — M9-R13. The shared lifecycle reconcile helpers
  (`reconcileTo` table-walk, `waitSince`, `advance`) extracted from `bridge-states.ts`
  so the bridge, gasless and x402 reconcilers share one table-walking implementation
  (the `applyTransition` silent-drop hazard is handled in exactly one place).
- `packages/core/src/gasless-states.ts` — M9-R3. The gasless reconciler mapping the
  relay→transfer progression onto the canonical states (`awaiting_approval` / `executing`
  / `awaiting_external` actor `relayer` / `succeeded`); `succeeded` is entered only from
  the on-chain FXRP transfer read, walking the states table via `pathTo`, never from the
  relayer's HTTP 200. Split `gasless-approval.ts` off if it exceeds 300 lines.
- `packages/core/src/mock-gasless.ts` — M9-R9. The gasless mock, written after the live
  run, reproducing the observed nonce/allowance/relay-accept→confirmed and failure
  shapes; refuses anything it never observed.
- `packages/core/src/x402-eip3009.ts` — M9-R6. The canonical EIP-3009 authorization type
  + domain + sign (`{v,r,s}`) — the single source of truth `services/x402-server`
  imports.
- `packages/core/src/x402-client.ts` — M9-R6. Parses a `402` challenge (carrying
  `demoToken` + the expiry), encodes the `X-Payment` header, reads `X-Payment-Response`,
  and tracks settlement and resource delivery as two independent states.
- `packages/core/src/x402-states.ts` — M9-R6. The x402 reconciler mapping
  settlement≠resource onto the canonical states: `awaiting_external` (actor `provider`)
  → `succeeded` (settled + delivered) / `partially_succeeded` (settled, resource failed)
  / `failed` (rejected); never `succeeded` from the `402` alone. Split
  `x402-settlement.ts` off if it exceeds 300 lines.
- `packages/core/src/mock-x402.ts` — M9-R9. The x402 mock, written after the live run,
  reproducing the observed challenge/settlement/delivery and the settled-but-resource-
  failed split; refuses the unobserved.
- `packages/core/scripts/probe-gasless.mjs` — a read-only probe (no key) of the FXRP
  token (decimals/symbol/balance), the re-confirmed no-EIP-3009 facts, and the
  operator/payer funding, recorded before any build.
- `packages/core/scripts/live-gasless.mjs` — the M9-AC1/AC2 evidence run: the
  payer-gassed one-time approval, the drain to ~0 C2FLR, and the payer-0-gas relayed
  payment confirmed by the on-chain transfer read; flips `gaslessVerified` after it.
- `packages/core/scripts/live-x402.mjs` — the M9-AC3 evidence run: `402` → EIP-3009
  authorization → facilitator settlement (real tx + payment ID) → resource delivery,
  recorded as two independent facts; flips `x402Verified` after the confirmed settlement.
- `packages/react/src/use-gasless.ts` — M9-R14. The `useGasless` hook over the gasless op
  (reads/plan need no key; the approval and signed request go out via the host's
  `onSubmit`), polling `paymentSince` on a host-controlled interval and clearing a
  transient relay/read error.
- `packages/react/src/use-x402.ts` — M9-R14. The `useX402` hook over the x402 op (parse →
  sign → settle-and-fetch), returning the settlement and resource states independently.
- `packages/react-ui/src/GaslessCard.tsx`, `packages/react-ui/src/gasless-card-state.ts`
  — M9-R10. The composer (FXRP send leg via `SwapLeg`, relayer identity + reachability,
  the "relayer covers gas · no fee" line, USD₮0 shown unavailable-on-testnet with the
  EIP-3009 reason), the loud one-time approval review, and the `submitted →
  awaiting_external(relayer) → succeeded` timeline on the `OperationTimeline` spine; the
  pure state split reuses `card-chrome.ts`.
- `packages/react-ui/src/X402Card.tsx`, `packages/react-ui/src/x402-card-state.ts` —
  M9-R11. The challenge review (amount in MockUSDT0 with the demo-token label, payee,
  facilitator, network, expiry) and the outcome with settlement and resource delivery
  independently visible (`partially_succeeded` when the payment took but the resource did
  not, never `succeeded`); the pure state split reuses `card-chrome.ts`.
- `packages/react-ui/src/payments.css` — M9-R13. The `fk-gasless` / `fk-x402` classes,
  values from tokens only.
- `packages/react-ui/gallery/m9-gasless-sections.tsx`,
  `packages/react-ui/gallery/m9-x402-sections.tsx` — M9-AC6. Every required state driven
  from props at a fixed `MOCK_EPOCH`, both themes.
- `.thoughts/verification/2026-08-12-m9-gasless-payments.md` — the M9 evidence: the live
  gasless payment (payer 0-gas), the live x402 settle+resource, the demo-label/quote
  honesty, the browser run, and the a11y result.
- `packages/contracts/src/delegation.ts` — M10-R1. The WNat wrap/unwrap + IVPToken
  delegation registry, reusing the existing `wrappedNative` snapshot for WNat, with
  `delegationVerified` (false until the live round trip).
- `packages/contracts/src/delegation-abis.ts` — M10-R1. IWNat (`deposit`/`withdraw`/
  `balanceOf`) and IVPToken (`delegate`/`delegateExplicit`/`batchDelegate`/`undelegateAll`/
  `delegatesOf`/`votePowerOf`/`delegationModeOf`) fragments.
- `packages/contracts/src/rewards.ts` — M10-R1/R5. The RewardManager v2 + RNat +
  DistributionToDelegators registry with `rewardsVerified`, per-kind metadata, and the
  FTSO `proofSource.official:false` label for Coston2.
- `packages/contracts/src/rewards-abis.ts` — M10-R1. RewardManager / RNat /
  DistributionToDelegators / FlareSystemsManager fragments.
- `packages/core/src/delegation-adapter.ts` — M10-R2. Balances, delegate/vote-power
  reads, and the wrap/unwrap/delegate/undelegate `UnsignedCall` builders (no signing).
- `packages/core/src/delegation-states.ts` — M10-R3. The durable delegation lifecycle
  (`reconcileDelegation`); `succeeded` only from the on-chain `delegatesOf` read.
- `packages/core/src/delegation.ts` — M10-R2. Intents → verified-gated plan → lifecycle,
  enforcing ≤2 delegates / Σ bips ≤ 10000 / percentage-vs-explicit mode-exclusivity.
- `packages/core/src/mock-delegation.ts` — M10-R8. Copies the observed delegation shapes;
  refuses anything the live run never produced.
- `packages/core/src/rewards-adapter.ts` — M10-R4/R5. The three claim reads + call
  builders (Merkle-proof assembly + the `rewardsHash` signed-epoch gate).
- `packages/core/src/rewards-states.ts` — M10-R4. The three claim lifecycles
  (`reconcileClaim`); `succeeded` only from a confirmed on-chain read.
- `packages/core/src/rewards.ts` — M10-R4. Intents → verified-gated plans → the three
  distinct claim lifecycles, never collapsed into one generic claim.
- `packages/core/src/mock-rewards.ts` — M10-R8. Copies the observed reward reads; refuses
  the unobserved (including an un-run claim).
- `packages/core/scripts/probe-delegation.mjs` — M10 Verification. Dev, not shipped: the
  read-only resolve + account/funding probe against live Coston2.
- `packages/core/scripts/live-delegation.mjs` — M10 Verification. Dev, not shipped: the
  live wrap/delegate/undelegate/unwrap round trip + reward reads + `claim` subcommand
  (keys from `.secrets`, never logged).
- `packages/react/src/use-delegation.ts` — M10-R11. The delegate/balance poll hook over
  the delegation op.
- `packages/react/src/use-rewards.ts` — M10-R11. The claimable-reads + confirmation poll
  hook, each claim kind's state independent.
- `packages/react-ui/src/DelegationCard.tsx`, `packages/react-ui/src/delegation-card-state.ts`
  — M10-R9. The wrap/unwrap + delegate/undelegate composer, the state panel (mono face,
  `unavailable` never a confident zero), and the timeline on the `OperationTimeline` spine.
- `packages/react-ui/src/ClaimCard.tsx`, `packages/react-ui/src/claim-card-state.ts` —
  M10-R10. One shared claim component parameterised by kind; the three (FTSO / rNat /
  FlareDrop) rendered distinctly with honest empties.
- `packages/react-ui/src/delegation.css` — M10-R9/R10. The `fk-delegation` / `fk-claim`
  classes, values from tokens only, `@import`-ed into `styles.css`.
- `packages/react-ui/gallery/m10-delegation-sections.tsx`,
  `packages/react-ui/gallery/m10-claims-sections.tsx` — M10-AC6. Every required state
  driven from props at a fixed `MOCK_EPOCH`, both themes.
- `packages/contracts/src/staking.ts` — M11-R1. The `PChainStakeMirror` /
  `PChainStakeMirrorVerifier` / `ValidatorRewardManager` EVM registry (snapshotted from
  `FlareContractRegistry`) plus the Coston2 P-chain RPC/hrp (`costwo`) config, with
  `stakeVerified` (false until the confirming on-chain stake-position read).
- `packages/contracts/src/staking-abis.ts` — M11-R1. `PChainStakeMirrorVerifier` limits +
  `ValidatorRewardManager` (GenericRewardManager `getStateOfRewards`/`claim`) fragments and
  the minimal, provenance-flagged (not vendored) `PChainStakeMirror` mirrored-vote-power read ABI.
- `packages/core/src/pchain-rpc.ts` — M11-R2. SDK-free P-chain JSON-RPC reads
  (`platform.getCurrentValidators`/`getStake`/`getMinStake`/balances); no flarejs.
- `packages/core/src/stake-adapter.ts` — M11-R2/R5. The viem EVM reads (verifier limits,
  mirrored vote power, `ValidatorRewardManager.getStateOfRewards`), the stake intent, and the
  injected `PChainStakeExecutor` seam (the four signed legs + reward claim); no flarejs in src.
- `packages/core/src/stake-states.ts` — M11-R3. The durable four-leg stake lifecycle
  (`reconcileStake`) over the canonical states via `reconcile.ts`; the delayed P→C return maps
  `awaiting_external` (the ≥14-day lock clock) → `action_required` → `succeeded`, entered only
  from the on-chain stake-position read.
- `packages/core/src/staking.ts` — M11-R2/R4. Intents → `stakeVerified`-gated plan → lifecycle,
  enforcing the live-read limits (amount ≥ `minDelegatorStake` / ≤ max, 14-day ≤ duration ≤
  365-day, end ≤ the chosen validator's active window) and surfacing the irreversible value-lock.
- `packages/core/src/mock-stake.ts` — M11-R7. Copies exactly what the live run observed; refuses
  the unobserved (never a fabricated stake position or zero).
- `packages/core/scripts/probe-stake.mjs` — M11 Verification. Dev, not shipped: the keyless read
  probe (validators, verifier/getMinStake limits, positions, mirrored vote power, reward state).
- `packages/core/scripts/live-stake.mjs` — M11 Verification. Dev, not shipped: the gated live
  C→P export + `AddPermissionlessDelegator` broadcast + stake-position read-back + the delayed
  P→C return + reward claim (keys from `.secrets`, never logged).
- `packages/core/scripts/pchain-executor.mjs` — M11-R5. Dev, not shipped: the reference
  `PChainStakeExecutor` wrapping flare-tx-sdk (`transferToP`/`delegateOnP`/`transferToC`/
  `claimStakingReward`), injected by the live script/tests; flarejs lives here, never in `src`.
- `packages/react/src/use-staking.ts` — M11-R9. The stake lifecycle + reward-read poll hook over
  the M8 durable-poll base; read/plan keyless, signing via the caller-injected executor.
- `packages/react-ui/src/StakeCard.tsx`, `packages/react-ui/src/stake-card-state.ts` — M11-R8.
  Validator discovery + stake composer (live-read minimums, the irreversible value-lock stated
  before signing) + staked-position/mirrored-vote-power panel (mono face, `unavailable` never a
  confident zero) + the four-leg timeline on the `OperationTimeline` spine; chrome reused, never inline.
- `packages/react-ui/src/claim-card-notes.ts` — M11 (Task 11). Split from `claim-card-state.ts` to
  keep it < 300: the DECLARED-unknown state notes (each carries its own copy, never a fabricated
  amount), including the NON-EXPIRING staking honest-empty. Chrome reused; the ClaimCard 4th kind.
- `packages/react-ui/src/staking.css` — M11-R8. The `fk-stake` classes, values from tokens only,
  `@import`-ed into `styles.css`.
- `packages/react-ui/gallery/m11-staking-sections.tsx` — M11-AC6. Every required state driven from
  props, both themes; only states the live run observed (no invented active stake).
- `packages/contracts/src/governance.ts` — M12-R1. `GovernanceVotePower` /
  `PollingFoundation` / `PollingFtso` / `PollingManagementGroup` registry for
  `coston2` + `flare`, with `governanceVerified` (false until the live delegate
  round trip reads back).
- `packages/contracts/src/governance-abis.ts` — M12-R1. `IGovernanceVotePower` /
  `IGovernor` (`PollingFoundation`) / `IPollingFtso` viem fragments.
- `packages/core/src/governance-adapter.ts` — M12-R2. Governance-VP + eligibility
  reads (viem) and the delegate/undelegate `UnsignedCall` builders.
- `packages/core/src/governance.ts` — M12-R2/R4. Intents → `governanceVerified`-gated
  plan → lifecycle; invariants (all-or-nothing single delegate, never M10's bips).
- `packages/core/src/governance-states.ts` — M12-R3. `reconcileGovernance`, the
  delegate/undelegate spine over canonical states; `succeeded` only from the
  `getDelegateOfAtNow` read back.
- `packages/core/src/proposals.ts` — M12-R5/R6. Mainnet-read proposal
  discovery/state + detail + eligibility, honest-empty when discovery finds
  none within RPC limits; the carried `castVote` intent.
- `packages/core/src/proposal-mapping.ts` — M12-R5. The pure mapping layer
  `proposals.ts` builds on: the proposal view types, the SOURCE-dispatched
  state enum (FTSO vs IGovernor orders — probe-anchored index 3 = Defeated for
  FTSO), and the local `ProposalCreated` event fragment for the discovery scan.
- `packages/core/src/mock-governance.ts` — M12-R7. The governance mock, built
  after the real run; copies observed, refuses unobserved.
- `packages/core/scripts/probe-governance.mjs` — M12 Verification / M12-R1. Dev,
  not shipped: keyless resolve on both networks + VP/delegate/eligibility/
  proposal-discovery probe.
- `packages/core/scripts/live-governance.mjs` — M12 Verification. Dev, not
  shipped: keyless reads always, plus the gated delegate/undelegate round trip
  (keys from `.secrets`, never logged); flips `governanceVerified`.
- `packages/react/src/use-governance.ts` — M12-R9. The delegate/undelegate
  operation hook.
- `packages/react/src/use-proposals.ts` — M12-R9. The mainnet proposal
  catalogue/detail read hook.
- `packages/react-ui/src/GovernanceCard.tsx` (+ `packages/react-ui/src/governance-card-state.ts`)
  — M12-R8. The GOVERNANCE write card: VP + delegate composer + eligibility.
- `packages/react-ui/src/ProposalCatalogue.tsx` — M12-R8. The mainnet proposal
  list (cross-network read, labelled).
- `packages/react-ui/src/ProposalDetail.tsx` — M12-R8. One proposal, full state
  + the carried vote affordance.
- `packages/react-ui/src/proposal-visuals.ts` — M12-R8. The single map from
  `ProposalState`/`ProposalSource` to its word, tone and glyph, beside
  `state-visuals.ts` and `ftso-visuals.ts`; the state word is always shown, so
  colour is never the first signal. Both surfaces read it — neither invents a
  per-screen label.
- `packages/react-ui/src/governance.css` — M12-R8. The `fk-gov` classes, values
  from tokens only, `@import`-ed into `styles.css`.
- `packages/react-ui/gallery/m12-governance-sections.tsx` — M12-AC6. The state
  matrix, both themes, observed states only.
- `packages/contracts/src/smart-accounts.ts` — M13-R1. The
  `MasterAccountController` registry for `coston2` + `flare` (the same address on
  both, resolved by name from `FlareContractRegistry`), `smartAccountsVerified`
  per network, and the built-in instruction vocabulary as types. Deliberately
  carries NO operator-mutable value: the operator XRPL wallets, source id, proof
  validity window, instruction fees, vault ids, agent vault ids and default
  executor are settings the operator can change, so freezing them here would
  produce a plan that signs an XRPL payment to a stale destination. They are read
  live in `smart-accounts/adapter.ts` instead.
- `packages/contracts/src/smart-accounts-abis.ts` — M13-R1. The
  `IMasterAccountController` read fragments (personal account, instructions,
  fees, vaults, agent vaults, executor, XRPL provider wallets, payment proofs),
  `executeInstruction`, the `InstructionExecuted` event — whose
  `personalAccount`, `transactionId` and `paymentReference` are all INDEXED,
  unlike M1's direct-minting events, which is what makes the R7 backfill scan
  possible — the named errors, and `IPersonalAccount`.
- `packages/contracts/src/fdc/payment-abi.ts` — M13-R2b. `IPayment.Proof` and
  `FdcVerification.verifyPayment`. DISTINCT from `direct-minting-abi.ts`'s
  `IXRPPayment.Proof`: the request body is `{transactionId, inUtxo, utxo}` rather
  than `{transactionId, proofOwner}`, and the response carries
  `standardPaymentReference` — the field `executeInstruction` dispatches on —
  where `IXRPPayment` carries `firstMemoData` and `destinationTag` instead.
  Neither proof verifies against the other's consumer.
- `packages/core/src/fdc/families/payment.ts` — M13-R2b. The chain-agnostic
  `Payment` attestation family over M3's generic lifecycle. M3 catalogued this
  family with `hasBuilder: false`; M13 builds the builder and flips that row,
  because a catalogue that denies a capability the kit has is a lie in the
  direction this project cares most about.
- `packages/core/src/smart-accounts/payment-reference.ts` — M13-R2. The 32-byte
  payment-reference codec, command-aware because the tail windows OVERLAP: bytes
  12–13 `agentVaultId`, 14–15 `vaultId`, or 12–31 a 20-byte address. Carries the
  value's denomination (lots, drops, shares, a Firelight period, an Upshift
  `yyyymmdd` date) as typed data, because one 80-bit field means five different
  things across the eleven instructions.
- `packages/core/src/smart-accounts/adapter.ts` — M13-R3. Live deployment and
  personal-account reads (including deployment state by code size), plus the
  pure `executeInstruction` call builder. Every read is `undefined`-on-throw and
  surfaces as `unavailable`; a revert is never coerced to `0`, `[]` or `false`.
- `packages/core/src/smart-accounts/personal-account.ts` — M13-R3. The
  personal-account half of the reads, split from `adapter.ts` to keep both under
  300 lines. Carries the `getCode` subtlety: viem answers `undefined` for an
  address with no code, which is the same value a thrown read would produce, so
  it is read through a result wrapper — "not deployed" and "we could not look"
  must stay distinguishable.
- `packages/core/src/smart-accounts/catalogue.ts` — M13-R4. The DISCOVERED
  instruction catalogue: availability derived from live deployment state, the
  three legacy collateral-reservation commands marked `superseded`, and the
  instruction-type nibble validated against `IVaultsFacet.VaultType`
  (`None=0, Firelight=1, Upshift=2`) — the nibble IS the enum.
- `packages/core/src/smart-accounts/payment.ts` — M13-R5. The unsigned XRPL
  instruction payment, built on M1's `xrpl.ts` primitives. Never touches key
  material; never emits a `DestinationTag`.
- `packages/core/src/smart-accounts/plan.ts` — M13-R5. `smartAccountsVerified`
  gate first, then the invariants the chain would otherwise enforce after the
  money has already left; the plan carries the whole chain for approval,
  including the proof-expiry deadline as a wall-clock instant.
- `packages/core/src/smart-accounts/plan-types.ts` — M13-R5. The plan vocabulary,
  split from `plan.ts` to stay under 300 lines and so react/react-ui can name a
  refusal or a warning without the planner's logic. Every `RefusalCode` names a
  controller revert that would land AFTER the XRP reached the operator.
- `packages/core/src/smart-accounts/states.ts` — M13-R6. The four-leg durable
  lifecycle (xrpl → fdc → flare → effect) over the canonical states via the
  shared `reconcile.ts` helpers; `succeeded` only from the decoded
  `InstructionExecuted` AND the observable consequence; proof expiry is a
  distinct terminal state that never offers a retry.
- `packages/core/src/smart-accounts/watch.ts` — M13-R7. The bounded, chunked
  backfill scan over the indexed `InstructionExecuted` topics; an incomplete
  scan yields `unavailable`, never an empty history.
- `packages/core/src/mock-smart-accounts.ts` — M13-R8. Written after the live
  runs of 2026-08-13; drives the real plan builder and real reconciler, copies
  observed, refuses unobserved. Its recorded references are re-derived by the
  real encoder in test, so they stay bytes the Coston2 controller actually
  accepted. The deposit is recorded with `dispatchedByUs: false` — its
  instruction executed and its effect is real, but the operator's backend
  submitted the proof first, and claiming that leg would be inventing it.
- `packages/core/src/mock-smart-accounts-observed.ts` — M13-R8. **Deviation,
  found in build:** the observed values, split from the reader above when the
  two together crossed 300 lines. A record with no behaviour, beside a reader
  that drives the real code with it. Re-exported, so the published surface is
  unchanged. It also carries the mainnet READ-LENS probe, so the
  identical-address property is shown from two independently-read values rather
  than one printed twice; `smartAccountsVerified.flare` stays `false`.
- `packages/core/scripts/probe-smart-accounts.mjs` — M13 Verification / M13-R1.
  Dev, not shipped: the keyless both-network probe (controller by name, operator
  wallets, source id, proof window, fees, vaults, agent vaults, executor, and the
  personal account derived for the run's XRPL address).
- `packages/core/scripts/live-smart-account.mjs` — M13 Verification. Dev, not
  shipped: the gated live round trips — XRPL payment, FDC `Payment` attestation,
  `executeInstruction`, effect read-back (keys from `.secrets`, never logged).
- `packages/react/src/use-smart-account.ts` — M13-R9. Account identity, plan and
  the durable lifecycle; reads keyless, signing via an injected wallet client.
- `packages/react/src/use-instruction.ts` — M13-R9. The plan and the durable
  four-leg lifecycle for one instruction. Planning is keyless and pure; SIGNING
  is deliberately the host's job, because the payment is an XRPL transaction and
  a hook that took an XRPL seed would put key material in the render tree for no
  gain. Replaces the planned `use-instruction-catalogue.ts`: discovery is derived
  from the same settings read `use-smart-account.ts` already performs, so a
  separate catalogue hook would double the RPC traffic for the same answer.
- `packages/react-ui/src/SmartAccountCard.tsx` (+
  `packages/react-ui/src/smart-account-card-state.ts`) — M13-R10. The identity
  surface: XRPL controller, personal account, deployed / not deployed as a
  first-class fact, balances, memo nonce, pinned executor, fee settings, both
  networks side by side.
- `packages/react-ui/src/SmartAccountNetwork.tsx` — M13-R10. **Deviation, found
  in build:** one network's column, split out of the card, which reached 299
  lines. The two halves it draws are different subjects — what this XRPL
  address's account IS, and what the DEPLOYMENT is.
- `packages/react-ui/src/InstructionCatalogue.tsx` — M13-R10. The discovered
  catalogue, in the `AttestationCatalogue`/`VaultCatalogue` anatomy.
- `packages/react-ui/src/InstructionComposer.tsx` (+
  `packages/react-ui/src/instruction-composer-state.ts`) — M13-R10. The plan
  surface: the entire chain before approval, with the proof-expiry deadline
  stated.
- `packages/react-ui/src/InstructionChain.tsx` — M13-R10. **Deviation, found in
  build:** the four legs, split out of the composer at 320 lines. A real seam
  rather than arithmetic: this renders a PLAN (what will happen), the composer
  renders an OPERATION (what did), and keeping those apart is the milestone.
- `packages/react-ui/src/instruction-visuals.ts` — M13-R10. The vocabulary the
  three surfaces share: availability visuals, and the denomination naming that
  keeps one 80-bit field from rendering as five different things unlabelled.
- `packages/react-ui/src/smart-accounts.css` — M13-R10. The `fk-sa` classes,
  values from tokens only, `@import`-ed into `styles.css`.
- `packages/react-ui/gallery/m13-smart-account-sections.tsx` — M13-AC6. The
  state matrix, both themes, observed states only.

## Integrations

| Surface | Classification | Note |
|---|---|---|
| `packages/core/src/xrpl.ts` | REAL_MVP | XRPL Testnet public endpoint, no key |
| `packages/contracts/src/addresses.ts` | REAL_MVP | Coston2 deployed addresses, verified at write time |
| `packages/core/src/fassets/direct-mint.ts` | REAL_MVP | live AssetManager reads and writes |
| `packages/core/src/fdc/client.ts` | REAL_MVP | real attestation request, proof retrieval and on-chain verification, generic over the family. Replaces `packages/core/src/fdc.ts`, deleted in M3. |
| `packages/core/src/fdc/round.ts` | REAL_MVP | round derivation and finality. Verified live 2026-08-04: `firstVotingRoundStartTs()` and `votingEpochDurationSeconds()` are declared on `IRelay` in the periphery package but REVERT on the deployed Relay — they are implemented on `FlareSystemsManager`. Only `isFinalized` is on Relay. |
| `packages/core/src/fdc/fee.ts` | REAL_MVP | `getRequestFee` for the exact bytes. Measured 2026-08-04: 1000 wei on Coston2, 20 FLR on Flare mainnet, 3 FLR for `ConfirmedBlockHeightExists`. A constant would be wrong on one of the two networks. |
| Executor execution | REAL_LATER | third-party executor availability on Coston2 is unverified; until confirmed, the timeline shows the honest awaiting-external state and manual retry drives execution |
| `packages/core/src/mock.ts` | SIMULATED_DEMO_ONLY | labelled mock kit, powers docs, tests and demo mock mode; never a failure fallback |
| Wallet connection | REAL_MVP | injected EVM wallet plus an XRPL wallet adapter |
| `apps/demo` live mode | REAL_MVP | real testnet; falls back to read-only or mock with the reason stated |

## Surfaces

| Screen | Required states | Data shown | Entry point |
|---|---|---|---|
| MintFXRP | loading, ready, below minimum, no executor, insufficient balance, quote expired, typed error | XRP amount, exact FXRP estimate, protocol and executor fees, XRPL destination, recipient, executor, duration | demo home, or embedded |
| XRPL payment handoff | payload creating, awaiting signature, rejected, expired, submitted | exact amount, destination, memo, expiry, one-payment-only warning | after exact review |
| OperationTimeline | full operation state set, source degraded, delayed, action required, recovered, succeeded | step actors, XRPL hash, FDC round, executor, Flare tx, allowed-at | deep link by operation ID |
| RecoveryPanel | retry available, blocked by precondition, no safe action | what moved, what remains, reuse versus new payment, idempotency | from timeline |
| ConnectButton | disconnected, connecting, rejected, wrong network, EVM only, XRPL only, both ready, read-only | account, network, custody class | app shell |

## Acceptance criteria

- AC1 — Given no wallet and no network, when the demo runs in mock mode, then
  every state above is reachable and the full mint completes in seconds.
- AC2 — Given a funded XRPL Testnet account, when a user mints 250 XRP, then
  exactly one XRPL payment is requested and FXRP is credited on Coston2.
- AC3 — Given a mint whose executor has not run, when the user opens the
  operation, then it reads delayed rather than failed, states the awaited actor
  and expected range, and offers no action that could send XRP twice.
- AC4 — Given a delayed mint past its allowed-at time, when the user retries,
  then the existing payment and proof are reused and a second retry is a no-op.
- AC5 — Given a page reload mid-operation, when the app restarts, then the
  operation resumes from its persisted record with no lost evidence.
- AC6 — Given keyboard-only navigation, when a user completes a mint, then
  every control is reachable with visible focus and every state change is
  announced in text.
- AC7 — Given an XRP amount below the live direct-minting minimum fee, when the
  user tries to proceed, then the mint is blocked before any signature is
  requested and the exact minimum is stated. The protocol converts a
  below-minimum payment entirely into fee and mints nothing to the payer; the
  loss is total and unrecoverable, so this is a hard invariant, not a warning.
  Verified in `.thoughts/research/2026-08-04-direct-minting-execution.md`.
- AC8 — Given a mint whose payment the AssetManager has already confirmed, when
  recovery runs again, then core resolves the operation as succeeded from chain
  evidence and submits no transaction. A repeat `executeDirectMinting` reverts,
  so idempotency is core's to provide, not the contract's.

## Verification

```bash
pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @flarekit-dev/core test:e2e:mock      # AC1, AC3, AC4, AC5 against the mock
pnpm --filter demo dev                            # then drive AC2 in a browser on Coston2
```

## Checklist

- [x] R1 workspace, build, publint clean
- [x] R2 contracts and address registry
- [x] R3 operation lifecycle, errors, recovery matrix
- [x] R4 direct mint end to end — closed by M0. Verified live on Coston2:
  `.thoughts/verification/2026-08-04-coston2-live-mint.md`. Core orchestrates it
  through `createFlareKit(...).reconcile()`, not a script.
- [x] R5 persistence and resume
- [x] R6 mock kit
- [x] R7 React provider and hooks — closed by M0. `createFlareKit` is the live
  half of `DirectMintKit`, so `FlareProvider` genuinely accepts either.
- [x] R8 three UI components
- [x] R9 every required state rendered against the mock
- [x] R10 idempotent recovery — closed by M0. `readDirectMintChainState`
  detects `PaymentAlreadyConfirmed` and resolves to succeeded without
  submitting; proved live by `scripts/verify-reconcile.mjs`.
- [x] R11 accessibility bar — automated axe checks, keyboard, focus, text+shape; contrast verified in DESIGN.md against the token values, not in jsdom

## Sources

- `.thoughts/decisions/2026-08-03-full-flare-application-layer-scope.md`
- `.thoughts/specs/2026-08-04-m1-fassets-redeem.md` — M1's own spec, written
  before its implementation as the milestone decision requires
- `.thoughts/specs/2026-08-04-m2-accounts-portfolio-activity.md` — M2's spec:
  accounts and signing authority, portfolio and activity
- `.thoughts/handoffs/2026-08-04-m1-complete-m2-ready.md` — session handoff:
  where the build stands, the live accounts, and the process lessons that only
  existed in conversation
- `.thoughts/decisions/2026-08-04-build-everything-real-first.md` — **supersedes
  this file as a statement of total scope.** SPEC.md remains accurate as the
  specification of the FXRP mint path, which is now milestone M1.
- `.thoughts/decisions/2026-08-03-bounty-coverage-and-demo-product.md` (build order)
- `.thoughts/specs/2026-08-03-flare-application-layer.md` (R-OP, R-LIFE, R-REC, R-WIDGET)
- `.thoughts/specs/2026-08-03-kit-distribution-surfaces.md` (packaging, mock mode, demo app)
- `.thoughts/design/2026-08-03-product-surface-map.md` (FX-02 to FX-04, SH-02, SH-05, SH-06)
- `.thoughts/verification/2026-08-04-coston2-live-mint.md` — the AC2 evidence
  record: date, network, addresses, transaction hashes and explorer links
- `DESIGN.md` and the accepted specimens under `.thoughts/design/fable5-direction-return/`
- `.thoughts/research/2026-08-04-fdc-xrp-payment-attestation.md` — the verified
  XRPPayment attestation flow R4 is built on: request shape, round derivation,
  proof retrieval, the JSON-to-struct mapping and the uint64 parsing hazard
- `.thoughts/research/2026-08-04-direct-minting-execution.md` — verified
  `executeDirectMinting` behaviour: fee arithmetic, memo encoding, the delay
  path, executor gating, and why a below-minimum payment is unrecoverable
