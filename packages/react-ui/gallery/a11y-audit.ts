/**
 * M4-R12 — WCAG 2.2 AA against **rendered** pixels, not markup and not a
 * screenshot.
 *
 * Attached to `window.__auditA11y` by the gallery so it can be re-run by anyone
 * with the page open, rather than existing only in the transcript of the session
 * that wrote it.
 *
 * The method matters more than the numbers, because an earlier ad-hoc sweep got
 * this wrong in a way that looked like a pass:
 *
 * - **`getComputedStyle().color` does not include `opacity`.** A checker that
 *   reads it directly clears every dimmed element in the kit. Measured on
 *   `.fk-src-age` at `opacity: 0.8`: the declared colour reads 4.67:1 and
 *   passes; composited it is 3.36:1 and fails. The tell that a checker is broken
 *   is two elements of different opacity reporting an identical ratio.
 * - **Composite in sRGB byte space _before_ linearising.** That is the order the
 *   browser uses; compositing in linear space is off by about half a point.
 * - **Linearise with the WCAG piecewise curve, not gamma 2.2.**
 *
 * Calibrate any change to this file against one element of known opacity before
 * trusting a single number it emits.
 */

/** WCAG 2.2: 4.5:1 for body text, 3:1 for large text and non-text graphics. */
const AA_TEXT = 4.5
const AA_LARGE = 3
/** DESIGN.md: interactive targets are at least 24x24 CSS px. */
const MIN_TARGET = 24

export interface A11yFinding {
  readonly kind: 'contrast' | 'target-size' | 'focus' | 'not-measurable'
  readonly selector: string
  readonly detail: string
  readonly sample: string
}

type Rgb = readonly [number, number, number]

const channel = (c: number) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

const luminance = ([r, g, b]: Rgb) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

const parse = (value: string): Rgb | undefined => {
  const parts = value.match(/[\d.]+/g)
  if (!parts || parts.length < 3) return undefined
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])]
}

function ratio(fg: Rgb, bg: Rgb): number {
  const a = luminance(fg)
  const b = luminance(bg)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/** Every ancestor's opacity multiplies. One element's own value is not enough. */
function effectiveOpacity(el: Element): number {
  let out = 1
  let node: Element | null = el
  while (node && node !== document.documentElement) {
    out *= Number(getComputedStyle(node).opacity)
    node = node.parentElement
  }
  return out
}

/** The first ancestor that actually paints. A transparent parent is not a background. */
function backgroundOf(el: Element): Rgb {
  let node: Element | null = el.parentElement
  while (node) {
    const declared = getComputedStyle(node).backgroundColor
    const parts = declared.match(/[\d.]+/g)
    const alpha = parts && parts.length > 3 ? Number(parts[3]) : 1
    if (parts && alpha > 0.9) return parse(declared) as Rgb
    node = node.parentElement
  }
  return parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255]
}

/**
 * Whether the element paints over a gradient.
 *
 * A gradient has no single background colour, so walking to the nearest painted
 * ancestor measures the wrong thing entirely: the primary button's near-white
 * label was being compared against the white card *behind* its cobalt gradient,
 * reporting 1.03:1. That is not a failure and not a pass — it is a question this
 * method cannot answer, and saying so is the only honest option.
 */
function overGradient(el: Element): boolean {
  let node: Element | null = el
  while (node && node !== document.documentElement) {
    const image = getComputedStyle(node).backgroundImage
    if (image.includes('gradient')) return true
    const declared = getComputedStyle(node).backgroundColor
    const parts = declared.match(/[\d.]+/g)
    if (parts && (parts.length < 4 || Number(parts[3]) > 0.9)) return false
    node = node.parentElement
  }
  return false
}

const composite = (fg: Rgb, bg: Rgb, alpha: number): Rgb =>
  [0, 1, 2].map((i) => alpha * fg[i]! + (1 - alpha) * bg[i]!) as unknown as Rgb

