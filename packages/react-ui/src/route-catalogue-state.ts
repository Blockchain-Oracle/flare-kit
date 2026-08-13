// packages/react-ui/src/route-catalogue-state.ts
import type { Amount, BridgeRoute, Observation } from '@flare-kit/core'

/**
 * The pure state → chrome mapping for RouteCatalogue (M8-R7), split from the JSX at
 * the seam the swap/vault catalogues sit on. Every honesty rule the catalogue turns
 * on is readable here: an unknown fee read is `—` (never `0`), and a route whose
 * destination delivery is not live-verified on this network is marked for the
 * declared-unbuilt affordance rather than an actionable bridge.
 */

/** The live reads for one route row; a field is `null` when unknown (renders `—`). */
export interface RouteReadsView {
  /** The live cross-chain fee (`quoteSend` nativeFee), in the source native currency. */
  readonly fee: Amount | null
}

export interface RouteRow {
  readonly route: BridgeRoute
  /** Live reads, or `undefined` when they could not be fetched (renders unavailable, never zero). */
  readonly reads?: RouteReadsView
  /** Provenance for the row's reads, for the SourceChip. */
  readonly provenance?: Observation<unknown>
}

const CHAIN_LABEL: Record<string, string> = { coston2: 'Coston2', sepolia: 'Sepolia', flare: 'Flare' }

export function chainLabel(key: string): string {
  return CHAIN_LABEL[key] ?? key
}

/** `Coston2 → Sepolia` — the source/destination pair, the row's headline. */
export function routeChainsLabel(route: BridgeRoute): string {
  return `${chainLabel(route.from.key)} → ${chainLabel(route.to.key)}`
}

/** The primitive: a plain OFT bridge, or the compose-messaging redeem to native XRP. */
export function primitiveLabel(route: BridgeRoute): string {
  return route.kind === 'redeem' ? 'Compose redeem → native XRP' : 'OFT bridge'
}

/** The reasoned copy for a route whose destination delivery is not live-verified here. */
export function routeUnverifiedReason(route: BridgeRoute): string {
  return `The ${routeChainsLabel(route)} ${primitiveLabel(route).toLowerCase()} hasn't been driven live in this build. Its fee and route read normally; the bridge action stays unbuilt rather than spend a real cross-chain fee on a message that has never been confirmed delivered.`
}
