import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The brandmark is drawn in three places: the canonical asset in `brand/`, the
 * `BrandMark` component the shell renders, and the tab icon. Three copies of one
 * identity drift silently — nothing type-checks a favicon, and nobody notices a
 * wrong tab icon in review.
 *
 * These tests pin all three to the same geometry, so changing the mark means
 * changing it everywhere or failing here.
 */
const CANONICAL = readFileSync('../../brand/flare-kit-mark.svg', 'utf8')
/**
 * The mark moved into the kit: a brandmark needed by two apps is one shared
 * component, not a copy per app. The guard follows it rather than being
 * dropped — it is the only thing standing between one identity and four
 * drawings of it.
 */
const COMPONENT = readFileSync('../../packages/react-ui/src/BrandMark.tsx', 'utf8')
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

describe('the brandmark is one mark, not three drawings', () => {
  it('gives the tab icon the canonical geometry', () => {
    expect(shapes(ICON)).toEqual(shapes(CANONICAL))
  })

  it('gives the shell component the canonical geometry', () => {
    expect(shapes(COMPONENT)).toEqual(shapes(CANONICAL))
  })

  it('draws the tab icon on the same viewBox, so it does not crop', () => {
    expect(ICON).toMatch(/viewBox="0 0 48 48"/)
  })
})

describe('the tab icon', () => {
  /**
   * A favicon renders against the browser's chrome, not against our page, so it
   * cannot inherit `currentColor` the way the in-page component does. It carries
   * the brand crimson literally — one of the three sanctioned uses of the brand
   * colour, and the only place in the site a literal is correct.
   */
  it('carries the brand crimson rather than currentColor', () => {
    expect(ICON).toMatch(/#e62058/i)
    expect(ICON).not.toMatch(/currentColor/)
  })

  it('names the product for assistive technology', () => {
    expect(ICON).toMatch(/aria-label="flare-kit"/)
  })
})

/**
 * The brand diagrams name packages in live `<text>`, so they are the one place
 * a package rename cannot be caught by a compiler. The @flarekit-dev rename
 * missed them: both diagrams still drew `@flare-kit/*`, which is a scope that
 * no longer exists, on assets served from the README and npm.
 *
 * The live scope is derived from a package rather than written here, so a
 * future rename either updates the diagrams or fails.
 */
describe('the brand diagrams name packages that exist', () => {
  const SCOPE = (
    JSON.parse(readFileSync('../../packages/core/package.json', 'utf8')) as { name: string }
  ).name.split('/')[0]

  const diagrams = ['architecture.svg', 'packages.svg'] as const

  for (const file of diagrams) {
    it(`${file} names no scope but ${'the live one'}`, () => {
      const svg = readFileSync(`../../brand/${file}`, 'utf8')
      const scopes = [...svg.matchAll(/(@[a-z0-9][a-z0-9-]*)\//g)].map((m) => m[1])
      const wrong = [...new Set(scopes)].filter((s) => s !== SCOPE)
      expect(wrong).toEqual([])
    })
  }
})

/**
 * "Ship Flare operations that recover." was never an approved motto — the spec
 * records that it was only a hero line in one specimen render, and that a motto
 * remains Abu's open choice. It survived in the root metadata, which is the
 * description every page and every social card carries.
 *
 * The identity is the brand banner's: the developer toolkit for Flare.
 */
describe('the site does not ship an unapproved motto', () => {
  /**
   * The shipped VALUE, not the file: the layout may discuss the retracted
   * slogan in a comment explaining why it is gone. Only what reaches a page
   * counts.
   */
  const description = readFileSync('app/layout.tsx', 'utf8').match(
    /export const metadata\s*=\s*\{[\s\S]*?description:\s*'([^']*)'/,
  )?.[1]

  it('declares a description at all', () => {
    expect(description).toBeDefined()
  })

  it('carries no retracted slogan', () => {
    expect(description).not.toMatch(/Ship Flare operations that recover/)
  })

  it('describes the product by what it is', () => {
    expect(description).toMatch(/developer toolkit for Flare/i)
  })
})
