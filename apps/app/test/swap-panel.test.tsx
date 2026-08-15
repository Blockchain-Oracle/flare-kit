import { FLARE_NETWORKS, dexFor } from '@flarekit-dev/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SwapPanel } from '../components/panels/swap-panel'

const COSTON2 = FLARE_NETWORKS.coston2
const DEX = dexFor(COSTON2.id)
const [FROM_KEY, TO_KEY] = DEX.canonicalPair
const FROM_SYMBOL = DEX.tokens[FROM_KEY]!.symbol
const TO_SYMBOL = DEX.tokens[TO_KEY]!.symbol

describe('the swap panel', () => {
  it('renders read-only with no wallet, not an error', () => {
    render(<SwapPanel />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('states the network it is reading', () => {
    render(<SwapPanel />)
    expect(screen.getByText(new RegExp(COSTON2.name, 'i'))).toBeInTheDocument()
  })

  it('claims no balance it has not read', () => {
    render(<SwapPanel />)
    // An unread balance is absent, never a confident zero.
    expect(screen.queryByText(/^0(\.0+)?$/)).toBeNull()
  })

  /**
   * Swap has no verified flag and needs none. `canonicalPair` is the pair the
   * R1 probe read on chain, and every other pair is gated by a live `getPair`
   * before it can quote — per-pair and current, rather than per-network and
   * remembered. Both symbols come from the registry; neither is written here.
   */
  it('offers the probe-verified canonical pair by default', () => {
    render(<SwapPanel />)
    expect(screen.getAllByText(FROM_SYMBOL).length).toBeGreaterThan(0)
    expect(screen.getAllByText(TO_SYMBOL).length).toBeGreaterThan(0)
  })

  it('presents no quote for a pair whose liquidity has not been read', () => {
    render(<SwapPanel />)
    // "Minimum received" is a real SwapCard detail row, rendered only from a
    // landed quote. Before a read there is no rate, no floor and no impact.
    expect(screen.queryByText(/minimum received/i)).toBeNull()
    expect(screen.queryByText(/price impact/i)).toBeNull()
  })

  it('reads the other network from the registry too, with its own tokens', () => {
    const mainnet = dexFor(FLARE_NETWORKS.flare.id)
    render(<SwapPanel network="flare" />)
    expect(screen.getByText(new RegExp(FLARE_NETWORKS.flare.name, 'i'))).toBeInTheDocument()
    expect(screen.getAllByText(mainnet.tokens[mainnet.canonicalPair[0]]!.symbol).length).toBeGreaterThan(0)
  })
})
