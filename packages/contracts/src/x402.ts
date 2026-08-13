import { type FlareNetworkKey } from './chains.js'
import type { Address } from './addresses.js'

/**
 * The x402 registry, per network (M9-R1/R7). The one source of truth for the demo
 * token, the facilitator, and the payee, so no x402 value is hardcoded in a
 * component.
 *
 * Every address here was recorded by the M9 Task-2 live deploy
 * (`reference/contracts/deployments/coston2.json`). MockUSDT0 is a LABELLED DEMO
 * token: `demoToken: true` is registry DATA (never a hand-typed string that could
 * drift), and every x402 surface renders that label — the token is never shown as
 * USD₮0 or FXRP. It exists because neither FXRP nor the real Coston2 USD₮0 implements
 * EIP-3009 (re-probed 2026-08-12), which x402 settlement requires. The flow, the
 * facilitator, and the settlement transaction are real; only the asset is a stand-in.
 *
 * `x402Verified` is the M9 analog of `bridgeVerified`/`withdrawVerified`: it starts
 * `false` and flips to `true` only after the Task-11 live run confirms a real
 * facilitator settlement AND resource delivery. Until then the surface shows the
 * configured path but a declared-unbuilt affordance, never a plan.
 */

export interface X402Deployment {
  readonly network: FlareNetworkKey
  readonly token: {
    /** The on-chain ERC-20 symbol (mUSDT0). Rendered with the demo mark, never bare. */
    readonly symbol: string
    /** The on-chain ERC-20 name (= the EIP-712 domain name). */
    readonly name: string
    /** The EIP-712 domain the authorization is signed against — the exact strings the
     * facilitator's `transferWithAuthorization` verifies. Kept as data so the client
     * (core), the server, and the contract cannot drift. */
    readonly eip712Name: string
    readonly eip712Version: string
    readonly address: Address
    readonly decimals: number
    /** Registry data (M9-R7): this asset is a demo stand-in, never dressed as real. */
    readonly demoToken: true
  }
  readonly facilitator: Address
  /** The x402 server's receiving address (the resource provider). */
  readonly payee: Address
  /**
   * The reference x402 server's base URL. The server is a self-hosted single-endpoint
   * fixture (not a marketplace), so this is a localhost default a developer overrides.
   */
  readonly serverUrl: string
  /** The one gated fixture endpoint. */
  readonly resourcePath: string
  readonly x402Verified: boolean
}

// --- deploy-recorded addresses (Coston2; reference/contracts/deployments/coston2.json) ---
const COSTON2_MOCKUSDT0 = '0x2dA725841FF6F5367E65C5d114aa66C034A3d97b' as const
const COSTON2_FACILITATOR = '0x57da665Ef6Bd39F82Af6BC0764cd779E9C156DdA' as const
const COSTON2_PAYEE = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as const

// The reference x402 server's default port (see services/x402-server). Overridable.
const REFERENCE_SERVER_URL = 'http://localhost:8789'

const X402_INTERNAL: Readonly<Record<FlareNetworkKey, X402Deployment | undefined>> = {
  coston2: {
    network: 'coston2',
    token: {
      symbol: 'mUSDT0',
      name: 'Mock USDT0',
      eip712Name: 'Mock USDT0',
      eip712Version: '1',
      address: COSTON2_MOCKUSDT0,
      decimals: 6,
      demoToken: true,
    },
    facilitator: COSTON2_FACILITATOR,
    payee: COSTON2_PAYEE,
    serverUrl: REFERENCE_SERVER_URL,
    resourcePath: '/api/demo',
    // VERIFIED live 2026-08-12: a real facilitator settlement landed and the resource
    // was delivered, recorded as two independent facts. Settlement tx
    // 0x2923aa74b5478b3cf6b5aa6e279acfdf120ece201afd8de8f0701d076e698158 (status success,
    // mUSDT0 payer −0.1 / payee +0.1), paymentId
    // 0x3ef50c3d33ff5bd92b288c8427164b1e59abdf1df77e6206e0111903927843cc, resource HTTP 200.
    // succeeded reached ONLY from settled + delivered. Evidence:
    // .thoughts/verification/2026-08-12-coston2-live-x402.json.
    x402Verified: true,
  },
  // Real x402 in FXRP or real USD₮0 is impossible until the token implements EIP-3009
  // (declared, M9 out-of-scope). Mainnet slots into this registry when a live run
  // verifies it — no source rewrite.
  flare: undefined,
}

export const X402 = X402_INTERNAL

/** The x402 deployment configured for a network, or `undefined` if none. */
export function x402For(network: FlareNetworkKey): X402Deployment | undefined {
  return X402[network]
}
