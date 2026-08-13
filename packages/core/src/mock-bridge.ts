// packages/core/src/mock-bridge.ts
import type { Address, Hex, PublicClient } from 'viem'
import { type BridgeRoute, routeByKey } from '@flare-kit/contracts'
import { type BridgeAdapter, makeBridgeAdapter } from './bridge-adapter.js'

/**
 * The cross-chain mock (M8-R6), written AFTER the real Coston2 ↔ Sepolia round trip
 * and copying only what that run observed. It is a pair of labelled fake
 * `PublicClient`s (source + destination): the REAL adapter, quote and plan code run
 * against them unchanged, so a test or a demo drives the true code path with no
 * network. Mock mode is explicit — a caller constructs this reader; nothing ever
 * falls back to it. It REFUSES the unobserved: a route never driven live throws, and
 * any read the run never captured throws loudly rather than return a plausible zero
 * (the M4/M6/M7 mock discipline). A `delivered` result is never fabricated without an
 * observed destination read — the delivery/redemption states come from explicit config.
 *
 * OBSERVED (live run 2026-08-11, evidence
 * `.thoughts/verification/2026-08-11-coston2-live-bridge.json`):
 *
 *  - Bridge Coston2 → Sepolia: `quoteSend` nativeFee 22.950824887834713257 C2FLR;
 *    NO dust (sharedDecimals 6, decimalConversionRate 1) so amountReceivedLD ==
 *    amountLD — 1 FXRP in delivered exactly 1_000_000 on Sepolia (balance 0 → 1e6).
 *  - Redeem Sepolia → Coston2: `quoteSend` nativeFee ~0.000101716 ETH; NO approve
 *    (native OFT); 10 FXRP redeemed → composer FAssetRedeemed 9_990_000 UBA →
 *    native XRP SETTLED on XRPL 9_940_050 drops (agent rDYeq…). succeeded is reached
 *    ONLY from that XRPL settlement read, never from FAssetRedeemed alone.
 */

const NON_ZERO_PEER: Hex = `0x${'00'.repeat(11)}81672c5d42f3573ad95a0bdfbe824faac547d4e6`
const MOCK_LATEST_BLOCK = 25n // bounds the adapter's chunked scan; drive reads with since = 0n

export const MOCK_BRIDGE_OBSERVED = {
  'coston2-sepolia': {
    nativeFee: 22_950_824_887_834_713_257n, // C2FLR, quoteSend
    deliveredExample: 1_000_000n, // 1 FXRP, no dust
  },
  'sepolia-coston2-redeem': {
    nativeFee: 101_716_112_596_575n, // ETH (Sepolia), quoteSend
    redeemedAmountUBA: 9_990_000n, // FAssetRedeemed filed
    xrplSettlementDrops: 9_940_050n, // native XRP delivered on XRPL
  },
} as const

/** The only routes the live run observed. The mock serves these and refuses the rest. */
const OBSERVED_ROUTE_KEYS = ['coston2-sepolia', 'sepolia-coston2-redeem'] as const

/** Overrides for the reads a demo/test wants to drive a specific state from. */
export interface MockBridgeConfig {
  readonly assetBalance?: bigint
  readonly assetAllowance?: bigint
  readonly nativeBalance?: bigint
  /** Override the delivered amount (dust-below-min: set below the slippage floor). */
  readonly amountReceivedLD?: bigint
  readonly peerSet?: boolean
  /** The destination delivery read: has the OFTReceived landed? */
  readonly delivered?: boolean
  readonly deliveredAmount?: bigint
  /** The composer read: the FAssets redemption leg. */
  readonly redemption?: 'none' | 'filed' | 'failed'
}

function observedRoute(routeKey: string): BridgeRoute {
  if (!OBSERVED_ROUTE_KEYS.includes(routeKey as (typeof OBSERVED_ROUTE_KEYS)[number])) {
    throw new Error(`mock-bridge: '${routeKey}' was never observed live — the mock refuses to invent a route it did not drive.`)
  }
  const route = routeByKey('coston2', routeKey)
  if (!route) throw new Error(`mock-bridge: '${routeKey}' is not in the Coston2 registry.`)
  return route
}

const BIG = (1n << 100n)

