// packages/react-ui/test/route-catalogue.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { type Observation, amount, observe, routeByKey } from '@flare-kit/core'
import { RouteCatalogue } from '../src/RouteCatalogue.js'
import type { RouteRow } from '../src/route-catalogue-state.js'

const NOW = 1_786_400_000
const bridge = routeByKey('coston2', 'coston2-sepolia')!
const redeem = routeByKey('coston2', 'sepolia-coston2-redeem')!
const CHAIN: Observation<unknown> = observe({}, { class: 'chain', provider: 'Coston2 RPC', network: 'Coston2', chainId: 114 }, NOW * 1000)

const bridgeFee = amount(22_950_824_887_834_713_257n, 18, 'C2FLR')

describe('RouteCatalogue (M8-R7)', () => {
  it('lists each route with its chain pair, primitive and live fee', () => {
    const rows: RouteRow[] = [
      { route: bridge, reads: { fee: bridgeFee }, provenance: CHAIN },
      { route: redeem, reads: { fee: amount(101_716_112_596_575n, 18, 'ETH') }, provenance: CHAIN },
    ]
    render(<RouteCatalogue rows={rows} now={NOW} networkLabel="Coston2" />)
    expect(screen.getByText('Coston2 → Sepolia')).toBeInTheDocument()
    expect(screen.getByText('Sepolia → Coston2')).toBeInTheDocument()
    expect(screen.getByText('OFT bridge')).toBeInTheDocument()
    expect(screen.getByText('Compose redeem → native XRP')).toBeInTheDocument()
  })

  it('renders an unknown fee as — (never 0)', () => {
    const rows: RouteRow[] = [{ route: bridge, reads: { fee: null }, provenance: CHAIN }]
    render(<RouteCatalogue rows={rows} now={NOW} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    // a real 0 is never printed for an unknown fee
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('a read that could not be fetched renders unavailable, not a confident zero', () => {
    const rows: RouteRow[] = [{ route: bridge, provenance: CHAIN }] // no reads
    render(<RouteCatalogue rows={rows} now={NOW} />)
    expect(screen.getByText(/couldn't read this route/i)).toBeInTheDocument()
  })

  it('an unverified route renders the declared-unbuilt affordance, never an actionable bridge', () => {
    // both live routes are verified now; construct an explicitly-unverified one
    const unverified = { ...bridge, key: 'coston2-hyperliquid', bridgeVerified: false }
    const rows: RouteRow[] = [{ route: unverified, reads: { fee: bridgeFee }, provenance: CHAIN }]
    const { container } = render(<RouteCatalogue rows={rows} now={NOW} />)
    const unbuilt = container.querySelector('.fk-unbuilt')
    expect(unbuilt).not.toBeNull()
    expect(unbuilt?.getAttribute('aria-disabled')).toBe('true')
    expect(within(unbuilt as HTMLElement).getByText(/not built for this route/i)).toBeInTheDocument()
  })

  it('marks the two live-verified routes as Verified', () => {
    const rows: RouteRow[] = [
      { route: bridge, reads: { fee: bridgeFee }, provenance: CHAIN },
      { route: redeem, reads: { fee: bridgeFee }, provenance: CHAIN },
    ]
    render(<RouteCatalogue rows={rows} now={NOW} />)
    expect(screen.getAllByText('Verified')).toHaveLength(2)
  })
})
