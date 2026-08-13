import { type FlareNetworkKey, chainFor } from './chains.js'
import type { Address } from './addresses.js'

/**
 * The swap venue, per network. M5-R2: the one source of truth for the router,
 * the factory and the swappable tokens, so no swap address is hardcoded in a
 * component. The kit integrates the **Uniswap V2 router interface**, not a
 * brand: Coston2 is BlazeSwap, Flare is SparkDEX's V2 router, and the same code
 * path drives both — only the address changes (network is configuration).
 *
 * Every address here was read on-chain by the R1 probe
 * (`.thoughts/verification/2026-08-09-m5-r1-coston2-swap-venue.md`): each
 * router's `factory()` matches, each `getAmountsOut` returns, and the FXRP/USD₮0
 * pool holds real reserves on both networks. Nothing is inferred.
 */

export interface DexToken {
  /** The symbol the chain actually deploys — `FTestXRP` on Coston2, not `FXRP`. */
  readonly symbol: string
  readonly address: Address
  readonly decimals: number
}

export interface DexRegistry {
  readonly router: Address
  readonly factory: Address
  /** Swappable tokens, keyed by a stable cross-network key (`FXRP`, `USDT0`, …). */
  readonly tokens: Readonly<Record<string, DexToken>>
  /**
   * The pair the R1 probe verified holds liquidity on this network, as
   * `[fromKey, toKey]`. A default the surface can offer without guessing; every
   * other pair is still gated by a live `getPair` check before it quotes.
   */
  readonly canonicalPair: readonly [string, string]
  /**
   * Whether this router's `addLiquidity` signature has been verified on chain
   * for this network. BlazeSwap/Coston2 carries the non-standard feeBips
   * signature (see `UNIV2_ROUTER_ABI` below), and only that one has been
   * verified — a future mainnet (SparkDEX V2) may use the standard signature,
   * which would revert against the feeBips-shaped calldata this kit builds.
   * Absent (or `false`) means the add path refuses to quote rather than emit
   * a plan that reverts after real approvals.
   */
  readonly addLiquidityVerified?: boolean
}

const REGISTRIES: Readonly<Record<FlareNetworkKey, DexRegistry>> = {
  coston2: {
    // BlazeSwap. The deployment that holds the FXRP pool (a second BlazeSwap
    // deployment on Coston2 has no FXRP pair — this is the right one).
    router: '0x440602f459d7dd500a74528003e6a20a46d6e2a6',
    factory: '0x02d03957Cf02d153141bf23C60099E9aa48bf872',
    tokens: {
      FXRP: { symbol: 'FTestXRP', address: '0x0b6A3645c240605887a5532109323A3E12273dc7', decimals: 6 },
      USDT0: { symbol: 'USD₮0', address: '0xC1A5B41512496B80903D1f32d6dEa3a73212E71F', decimals: 6 },
      WNAT: { symbol: 'WC2FLR', address: '0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273', decimals: 18 },
    },
    canonicalPair: ['USDT0', 'FXRP'],
    addLiquidityVerified: true,
  },
  flare: {
    // SparkDEX V2 router (Uniswap V2 interface). A real V2 FXRP/USD₮0 pool exists.
    router: '0x4a1E5A90e9943467FAd1acea1E7F0e5e88472a1e',
    factory: '0x16b619B04c961E8f4F06C10B42FDAbb328980A89',
    tokens: {
      FXRP: { symbol: 'FXRP', address: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE', decimals: 6 },
      USDT0: { symbol: 'USD₮0', address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6 },
      WNAT: { symbol: 'WFLR', address: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d', decimals: 18 },
    },
    canonicalPair: ['USDT0', 'FXRP'],
  },
}

/** The swap venue for a chain, or `UnsupportedNetworkError` for one the kit does not serve. */
export function dexFor(chainId: number): DexRegistry {
  return REGISTRIES[chainFor(chainId).key]
}

/** The swappable tokens for a chain, as a list for a selector. */
export function dexTokens(chainId: number): readonly DexToken[] {
  return Object.values(dexFor(chainId).tokens)
}

// ---------- the minimal V2 + ERC-20 ABIs the swap path needs ----------

export const UNIV2_ROUTER_ABI = [
  { name: 'factory', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    name: 'getAmountsOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactTokensForTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  // BlazeSwap's addLiquidity is NOT standard UniV2: it carries two extra fee-on-transfer
  // tolerance params (feeBipsA/feeBipsB, 0 for standard tokens) between amountBMin and `to`.
  // A standard-UniV2 8-param call reverts with empty data (selector hits the fallback).
  // NOTE: a future mainnet (SparkDEX V2) liquidity path may use the STANDARD signature —
  // adds are venue-specific, unlike swap/removeLiquidity. M6 is Coston2/BlazeSwap only.
  {
    name: 'addLiquidity',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'amountADesired', type: 'uint256' },
      { name: 'amountBDesired', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'feeBipsA', type: 'uint256' },
      { name: 'feeBipsB', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
      { name: 'liquidity', type: 'uint256' },
    ],
  },
  {
    name: 'removeLiquidity',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
    ],
  },
] as const

export const UNIV2_FACTORY_ABI = [
  {
    name: 'getPair',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
    ],
    outputs: [{ name: 'pair', type: 'address' }],
  },
] as const

export const UNIV2_PAIR_ABI = [
  { name: 'token0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'token1', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    name: 'getReserves',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' },
    ],
  },
] as const

export const ERC20_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const
