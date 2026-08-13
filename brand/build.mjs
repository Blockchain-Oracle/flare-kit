/**
 * Regenerates flare-kit-mark.svg, flare-kit-logo.svg and flare-kit-banner.svg.
 *
 * The wordmark is committed as OUTLINED PATHS, not <text>. An SVG shown on
 * GitHub or npm is served as an image through camo, whose CSP forbids loading
 * a font — so live text would silently fall back to a system face. Outlines
 * render identically everywhere.
 *
 * packages.svg and architecture.svg are hand-authored and NOT generated here.
 * They keep live <text> on a system font stack on purpose: they are diagrams
 * that must stay editable, and a diagram is not brand type.
 *
 * Two dependencies are needed that are deliberately NOT workspace packages —
 * this is run by hand, rarely, and adding them would put two unused entries in
 * every install:
 *
 *   mkdir -p /tmp/fk-brand && cd /tmp/fk-brand
 *   npm init -y && npm i opentype.js wawoff2
 *   node <repo>/brand/build.mjs
 *
 * Both are resolved from the working directory rather than by bare import,
 * because node resolves a bare specifier next to the SCRIPT — which would send
 * it looking inside the repository for two packages that are not installed
 * there, and are not meant to be.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(join(process.cwd(), 'noop.cjs'))
let opentype, wawoff2
try {
  opentype = require('opentype.js')
  wawoff2 = require('wawoff2')
} catch {
  console.error(
    'Missing build tools. From a scratch directory:\n' +
      '  npm init -y && npm i opentype.js wawoff2\n' +
      '  node <repo>/brand/build.mjs',
  )
  process.exit(1)
}

const BRAND = dirname(fileURLToPath(import.meta.url))
const FONTS = join(BRAND, '..', 'packages', 'react-ui', 'src', 'fonts')

// DESIGN.md. `brand` is identity-only; the mark is one of its three sanctioned
// uses. The standalone logo is all-crimson so a single file survives an unknown
// background — the banner brings its own paper, so its wordmark can be ink.
const CRIMSON = '#e62058'
const PAPER = '#fdfcf9'
const INK = '#221d18'
const MUTED = '#68625c'
const LINE = '#e1dfdb'

async function face(file) {
  const ttf = await wawoff2.decompress(readFileSync(join(FONTS, file)))
  return opentype.parse(new Uint8Array(ttf).buffer)
}

/** Lay out a string as one path, applying tracking between glyphs. */
function outline(font, text, size, trackingEm = 0) {
  let x = 0
  const path = new opentype.Path()
  for (const ch of text) {
    const glyph = font.charToGlyph(ch)
    path.extend(glyph.getPath(x, 0, size))
    x += (glyph.advanceWidth / font.unitsPerEm) * size + trackingEm * size
  }
  const bb = path.getBoundingBox()
  return { d: path.toPathData(2), width: bb.x2, capHeight: -bb.y1 }
}

// Candidate A, accepted 2026-08-13: a descending stack closed by a node.
const MARK_SHAPES = `<rect x="4" y="8" width="40" height="7" rx="3.5"/>
  <rect x="4" y="20.5" width="28" height="7" rx="3.5"/>
  <rect x="4" y="33" width="16" height="7" rx="3.5"/>
  <circle cx="37.5" cy="36.5" r="6.5"/>`

const bricolage = await face('BricolageGrotesque-800.woff2')
const hanken = await face('HankenGrotesk-500.woff2')

// ── mark ──────────────────────────────────────────────────────────────────
writeFileSync(
  join(BRAND, 'flare-kit-mark.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" fill="${CRIMSON}" role="img" aria-label="flare-kit">
  ${MARK_SHAPES}
</svg>
`,
)

// ── logo lockup ───────────────────────────────────────────────────────────
const word = outline(bricolage, 'flare-kit', 100, -0.03)
const scale = 30 / word.capHeight // cap height 30 sits optically inside the mark's 48
const GAP = 13
const logoW = Math.round(48 + GAP + word.width * scale)
const baseline = (48 + word.capHeight * scale) / 2

writeFileSync(
  join(BRAND, 'flare-kit-logo.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${logoW} 48" width="${logoW}" height="48" fill="${CRIMSON}" role="img" aria-label="flare-kit">
  ${MARK_SHAPES}
  <g transform="translate(${48 + GAP} ${baseline.toFixed(2)}) scale(${scale.toFixed(5)})">
    <path d="${word.d}"/>
  </g>
</svg>
`,
)

// ── banner ────────────────────────────────────────────────────────────────
const BW = 1200
const BH = 300
const L = 88
const MARK_PX = 74
const markY = 68

const bWord = outline(bricolage, 'flare-kit', 82, -0.03)
const bTag = outline(hanken, 'The developer toolkit for Flare', 25)
const bSub = outline(
  hanken,
  'One operation lifecycle across TypeScript, React, widgets and agent tools.',
  17,
)

writeFileSync(
  join(BRAND, 'flare-kit-banner.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BW} ${BH}" width="${BW}" height="${BH}" role="img" aria-label="flare-kit — the developer toolkit for Flare">
  <rect width="${BW}" height="${BH}" fill="${PAPER}"/>
  <g transform="translate(${L} ${markY}) scale(${(MARK_PX / 48).toFixed(4)})" fill="${CRIMSON}">
    ${MARK_SHAPES}
  </g>
  <g transform="translate(${L + MARK_PX + 24} ${(markY + MARK_PX / 2 + bWord.capHeight / 2 - 2).toFixed(1)})" fill="${INK}"><path d="${bWord.d}"/></g>
  <g transform="translate(${L} ${markY + MARK_PX + 60})" fill="${INK}"><path d="${bTag.d}"/></g>
  <g transform="translate(${L} ${markY + MARK_PX + 97})" fill="${MUTED}"><path d="${bSub.d}"/></g>
  <rect x="0" y="${BH - 6}" width="${BW}" height="1" fill="${LINE}"/>
  <rect x="0" y="${BH - 5}" width="${BW}" height="5" fill="${CRIMSON}"/>
</svg>
`,
)

console.log(`  flare-kit-mark.svg    48x48`)
console.log(`  flare-kit-logo.svg    ${logoW}x48`)
console.log(`  flare-kit-banner.svg  ${BW}x${BH}`)
