# Verification: site shell and landing page

Date: 2026-08-13
Branch: `docs-and-branding`
Scope: plan 1 of 3 — `apps/site` shell and landing page (tasks 1–7)
Network: none. This milestone touches no chain; the landing card runs the mock
state machine, which is labelled as such on screen.

## Gate

Run from the repository root. Exit codes captured separately per command, not
through a pipe — `pnpm lint` is `eslint .` directly, so piping to `tail` reports
`tail`'s status.

```
pnpm build      → 0    Tasks: 5 successful, 5 total
pnpm typecheck  → 0    Tasks: 11 successful, 11 total
pnpm lint       → 0    (eslint ., no output)
pnpm test       → 0    Tasks: 11 successful, 11 total
```

Test totals from the output:

| Package | Files | Tests |
| --- | --- | --- |
| `@flare-kit/react-ui` | 38 passed | 385 passed |
| `@flare-kit/react` | 8 passed | 57 passed |
| `@flare-kit/site` | 3 passed | 11 passed |
| `@flare-kit/x402-server` | 1 passed | 12 passed |
| `@flare-kit/relayer` | 1 passed | 7 passed |

## Token inheritance, verified in the browser

The site declares no tokens. It puts `.fk` on `<body>` and wears
`@flare-kit/react-ui`'s contract. `test/kit-inheritance.test.ts` proves the two
lines are present; it cannot prove the cascade resolves. Read from
`getComputedStyle` on the rendered page:

| Reading | Value |
| --- | --- |
| `document.body.className` | `fk` |
| `body` `font-family` | `"Hanken Grotesk", system-ui, sans-serif` |
| `body` `background-color` | `rgb(253, 252, 249)` — `--fk-bg` |
| `--fk-primary` | `#3959da` |
| `--fk-font-display` | `"Bricolage Grotesque", system-ui, sans-serif` |

All nine kit `@font-face` rules register and load on demand through the
workspace link (`document.fonts`): Bricolage Grotesque 600/700/800, Hanken
Grotesk 400/500/600, JetBrains Mono 400/500/700. Faces report `unloaded` until
first use, which is why a bare `document.fonts.check()` on an unused weight
returns false; forcing use resolves them to `loaded`.

## Theme

`data-theme` is stamped on `<html>` before first paint by an inline script.
Toggling flips the attribute, persists to `localStorage['fk-theme']`, and the
kit tokens follow — `--fk-bg` moves between `#fdfcf9` and the dark value, and
the toggle's glyphs swap by CSS with no React state.

## Contrast, both themes

Measured from computed styles on the rendered page, compositing alpha layers
and with transitions disabled — an earlier sweep that ignored alpha and sampled
mid-transition produced four false failures, all since resolved.

Landing type, light → dark:

| Element | Light | Dark |
| --- | --- | --- |
| Display heading | 16.28 | 16.68 |
| `recover` (`--fk-brand-text`) | 5.63 | 7.00 |
| Lede | 5.86 | 7.65 |
| Eyebrow (mono, 11.5px) | 5.16 | 5.52 |
| Install command (mono) | 16.28 | 16.68 |

A full sweep over every text-bearing element in both themes reports **no
failures** other than the open defect below.

## Open defect — `.fk-btn-primary` fails AA in dark theme

**This is a kit defect, not a site defect, and it is not fixed here.**

`packages/react-ui/src/primitives.css` hardcodes the primary button's text
colour while deriving its fill from theme tokens:

```css
.fk-btn-primary {
  color: #fdfcf9;
  background: linear-gradient(180deg, #4b69e4 0%, var(--fk-primary) 60%, var(--fk-primary-hi) 100%);
}
```

In dark theme `--fk-primary` becomes `#7197ff` and `--fk-primary-hi` becomes
`#8eb2ff`, so the fill *lightens* while the text stays near-white.

| Theme | Gradient stops | Ratios | Worst |
| --- | --- | --- | --- |
| Light | `rgb(75,105,228)` → `rgb(57,89,218)` → `rgb(43,69,197)` | 4.61 / 5.66 / 7.42 | **4.61** — passes |
| Dark | `rgb(75,105,228)` → `rgb(113,151,255)` → `rgb(142,178,255)` | 4.61 / 2.70 / 2.05 | **2.05** — fails |

Text is 13.76px at weight 600, so the threshold is 4.5. Every consumer of
`@flare-kit/react-ui` inherits this, not just the site.

The fix belongs in the kit and has a design choice in it — darken the text on
primary in dark (an `--fk-on-primary` token, which the contract does not
currently have), or keep the gradient dark in dark theme. Raised rather than
chosen unilaterally.

Light theme also passes only narrowly at 4.61.

## Accessibility

`apps/site/test/a11y.test.tsx` runs axe-core over Hero, LiveOperation,
SiteFooter and ThemeToggle. **0 violations.**

One violation was found and fixed during this pass: `heading-order` on the
footer, whose column headings were `<h4>` while the page outline runs `h1`
(hero) → `h2` (section), skipping `h3`. Changed to `<h3>`.

`SiteNav` is excluded from the jsdom pass because it calls `usePathname()`,
which needs App Router context jsdom cannot supply; it was checked in the
browser instead.

axe's `color-contrast` rule does not run under jsdom — it needs
`HTMLCanvasElement.getContext`, which logs `Not implemented` there. That is why
contrast is measured directly from computed styles above rather than being
treated as covered by the axe pass.

## Honest-rendering check

The landing operation card renders a record the mock actually produced. The
trace for `scenario: 'happy'`, `seed: 'landing'` runs:

```
submitted → confirming → awaiting_external → awaiting_external → action_required → succeeded
```

The card renders the `awaiting_external` record. On screen: two steps done, the
FDC step active, two pending, `Waiting on the Flare Data Connector` with the
real reason string, and `Nothing for you to do yet` — no spinner, no invented
outcome, and nothing rendered as `succeeded` while in flight. The `mock kit`
label sits beside the section heading. Missing the state throws rather than
falling back to another record.

## Not done in this plan

The `/docs` routes, Pagefind, `llms.txt` and the `<Preview>` component are plan
2. The nav's search slot is an inert placeholder and its four links all point at
`/docs`.
