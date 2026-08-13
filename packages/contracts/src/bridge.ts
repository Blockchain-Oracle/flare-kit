import { FLARE_NETWORKS, type FlareNetworkKey } from './chains.js'
import type { Address } from './addresses.js'

/**
 * The cross-chain route registry, per source network. M8-R1: the one source of
 * truth for every LayerZero V2 OFT address, endpoint id and executor/compose gas,
 * so no cross-chain value is hardcoded in a component. Cross-chain is the first
 * capability whose outcome lives on a *different chain than the signature*, so a
 * route pairs two `ChainEndpoint`s — a source and a destination — and the shared
 * thing downstream is the operation lifecycle, not one chain.
 *
 * Every value here was read on-chain by the M8 probe
 * (`.thoughts/verification/2026-08-11-m8-bridge-probe.json`): the Coston2 adapter's
 * `token()` == FTestXRP, `peers(40161)` is set (so a send routes, not reverts),
 * `quoteSend`/`quoteOFT` return, and `sharedDecimals` 6 / `decimalConversionRate` 1
 * mean this route removes no dust (delivered == sent). Nothing is inferred.
 *
 * `bridgeVerified` is the M8 analog of `dex.ts`'s `addLiquidityVerified` and
 * `vaults.ts`'s `withdrawVerified`: a route is trusted to emit a plan (spend a real
 * cross-chain fee on a message that must deliver) only after a live run confirms
 * delivery on the *destination* chain. Both Coston2 routes start `false` and flip to
 * `true` in the M8 live verification (Task 6) — never before a confirmed destination
 * read. Until then the surface shows the route's config but a declared-unbuilt bridge
 * affordance, never a plan that could misrender.
 */

export interface ChainEndpoint {
  /** A human key for the chain (`coston2` | `sepolia`); not a `FlareNetworkKey`. */
  readonly key: string
  readonly chainId: number
  /** LayerZero V2 endpoint id (Coston2 40294 = FLARE_V2_TESTNET, Sepolia 40161). */
  readonly eid: number
  readonly rpcUrl: string
  /** Transaction explorer base, e.g. `https://sepolia.etherscan.io/tx/`. */
  readonly explorer: string
  /** The OFT `send` is called on: the adapter on Flare, the native OFT off-chain. */
  readonly oft: Address
  /** The native token the cross-chain fee is paid in on this chain (C2FLR / ETH). */
  readonly nativeCurrency: { readonly symbol: string; readonly decimals: number }
}

export type RouteKind = 'bridge' | 'redeem'

export interface BridgeRoute {
  /** Stable cross-network key (`coston2-sepolia`, `sepolia-coston2-redeem`). */
  readonly key: string
  readonly kind: RouteKind
  /** The chain the `send` runs on (and whose native token pays the fee). */
  readonly from: ChainEndpoint
  /** The chain the message is delivered on and delivery is read from. */
  readonly to: ChainEndpoint
  /** The FXRP token on `from` — the adapter's underlying on Flare, the OFT itself off-chain. */
  readonly asset: { readonly symbol: string; readonly address: Address; readonly decimals: number }
  /** Set on a `redeem` route: the FAssetRedeemComposer on the destination (Flare). */
  readonly composer?: Address
  /** lzReceive gas for the executor: 200k for a plain bridge, 1M for the compose redeem. */
  readonly executorGas: number
  /** lzCompose gas, set on a `redeem` route (1M). */
  readonly composeGas?: number
  /** LayerZeroScan evidence base — an evidence link, never the source of delivery truth. */
  readonly scanUrl: string
  /** True only where a live run confirmed delivery on the destination (Task 6). */
  readonly bridgeVerified: boolean
}

// --- probe-verified addresses (Coston2 testnet ↔ Sepolia) ---
const COSTON2_OFT_ADAPTER = '0xCd3d2127935Ae82Af54Fc31cCD9D3440dbF46639' as const
const FTESTXRP_COSTON2 = '0x0b6A3645c240605887a5532109323A3E12273dc7' as const
const SEPOLIA_FXRP_OFT = '0x81672c5d42f3573ad95a0bdfbe824faac547d4e6' as const
const COSTON2_COMPOSER = '0xa10569DFb38FE7Be211aCe4E4A566Cea387023b0' as const

