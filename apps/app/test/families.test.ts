import { describe, expect, it } from 'vitest'
import { FAMILIES, LANDING_FAMILY_ID, familyById } from '../lib/families'

describe('the family registry', () => {
  it('lands on swap, the surface the accepted mockup shows', () => {
    expect(LANDING_FAMILY_ID).toBe('swap')
    expect(familyById(LANDING_FAMILY_ID)).toBeDefined()
  })

  it('gives every family a unique id', () => {
    const ids = FAMILIES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('makes every unbuilt family state its milestone and what it will do', () => {
    for (const family of FAMILIES) {
      if (family.status.kind !== 'unbuilt') continue
      expect(family.status.milestone, `${family.id} must name its milestone`).toMatch(/\S/)
      expect(family.status.will, `${family.id} must say what it will do`).toMatch(/\S/)
    }
  })

  it('never says "coming soon", which states nothing', () => {
    for (const family of FAMILIES) {
      if (family.status.kind !== 'unbuilt') continue
      expect(family.status.will.toLowerCase()).not.toMatch(/coming soon/)
    }
  })

  it('carries the three reserved seams the spec names', () => {
    const unbuilt = FAMILIES.filter((f) => f.status.kind === 'unbuilt').map((f) => f.id)
    expect(unbuilt).toContain('chat')
    expect(unbuilt).toContain('confidential')
    expect(unbuilt).toContain('operator')
  })
})
