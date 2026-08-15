---
version: alpha
name: Flare Kit
description: >-
  Developer kit for the Flare ecosystem. Warm-paper instrument surface,
  cobalt interaction, Flare crimson as identity only. Seeded from the
  cdr-kit reference; not yet ratified by an accepted screen.
colors:
  bg: "#FDFCF9"
  surface: "#F7F6F1"
  card: "#FFFFFF"
  text: "#221D18"
  textMuted: "#68625C"
  textFaint: "#6F6B65"
  border: "#E1DFDB"
  borderControl: "#8D8883"
  primary: "#3959DA"
  primaryHi: "#2B45C5"
  brand: "#E62058"
  brandText: "#C51B4B"
  success: "#00803F"
  successText: "#006B34"
  attention: "#9F5F00"
  attentionText: "#8A5200"
  danger: "#BC2E27"
  partial: "#794DB6"
  neutral: "#68625C"
  bgDark: "#0F1014"
  surfaceDark: "#17191E"
  cardDark: "#17191E"
  textDark: "#F1F0ED"
  textMutedDark: "#9FA5AC"
  textFaintDark: "#858B91"
  borderDark: "#2B2E33"
  borderControlDark: "#5F646A"
  primaryDark: "#7197FF"
  primaryHiDark: "#8EB2FF"
  brandDark: "#FA5574"
  brandTextDark: "#FF6C84"
  successDark: "#5BCC80"
  successTextDark: "#5BCC80"
  attentionDark: "#F0A646"
  attentionTextDark: "#F0A646"
  dangerDark: "#F97163"
  partialDark: "#B995F6"
  neutralDark: "#999FA6"
typography:
  display:
    fontFamily: Bricolage Grotesque
    fontSize: 5.1rem
    fontWeight: 800
    lineHeight: 0.97
    letterSpacing: -0.035em
  h2:
    fontFamily: Bricolage Grotesque
    fontSize: 3rem
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: -0.03em
  h3:
    fontFamily: Bricolage Grotesque
    fontSize: 1.32rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  lede:
    fontFamily: Hanken Grotesk
    fontSize: 1.32rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: -0.005em
  body:
    fontFamily: Hanken Grotesk
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: -0.005em
  small:
    fontFamily: Hanken Grotesk
    fontSize: 0.88rem
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: JetBrains Mono
    fontSize: 0.82rem
    fontWeight: 400
    lineHeight: 1.65
  eyebrow:
    fontFamily: JetBrains Mono
    fontSize: 0.72rem
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.12em
rounded:
  sm: 5px
  md: 9px
  lg: 14px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 72px
components:
  button:
    rounded: "{rounded.md}"
    backgroundColor: "{colors.primary}"
    textColor: "{colors.bg}"
    padding: 11px 18px
  badge:
    rounded: "{rounded.full}"
    typography: "{typography.eyebrow}"
    padding: 4px 9px
  card:
    rounded: "{rounded.lg}"
    backgroundColor: "{colors.card}"
  codeWindow:
    rounded: "{rounded.lg}"
    backgroundColor: "{colors.surface}"
---

# DESIGN.md — Flare Application Layer kit

Status: **accepted contract.** Abu accepted the direction on 2026-08-03 against
two rendered screens. These tokens now outrank every default, every taste skill
and every component-library convention. Change them only through a new accepted
screen.

Accepted screens this file is derived from:
`.thoughts/design/fable5-direction-return/index.html` (landing) and
`.thoughts/design/fable5-direction-return/docs.html` (component documentation),
captured under `renders/`. Lineage: cdr-kit, plus Flare's own brand token.

> **On the `.thoughts/` paths cited throughout this file.** They are provenance,
> recording which accepted screen a token came from. That record is kept locally
> and is not published with the repository, so the paths will not resolve from a
> fresh clone. The token values below are self-contained and remain the contract.

