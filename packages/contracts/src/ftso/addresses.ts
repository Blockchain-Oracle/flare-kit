import { type FlareNetworkKey, chainFor } from '../chains.js'
import type { Address } from '../addresses.js'

/**
 * The FTSO deployment on each network.
 *
 * Every address below was read from `FlareContractRegistry.getAllContracts()` on
 * the live network on 2026-08-04 — 69 registered contracts on Coston2, 67 on
 * Flare — and never copied from documentation. The registry is the only source
 * that cannot be stale relative to the chain it describes.
 *
 * These live beside `addresses.ts` rather than inside `NetworkRegistry` because
 * that interface is already the FAssets-and-FDC contract surface; a seventh and
 * eighth unrelated field on it makes the FAssets reader carry FTSO's vocabulary.
 * `ftsoRegistryFor` parallels `registryFor` exactly.
 */

export interface FtsoRegistry {
  readonly chainId: number
  /**
   * An ERC1967 proxy. Its published explorer ABI is seven entries; the usable
   * ABI comes from the vendored interface artifact, never from the proxy.
   */
  readonly ftsoV2: Address
  readonly fastUpdater: Address
  readonly fastUpdatesConfiguration: Address
  readonly fastUpdateIncentiveManager: Address
  /**
   * A *second* fee oracle, and it does not always agree with `FtsoV2`'s own —
   * for the same 66 mainnet feeds it answers 3 where FtsoV2 answers 0. It is
   * never what a feed read pays; see `core/src/ftso/fee.ts`, which quotes from
   * the contract that guards the call.
   */
  readonly feeCalculator: Address
  /** Anchor-path decimals. Not the same value as the block-latency path's. */
  readonly ftsoFeedDecimals: Address
  readonly ftsoFeedIdConverter: Address
}



const FTSO_REGISTRIES: Readonly<Record<FlareNetworkKey, FtsoRegistry>> = {
  coston2: {
    chainId: 114,
    ftsoV2: '0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d',
    fastUpdater: '0x0B162CA3acf3482d3357972e12d794434085D839',
    fastUpdatesConfiguration: '0x222768c5AbCe56Af9Fd75c5f59614a8B7F5dBe80',
    fastUpdateIncentiveManager: '0xC71C1C6E6FB31eF6D948B2C074fA0d38a07D4f68',
    feeCalculator: '0x88A9315f96c9b5518BBeC58dC6a914e13fAb13e2',
    ftsoFeedDecimals: '0xdC338222e3Bf815A87F561C6BD42C094a5d171d4',
    ftsoFeedIdConverter: '0x1224AE03e0564c4C2dD3B49B1834F2ac765a529E',
  },
  flare: {
    chainId: 14,
    ftsoV2: '0x7BDE3Df0624114eDB3A67dFe6753e62f4e7c1d20',
    fastUpdater: '0xdBF71d7840934EB82FA10173103D4e9fd4054dd1',
    fastUpdatesConfiguration: '0xD9B6fB7F49C13C1448d0DEF4E83aFECf8E8778C8',
    fastUpdateIncentiveManager: '0xd648e8ACA486Ce876D641A0F53ED1F2E9eF4885D',
    feeCalculator: '0xFDe4f89E6d67ec1a497e1c25944ba5D2d7a36bf3',
    ftsoFeedDecimals: '0xC4C1B29Db668D40D986B19D06956079D1571baC1',
    ftsoFeedIdConverter: '0xafEa60cabb2daB413D17b85Db82cCf6EB06a0F66',
  },
}

export function ftsoRegistryFor(chainId: number): FtsoRegistry {
  return FTSO_REGISTRIES[chainFor(chainId).key]
}

/**
 * What each network's custom-feed set looked like when it was last read, so an
 * empty set can render as an honest dated observation rather than as an error or
 * as an absence of the feature (M4-R8).
 *
 * This is evidence about the past, never a substitute for reading the chain. The
 * surface reads live and shows this only to say *when we last looked and what we
 * saw*.
 */
export const OBSERVED_CUSTOM_FEEDS = {
  observedAt: '2026-08-04',
  coston2: [] as readonly string[],
  flare: ['sFLR/USD', 'stXRP/USD', 'stFLR/USD'] as readonly string[],
} as const
