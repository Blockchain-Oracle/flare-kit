import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The gallery's sections import this package BY NAME, so the docs site can
 * compile them against `dist`. In gallery dev a Vite alias maps that name back
 * to live `src`, which is the only reason editing a component hot-reloads
 * without a build.
 *
 * That alias is a regex containing the package name as a literal. When the npm
 * scope was renamed, the rename updated the COMMENT above the alias and left
 * the pattern behind — so the alias silently matched nothing, gallery dev
 * quietly resolved to `dist`, and hot reload stopped with no error anywhere.
 *
 * This test derives the expected name from package.json rather than hardcoding
 * it, so a future rename either updates the alias or fails here.
 */
const PACKAGE_NAME = (JSON.parse(readFileSync('package.json', 'utf8')) as { name: string }).name
const CONFIG = readFileSync('gallery/vite.config.ts', 'utf8')

describe('the gallery dev alias', () => {
  it('matches this package by its current name', () => {
    // The literal contains an escaped slash, so consume `\.` pairs as one unit.
    const pattern = CONFIG.match(/find:\s*\/((?:\\.|[^/])+)\//)?.[1]
    expect(pattern, 'gallery/vite.config.ts must alias the package by name').toBeDefined()

    // The alias is written as an exact-match regex; unescape it and test it
    // against the real name, so we assert behaviour rather than spelling.
    const alias = new RegExp(pattern!)
    expect(alias.test(PACKAGE_NAME)).toBe(true)
  })

  it('stays an exact match, so subpath exports still resolve', () => {
    // The literal contains an escaped slash, so consume `\.` pairs as one unit.
    const pattern = CONFIG.match(/find:\s*\/((?:\\.|[^/])+)\//)?.[1]
    const alias = new RegExp(pattern!)
    // `<pkg>/styles.css` must NOT be swallowed by the alias — it has to keep
    // resolving through the package's own exports map.
    expect(alias.test(`${PACKAGE_NAME}/styles.css`)).toBe(false)
  })
})
