import { type FlareNetworkKey, chainFor } from './chains.js'
import type { Address } from './addresses.js'

/**
 * The ERC-4626-family vault venue, per network. M7-R1: the one source of truth for
 * every vault address and its shape, so no vault address is hardcoded in a
 * component. Vaults are the third capability in the DEX bucket (after M5 swaps and
 * M6 liquidity); the kit drives the deposit + delayed-withdrawal lifecycle, not a
 * brand.
 *
 * Every address here was read on-chain by the M7 probe
 * (`.thoughts/verification/2026-08-11-m7-vault-probe.json`, Coston2 block 33928587;
 * Flare mainnet block 67172499). Nothing is inferred — the mainnet Upshift share is
 * `earnXRP`, not testnet's `vFXRP`, because the probe read it rather than guessing.
 *
 * `withdrawVerified` is the M7 analog of `dex.ts`'s `addLiquidityVerified`: the two
 * vaults have materially different, non-standard withdraw call shapes (see
 * `vault-abis.ts`), so a network's withdraw path is trusted only after a live run
 * confirms it. Coston2 flips to `true` in the M7 live verification (Task 5); Flare
 * mainnet stays `false` (reads only) until a mainnet run — the kit refuses to emit
 * an unverified withdraw/claim plan rather than sign approvals then revert.
 */

export type VaultProtocol = 'firelight' | 'upshift'

export type ExitMode = 'delayed' | 'instant'

/** The share representation: the vault itself (ERC-4626 self-share) or a separate LP token. */
export type ShareToken =
  | { readonly kind: 'self'; readonly symbol: string; readonly decimals: number }
  | { readonly kind: 'lp'; readonly symbol: string; readonly address: Address; readonly decimals: number }

export interface VaultConfig {
  /** A stable cross-network key (`firelight-fxrp`, `upshift-fxrp`, …). */
  readonly key: string
  readonly protocol: VaultProtocol
  readonly address: Address
  /** The deposit asset, keyed like `dex.ts` tokens (`FXRP`). */
  readonly assetKey: string
  readonly asset: { readonly symbol: string; readonly address: Address; readonly decimals: number }
  readonly share: ShareToken
  /** Exit routes this vault offers; `delayed` is request→wait→claim, `instant` is immediate-with-fee. */
  readonly exitModes: readonly ExitMode[]
  /**
   * Whether this vault's non-standard withdraw path has been driven live on this
   * network. `false` means the surface shows the vault's reads but its withdraw
   * action is a declared-unbuilt affordance — never a plan that could misrender.
   */
  readonly withdrawVerified: boolean
}

const FTESTXRP_COSTON2 = {
  symbol: 'FTestXRP',
  address: '0x0b6A3645c240605887a5532109323A3E12273dc7',
  decimals: 6,
} as const

const FXRP_FLARE = {
  symbol: 'FXRP',
  address: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE',
  decimals: 6,
} as const

const VAULTS: Readonly<Record<FlareNetworkKey, readonly VaultConfig[]>> = {
  coston2: [
    {
      // Firelight — self-share stFXRP; standard ERC-4626 deposit, period-based
      // delayed withdrawal (withdraw/redeem create a request, claimWithdraw later).
      key: 'firelight-fxrp',
      protocol: 'firelight',
      address: '0x91Bfe6A68aB035DFebb6A770FFfB748C03C0E40B',
      assetKey: 'FXRP',
      asset: FTESTXRP_COSTON2,
      share: { kind: 'self', symbol: 'stFXRP', decimals: 6 },
      exitModes: ['delayed'],
      // The delayed CLAIM landed live 2026-08-13 (claim 0xbba94b139057e33ba955fde908f41c30d1fc6a6f1302a6c74edfc6a1ecf3c71d,
      // received 0.003 FXRP, block 33998606) — the request→claim round trip is proven. The
      // `withdrawVerified:true` flip is a follow-up: it is the suite's canonical declared-unbuilt
      // fixture (contracts/core/react-ui tests + mock + gallery), so the flip needs its own
      // reviewed migration + browser re-verify. Kept false (safe under-claim) until then.
      withdrawVerified: false,
    },
    {
      // Upshift — separate LP token vFXRP; NON-STANDARD deposit(asset,amount,receiver);
      // instant (fee) or requestRedeem → lag → claim(y,m,d) (lower fee) routes.
      key: 'upshift-fxrp',
      protocol: 'upshift',
      address: '0x24c1a47cD5e8473b64EAB2a94515a196E10C7C81',
      assetKey: 'FXRP',
      asset: FTESTXRP_COSTON2,
      share: { kind: 'lp', symbol: 'vFXRP', address: '0xe084F7328DDaB082a139b880782dCC424d20a1DB', decimals: 6 },
      exitModes: ['instant', 'delayed'],
      // VERIFIED live: instant round trip (Phase A) + the delayed request→claim round trip
      // (claim 0x4a652477…, received 498759 == expected exact, 2026-08-12). Full withdraw path proven.
      withdrawVerified: true,
    },
  ],
  flare: [
    {
      // Upshift on Flare mainnet — configured for READS ONLY. Probed live (block
      // 67172499): asset FXRP, share `earnXRP`. Its withdraw model is not yet
      // driven live on mainnet, so `withdrawVerified` is false and the withdraw
      // path stays declared-unbuilt. Firelight mainnet is intentionally absent —
      // no address is published in the vendored sources, and the registry will not
      // carry an unverified address.
      key: 'upshift-fxrp',
      protocol: 'upshift',
      address: '0x373D7d201C8134D4a2f7b5c63560da217e3dEA28',
      assetKey: 'FXRP',
      asset: FXRP_FLARE,
      share: { kind: 'lp', symbol: 'earnXRP', address: '0xE533E447fD7720b2F8654da2B1953Efa06b60bfA', decimals: 6 },
      exitModes: ['instant', 'delayed'],
      withdrawVerified: false,
    },
  ],
}

/** The vaults configured for a network key. */
export function vaultsFor(network: FlareNetworkKey): readonly VaultConfig[] {
  return VAULTS[network]
}

/** The vaults configured for a chain id (the shape surfaces use, mirroring `dexFor`). */
export function vaultsForChain(chainId: number): readonly VaultConfig[] {
  return VAULTS[chainFor(chainId).key]
}

/** One vault by its stable key on a network, or `undefined` if not configured. */
export function vaultByKey(network: FlareNetworkKey, key: string): VaultConfig | undefined {
  return VAULTS[network].find((v) => v.key === key)
}

/** One vault by its stable key for a chain id. */
export function vaultByKeyForChain(chainId: number, key: string): VaultConfig | undefined {
  return vaultByKey(chainFor(chainId).key, key)
}