**Re-cut 2026-08-09.** Abu accepted a re-cut toward Uniswap/Jupiter *interaction
conventions* — real bundled asset marks, Swap/Limit tabs, a token selector, and
a connect flow that names both chains — on the same palette, against
`.thoughts/design/2026-08-09-uniswap-recut-return/swapcard.html`. Palette, type
and lifecycle are unchanged; the component vocabulary grows. Decision:
`.thoughts/decisions/2026-08-09-uniswap-recut-direction.md`.

## Overview

A developer kit for the Flare ecosystem: headless TypeScript, React hooks,
styled embeddable widgets and policy-constrained agent tools over one
operation lifecycle. The people who meet it first are developers deciding
whether to integrate, so the front door is a landing page and documentation
with live component previews. The end-user application is dogfooding of the
library, not the product itself.

Emotional target: **an instrument you trust with money that is still in
motion.** Warm paper rather than cold dashboard grey, exact values in mono,
long multi-chain waits presented as legible destinations rather than spinners.

The hardest design problem here is time. A direct FXRP mint spans 8 to 15
minutes across an XRPL payment, an FDC proof and an executor action. Anything
that renders that as an indeterminate spinner has failed.

**Anti-references — aesthetic, not convention.** Do not look like: a generic
crypto dashboard with neon-on-black cards; a Stripe-clone marketing page with
three equal feature cards; Flare's own protocol websites; a wall of full-colour
vendor logos. This bars house *style*, never layout *convention*. As of the
2026-08-09 re-cut (below), the kit deliberately adopts the interaction
conventions traders already have muscle memory for — Uniswap's swap/limit card
and token selector, Jupiter's portfolio send/deposit — rendered on our own
paper + cobalt palette, mono exactness and named-actor lifecycle. Borrow the
convention; keep our surface. This supersedes the earlier "do not reproduce
Uniswap" line; see `.thoughts/decisions/2026-08-09-uniswap-recut-direction.md`.

Sources: `cdr-kit/apps/site/app/globals.css` (system lineage),
`cdr-kit/context/00-START-HERE.md` (kit framing),
`.thoughts/wiki/application-layer.md:19` (accepted product direction),
`developer-hub/src/css/custom.css` (Flare brand).

## Colors

Light is the default. Dark is a peer, switched by `data-theme="dark"` on the
root with a pre-paint script.

**`card: #FFFFFF` in light is deliberate.** The page sits on warm paper
`#FDFCF9`; a pure-white card is how a raised surface separates from it
without needing a shadow. There is no pure `#000000` anywhere.

**`brand` is Flare's `#E62058` and is identity-only.** It reaches 4.34:1 on
paper, failing AA for body text, so it never carries text. Use it for the
logo mark, one emphasised word in a display heading, and section ticks. Where
the brand hue must carry text, use `brandText` at 5.63:1.

**`primary` stays the reference cobalt.** It is the interaction colour:
buttons, links, focus, code keywords. Keeping it distinct from the crimson
brand is what keeps `danger` unambiguous, since red and crimson are
neighbours on the wheel.

**State colour is never the first signal.** Every state pairs its colour with
a glyph and a word.

Verified contrast against each token's own background, light / dark: `text`
16.28 / 16.68; `textMuted` 5.86 / 7.65; `textFaint` 4.89 / 5.11; `primary`
5.66 / 6.86; `success` 4.92 / 9.41; `attention` 4.98 / 9.28; `danger` 5.75 /
6.85; `partial` 5.77 / 7.87. On the soft state tints, `success` and `attention`
fall to 4.34 / 4.40 at chip size — under AA — so small text on a tint carries
`successText` / `attentionText` (5.71 / 5.51 on their tints), the same rule
`brandText` already encodes. Dark needs no darker variant; the `-Text` values
equal the dark hues so one declaration serves both themes. `borderControl` is 3.42 / 3.18, meeting the 3:1
non-text minimum for control boundaries. `border` at 1.30 / 1.40 is a
decorative hairline, never the sole boundary of an interactive control.

