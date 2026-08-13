import { type FlareNetworkKey } from './chains.js'
import type { Address } from './addresses.js'

/**
 * The gasless-payment registry, per network (M9-R1). The one source of truth for the
 * GaslessPaymentForwarder address, the FXRP it moves, and the reference relayer's base
 * URL, so no gasless value is hardcoded in a component.
 *
 * Every address here was recorded by the M9 Task-2 live deploy
 * (`reference/contracts/deployments/coston2.json`): the forwarder deployed to
 * 0x7F35…, its `fxrp()` resolved to FTestXRP 0x0b6A… on-chain, and the operator was
 * authorized as its relayer. Nothing is inferred.
 *
 * `gaslessVerified` is the M9 analog of `bridge.ts`'s `bridgeVerified` and
 * `vaults.ts`'s `withdrawVerified`: the surface is trusted to emit a plan (sign an
 * approval on this forwarder) only after a live run confirms a real gasless FXRP
 * transfer on-chain (Task 7). It starts `false` and flips to `true` only after that
 * confirmed transfer read — never before. Until then the composer shows the
 * configured path but a declared-unbuilt affordance, never a plan.
 */

export interface GaslessDeployment {
  readonly network: FlareNetworkKey
  readonly forwarder: Address
  /** The FXRP moved by the forwarder — the on-chain symbol (FTestXRP on Coston2). */
  readonly fxrp: { readonly symbol: string; readonly address: Address; readonly decimals: number }
  /**
   * The reference relayer's base URL. The relayer is self-hosted (flare-kit never
   * becomes a hosted operator), so this is a localhost default a developer overrides —
   * a public constant, never an env var.
   */
  readonly relayerUrl: string
  readonly gaslessVerified: boolean
}

// --- deploy-recorded addresses (Coston2; reference/contracts/deployments/coston2.json) ---
const COSTON2_FORWARDER = '0x7F358717afdEC6FD4AFEfCf2e7dD9ff3dF4b9c17' as const
const COSTON2_FTESTXRP = '0x0b6A3645c240605887a5532109323A3E12273dc7' as const

// The reference relayer's default port (see services/relayer). Overridable per host.
const REFERENCE_RELAYER_URL = 'http://localhost:8788'

const GASLESS_INTERNAL: Readonly<Record<FlareNetworkKey, GaslessDeployment | undefined>> = {
  coston2: {
    network: 'coston2',
    forwarder: COSTON2_FORWARDER,
    fxrp: { symbol: 'FTestXRP', address: COSTON2_FTESTXRP, decimals: 6 },
    relayerUrl: REFERENCE_RELAYER_URL,
    // VERIFIED live 2026-08-12: a real FXRP payment landed with the payer paying 0 gas
    // for it. The payer approved once (payer-gassed, tx 0x753a184f…), drained C2FLR to
    // ~0.001365, then signed a PaymentRequest the relayer submitted (payment tx
    // 0x799d3c9eb0893643d418f334cb15d97cc6b2140d541bd46cef6901938f5b02d4, FXRP payer −1 /
    // recipient +1, payer C2FLR unchanged across the payment). succeeded reached ONLY
    // from the on-chain PaymentExecuted read. Evidence:
    // .thoughts/verification/2026-08-12-coston2-live-gasless.json.
    gaslessVerified: true,
  },
  // Mainnet gasless is a later, separately-verified milestone (FXRP + a mainnet
  // forwarder deploy slot into this same registry with no source rewrite).
  flare: undefined,
}

export const GASLESS = GASLESS_INTERNAL

/** The gasless deployment configured for a network, or `undefined` if none. */
export function gaslessFor(network: FlareNetworkKey): GaslessDeployment | undefined {
  return GASLESS[network]
}
