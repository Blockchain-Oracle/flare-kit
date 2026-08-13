import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssetLogo } from '../src/primitives/AssetLogo.js'

/**
 * AssetLogo resolves a symbol to a mark or, failing that, an honest monogram.
 * jsdom loads no stylesheet, so this asserts the RESOLUTION — which path a
 * symbol takes and that it is labelled — not the painted background. The rule
 * that matters: an unknown symbol is a seeded monogram, never a wrong logo and
 * never a blank. Filling an unknown with a plausible mark is the same lie
 * DESIGN.md forbids for a number.
 */

describe('AssetLogo', () => {
  it('resolves a bundled symbol to its Flare mark, not a monogram', () => {
    render(<AssetLogo symbol="FXRP" />)
    const mark = screen.getByRole('img', { name: 'FXRP' })
    expect(mark).toHaveClass('fk-am', 'fk-am-fxrp')
    expect(mark).not.toHaveClass('fk-am-mono')
    // A real mark carries no monogram text — the picture is the identity.
    expect(mark).toHaveTextContent('')
  })

  it('looks symbols up case-insensitively and folds the FLR family to one mark', () => {
    render(
      <>
        <AssetLogo symbol="fxrp" />
        <AssetLogo symbol="C2FLR" />
        <AssetLogo symbol="WFLR" />
      </>,
    )
    expect(screen.getByRole('img', { name: 'fxrp' })).toHaveClass('fk-am-fxrp')
    expect(screen.getByRole('img', { name: 'C2FLR' })).toHaveClass('fk-am-flr')
    expect(screen.getByRole('img', { name: 'WFLR' })).toHaveClass('fk-am-flr')
  })

  it('gives an unbundled symbol a seeded monogram, never a wrong mark', () => {
    render(<AssetLogo symbol="USD₮0" />)
    const mark = screen.getByRole('img', { name: 'USD₮0' })
    expect(mark).toHaveClass('fk-am', 'fk-am-mono')
    // Letters only, so the currency mark and digit do not widen the circle.
    expect(mark).toHaveTextContent('US')
    // It wears none of the real marks.
    for (const wrong of ['fk-am-fxrp', 'fk-am-xrp', 'fk-am-flr', 'fk-am-fassets']) {
      expect(mark).not.toHaveClass(wrong)
    }
    // A colour is set (jsdom normalises the inline hsl() to rgb() on read).
    expect(mark.style.backgroundColor).not.toBe('')
  })

  it('colours a monogram deterministically, the same symbol the same colour', () => {
    const { container } = render(
      <>
        <AssetLogo symbol="ZZZ" />
        <AssetLogo symbol="ZZZ" />
      </>,
    )
    const marks = container.querySelectorAll<HTMLSpanElement>('.fk-am-mono')
    expect(marks).toHaveLength(2)
    expect(marks[0]!.style.backgroundColor).toBe(marks[1]!.style.backgroundColor)
  })
})
