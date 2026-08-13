import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The CSS and the components have to agree, in both directions.
 *
 * Two M2 defects lived in the gap between them, and neither could fail a
 * rendering test:
 *
 * - `icon="eye"` and `icon="globe"` had no `.fk-i-*` rule. `.fk-i` sets
 *   `background: currentColor` and masks it with `--fk-icon`, so an undefined
 *   icon renders as a **solid black square** — loud on screen, invisible to
 *   jsdom, which has no mask support and no stylesheet.
 * - `ConnectButton` was deleted but its `.fk-account*` rules stayed in
 *   `compose.css` and silently beat the new ones. "Delete dead code as you
 *   migrate" needs something that notices when you did not.
 *
 * These are static checks over the source, so they cost nothing to run and do
 * not depend on a renderer.
 */

// `process.cwd()` is the package root under vitest. `import.meta.url` is
// rewritten by the jsdom environment and does not resolve to a real path.
const SRC = join(process.cwd(), 'src')

function filesUnder(dir: string, extension: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'fonts' || entry.name === 'icons' ? [] : filesUnder(path, extension)
    return entry.name.endsWith(extension) ? [path] : []
  })
}

const tsxSource = filesUnder(SRC, '.tsx')
  .concat(filesUnder(SRC, '.ts'))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')

const cssFiles = filesUnder(SRC, '.css')
const cssSource = cssFiles.map((path) => readFileSync(path, 'utf8')).join('\n')

describe('every icon a component asks for exists', () => {
  const iconsUsed = [...tsxSource.matchAll(/icon="([a-z-]+)"/g)].map((match) => match[1]!)

  it('finds the icons the components use', () => {
    expect(iconsUsed.length).toBeGreaterThan(0)
  })

  it('defines a CSS rule for each one', () => {
    // Without this the icon is not missing — it is a black square.
    const missing = [...new Set(iconsUsed)].filter(
      (name) => !cssSource.includes(`.fk-i-${name} {`),
    )
    expect(missing).toEqual([])
  })

  it('points every icon rule at a file that is actually vendored', () => {
    const referenced = [...cssSource.matchAll(/--fk-icon:\s*url\('\.\/icons\/([^']+)'\)/g)].map(
      (match) => match[1]!,
    )
    expect(referenced.length).toBeGreaterThan(0)
    const absent = referenced.filter((file) => !existsSync(join(SRC, 'icons', file)))
    expect(absent).toEqual([])
  })
})

describe('no CSS outlives the component it styled', () => {
  /**
   * Class names built at runtime — `fk-chip-${tone}`, `fk-g-${glyph}` — are
   * never written out in full in the source, so the prefix is what counts as a
   * reference for them.
   */
  const DYNAMIC_PREFIXES = ['fk-chip-', 'fk-g-', 'fk-i-', 'fk-btn-', 'fk-note-']

  const defined = [...new Set([...cssSource.matchAll(/\.(fk-[a-z0-9-]+)\s*[,{:]/g)].map((m) => m[1]!))]

  it('finds the classes the stylesheets define', () => {
    expect(defined.length).toBeGreaterThan(20)
  })

  it('has a component referencing every class it defines', () => {
    const orphans = defined.filter((name) => {
      if (DYNAMIC_PREFIXES.some((prefix) => name.startsWith(prefix))) return false
      // `fk` and `fk-sr` are the scope root and the screen-reader utility.
      if (name === 'fk' || name === 'fk-sr') return false
      return !tsxSource.includes(name)
    })
    expect(orphans).toEqual([])
  })
})