const SCAN_URL = 'https://testnet.layerzeroscan.com/tx/'

const COSTON2_ENDPOINT: ChainEndpoint = {
  key: 'coston2',
  chainId: 114,
  eid: 40294, // EndpointId.FLARE_V2_TESTNET
  rpcUrl: FLARE_NETWORKS.coston2.rpcUrl,
  explorer: `${FLARE_NETWORKS.coston2.explorerUrl}/tx/`,
  oft: COSTON2_OFT_ADAPTER,
  nativeCurrency: FLARE_NETWORKS.coston2.nativeCurrency,
}

const SEPOLIA_ENDPOINT: ChainEndpoint = {
  key: 'sepolia',
  chainId: 11155111,
  eid: 40161, // EndpointId.SEPOLIA_V2_TESTNET
  // Public constant, not an env var. The public RPC lagged once during the probe
  // (reported 0 ETH for a funded account) — the delivery reconciler never concludes
  // an absence from a single read (cf. the FTSO single-absence rule).
  rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  explorer: 'https://sepolia.etherscan.io/tx/',
  oft: SEPOLIA_FXRP_OFT,
  nativeCurrency: { symbol: 'ETH', decimals: 18 },
}

const BRIDGE_ROUTES_INTERNAL: Readonly<Record<FlareNetworkKey, readonly BridgeRoute[]>> = {
  coston2: [
    {
      // Plain OFT bridge: lock FTestXRP on Coston2, mint FXRP on Sepolia. One
      // lzReceive executor option, no compose.
      key: 'coston2-sepolia',
      kind: 'bridge',
      from: COSTON2_ENDPOINT,
      to: SEPOLIA_ENDPOINT,
      asset: { symbol: 'FTestXRP', address: FTESTXRP_COSTON2, decimals: 6 },
      executorGas: 200_000,
      scanUrl: SCAN_URL,
      // VERIFIED live 2026-08-11: 1 FXRP bridged Coston2 → Sepolia, delivery confirmed
      // by reading the Sepolia OFTReceived (guid 0xd0f1e2c6…2b22a04, balance 0 → 1_000_000,
      // quoted == delivered exact). Evidence: .thoughts/verification/2026-08-11-coston2-live-bridge.json.
      bridgeVerified: true,
    },
    {
      // Compose redeem: bridge FXRP Sepolia → Coston2 carrying a compose message to
      // the FAssetRedeemComposer, which files an FAssets redeem to native XRP on
      // XRPL. The `send` runs on Sepolia (from); the composer is on Coston2 (to).
      key: 'sepolia-coston2-redeem',
      kind: 'redeem',
      from: SEPOLIA_ENDPOINT,
      to: COSTON2_ENDPOINT,
      // On Sepolia the native OFT is its own ERC-20 (probe: token() returns itself).
      asset: { symbol: 'FTestXRP', address: SEPOLIA_FXRP_OFT, decimals: 6 },
      composer: COSTON2_COMPOSER,
      executorGas: 1_000_000,
      composeGas: 1_000_000,
      scanUrl: SCAN_URL,
      // VERIFIED live 2026-08-11 end-to-end: 10 FXRP redeemed Sepolia → Coston2 composer
      // (guid 0x4d73dd2c…ed1b04b2) → FAssetRedeemed filed → native XRP SETTLED on XRPL
      // (9.94 XRP, tx 401F7591…, from agent rDYeq…). succeeded reached ONLY from the XRPL
      // settlement read. Evidence: .thoughts/verification/2026-08-11-coston2-live-bridge.json.
      bridgeVerified: true,
    },
  ],
  // Flare mainnet OFT routes (HyperEVM, Base, BNB, …) are a later, separately-verified
  // milestone — configured only when their own live run confirms delivery.
  flare: [],
}

export const BRIDGE_ROUTES = BRIDGE_ROUTES_INTERNAL

/** The cross-chain routes configured for a network key. */
export function routesFor(network: FlareNetworkKey): readonly BridgeRoute[] {
  return BRIDGE_ROUTES[network]
}

/** One route by its stable key on a network, or `undefined` if not configured. */
export function routeByKey(network: FlareNetworkKey, key: string): BridgeRoute | undefined {
  return BRIDGE_ROUTES[network].find((r) => r.key === key)
}
