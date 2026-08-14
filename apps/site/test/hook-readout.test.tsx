import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HookReadout } from '../components/docs/demos/hook-readout'

/**
 * The pane every hook page shares. It used to `JSON.stringify` the hook's
 * return value, which is the wrong notation for an API return shape and told
 * three outright lies about it:
 *
 * - `undefined` was replaced with `null`. Those are different states, and this
 *   kit distinguishes "not read" from "read as empty" everywhere else.
 * - a bigint became the STRING "123n", so an exact value was rendered as prose.
 * - a function became the string "[function]", which names nothing.
 *
 * It also rendered through the kit's CodeWindow, which is deliberately never
 * highlighted — correct for a product surface showing exact values, wrong for
 * a documentation pane sitting beside highlighted code blocks.
 */

/** The rendered code, with the highlighter's span boundaries collapsed away. */
function readoutText(): string {
  return screen.getByRole('code').textContent ?? ''
}

describe('HookReadout notation', () => {
  it('writes an absent value as undefined, not as null', () => {
    render(<HookReadout name="useThing" value={{ delegate: undefined }} />)
    expect(readoutText()).toMatch(/delegate: undefined/)
    expect(readoutText()).not.toMatch(/null/)
  })

  it('writes a bigint as an exact literal, not as a quoted string', () => {
    render(<HookReadout name="useThing" value={{ vp: 2354308387975507843417n }} />)
    expect(readoutText()).toMatch(/vp: 2354308387975507843417n/)
    expect(readoutText()).not.toMatch(/"2354308387975507843417n"/)
  })

  it('writes a function as a call signature naming its parameters', () => {
    render(<HookReadout name="useThing" value={{ submit: (plan: unknown) => plan }} />)
    expect(readoutText()).toMatch(/submit: \(plan\) => …/)
    expect(readoutText()).not.toMatch(/\[function\]/)
  })

  it('writes keys as identifiers, the way a return type is written', () => {
    render(<HookReadout name="useThing" value={{ position: 1 }} />)
    expect(readoutText()).toMatch(/\bposition:/)
    expect(readoutText()).not.toMatch(/"position":/)
  })

  it('keeps a string a quoted string', () => {
    render(<HookReadout name="useThing" value={{ network: 'coston2' }} />)
    expect(readoutText()).toMatch(/network: 'coston2'/)
  })

  it('names the return type in the title when the page states one', () => {
    render(<HookReadout name="useGovernance" value={{}} returnType="UseGovernanceResult" />)
    expect(screen.getByText('UseGovernanceResult')).toBeInTheDocument()
  })
})

describe('HookReadout rendering', () => {
  it('is syntax-highlighted, like every other code surface on the page', () => {
    const { container } = render(<HookReadout name="useThing" value={{ vp: 1n }} />)
    expect(container.querySelectorAll('[class^="tok-"]').length).toBeGreaterThan(0)
  })
})
