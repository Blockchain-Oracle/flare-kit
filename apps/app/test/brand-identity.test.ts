import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The app's tab icon is a fourth drawing of one identity — after the canonical
 * asset in `brand/`, the site's `BrandMark` component and the site's icon.
 * Nothing type-checks a favicon, so this app pins its own copy to the canonical
 * geometry exactly as `apps/site/test/brand-identity.test.ts` pins the site's.
 */
const CANONICAL = readFileSync('../../brand/flare-kit-mark.svg', 'utf8')
const ICON = readFileSync('app/icon.svg', 'utf8')

/** The drawn shapes, normalised: self-closing slashes and spacing vary by author. */
function shapes(svg: string): string[] {
  return (svg.match(/<(?:rect|circle)\b[^>]*>/g) ?? []).map((tag) =>
    tag
      .replace(/\s*\/?>$/, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

describe("the app's tab icon is the same mark", () => {
  it('carries the canonical geometry', () => {
    expect(shapes(ICON)).toEqual(shapes(CANONICAL))
  })

  it('draws on the same viewBox, so it does not crop', () => {
    expect(ICON).toMatch(/viewBox="0 0 48 48"/)
  })

  /**
   * A favicon renders against the browser's chrome, not our page, so it cannot
   * inherit `currentColor`. It carries the brand crimson literally — a
   * sanctioned use of the brand colour.
   */
  it('carries the brand crimson rather than currentColor', () => {
    expect(ICON).toMatch(/#e62058/i)
    expect(ICON).not.toMatch(/currentColor/)
  })

  it('names the product for assistive technology', () => {
    expect(ICON).toMatch(/aria-label="flare-kit"/)
  })
})
