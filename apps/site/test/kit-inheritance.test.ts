import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The site does not declare tokens — it wears the kit's.
 *
 * `@flarekit-dev/react-ui` scopes its contract to `.fk` so it never touches a host
 * page. The site is a host page that *wants* the contract, so it opts in by
 * putting `.fk` on <body>. Two lines make that true, neither is type-checked,
 * and losing either degrades the whole page to system fonts and unstyled
 * controls without failing a build. This is that guard.
 */
const LAYOUT = readFileSync('app/layout.tsx', 'utf8')
const GLOBALS = readFileSync('app/globals.css', 'utf8')

describe('the site inherits the kit token contract', () => {
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

  it('consumes the tokens it relies on, rather than hardcoding values', () => {
    // A hex or rgb() literal in the page sheet means a value escaped the
    // contract and will not follow the theme.
    const literals = GLOBALS.match(/:\s*(#[0-9a-f]{3,8}|rgba?\()/gi) ?? []
    expect(literals, 'page sheet must reference --fk-* tokens, not literals').toEqual([])
  })
})