**Deliberate divergence from the reference.** cdr-kit's faint ink sits at
3.29:1. Here captions carry load-bearing meaning (timestamps, provider
identity, source freshness, expected wait), so the faint tier was darkened
until it passes AA.

**Corrected 2026-08-05 by M4-R12.** The tier was `#75716B` / `#7B8187`, whose
published ratios were computed against `bg`. Measured against the background it
is actually painted on — `surface`, the worst of the three — it was **4.48 / 4.46**,
missing AA by a hair across eighteen classes. The hue is unchanged; lightness
moved three steps, and the ratios above are now the worst case over `bg`,
`surface` and `card` rather than the best case over `bg` alone.

Sources: accepted screens `index.html` and `docs.html`, both rendering these
exact values via `assets/globals.css`; Flare brand from
`developer-hub/src/css/custom.css`; every ratio computed in-session against
these exact values. Lineage `cdr-kit/apps/site/app/globals.css:10-40`.

## Typography

Self-hosted woff2, already vendored. No CDN font links.

**The exactness rule.** Every amount, address, hash, identifier, round number,
deadline and duration renders in JetBrains Mono with tabular numerals. Prose,
labels and actions render in Hanken Grotesk. A number in the body face is a bug.

Amounts always carry asset and full stored precision: `250.000000 XRP`, never
`250`. Addresses truncate first-6/last-4, hashes first-10/last-6, and the full
value is always copyable.

Emphasis inside a display heading uses weight or the brand colour on a single
word, never a second typeface.

Sources: `cdr-kit/apps/site/lib/fonts.ts`,
`cdr-kit/apps/site/app/globals.css:104-132`,
`.thoughts/design/2026-08-03-product-surface-map.md:377-388`.

## Layout

Container `1180px`, inline padding `28px`, nav height `60px`. Section rhythm
`clamp(56px, 9vw, 116px)`; tight sections `clamp(40px, 6vw, 72px)`.

Breakpoints `960px` and `560px`. Above 960 the marketing and docs layouts are
asymmetric two-column splits (`1.04fr 0.96fr` hero, `0.85fr 1.15fr`
quickstart, `0.82fr 1.18fr` agent section). At 960 they collapse to one column
with `38px` gaps and the docs sidebar becomes a drawer.

Density is deliberately split. Marketing surfaces breathe. Operational
timelines and evidence rows run tight: `8/12` internal padding, hairline
separation, no card chrome per row. Data tables (portfolio, activity, feed
history) took the re-cut's roomy Uniswap density on 2026-08-09 — see
*Components — re-cut 2026-08-09*.

The responsive rule that outranks aesthetics: a narrow viewport may reflow or
stack, but may never hide an exact amount, provider identity, authority, a
public/private boundary, a partial outcome or recovery risk. No horizontal
overflow at any width; wide tables scroll inside their own container.

Sources: `cdr-kit/apps/site/app/globals.css:99-102`,
`cdr-kit/apps/site/app/landing.css:18-21, 94, 106, 213-236`.

## Elevation & Depth

Three warm-tinted levels. A pure black shadow on warm paper reads as dirt.

- `sh-1` `0 1px 2px oklch(.3 .02 70 / .05), 0 1px 1px oklch(.3 .02 70 / .04)` — cards at rest
- `sh-2` `0 2px 8px oklch(.3 .02 70 / .06), 0 1px 2px oklch(.3 .02 70 / .05)` — hover, code windows
- `sh-3` `0 18px 50px -18px oklch(.3 .05 70 / .22), 0 2px 8px oklch(.3 .02 70 / .06)` — modals, floating chips, terminal

In dark theme these become neutral black at higher alpha, since warm tint
vanishes against `#0F1014`. Structure comes from surface steps and hairlines
first, elevation second.

Sources: `cdr-kit/apps/site/app/globals.css:47-50, 76-78`.

## Shapes

