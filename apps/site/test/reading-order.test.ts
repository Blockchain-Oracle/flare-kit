import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { READING_ORDER, neighbours } from '../lib/reading-order'

/**
 * The reading order is the ONE place page sequence is authored. Prev/next used
 * to live in each page's frontmatter, which meant inserting a page rewrote its
 * two neighbours by hand, and a retitled page left a stale label behind in
 * someone else's file.
 *
 * These tests are the safety net that makes forgetting impossible: adding an
 * MDX file without listing it here fails, and listing a page that does not
 * exist fails.
 */

/** Vitest runs with the package as cwd, the same base `page.tsx` reads from. */
const CONTENT_ROOT = join(process.cwd(), 'content/docs')

/** Every `.mdx` under content/docs, as the URL fumadocs will serve it at. */
function urlsOnDisk(): string[] {
  const walk = (dir: string, prefix: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory()) return walk(join(dir, entry.name), `${prefix}/${entry.name}`)
      if (!entry.name.endsWith('.mdx')) return []
      const slug = entry.name.replace(/\.mdx$/, '')
      return [slug === 'index' ? prefix : `${prefix}/${slug}`]
    })
  return walk(CONTENT_ROOT, '/docs')
}

describe('READING_ORDER', () => {
  it('lists every page that exists on disk', () => {
    const missing = urlsOnDisk().filter((url) => !READING_ORDER.includes(url))
    expect(missing).toEqual([])
  })

  it('names only pages that exist on disk', () => {
    const onDisk = new Set(urlsOnDisk())
    const dangling = READING_ORDER.filter((url) => !onDisk.has(url))
    expect(dangling).toEqual([])
  })

  it('lists no page twice', () => {
    const seen = new Set<string>()
    const duplicated = READING_ORDER.filter((url) => !seen.add(url))
    expect(duplicated).toEqual([])
  })

  it('starts at the docs root', () => {
    expect(READING_ORDER[0]).toBe('/docs')
  })
})

describe('neighbours', () => {
  const order = ['/docs', '/docs/quickstart', '/docs/theming']
  const titles = new Map([
    ['/docs', 'Introduction'],
    ['/docs/quickstart', 'Quickstart'],
    ['/docs/theming', 'Theming'],
  ])

  it('labels each neighbour with that page’s own title', () => {
    expect(neighbours('/docs/quickstart', titles, order)).toEqual({
      prev: { href: '/docs', label: 'Introduction' },
      next: { href: '/docs/theming', label: 'Theming' },
    })
  })

  it('gives the first page no previous', () => {
    expect(neighbours('/docs', titles, order).prev).toBeUndefined()
  })

  it('gives the last page no next', () => {
    expect(neighbours('/docs/theming', titles, order).next).toBeUndefined()
  })

  it('gives a page outside the order no neighbours at all', () => {
    expect(neighbours('/docs/nowhere', titles, order)).toEqual({})
  })

  /**
   * A page listed in the order whose title is unknown must not render a link
   * labelled `undefined`. Falling back to the href keeps the link honest.
   */
  it('falls back to the href when a neighbour has no title', () => {
    expect(neighbours('/docs', new Map(), order).next).toEqual({
      href: '/docs/quickstart',
      label: '/docs/quickstart',
    })
  })
})
