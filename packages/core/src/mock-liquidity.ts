// packages/core/src/mock-liquidity.ts
import { type Address, dexFor } from '@flare-kit/contracts'
import type { SwapReader } from './swap-quote.js'

/**
 * The liquidity mock (M6-R5), written after the real path. It is a labelled reader
 * the REAL quote/position functions run against, so a test or a demo drives the true
 * code path with no network. Mock mode is explicit — a caller opts in by constructing
 * this reader; nothing ever falls back to it. It refuses any call it never observed.
 *
 * Reserves and totalSupply are the real Coston2 FXRP/USD₮0 pool, read on chain via
 * scripts/probe-liquidity.mjs (2026-08-11). token0 is FXRP.
 */

export const MOCK_LIQUIDITY = {
  reserveA: 22_964524n, // FXRP (6dp) — observed
  reserveB: 28_582833n, // USD₮0 (6dp) — observed
  totalSupply: 25_544224n, // LP — observed
} as const

const MOCK_PAIR: Address = '0xdd598473f738df117ee331bc07172481db60acbe'
const ZERO: Address = '0x0000000000000000000000000000000000000000'
const AMPLE = 1n << 128n

export interface MockLiquidityConfig {
  readonly poolExists?: boolean
  readonly allowance?: bigint
  readonly lpBalance?: bigint
  readonly reserves?: { readonly reserveA: bigint; readonly reserveB: bigint; readonly totalSupply: bigint }
}

export function createMockLiquidityReader(config: MockLiquidityConfig = {}): SwapReader {
  const dex = dexFor(114)
  const fxrp = dex.tokens.FXRP!.address
  const reserves = config.reserves ?? MOCK_LIQUIDITY
  return {
    async readContract({ functionName }) {
      switch (functionName) {
        case 'getPair':
          return config.poolExists === false ? ZERO : MOCK_PAIR
        case 'token0':
          return fxrp
        case 'getReserves':
          return [reserves.reserveA, reserves.reserveB, 0]
        case 'totalSupply':
          return reserves.totalSupply
        case 'allowance':
          return config.allowance ?? AMPLE
        case 'balanceOf':
          return config.lpBalance ?? 0n
        case 'decimals':
          return 18
        case 'symbol':
          return 'BLAZE-LP'
        default:
          throw new Error(`mock liquidity reader: unexpected call ${functionName}`)
      }
    },
  }
}
