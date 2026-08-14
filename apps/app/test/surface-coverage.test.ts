import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHROME_SURFACES, FAMILIES } from '../lib/families'

/**
 * The app must have a home for every surface the kit ships.
 *
 * This exists because prose could not hold it. The rail was written from a
 * mental list and silently omitted an entire capability — XRPL-controlled
 * smart accounts, five components, built and live-verified — plus activity,
 * which has a table and a hook and nowhere to render. Nothing failed. The app
 * simply would not have had them, and the omission would have been found by a
 * person noticing, or not at all.
 *
 * So placement is now checked against the kit's own directory. Adding a
 * component to `@flarekit-dev/react-ui` fails this test until someone decides
 * where in the app it belongs — including "it is chrome, not a capability",
 * which is a decision, not a default.
 */
const UI_SRC = join(process.cwd(), '../../packages/react-ui/src')

/** Every exported surface component. Primitives and the brandmark are not surfaces. */
function kitSurfaces(): string[] {
  return readdirSync(UI_SRC)
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => name.replace(/\.tsx$/, ''))
    .filter((name) => name !== 'BrandMark')
}

const placed = [...FAMILIES.flatMap((family) => family.surfaces), ...CHROME_SURFACES]

describe('every kit surface has a home in the app', () => {
  it('places every component the kit ships', () => {
    const orphans = kitSurfaces().filter((surface) => !placed.includes(surface))
    expect(orphans, 'these components have nowhere to render').toEqual([])
  })

  it('names no surface the kit does not ship', () => {
    const surfaces = kitSurfaces()
    const dangling = placed.filter((name) => !surfaces.includes(name))
    expect(dangling, 'these placements point at nothing').toEqual([])
  })

  it('places each surface exactly once', () => {
    const seen = new Set<string>()
    const twice = placed.filter((name) => !seen.add(name))
    expect(twice, 'a surface belongs to one family').toEqual([])
  })
})

describe('the families that were missing', () => {
  it('has a home for XRPL-controlled smart accounts', () => {
    expect(FAMILIES.map((f) => f.id)).toContain('smart-accounts')
  })

  it('has a home for activity', () => {
    expect(FAMILIES.map((f) => f.id)).toContain('activity')
  })
})
