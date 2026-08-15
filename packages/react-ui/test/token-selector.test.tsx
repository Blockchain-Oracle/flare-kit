import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { amount } from '@flarekit-dev/core'
import { TokenSelector, type TokenChoice } from '../src/TokenSelector.js'

/**
 * TokenSelector (M5-R7): search, common-base pills, balance-sorted rows each with
 * its mark. Its load-bearing rule is the counter-side gate — a token with no real
 * pool against the chosen side is shown but cannot be picked, so a person can
 * never select a pair the DEX cannot quote.
 */

const addr = (seed: string) => `0x${seed.repeat(40).slice(0, 40)}` as `0x${string}`

const FXRP: TokenChoice = {
  key: 'FXRP',
  token: { symbol: 'FXRP', address: addr('a'), decimals: 6 },
  name: 'FAsset XRP',
  balance: amount(247_500000n, 6, 'FXRP'),
}
const USDT: TokenChoice = {
  key: 'USDT0',
  token: { symbol: 'USD₮0', address: addr('b'), decimals: 6 },
  name: 'Tether',
  balance: amount(0n, 6, 'USD₮0'),
}
const WNAT: TokenChoice = {
  key: 'WNAT',
  token: { symbol: 'WC2FLR', address: addr('c'), decimals: 18 },
  name: 'Wrapped C2FLR',
}

const rowOrder = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('.fk-tsel-row[data-token]')].map((n) => n.getAttribute('data-token')!)

describe('TokenSelector', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <TokenSelector open={false} tokens={[FXRP, USDT]} onSelect={() => {}} onClose={() => {}} />,
    )
    expect(container.querySelector('.fk-tsel')).toBeNull()
  })

  it('filters rows to those matching the search text', () => {
    const { container } = render(
      <TokenSelector open tokens={[FXRP, USDT, WNAT]} onSelect={() => {}} onClose={() => {}} />,
    )
    fireEvent.change(screen.getByRole('searchbox', { name: /search/i }), { target: { value: 'xrp' } })
    expect(rowOrder(container)).toEqual(['FXRP'])
  })

  it('seeds the search from defaultQuery so the filtered state is reachable from props', () => {
    const { container } = render(
      <TokenSelector open defaultQuery="usd" tokens={[FXRP, USDT, WNAT]} onSelect={() => {}} onClose={() => {}} />,
    )
    expect(rowOrder(container)).toEqual(['USDT0'])
  })

  it('reports the token key when a pooled row is chosen', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <TokenSelector open tokens={[FXRP, USDT]} onSelect={onSelect} onClose={() => {}} />,
    )
    fireEvent.click(container.querySelector('.fk-tsel-row[data-token="USDT0"]')!)
    expect(onSelect).toHaveBeenCalledWith('USDT0')
  })

  it('disables a counter-side token with no pool and names the missing pair', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <TokenSelector
        open
        counterSymbol="FXRP"
        tokens={[USDT, { ...WNAT, pooled: false }]}
        onSelect={onSelect}
        onClose={() => {}}
      />,
    )
    const wnat = container.querySelector('.fk-tsel-row[data-token="WNAT"]') as HTMLButtonElement
    expect(wnat).toBeDisabled()
    fireEvent.click(wnat)
    expect(onSelect).not.toHaveBeenCalled()
    expect(within(wnat).getByText(/no .*FXRP.* pool/i)).toBeInTheDocument()
  })

  it('sorts held balances above zero and unknown balances', () => {
    const { container } = render(
      <TokenSelector open tokens={[WNAT, USDT, FXRP]} onSelect={() => {}} onClose={() => {}} />,
    )
    // FXRP holds 247.5; USDT holds 0; WNAT is unknown. Held first, then the rest.
    expect(rowOrder(container)[0]).toBe('FXRP')
  })

  it('selects a token from a common-base pill', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <TokenSelector
        open
        tokens={[FXRP, USDT]}
        commonBases={['USDT0']}
        onSelect={onSelect}
        onClose={() => {}}
      />,
    )
    const pills = container.querySelector('.fk-tsel-pills') as HTMLElement
    fireEvent.click(within(pills).getByRole('button', { name: /USD₮0/ }))
    expect(onSelect).toHaveBeenCalledWith('USDT0')
  })

  it('closes on the close control', () => {
    const onClose = vi.fn()
    render(<TokenSelector open tokens={[FXRP]} onSelect={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