Pills are for labels, never for buttons. Buttons are `rounded.md`, so a pill
on screen always means "this is a tag", never "this is an action".

Sources: `cdr-kit/apps/site/app/globals.css:42-45, 194-200`.

## Components

**Buttons.** The primary button is a layered vertical gradient with an inset
top highlight, an inset bottom shadow and a primary-tinted outer glow. This
gradient is deliberate and is the one place gradients are permitted; the
preflight hook should not flag it. The governing rule, inherited verbatim from
the reference: *no flat fills; every interactive surface earns its weight.*
Ghost buttons are transparent with a `borderControl` edge. `:active`
translates 1px down.

**Badges and state chips.** Mono, pill, 1px border, tinted background, plus a
glyph. The glyph vocabulary is fixed: filled disc = complete, ring = working,
dashed ring = waiting on an external actor, filled square = your action
required, half disc = partial, cross = failed, dotted ring = outcome unknown.

**The seven are an operation-outcome vocabulary, and only outcomes carry them.**
A chip that *labels* — a mode badge like `mock kit`, a property badge like
`Renamed` — takes its word and no mark. Both previously borrowed `unknown`,
which means *outcome unknown*, so a label was claiming something it cannot know;
the dotted-ring change made that claim more legible rather than less. Inflating a
fixed vocabulary with an eighth "this is a label" mark would be worse than saying
labels do not take one. The rule is that every **state** pairs its colour with a
glyph and a word — a label is not a state. Decided 2026-08-05.

Seven marks, seven **shapes**. No state is told apart from another by colour,
weight or opacity alone — that is what "colour is never the first signal" means
when it is applied to the vocabulary itself. Until 2026-08-05 `waiting` and
`unknown` were the same dashed ring separated by `opacity: 0.6`, which failed
that rule and dimmed the most-used mark on the FTSO surfaces below the contrast
tier it was verified at. Abu chose the dotted ring.

A live badge adds a pulsing dot; under reduced motion the pulse becomes a static
`LIVE` tick.

**Operation spine.** The signature component. A vertical rail of steps where
each node carries the glyph above and each row names its owning actor: you,
your wallet, the XRPL network, the FDC protocol, a named executor, the policy
engine, an operator. Long waits state four things in order: current stage,
expected range, awaited actor, safe user action.

**Evidence chip.** One anatomy everywhere: mono type label, truncated
identifier, copy control revealing the full value. Identical in the widget,
the timeline, the receipt, the operator console and the support workspace.

**Code window.** `rounded.lg` frame, `surface` title bar with a mono filename,
copy control, horizontal scroll inside its own container. Install blocks carry
package-manager tabs.

**Live component preview.** Preview and Code tabs, a `mock kit` badge, a reset
control. Every preview runs against an in-memory mock so a visitor needs no
wallet, no chain and no testnet funds to see the component work. Docs are
mock; scaffolded apps are live.

**Terminal.** Dark panel even in light theme, for agent-run transcripts only.

**Skeletons, never spinners.** Loading states mirror the final layout's shape.
Determinate multi-stage waits show stage progress.

Sources: `cdr-kit/apps/site/app/globals.css:134-278`,
`cdr-kit/apps/site/app/landing.css:104-136`,
`cdr-kit/apps/site/components/docs/demo.tsx`,
`.thoughts/design/2026-08-03-product-surface-map.md:482-492`.

## Components — re-cut 2026-08-09

**Asset marks.** Assets render their real logo, not a monogram. The mark is a
bundled SVG — the official Flare marks (MIT, vendored in
`developer-hub/static/img/ui/`) for FXRP, XRP, FLR/WFLR/C2FLR and FAssets —
framed inside the token circle. Assets with no bundled mark fall back to a
seeded monogram on a deterministic colour, never a remote image. Resolution is
`bundled SVG → seeded monogram`, so it holds under a widget's strict CSP with no
external request. Full colour is allowed on the mark itself and nowhere else; a
wall of full-colour logos is the anti-reference, a single framed mark is not.
Resolution lives in one `AssetLogo`, never inline in a row. This does not touch
the seven operation-outcome glyphs — an asset mark is identity, not a state.

