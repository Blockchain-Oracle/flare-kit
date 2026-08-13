# M4-R12 — WCAG 2.2 AA against rendered pixels

Ran 2026-08-05 against the state gallery, every surface M1–M4, both themes.
Method and checker: `packages/react-ui/gallery/a11y-audit.ts`, exposed on the
page as `window.__auditA11y()` so it is re-runnable rather than a one-off.

## Result

**Zero contrast, target-size or focus failures in either theme.**

One case is reported `not-measurable` by design and was verified by hand: the
primary button's label sits on a three-stop gradient, which has no single
background colour. `#fdfcf9` against each stop — `#4b69e4` **4.61:1**,
`#3959da` **5.66:1**, `#2b45c5` **7.42:1**. It clears AA at the worst stop.

## What the run changed

| fix | why |
|---|---|
| `--fk-text-faint` `#75716B` → `#6F6B65`, `#7B8187` → `#858B91` | Measured **4.48 / 4.46** against `surface`, the background it is actually painted on, failing AA across eighteen classes. DESIGN.md's published 4.73 / 4.83 were computed against `bg`, the most flattering of the three. Hue unchanged; lightness moved three steps. The contract now records the **worst case** over `bg`, `surface` and `card`. |
| `.fk-src-age` — `opacity: 0.8` removed | Composited to **3.36:1** on every `SourceChip` across M2, M3 and M4. How old an observation is *is* the claim. |
| `.fk-ev-link` — `min-height: 24px` | Measured **40x18** against WCAG 2.2 2.5.8's 24x24 minimum. An inline box is only as tall as its line, and a truncated hash is a short one. |

## Two method traps this run hit, both recorded so they are not repeated

**`getComputedStyle().color` does not include `opacity`.** A checker reading it
directly clears every dimmed element in the kit. `.fk-src-age` reads 4.67:1
declared and **3.36:1 composited**. The tell is two elements of different
opacity reporting an identical ratio. The checker is calibrated against exactly
this element before its output is trusted; compositing happens in sRGB byte
space **before** linearising, which is the order the browser uses.

**Toggling `data-theme` from script and measuring in the same task lies.** Doing
so reported the ghost button at **1.05:1** in dark — near-black on near-black —
and it is not real: the custom property changed without dependent `color` values
recomputing. Driven through the gallery's own toggle the same button is
`rgb(241, 240, 237)`, correct. A dark-theme "bug" was nearly fixed that never
existed. **Measure through the application's real state change, never by poking
an attribute.**
