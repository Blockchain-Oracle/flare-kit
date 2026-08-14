import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const LAYOUT = readFileSync('app/layout.tsx', 'utf8')
const GLOBALS = readFileSync('app/globals.css', 'utf8')

describe('the app inherits the kit token contract', () => {
  it('imports the kit stylesheet in the root layout', () => {
    expect(LAYOUT).toMatch(/import ['"]@flarekit-dev\/react-ui\/styles\.css['"]/)
  })

  it('puts the .fk scope on body, so tokens and primitives cascade', () => {
    expect(LAYOUT).toMatch(/<body[^>]*className=(["'])(?:[^"']*\s)?fk(?:\s[^"']*)?\1/)
  })

  it('declares no --fk-* token of its own, which would fork the contract', () => {
    const declared = GLOBALS.match(/^\s*--fk-[a-z0-9-]+\s*:/gm) ?? []
    expect(declared, 'globals.css must consume tokens, not declare them').toEqual([])
  })

  it('consumes tokens rather than hardcoding values', () => {
    const literals = GLOBALS.match(/:\s*(#[0-9a-f]{3,8}|rgba?\()/gi) ?? []
    expect(literals, 'page sheet must reference --fk-* tokens, not literals').toEqual([])
  })
})
