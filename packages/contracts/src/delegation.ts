import { FLARE_NETWORKS, type FlareNetworkKey } from './chains.js'
import { registryFor } from './addresses.js'

/**
 * The delegation registry: the one source of truth for the WNat token the M10
 * `DelegationCard` drives and the protocol cap it enforces. FTSO participation on
 * Flare is "wrap native → delegate WNat vote power to a provider (by percentage)",
 * so the shared object downstream is the WNat contract plus the delegation rules,
 * not a per-screen literal.
 *
 * Every value here traces to the M10 Task-1 probe
 * (`.thoughts/verification/2026-08-12-m10-probe.json`, Coston2 block 33963269): WNat
 * resolved from `FlareContractRegistry.getAllContracts()` (zero drift), and a
 * blank-slate account reading `delegationModeOf` 0 (NOTSET), `delegatesOf`
 * ([],[],0,0), `votePowerOf` 0. Nothing is inferred.
 *
 * `wnat` is sourced by REUSE — `registryFor(114).wrappedNative` — never a second
 * address literal. R2: addresses come from the address registry and are not
 * re-declared. The delegation surface is one more consumer of the WNat address the
 * DEX/vault config already carries.
 *
 * `delegationVerified` is the M10 analog of `bridge.ts`'s `bridgeVerified` and
 * `gasless.ts`'s `gaslessVerified`: the surface is trusted to emit a delegation plan
 * (spend real vote power on a provider) only after a live run confirms the round trip
 * on-chain. It starts `false` and flips to `true` in the M10 live verification
 * (Task 5) — never before a confirmed `delegatesOf` read following a real delegate.
 */

export interface DelegationDeployment {
  /** Always `coston2` here — mainnet is a separately verified milestone. */
  readonly network: FlareNetworkKey
  /**
   * The WNat token vote power is delegated on. REUSED from the address registry
   * (`registryFor(114).wrappedNative`); never a second literal in this file.
   */
  readonly wnat: `0x${string}`
  /** The native gas token wrapped into WNat: `C2FLR` on Coston2, `FLR` on mainnet. */
  readonly nativeSymbol: 'C2FLR' | 'FLR'
  /** The wrapped token symbol shown on the surface: `WC2FLR` / `WFLR`. */
  readonly wrappedSymbol: 'WC2FLR' | 'WFLR'
  /**
   * Protocol cap on the number of percentage delegates: at most two providers.
   * The surface enforces this before building a `batchDelegate`.
   */
  readonly maxPercentDelegates: 2
  /** True only where a live delegation round trip confirmed on-chain (Task 5). */
  readonly delegationVerified: boolean
}

const COSTON2_CHAIN_ID = FLARE_NETWORKS.coston2.id

const DELEGATION_INTERNAL: Readonly<Record<FlareNetworkKey, DelegationDeployment | undefined>> = {
  coston2: {
    network: 'coston2',
    // REUSE — the Coston2 WNat 0xC67DCE33…Ce9273, resolved once by the probe and
    // pinned in the address registry. No second literal lives here.
    wnat: registryFor(COSTON2_CHAIN_ID).wrappedNative,
    nativeSymbol: 'C2FLR',
    wrappedSymbol: 'WC2FLR',
    maxPercentDelegates: 2,
    // Starts false. Task 5 flips this after the confirmed on-chain round trip
    // (wrap → delegate → delegatesOf read → undelegate). Never before.
    delegationVerified: true,
  },
  // Flare mainnet delegation is a later, separately-verified milestone — configured
  // only when its own live run confirms the round trip. Mirrors bridge.ts's empty
  // `flare` handling.
  flare: undefined,
}

export const DELEGATION = DELEGATION_INTERNAL

/** The delegation deployment for a network key, or `undefined` if not configured. */
export function delegationFor(network: FlareNetworkKey): DelegationDeployment | undefined {
  return DELEGATION[network]
}
