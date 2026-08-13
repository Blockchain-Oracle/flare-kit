import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The other direction.
 *
 * `css-integrity.test.ts` checks that every class a stylesheet **defines** is
 * referenced by a component — it catches CSS outliving the thing it styled. It
 * does not check the reverse, and that gap is how `.fk-fdc-catalogue` survived
 * a green suite: applied on `AttestationCatalogue`'s root, defined nowhere, so
 * the surface computed to `display: block` with no gap while its FTSO twin was
 * flex-column. Found by measurement in the browser, not by the suite.
 *
 * A class that styles nothing is not a crash. It is a component quietly not
 * getting the layout its author believed they had written — which is exactly
 * the kind of defect that only shows up when somebody happens to look.
 */

const SRC = join(process.cwd(), 'src')

function filesUnder(dir: string, extension: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'fonts' || entry.name === 'icons' ? [] : filesUnder(path, extension)
    }
    return entry.name.endsWith(extension) ? [path] : []
  })
}

const tsxSource = filesUnder(SRC, '.tsx')
  .concat(filesUnder(SRC, '.ts'))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')

const cssSource = filesUnder(SRC, '.css')
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')

/**
 * Classes that deliberately style nothing.
 *
 * `fk` is the token scope itself and is defined; the rest are hooks a host or a
 * test targets rather than rules this package paints. Each entry is a claim that
 * the absence is intentional — if a class ends up here to silence the test
 * rather than because it is genuinely presentational-free, that is the failure
 * this list has to be read for.
 */
const INTENTIONALLY_UNSTYLED = new Set<string>([
  // Both sit on a `<tr>`, where the stacking rules the other surface roots use
  // would break table layout. They exist so a test and a screen reader can find
  // the loading rows; the visible skeleton is `.fk-skeleton` on the cell inside.
  'fk-sr-row',
  'fk-table-skeleton',
])

describe('no component applies a class that styles nothing', () => {
  // Only literal `className="fk-..."` and the class lists inside template
  // strings. Runtime-built names (`fk-chip-${tone}`) are covered by the
  // prefix rule in the sibling test and cannot be resolved statically.
  const applied = new Set<string>()
  for (const match of tsxSource.matchAll(/className=\{?[`'"]([^`'"$]*)/g)) {
    for (const name of (match[1] ?? '').split(/\s+/)) {
      // `fk-chip-${tone}` truncates at the interpolation, leaving a bare
      // prefix. Those are covered by the sibling test's prefix rule.
      if (name.startsWith('fk-') && !name.endsWith('-')) applied.add(name)
    }
  }

  it('finds the classes the components apply', () => {
    expect(applied.size).toBeGreaterThan(20)
  })

  it('defines a rule for every one of them', () => {
    const undefined_ = [...applied]
      .filter((name) => !INTENTIONALLY_UNSTYLED.has(name))
      .filter((name) => !new RegExp(`\\.${name}[\\s,{:>]`).test(cssSource))
      .sort()
    expect(undefined_).toEqual([])
  })
})