/** The SOURCE fake client: quote / token / peer / balance / allowance reads. */
function createMockSrcClient(route: BridgeRoute, config: MockBridgeConfig): PublicClient {
  const observed = MOCK_BRIDGE_OBSERVED[route.key as keyof typeof MOCK_BRIDGE_OBSERVED]
  const assetAddress = route.asset.address.toLowerCase()
  return {
    async readContract({ address, functionName, args = [] }: { address: Address; functionName: string; args?: readonly unknown[] }) {
      switch (functionName) {
        case 'peers':
          return config.peerSet === false ? (`0x${'0'.repeat(64)}` as Hex) : NON_ZERO_PEER
        case 'quoteSend':
          return { nativeFee: observed.nativeFee, lzTokenFee: 0n }
        case 'quoteOFT': {
          const sp = args[0] as { amountLD: bigint }
          const received = config.amountReceivedLD ?? sp.amountLD // no dust observed
          return [{ minAmountLD: 0n, maxAmountLD: BIG }, [], { amountSentLD: sp.amountLD, amountReceivedLD: received }]
        }
        case 'balanceOf':
          if (String(address).toLowerCase() !== assetAddress) {
            throw new Error(`mock-bridge: balanceOf on an unobserved token ${address}`)
          }
          return config.assetBalance ?? BIG
        case 'allowance':
          if (String(address).toLowerCase() !== assetAddress) {
            throw new Error(`mock-bridge: allowance on an unobserved token ${address}`)
          }
          return config.assetAllowance ?? 0n
        default:
          throw new Error(`mock-bridge: unexpected (unobserved) source read ${functionName}`)
      }
    },
    async getBalance() {
      return config.nativeBalance ?? BIG
    },
  } as unknown as PublicClient
}

/** The DESTINATION fake client: the delivery / redemption event reads. */
function createMockDstClient(route: BridgeRoute, config: MockBridgeConfig): PublicClient {
  const observed = MOCK_BRIDGE_OBSERVED[route.key as keyof typeof MOCK_BRIDGE_OBSERVED]
  // The delivered amount is an OBSERVED value or an explicit config — NEVER a
  // fabricated 0. A route that observed neither refuses rather than invent a zero.
  const resolveDelivered = (): bigint => {
    if (config.deliveredAmount !== undefined) return config.deliveredAmount
    if ('deliveredExample' in observed) return observed.deliveredExample
    if ('redeemedAmountUBA' in observed) return observed.redeemedAmountUBA
    throw new Error(`mock-bridge: no observed delivered amount for ${route.key} — the mock refuses to invent a 0`)
  }
  return {
    async getBlockNumber() {
      return MOCK_LATEST_BLOCK
    },
    async getContractEvents({ eventName }: { eventName: string }) {
      // A `delivered` result is NEVER fabricated — it appears only when the caller
      // explicitly configures the observed destination read.
      if (eventName === 'OFTReceived') {
        return config.delivered ? [{ args: { guid: NON_ZERO_PEER, amountReceivedLD: resolveDelivered() } }] : []
      }
      if (eventName === 'FAssetRedeemed') {
        return config.redemption === 'filed'
          ? [{ args: { redeemedAmountUBA: resolveDelivered(), redeemerUnderlyingAddress: 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio' } }]
          : []
      }
      if (eventName === 'FAssetRedeemFailed') {
        return config.redemption === 'failed' ? [{ args: {} }] : []
      }
      throw new Error(`mock-bridge: unexpected (unobserved) destination event ${eventName}`)
    },
  } as unknown as PublicClient
}

/**
 * The mock adapter: the REAL `makeBridgeAdapter` over the two mock clients. It presents
 * the observed routes as `bridgeVerified: true` because their delivery WAS driven live —
 * exactly the config `live-bridge.mjs` bootstraps from. The mock is an offline reader of
 * what was observed, not a second implementation.
 */
export function createMockBridgeAdapter(routeKey: string, config: MockBridgeConfig = {}): BridgeAdapter {
  const route = { ...observedRoute(routeKey), bridgeVerified: true }
  return makeBridgeAdapter(createMockSrcClient(route, config), createMockDstClient(route, config), route)
}