**Order-type tabs.** Swap and Limit are one card with a segmented control and one
shared currency context — Uniswap's structure, re-derived (their web code is
GPL-3.0; we read it and reimplement, never copy it into a published package).
There is no fiat Buy/Sell tab: the kit has no on/off-ramp, and a tab that cannot
act is not shown.

**Connect + token selector.** The connect modal lists EVM wallets by EIP-6963
detection with Detected/Recent badges, and states plainly that a FAssets
mint/redeem also links an XRPL wallet — it names both chains rather than hiding
the second. The token selector carries search, common-base pills and
balance-sorted rows, each with its asset mark.

**Data tables.** Portfolio, activity and feed history compose one `DataTable`,
re-cut 2026-08-09 to Uniswap's data-table density: `64px` rows (a floor, not a
cap — a cell whose content stacks grows past it), a soft `surface` header pill
(sentence-case `text-muted`/500, no uppercase, no heavy rule, sticky), tabular
numerals and right-alignment baked into the numeric cell rather than set per
column, per-cell skeleton bubbles never a spinner, and a full-width `surface`
row-hover with no per-row card. The density lives once in `data.css`, so every
table inherits it. This overrides the older "operator tables run tight" rule for
tables only; timelines and evidence rows stay tight. A pinned identity column is
deferred until a table can be told its own backdrop — a sticky cell must paint
opaque, and the correct colour is the host container's, not the primitive's.

**Info notes recede.** An info note carries explanation, never an outcome, so
re-cut 2026-08-09 it drops the cobalt for a muted `--fk-tint` card — a hairline,
a text-tier title and a faint glyph. The operation-outcome tones (`att`, `bad`,
`ok`) keep their colour: severity is still gated, only the non-status tone stops
shouting. Demoted once on `.fk-note-info`, so every info note across the kit
recedes together, and no note's copy or its screen-reader role changes — the
blue was the noise, not the words.

Sources: accepted screen `.thoughts/design/2026-08-09-uniswap-recut-return/swapcard.html`;
logo sourcing and CSP rationale + Uniswap/Jupiter code anatomy captured with the
decision record; Flare marks `developer-hub/static/img/ui/*.svg` (MIT).

## Do's and Don'ts

**Do** give every interactive surface real weight: gradient, inset highlight
and tinted glow on primary actions.

**Do** render every exact value in JetBrains Mono with tabular numerals.

**Do** state long waits as stage, expected range, awaited actor, safe action.

**Do** keep provider, venue, relayer, executor and explorer identities as
proper nouns.

**Do** pair every status colour with a glyph and a word.

**Don't** use a spinner for anything taking longer than a few seconds.

**Don't** show `submitted` as `succeeded`, or an unknown outcome as failed.

**Don't** put `brand` crimson on text, or use it to signal a status.

**Don't** collapse a partial outcome into a success or an error toast.

**Don't** hide fees, authority, provider, recovery risk or a public/private
boundary behind an "advanced" disclosure when it changes a signing decision.

**Don't** let a mobile layout become a stripped summary exactly when risk and
recovery matter most.

**Don't** ship a marketing page pretending to be the application, or an
application shell pretending to be the kit.

Accessibility bar: WCAG 2.2 AA on every kit-controlled surface. Focus is a 2px
`primary` ring at 2px offset, never suppressed. Interactive targets are at
least 24x24 CSS px with adequate spacing. Every state change is announced in
text. Reduced motion collapses transitions to instant and replaces the live
pulse with a static tick.

Sources: `cdr-kit/apps/site/app/globals.css:145-147` (the weight rule,
verbatim), `.thoughts/design/2026-08-03-product-surface-map.md:478-537`.
