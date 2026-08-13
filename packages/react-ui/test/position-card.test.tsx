// packages/react-ui/test/position-card.test.tsx
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { type Position, amount } from '@flare-kit/core'
import { PositionCard } from '../src/PositionCard.js'

const FXRP = { symbol: 'FXRP', address: '0x0b6A3645c240605887a5532109323A3E12273dc7', decimals: 6 } as const
const USDT0 = { symbol: 'USD₮0', address: '0xC1A5B41512496B80903D1f32d6dEa3a73212E71F', decimals: 6 } as const

const position: Position = {
  tokenA: FXRP, tokenB: USDT0, lpBalance: 6_250000n,
  amountA: amount(5_900000n, 6, 'FXRP'), amountB: amount(6_945000n, 6, 'USD₮0'),
  poolShareBips: 250, pair: '0xDD598473f738df117Ee331bc07172481db60acBE',
}

describe('PositionCard (M6-R7)', () => {
  it('shows the current composition of both assets in the mono face', () => {
    render(<PositionCard position={position} networkLabel="Coston2" />)
    // SwapLeg renders the exact value as an input's value and the asset as a
    // separate token-select label — never combined in one text node — so
    // this is queried the same way swap-card.test.tsx queries a receive leg
    // (getByDisplayValue for the digits), not a combined getByText regex.
    expect(screen.getByDisplayValue('5.900000')).toBeInTheDocument()
    expect(screen.getByText('FXRP')).toBeInTheDocument()
    expect(screen.getByDisplayValue('6.945000')).toBeInTheDocument()
    expect(screen.getByText('USD₮0')).toBeInTheDocument()
  })

  it('renders an honest no-position state, never an empty guess', () => {
    render(<PositionCard position={null} networkLabel="Coston2" tokenA={FXRP} tokenB={USDT0} />)
    // Both the Note's title ("No position") and its body ("You hold no ...
    // liquidity yet.") match this regex, which is genuine ambiguity, not a
    // weaker assertion — scope to the body, the substantive honest
    // explanation, per the swap-card.test.tsx tightening precedent.
    expect(screen.getByText(/no .*liquidity|no position/i, { selector: '.fk-note-body' })).toBeTruthy()
  })

  it('never claims a fee balance — V2 fees are embedded in reserves', () => {
    render(<PositionCard position={position} networkLabel="Coston2" />)
    expect(screen.queryByText(/claim.*fee/i)).toBeNull()
  })

  it('surfaces a failed remove quote reason, not the generic fees note', () => {
    render(<PositionCard position={position} networkLabel="Coston2" removeQuoteResult={{ kind: 'unavailable', reason: 'Could not reach the pool right now.' }} />)
    expect(screen.getByText(/could not reach the pool/i)).toBeTruthy()
  })

  it('renders an honest unavailable state — never a confident "no position" — when the read failed', () => {
    render(<PositionCard position={null} unavailable="Could not reach the pool right now." networkLabel="Coston2" tokenA={FXRP} tokenB={USDT0} />)
    // Both the Note's title ("Couldn't read your position") and its body
    // ("We could not read your position on chain: ...") match this regex —
    // the same genuine ambiguity the no-position test above resolves by
    // scoping to the body.
    expect(screen.getByText(/could not read your position|couldn't read/i, { selector: '.fk-note-body' })).toBeTruthy()
    expect(screen.queryByText(/hold no .*liquidity/i)).toBeNull()
  })

  it('offers an exact-entry alongside the presets and reports the typed percent', () => {
    let picked = -1
    render(<PositionCard position={position} percent={0} onPercentChange={(p) => { picked = p }} networkLabel="Coston2" />)
    const exact = screen.getByLabelText(/exact percent/i) as HTMLInputElement
    fireEvent.change(exact, { target: { value: '33' } })
    expect(picked).toBe(33)
  })

  it('shows the value change against the supplied basis when the kit recorded it', () => {
    render(<PositionCard position={position} basis={{ amountA: amount(5_800000n, 6, 'FXRP'), amountB: amount(7_000000n, 6, 'USD₮0') }} networkLabel="Coston2" />)
    expect(screen.getByText(/change since supplied/i)).toBeTruthy()
    // position.amountA 5.900000 vs basis 5.800000 → +0.100000 FXRP
    expect(screen.getByText(/\+0\.100000 FXRP/)).toBeTruthy()
    // position.amountB 6.945000 vs basis 7.000000 → −0.055000 USD₮0 (U+2212)
    expect(screen.getByText(/−0\.055000 USD₮0/)).toBeTruthy()
  })

  it('shows no value change — no invented P&L — when the basis is unknown', () => {
    render(<PositionCard position={position} networkLabel="Coston2" />)
    expect(screen.queryByText(/change since supplied/i)).toBeNull()
  })
})
