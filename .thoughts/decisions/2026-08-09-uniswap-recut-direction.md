# Decision: UI re-cut toward Uniswap / Jupiter conventions

Date: 2026-08-09
Status: canonical current visual-direction decision
Supersedes: the "do not reproduce Uniswap house style" clause in `DESIGN.md`'s
Anti-references (that clause was aesthetic guidance; it is now scoped to *style*,
not *convention*).
Taste authority: Abu (accepted).

## Decision

The visual direction is re-cut to adopt the **interaction conventions** of
Uniswap (primary) and Jupiter (secondary), rendered on the **existing accepted
palette, type and lifecycle**. Abu accepted this direction on 2026-08-09 against
one rendered screen — the SwapCard re-cut — with the words "this is perfect, it's
my direction."

What changes:
- **Real asset marks, not monograms.** Bundled official SVGs (the Flare marks
  already vendored MIT in `developer-hub/static/img/ui/` — FXRP, XRP,
  FLR/WFLR/C2FLR, FAssets) framed in the token circle; a **seeded monogram**
  fallback for any asset without a bundled mark. Resolution is
  `bundled SVG → seeded monogram`, never a remote image, so it survives a
  widget's strict CSP. Homed in one `AssetLogo`.
- **Swap / Limit tabs** — one card, a segmented control, one shared currency
  context (Uniswap's structure). No fiat Buy/Sell tab: the kit has no on/off-ramp.
- **Connect-wallet modal** — EVM wallets via EIP-6963 detection with
  Detected/Recent badges, and it **names both chains**: a FAssets mint/redeem
  also links an XRPL wallet. This is a deliberate departure from Uniswap, whose
  modal never admits a second chain.
- **Token selector** — search, common-base pills, balance-sorted rows, each with
  its asset mark.

What does NOT change:
- The palette (paper + cobalt, Flare crimson identity-only), the type contract
  (Bricolage / Hanken / JetBrains, exact values in mono with full precision),
  the elevation, shapes, the seven operation-outcome glyphs, and the named-actor
  operation spine. An asset mark is identity, not a state — it does not touch the
  glyph vocabulary. Abu may still tweak one or two palette values later; that is
  a separate accepted-screen change and has not happened yet.

## Why this is not a contradiction of DESIGN.md

The accepted SwapCard already followed the Uniswap swap-card *convention* on
purpose ("the layout follows the convention every trader has muscle memory for").
The re-cut extends that stance to the token selector, order-type tabs and connect
flow. The Anti-references remain in force as an **aesthetic** guard: no generic
crypto dashboard, no neon-on-black, no wall of full-colour vendor logos. Borrow
the convention; keep our surface.

## Licence constraint (load-bearing)

- **Uniswap** web interface (`github.com/Uniswap/interface`, monorepo `apps/web`
  + `packages/{ui,uniswap,wallet}`) is **GPL-3.0**. Read-and-learn only —
  re-implement the patterns; never copy source into a published `@flare-kit`
  package.
- **Jupiter** plugin (`github.com/jup-ag/plugin`) is **MIT** — safe to borrow
  more directly, with attribution. Its wallet UI is a separate package
  (`@jup-ag/wallet-adapter`).

## Logo sourcing (verified 2026-08-09)

- Flare dev-hub marks (MIT, vendored) cover FXRP / XRP / FLR-family / FAssets.
- Trust Wallet assets (MIT) cover FTSO crypto majors but carry **no** Flare-native
  token — the dev-hub marks are the anchor.
- USD₮0 (official media kit), sFLR/wFLR (Sceptre), SGB (Flare brand kit) are the
  sources for the remainder; each vendored with recorded attribution.
- Integration: **bundle vetted SVGs** (e.g. `@flare-kit/icons` /
  `react-ui/src/assets`), not runtime `logoURI` — runtime fetch fails the CSP/
  widget path and leaks which assets a user views.

## Evidence

- Accepted screen: `.thoughts/design/2026-08-09-uniswap-recut-return/swapcard.html`
  (self-contained; real fonts + Flare marks inlined). Template + build note in the
  same folder.
- Reference study: Uniswap + Jupiter source cloned and read (connect modal, token
  selector + logo resolution, Swap/Limit tab structure, theming), and asset-logo
  sourcing, on 2026-08-09.

## Next gate

Same treatment to the next surfaces in coherent batches — **Portfolio →
Send/Deposit** (Jupiter-flavoured), the connect flow built out, then the landing.
As each surface is accepted, extend `DESIGN.md` and fold the work into the M5
spec. Implementation of shipped components is authorized only after the surface's
direction is accepted; a design specimen never authorizes production or claims a
live integration.

## Provenance

- [Accepted contract](../../DESIGN.md) (re-cut note + re-cut component section)
- [External visual-design ownership](2026-08-03-visual-design-ownership.md)
  (Abu retains final taste authority)
- [Build-everything-real-first scope](2026-08-04-build-everything-real-first.md)
  (M5 = swaps/liquidity/vaults, where these surfaces land)
