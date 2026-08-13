# Plan: the Uniswap re-cut, across every component

Status: active working plan
Date: 2026-08-09
Direction: `.thoughts/decisions/2026-08-09-uniswap-recut-direction.md` (accepted)
Contract: `DESIGN.md` (re-cut note + re-cut Components section)
Accepted screen: `.thoughts/design/2026-08-09-uniswap-recut-return/swapcard.html`

## Objective

Apply the accepted re-cut to **every** component, not just the swap. Abu set the
direction once; no per-surface design artifact is produced for approval again.
The kit reads as a real product on the accepted paper + cobalt palette, with real
asset marks, standard connect/selector patterns, and the named-actor lifecycle
intact.

## Laws this plan runs under (from CLAUDE.md / state.json)

- **Reuse, don't re-code.** One shared component per pattern. Build the shared
  piece once; every surface inherits it. Delete the old rendering as you migrate.
- **Real-first, mock copies observed behaviour.** No faked balances, logos-as-truth,
  or protocol outcomes. Mock mode stays explicit and labelled.
- Production source **< 300 lines**; split at real seams before writing.
- Source writes are added to `SPEC.md`'s `## Files` manifest (with a reason)
  before writing. Test lock: record the requirement in SPEC.md first.
- Gate every batch: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`,
  shown with output. Review cadence: review subagents every 2–3 surfaces, then the
  simplifier. Gallery + computed-style verification once the Chrome bridge is back.

## Component inventory (what the re-cut touches)

**Shared primitives (exist):** Button, Panel, DataTable, DetailRow, EvidenceChip,
FeeNote, Note, SourceChip, StateChip, Timestamp, CodeWindow.
**Shared primitives (new, this program):** `AssetLogo`, `SegmentedTabs`,
`TokenSelector`, `ConnectModal` (+ `WalletRow`).

**Asset-bearing surfaces (get `AssetLogo`):** PortfolioTable, ActivityTable,
MintFXRP, RedeemFXRP, RecoveryPanel, and FTSO feed rows that name a base asset
(FeedCatalogueRow, FeedDetail, FeedHistoryTable). Future: SwapCard, SendCard,
VaultCard, BridgeCard.
**Identity surfaces (get the connect flow):** AccountSheet, and the new
ConnectButton/AccountChip.
**Data/proof surfaces (consistency + marks where a feed names an asset):**
AttestationCatalogue, ProofDetail, ScalingProofDetail, AttestationTimeline,
FeedCatalogue, IncentiveComposer, SecureRandomPanel, etc. — no new pattern, just
the shared marks and the product-grade polish where an asset appears.

## Phases

### Phase 0 — `AssetLogo` (the foundation, Abu's #1 fix)
The single component that resolves a symbol to its mark. Resolution =
**bundled SVG → seeded monogram**, never a remote image (holds under a widget's
strict CSP; no leak of which assets a user views).
- Bundle the official Flare marks (MIT) from `developer-hub/static/img/ui/`
  (FXRP, XRP, FLR/WFLR/C2FLR, FAssets) into react-ui as an asset set; add USD₮0,
  sFLR, SGB from their recorded sources as they're vetted. Light/dark variants
  on a consistent plate.
- Seeded monogram = `symbol.slice(0,2..3)` on a deterministic colour for any
  unbundled symbol.
- Home: `packages/react-ui/src/primitives/AssetLogo.tsx` + an assets module;
  CSS in `primitives.css` (css-integrity: defined ↔ referenced, both directions).
- Tests: mark-vs-monogram is structural (which path a symbol takes); an unknown
  symbol is a monogram, never a blank or a wrong mark.
- SPEC.md manifest entries added first.

### Phase 1 — Retrofit the built asset-bearing surfaces
Swap plain-text asset rendering for `<AssetLogo>` in PortfolioTable, ActivityTable,
MintFXRP, RedeemFXRP, RecoveryPanel, and the FTSO feed rows. Delete the old
`fk-*-asset` text rendering as each is migrated. Each surface stays gallery-true;
re-verify states are still reachable from props. Gate + review after the batch.

### Phase 2 — Identity re-cut: ConnectModal + AccountChip
The connect flow: EVM wallets via EIP-6963 detection (Detected/Recent badges),
and it names the XRPL leg a FAsset mint/redeem needs — the modal admits both
chains. Re-cut AccountSheet as the connected-account view. Wallet layer sits on
the `@flare-kit/react` peer deps (wagmi/viem); hooks read, never spend.

### Phase 3 — M5 new surfaces, built in the direction
SwapCard (Swap/Limit `SegmentedTabs`, one currency context), `TokenSelector`
(search, common-base pills, balance-sorted rows with marks), VaultCard, liquidity,
and Send/Bridge if in M5 scope. These land in the **M5 spec**
(`.thoughts/specs/`), built real-first with the mock copying observed behaviour.
Uniswap `interface` (GPL) is read-only reference; Jupiter `plugin` (MIT) may be
borrowed with attribution.

### Phase 4 — Landing + docs re-cut (last)
The site consumes the packages, so it comes last. Re-cut the landing to read as a
product (Uniswap-grade), docs component previews use the re-cut components.

## Sequencing

Phase 0 → Phase 1 can start now as a re-cut pass over existing surfaces (no new
protocol work). Phases 2–3 align with M5 (swaps/liquidity/vaults) and go through
the M5 spec. Phase 4 is last. Each phase updates `SPEC.md`, passes the gate, and
extends `DESIGN.md` only from what shipped.

## Abu gallery review — 2026-08-09 (tracked so nothing is dropped)

Core directive: **study the CLONED Uniswap repo deeply and apply broadly**, even
where not explicitly named — tables, portfolio, pools, explore, trading, price/$,
base fee. Jupiter secondary.

- [in progress] Deep-read cloned Uniswap for row/logo/table/portfolio/explorer
  patterns → `uni-study` agent.
- [in progress] Vendor real logos: FTSO crypto majors (BTC/ETH/XLM/LTC/…) + wallet
  brands (MetaMask/Rabby/Coinbase/WalletConnect/Xaman) → `logo-fetch` agent.
- [DONE] AccountSheet: network mark (Flare/XRP) on every chain row, all states,
  testnet ring; removed duplicate network-line mark.
- [DONE] Cut noisy blue info-notes: AccountSheet "Two accounts…", ConnectModal
  "Two chains…". (Kept load-bearing att/danger notes.)
- [DONE] FTSO feed rows: real base-asset logo per row; rename demoted to a quiet
  faint line (no att-chip/paragraph).
- [queued] Feed PAIRS as TWO logos + slash (base/quote, Uniswap pair style) in
  the catalogue AND detail — a `PairLogo` (e.g. FLR/USD = FLR mark + USD mark, not
  a seeded monogram). Needs a USD/fiat quote mark.
- [queued] Demote the "renamed feed" (MATIC→POL) warning — not a default banner;
  show current name, former name as a quiet secondary, not a warning chip.
- [queued] Source field / tx hash → clickable explorer link (EvidenceChip already
  supports `href`; wire the link builder). Addresses no explorer indexes stay copy-only.
- [queued] Address → copy affordance. Extract a small reusable `CopyButton`
  primitive (EvidenceKind is operation-evidence, not a wallet address — don't
  shoehorn); use it on the account address.
- [queued] FTSO surfaces (SecureRandomPanel, ScalingProofDetail, FeedHistory
  "stale rounds", IncentiveEffect "fast updates", base fee) — Uniswap-ify the
  tables; cut noise.
- [queued] EVM consumer proof (ProofDetail) — worst-rated; rework.
- [queued] ConnectModal: real wallet brand logos (bundled, for known wallets).
- [consider] Mint selectability — is the asset a fixed contract call or a
  selectable option? Review against Uniswap's select-then-act.

## Uniswap blueprint — execution spec (from `uni-study`, real cloned code)

**Key finding: Uniswap's cleanliness is STRUCTURAL.** One row primitive
(`OptionItem`) and one table primitive (`Table`/`Cell`) that every surface
composes; density/hover/spacing/number-rendering decided once, never per screen.
Our clutter is per-screen bespoke layout. Fix at the primitive level → fixes
everywhere, and satisfies "one shared component per pattern".

Build these shared pieces, then re-express surfaces as thin configs:
1. **`AssetRow`** — logo slot / two-line title+subtitle / right-aligned two-line
   value. Three-tier colour only: neutral1 (name/primary) → neutral2 (symbol/
   secondary) → neutral3 (address/tertiary). Spacing tokens 8/12 only. Row hover
   = full-width surface-hovered fill at rounded-16, NO per-row border/card.
2. **`DataTable` + `Cell`** (enhance existing) — 64px rows; sticky header on a
   soft `surface2` rounded-12 pill, labels body3/neutral2/500 (no uppercase, no
   heavy rule); tabular-nums + right-align baked into the Cell primitive (not per
   column); per-cell skeleton bubbles (not a spinner); first identity column
   pinned; deprecated row = `opacity:0.6` dim, not a warning.
3. **`ExplorerLink`** — shortened value + trailing 16px neutral2 external icon,
   dim-on-hover no underline/accent; **degrades to plain text when no explorer
   URL** (never disable/error). Addresses/tx across ProofDetail, ScalingProof,
   SecureRandomPanel, FeedHistory, AccountSheet route through it. (EvidenceChip
   already carries `href`; reconcile the two — one anatomy.)
4. **Semantic number formatter** — one `formatValue(n, kind)` (price/stats/
   balance/percent); no scattered `toFixed`. `DeltaArrow` for % (arrow+colour
   carries sign, magnitude abs, exact-zero neutral3). Unknown → `—`, never `0`.

**Clutter rules (the crux of Abu's complaint):**
- No default info banners. A secondary fact is a severity-gated 16px icon-badge,
  and info-only facts get NO resting UI (Uniswap: "info-only is too noisy to
  surface here"). When a note must exist, it's a MUTED `surface2` InlineCard, not
  a blue/colored alert.
- Progressive disclosure: address/copy/network-list hidden at rest, shown on
  hover. Resting row = identity + primary number only.
- **Renamed/deprecated feed = dim the row + former name on hover (or a "show
  deprecated" expander); the rename explanation lives on FeedDetail, not as a
  catalogue banner.** This DEMOTES `FeedCatalogueRow`'s `Renamed` att-chip +
  paragraph. Requirement change → record in SPEC.md, update the locked
  `ftso-surfaces.test.tsx:44` assertion, then change the row + `fk-ftso-former`.

**Order:** build primitives (1–4) → re-express FeedCatalogue/FeedCatalogueRow
(logos from `logo-fetch` + demoted rename + ExplorerLink) → FeedHistoryTable →
PortfolioTable → ProofDetail/ScalingProofDetail/SecureRandomPanel. Each batch
through the gate; the rename demotion carries its SPEC/test update.

## Not doing

- No per-component design artifacts for approval — the direction is accepted.
- No palette change yet (Abu's 1–2 tweaks are a separate accepted-screen step).
- No BMAD PRD/stories layer — `.thoughts/` is the authoritative spine.

## Progress log

**2026-08-09 — Phase 0 shipped + first retrofit.**
- `packages/react-ui/src/primitives/AssetLogo.tsx` — `bundled SVG → seeded
  monogram`, no remote image. 4 mark families (FXRP, XRP, FLR-family, FAssets)
  + case-insensitive lookup; unknown symbol = seeded monogram, never a wrong
  mark. Manifest: `SPEC.md` admits `packages/react-ui/src/assets/*.svg`.
- 8 official Flare marks (MIT) vendored to `packages/react-ui/src/assets/`;
  CSS in `primitives.css` paints them via `background-image` (full colour),
  theme-swapped, monogram colour seeded inline. Exported from `index.ts`.
- Retrofit: `PortfolioTable` asset cell now uses `<AssetLogo>` via the shared
  `.fk-am-asset` pairing; old `fk-table-asset`-only text rendering removed.
- Gate GREEN: build 4/4, typecheck 7/7, lint clean, test 964 pass (react-ui
  212, +4 AssetLogo tests). Fixed an unrelated pre-existing lint breakage —
  the BMAD install (`_bmad/`, `.agents/`, `.claude/`) was being linted; added
  to `eslint.config.js` ignores alongside the other vendored/tooling dirs.
- **NOT yet visually verified** — the Chrome bridge is down, so the marks have
  not been driven in the gallery and looked at (DESIGN.md verification bar).
  Logic is test-covered; the pixel check (mark inset, plate on dark, monogram
  legibility) is owed the moment the browser is back.

**2026-08-09 — Phase 2 core: the connect flow.**
- `packages/react-ui/src/primitives/NetworkLogo.tsx` — the chain's real mark
  (Flare for EVM, XRP Ledger for XRPL), reusing the vendored marks; testnet is a
  secondary ring, the name stays authoritative.
- `packages/react-ui/src/ConnectModal.tsx` — the wallet picker. Presentational
  and wallet-agnostic BY DESIGN: the host owns the connection (`use-accounts`
  law — the kit never claims custody it lacks), passes the discovered wallets
  with their own EIP-6963 icons, and this renders the choice + calls back. A
  wallet with no advertised icon gets a neutral glyph, never a stand-in brand.
  Both chains always shown. `SPEC.md` admits the file.
- Retrofit: `AccountSheet` network line now pairs `NetworkLogo` with the name.
- Gate GREEN: build/typecheck/lint clean, test 972 (react-ui 220, +8).
- **NOT yet visually verified** (Chrome bridge down) — logic/structure/a11y
  attributes are test-covered; the pixel pass on the modal is owed.

**2026-08-09 — real logos vendored + wired (agents `logo-fetch` + `uni-study`).**
- 23 real logos vendored to `packages/react-ui/src/assets/` (18 crypto majors,
  Trust Wallet MIT; 5 wallet brands from each vendor's repo). `ATTRIBUTION.md`
  written; `SPEC.md` admits `assets/*.png` + ATTRIBUTION.
- `AssetLogo` registry + `primitives.css` extended with 18 crypto marks
  (BTC/ETH/XLM/… full-colour PNG). Available to every asset surface; visible in
  the gallery showcase now, into the FTSO feed rows at the FeedCatalogue rework.
- `ConnectModal` renders real wallet brand marks (MetaMask/Rabby/Coinbase/
  WalletConnect/Xaman) as the bundled fallback; own EIP-6963 icon still wins;
  unknown wallet → neutral glyph. Test updated to the three-way resolution.
- Gate GREEN, 972 tests. Uniswap blueprint captured above as the execution spec.

**2026-08-09 — FeedCatalogue rework (Abu's loudest FTSO complaint).**
- Real base-asset logo per feed row: `FeedCatalogueRow` extracts the base from
  the pair (`BTC/USD → BTC`) and renders `AssetLogo`; feed name + id + former
  name stack beside it (`fk-ftso-feed`/`fk-ftso-feed-text`).
- **Rename demoted**: removed the `Renamed` att-chip + the paragraph; now a quiet
  faint "Formerly MATIC/USD" line. Load-bearing fact kept (the locked
  `ftso-surfaces.test.tsx:44` still passes — it asserts the fact, not the noise),
  full explanation stays on FeedDetail. No SPEC/test change needed.
- Gate GREEN, 972 tests.

**2026-08-09 — `ExplorerLink` + `CopyButton` primitives, one anatomy.**
- `primitives/ExplorerLink.tsx` — the one link anatomy: shortened identifier +
  trailing `fk-i-external`, neutral (never accent — cut the blue), dims on hover,
  no underline. **Degrades to plain text** with no `href` (an un-indexed round,
  a Merkle node, an address on a chain with no indexer) — never disabled, never
  an error. 4 tests. `primitives/CopyButton.tsx` — the copy control lifted out of
  `EvidenceChip`; a clipboard the browser refuses is not an error state. 3 tests.
- **Reconciled `EvidenceChip`** to compose both: it is now `label + ExplorerLink
  (value) + CopyButton`. One link anatomy and one copy anatomy propagate to every
  chip surface at once — ProofDetail, ScalingProofDetail, ActivityTable, MintFXRP,
  RedeemFXRP, IncentiveComposer/Effect, OperationTimeline — linking where the host
  passed `href`, degrading where it did not. Deleted the bespoke `fk-ev-link`
  (both `primitives.css` + `state.css`) and folded `fk-ev-copy` into `.fk-copy`.
  Locked assertions held (`mint-states` `.fk-ev-value`+title, `fdc-surfaces`
  copy-bytes/keccak256) and CSS integrity stayed green both directions.
- `AccountSheet`: the wallet address now carries a `CopyButton` (`fk-account-id-row`).
  An address is identity, not an `EvidenceKind` — so copy, not a chip. 2 tests.
- **Honest wiring finding:** the surfaces that render an explorer-linkable
  identifier all do so through `EvidenceChip` and thus inherit the atom. The
  non-chip ones show nothing to link: FeedHistory/SecureRandom render voting-round
  ids (no explorer indexes a round) and SecureRandom names its contract (`Relay
  (RandomNumberV2)`), not an address value. No link was invented where no
  identifier exists. react-ui surfaces stay presentational — the **host** resolves
  explorer URLs and passes them (as `consumptionExplorerUrl` already does); no
  surface calls `linkEvidence`.
- SPEC.md `## Files` records both primitives + the one-anatomy requirement.

**Review pass (code-reviewer + simplifier) — applied before continuing:**
- [FIXED] a11y (important): the link's accessible name was a truncated hash with
  the new-tab signal only visual. Added `aria-label="${value}, opens in a new
  tab"` on the linked branch (WCAG 2.4.4 / G201). Verified live: name reads the
  full value + warning; the degrade span carries no aria-label.
- [FIXED] `CopyButton` timer now held in a ref, cleared on unmount and before
  re-arming (it renders 160+/screen). `min-width:24px` added to `.fk-xl-link`
  (target size floored on both axes). Dead `shorten:'none'` branch removed.
- [rejected] "delete `.fk-ev-value`" — it is the locked `mint-states.test.tsx:57`
  hook and css-referenced-defined requires it defined; the "redundancy" is the
  integrity contract working. [rejected] "drop `className`" — it is the house
  convention (13/15 primitives) and EvidenceChip uses ExplorerLink's.
- Gate re-green: build 4/4, typecheck 7/7, lint clean, test 230 (react-ui, +10).

**Queued (tracked, not dropped) from this batch:**
- [queued] EVM account address → explorer `href`. Needs a small core
  `accountExplorerLink(family, address, chainId?)` (EVM via `explorerAddressUrl`,
  guarded on `UnsupportedNetworkError`; XRPL leg has no chainId on `NetworkRef` →
  stays copy-only). Do NOT shoehorn the address into an `EvidenceKind`.
- [queued] ProofDetail/ScalingProof address identifiers (`recipient_address`,
  agent vaults) → linked when the host supplies the URL, same pattern as
  `consumptionExplorerUrl`. This is the plan's existing "wire the link builder".
- [queued] Move `ADDRESS_KINDS` → a core `isAddressKind(kind)` so a new
  address-shaped `EvidenceKind` can't silently render hash-truncated (reviewer
  CR#3, minor). [queued] `.fk-xl`/`.fk-ev-value` carry an inert `text-overflow`
  (inline / inline-flex don't honour it); JS already truncates, so drop the dead
  declarations or give the carrier a width to honour them (reviewer CR#5, minor).

**2026-08-09 — blueprint primitive #2: the shared `DataTable`, re-cut to roomy density.**
- **Reconciliation first:** the blueprint's "64px rows / soft pill header / opacity-dim"
  contradicted DESIGN.md:247-249 ("operator tables run tight: 8/12, hairline, no card
  chrome") and DESIGN.md:307-309 (opacity was deliberately removed as a signal). Abu
  was asked and **chose the roomy Uniswap density**, authorising the DESIGN.md density
  line to change. Recorded in DESIGN.md (density line + a new *Data tables* re-cut bullet).
- **Also reconciled:** the "Next" line below overstated the work. Only `FeedHistoryTable`
  is a real `DataTable`. `SecureRandomPanel`, `IncentiveEffectPanel` (the "base fee /
  fast updates" surface) and `ProofDetail`/`ScalingProofDetail` are `Panel`/`DetailRow`
  surfaces — their rework is noise-cut + re-cut polish, not a table migration. There is
  no component that renders a literal "base fee" today; it's the Fast-Update incentive
  fee/effect shown through `DetailRow`.
- **Change:** a **CSS-only** edit to `data.css` — restyled existing `.fk-table*`
  selectors, no new classes, no new markup, no `Cell` wrapper, no test-file edits.
  64px rows (a floor), soft `--fk-surface` sticky header pill (sentence-case
  `--fk-text-muted`/500, no uppercase, no rule), tabular-nums/right-align stay baked via
  `[data-numeric]`, per-cell skeleton bubbles, full-width `--fk-surface` row-hover.
  Portfolio, Activity and FeedHistory all inherited it from the one shell.
- **`Cell` primitive: deliberately not built.** All three surfaces write `<td
  data-numeric>` and the numeric rendering is already centralised in CSS — a thin wrapper
  would add indirection across three `Row`s with test risk and no dedup. Delivered the
  blueprint's intent (density decided once) via the shared CSS; "reuse, don't re-code"
  satisfied. (If a later surface needs per-column loading state, introduce it then.)
- **Pinned identity column: deferred, not dropped silently.** A sticky-left cell must
  paint opaque to hide scrolled values, but the right colour is the host container's,
  which the primitive can't know — a guessed `--fk-card` showed a white stripe against
  the surface backdrop even with no overflow. Queued to be done with a
  `--fk-table-pin-bg` contract or JS overflow-detection.
- **Verified in the gallery (port 5193), both themes, computed styles + a11y not just
  pixels:** header `text-transform:none`/500/`#68625C`(neutral2)/`--fk-surface` pill/
  9px radius/sticky; cells 64px/12px/middle; hover-fill + pill rules confirmed live in
  the CSSOM; `window.__auditA11y()` clean (1 pre-existing gradient-button note, 0
  table findings — the header contrast actually improved, faint→muted). Evidence:
  `.thoughts/verification/2026-08-09-recut-datatable/recut-*.png` (both themes,
  plus `-fixed` shots after the dark-pill review fix).
- **Gate GREEN:** build 4/4, typecheck 7/7, lint clean, test **982** (contracts 111+2
  skipped, core 623, react 18, react-ui 230 — unchanged, the CSS restyle broke no
  locked assertion).

**Review pass (code-reviewer + simplifier) — applied before continuing:**
- [FIXED] IMPORTANT: the header pill and row-hover were `--fk-surface`, which in
  dark theme equals `--fk-card` (the panel behind them) — so both were invisible
  in dark. (I'd seen it in the dark screenshot and mis-read "pill matches card" as
  fine.) Introduced a translucent neutral token `--fk-tint` (ink 6% light / text
  7% dark) for the pill and hover; an alpha tint reads as a step on any backdrop in
  both themes. Re-verified in the gallery, both themes — pill now a visible soft
  band. Gate re-green (982).
- [FIXED] IMPORTANT: `position: sticky` on the header was inert — `.fk-table-scroll`'s
  `overflow-x: auto` makes it the sticky scroll container, and with no height it
  never scrolls, so the header never stuck. Dropped `sticky` (honest static pill)
  rather than force every table into its own vertical scrollbar. A real sticky
  header wants a scroll container with a height — a separate enhancement.
- [APPLIED] simplifier: collapsed the four `:first-child`/`:last-child` radius
  blocks to two shared by the header pill and the hovered row.
- [checked-clear] reviewer confirmed `border-collapse: separate` is correct (no
  double borders; rounding needs it; it also fixes the sticky-th-under-collapse
  browser bug), `height:64px` is a min on cells, `.fk-table-empty td{height:auto}`
  correctly escapes the floor, no popover/z-index risk (CopyButton swaps an inline
  icon), and no css-integrity trip (only property values changed).
- [skipped] simplifier's `font-size:13px` on `.fk-table-empty td` micro-redundancy
  — pre-existing, out of this batch's scope.

**2026-08-09 — the FTSO/FDC Panel surfaces: info notes demoted, one primitive change.**
- Abu approved the kit-wide demotion. **Audited all six info-note kinds for pure
  redundancy to delete — found none.** Every one carries a load-bearing caveat
  (watch-only can't sign, activity coverage limits, expired ≠ failed, verifier-only
  end-state, staleness, below-retention-floor). So "cut the noise" = cut the *blue
  tone*, not the substance: deleting any would drop protocol reality (CLAUDE.md).
- **Change:** `.fk-note-info` in `primitives.css` only — blue alert
  (`--fk-primary-line`/`-soft`/`-primary` title) → muted card (`--fk-border`
  hairline, translucent `--fk-tint` fill, `--fk-text` title, `--fk-text-faint`
  glyph). One selector; **87 info notes across M1–M4 recede together**. The three
  outcome tones (`att`/`bad`/`ok`) keep their colour — severity still gated. No
  note's copy or screen-reader role changed (info notes already carry no role).
  No per-surface edits, no new classes, no test edits.
- **Verified in the gallery, both themes:** ProofDetail (worst-rated) verifier-only
  note, IncentiveComposer "no signer" beside its amber `att` note, SecureRandom's
  full spectrum (info muted, `ok` green, `bad` red with the danger-boxed value).
  `window.__auditA11y()` clean in dark — 0 note findings (the gradient-button note
  is the lone pre-existing one). Evidence: `recut-{proofdetail,incentive,securerandom}-*.png`
  in the verification folder.
- **Gate GREEN:** build 4/4, typecheck 7/7, lint clean, test 982 (unchanged).

**2026-08-09 — the two queued link follow-ups (core + AccountSheet + ProofDetail).**
- **Test-first.** SPEC.md's `links.ts` manifest entry records the new export (and
  unlocks the test files). Core test written red, then green.
- **Part A — `accountExplorerLink(family, address, chainId?)`** in `core/links.ts`:
  an account address is identity, not evidence, so it never becomes an
  `EvidenceKind` (parallel to `explorerLink`). Only the EVM leg links — its
  `NetworkRef` carries the chain id `explorerAddressUrl` needs; the XRPL identity
  has none, so it stays copy-only rather than linking a guessed ledger. 4 core
  tests (evm→coston2/mainnet, xrpl copy-only, evm-no-chainId, unsupported chain).
  `AccountSheet` address row now renders through `ExplorerLink` (shorten address,
  `fk-account-id` kept as its className) — the EVM address links with the ↗ glyph,
  the XRPL address is plain + copy-only. 2 react-ui tests.
- **Part B — ProofDetail `proofOwnerExplorerUrl?`**: host-supplied, same pattern
  as `consumptionExplorerUrl` (surface holds no chain id, so the host resolves the
  URL). Passed into the proof-owner `EvidenceChip`'s `href`; absent → copy-only.
  2 react-ui tests. **Reconciliation:** the queued note named "ProofDetail/Scaling
  address identifiers", but ScalingProofDetail renders only `ftso_proof` Merkle
  nodes (no address) — so Part B is ProofDetail's proof owner only.
- **Verified in the gallery** (SH-02, both legs): EVM addresses link to the right
  explorer *following the network* (Flare Mainnet vs Coston2 hrefs confirmed via
  DOM), each with ↗ + copy; XRPL is plain + copy. Fresh-load console clean (the 35
  errors seen mid-edit were stale HMR from the window before core's dist rebuilt).
  Evidence: `recut-accountsheet-links-light.png`.
- **Gate GREEN:** build 4/4, typecheck 7/7, lint clean, test **990** (core 627 +4,
  react-ui 234 +4).

**Review sweep (#9 + #10) — code-reviewer + simplifier, applied:**
- code-reviewer verdict **ready_to_merge**: contrast holds both themes, no css-integrity
  trip, `accountExplorerLink` guard correct (family precedes chainId; only
  `UnsupportedNetworkError` escapes and is caught), proof-owner href can't link a
  non-owner value.
- [FIXED] minor: `.fk-account-id`'s `word-break: break-all` went inert once the class
  moved onto `ExplorerLink` (whose `.fk-xl` sets `white-space: nowrap`) — pruned it
  plus the mono/colour it now inherits from `.fk-xl`, leaving only its unique 12px.
  Re-verified the address still renders 12px mono `--fk-text`. Gate re-green (990).
- [kept, with reason] simplifier's one soft flag — the `.fk-note-info .fk-note-title`
  colour rule is redundant with inheritance, but it keeps the four tones' title-colour
  rules symmetric and documents that an info title is deliberately body-coloured, not
  accent (the point of the demotion). Same "redundancy is the intent working" call as
  `.fk-ev-value` in batch #1.
- [convention, not flagged] the `{...(url ? {href:url} : {})}` conditional spread is the
  documented project pattern (exactOptionalPropertyTypes handling), used throughout.

**Next: Phase 3 — the swap surfaces (SwapCard, TokenSelector, VaultCard).** This is a
milestone boundary, not more re-cut polish: new **M5** product, built real-first with
the mock copying observed behaviour, so it needs an **M5 spec in `.thoughts/specs/`**
before any surface is built (per the plan's Phase 3 + the real-first law). Phase 4
(landing + docs re-cut) stays last.