/** Elements holding their own text, ignoring wrappers and screen-reader copy. */
/** `<script>`, `<style>` and `<title>` hold text that is never painted. */
const NOT_RENDERED = new Set(['SCRIPT', 'STYLE', 'TITLE', 'HEAD', 'META', 'LINK', 'NOSCRIPT'])

function textNodes(root: ParentNode): Element[] {
  return [...root.querySelectorAll('*')].filter((el) => {
    if (NOT_RENDERED.has(el.tagName)) return false
    if (el.classList.contains('fk-sr')) return false
    if (el.closest('[aria-hidden="true"]')) return false
    // WCAG 2.2 1.4.3 exempts inactive controls. A disabled button is dimmed on
    // purpose and is not a contrast defect — flagging it buries the real ones.
    if ((el as HTMLButtonElement).disabled || el.closest('button:disabled')) return false
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())
  })
}

function describe(el: Element): string {
  const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : ''
  return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase()
}

export function auditA11y(root: ParentNode = document): A11yFinding[] {
  const findings: A11yFinding[] = []
  const seen = new Set<string>()

  for (const el of textNodes(root)) {
    const style = getComputedStyle(el)
    const colour = parse(style.color)
    if (!colour) continue

    const size = parseFloat(style.fontSize)
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)

    if (overGradient(el)) {
      const key = `gradient:${describe(el)}`
      if (seen.has(key)) continue
      seen.add(key)
      findings.push({
        kind: 'not-measurable',
        selector: describe(el),
        detail:
          'paints over a gradient, which has no single background colour — verify this one by hand against the gradient stops',
        sample: (el.textContent ?? '').trim().slice(0, 48),
      })
      continue
    }

    const alpha = effectiveOpacity(el)
    const bg = backgroundOf(el)
    const measured = ratio(composite(colour, bg, alpha), bg)
    const required = large ? AA_LARGE : AA_TEXT

    if (measured < required) {
      const key = `contrast:${describe(el)}`
      if (seen.has(key)) continue
      seen.add(key)
      findings.push({
        kind: 'contrast',
        selector: describe(el),
        detail: `${measured.toFixed(2)}:1 against ${required}:1 required (${size}px${alpha < 1 ? `, composited at opacity ${alpha.toFixed(2)}` : ''})`,
        sample: (el.textContent ?? '').trim().slice(0, 48),
      })
    }
  }

  // Interactive targets. A disabled control is exempt from 1.4.3 but not from
  // being big enough to hit, so size is checked on every control.
  for (const el of root.querySelectorAll('button, a[href], input, select, [role="button"]')) {
    const box = el.getBoundingClientRect()
    if (box.width === 0 && box.height === 0) continue
    if (box.height >= MIN_TARGET && box.width >= MIN_TARGET) continue
    const key = `target:${describe(el)}`
    if (seen.has(key)) continue
    seen.add(key)
    findings.push({
      kind: 'target-size',
      selector: describe(el),
      detail: `${Math.round(box.width)}x${Math.round(box.height)} against ${MIN_TARGET}x${MIN_TARGET} minimum`,
      sample: (el.textContent ?? '').trim().slice(0, 48),
    })
  }

  // DESIGN.md: focus is a 2px primary ring at 2px offset, never suppressed.
  // `outline: none` with nothing replacing it is the failure this catches.
  for (const el of root.querySelectorAll('button, a[href], input, select')) {
    const style = getComputedStyle(el, ':focus-visible')
    const suppressed =
      (style.outlineStyle === 'none' || parseFloat(style.outlineWidth) === 0) &&
      style.boxShadow === 'none'
    if (!suppressed) continue
    const key = `focus:${describe(el)}`
    if (seen.has(key)) continue
    seen.add(key)
    findings.push({
      kind: 'focus',
      selector: describe(el),
      detail: 'no focus indicator: outline suppressed and no box-shadow replacing it',
      sample: (el.textContent ?? '').trim().slice(0, 48),
    })
  }

  return findings
}
