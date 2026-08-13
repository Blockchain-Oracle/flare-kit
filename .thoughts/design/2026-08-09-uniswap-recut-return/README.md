# Uniswap re-cut — direction return (2026-08-09)

**Accepted by Abu on 2026-08-09** as the direction to go ("this is perfect, it's
my direction"). This is the first accepted screen of the re-cut; `DESIGN.md` and
`.thoughts/decisions/2026-08-09-uniswap-recut-direction.md` are derived from it.

## Files

- `swapcard.html` — the accepted screen, self-contained (real Bricolage / Hanken
  / JetBrains woff2 and the official Flare asset marks inlined as data URIs).
  Opens in any browser with no network; also the exact shape a CSP-locked widget
  ships. This is the acceptance evidence.
- `swapcard.template.html` — source with `__ASSET__` placeholders; the inliner
  base64-embeds fonts from
  `.thoughts/design/fable5-direction-return/assets/fonts/` and marks from
  `developer-hub/static/img/ui/*.svg`, then substitutes.

Also published as a private Artifact:
`https://claude.ai/code/artifact/500ea1e9-8c26-4ed2-8690-355eb56f1d08`.

## What it demonstrates

Same accepted anatomy (label, amount, fiat sub-value, balance + MAX, flip,
detail block, one primary button whose label is the state machine), plus the
four re-cut additions:

1. **Real asset marks** — FXRP / FLR / XRP / FAssets render the bundled Flare
   SVG; USD₮0 / sFLR / SGB show the seeded-monogram fallback. Bundled → monogram,
   no remote image.
2. **Swap / Limit** segmented tabs on one card.
3. **Connect modal** — EIP-6963 Detected/Recent badges; names the XRPL leg for
   FAssets.
4. **Token selector** — search, common-base pills, balance-sorted rows with marks.

Palette, type and lifecycle are unchanged from the 2026-08-03 accepted contract.

## Lineage

- Convention re-derived from Uniswap (`github.com/Uniswap/interface`, GPL —
  read-only) and Jupiter (`github.com/jup-ag/plugin`, MIT). See the decision
  record for the licence map and logo sourcing.
- Supersedes the "do not reproduce Uniswap" clause; keeps the aesthetic
  anti-references.
