import { type Address, dexFor } from '@flare-kit/contracts'
import type { SwapReader } from './swap-quote.js'

/**
 * The swap mock (M5-R5), written after the real path. It is a labelled `SwapReader`
 * the REAL `quoteSwap` and `readAllowance` run against, so a test or a demo drives
 * the true code path with no network. Mock mode is explicit here — a caller opts
 * in by constructing this reader; nothing ever falls back to it on a failure.
 *
 * The reserves are the real Coston2 FXRP/USD₮0 pool, read on chain 2026-08-09
 * after the M5-AC1 swap. The mock prices with the standard V2 constant-product
 * curve and 0.3% fee — a simulation of the router, so a larger trade moves the
 * thin pool exactly as the live one does, and impact is non-linear, not invented.
 */

/** The one thin pool, read live on Coston2 (2026-08-09). Base units, 6 dp each. */
export const MOCK_SWAP_RESERVES = { FXRP: 23_623775n, USDT0: 27_782833n } as const

const MOCK_PAIR: Address = '0xdd598473f738df117ee331bc07172481db60acbe'
const ZERO: Address = '0x0000000000000000000000000000000000000000'
const AMPLE_ALLOWANCE = 1n << 128n

export interface MockSwapConfig {
  /** The router's allowance; `0n` makes the plan need an approve step. */
  readonly allowance?: bigint
  /** Force the canonical pair to have no pool (the no-route shape). */
  readonly poolExists?: boolean
  /** Make `getAmountsOut` revert — a pool too thin to fill the trade. */
  readonly quoteReverts?: boolean
  readonly reserves?: { readonly FXRP: bigint; readonly USDT0: bigint }
}

/** Uniswap V2 `getAmountsOut` for one hop: constant product with the 0.3% fee. */
function amountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  const inWithFee = amountIn * 997n
  return (inWithFee * reserveOut) / (reserveIn * 1000n + inWithFee)
}

export function createMockSwapReader(config: MockSwapConfig = {}): SwapReader {
  const dex = dexFor(114) // Coston2 — the network these reserves were read on.
  const reserves = config.reserves ?? MOCK_SWAP_RESERVES
  const fxrp = dex.tokens.FXRP!.address.toLowerCase()
  const usdt = dex.tokens.USDT0!.address.toLowerCase()

  return {
    async readContract({ functionName, args = [] }) {
      if (functionName === 'getPair') {
        if (config.poolExists === false) return ZERO
        const a = String(args[0]).toLowerCase()
        const b = String(args[1]).toLowerCase()
        const canonical = (a === fxrp && b === usdt) || (a === usdt && b === fxrp)
        return canonical ? MOCK_PAIR : ZERO
      }
      if (functionName === 'allowance') {
        return config.allowance ?? AMPLE_ALLOWANCE
      }
      if (functionName === 'getAmountsOut') {
        if (config.quoteReverts) throw new Error('BlazeSwapLibrary: INSUFFICIENT_LIQUIDITY')
        const amountIn = args[0] as bigint
        const path = args[1] as readonly string[]
        const fromFxrp = String(path[0]).toLowerCase() === fxrp
        const [reserveIn, reserveOut] = fromFxrp
          ? [reserves.FXRP, reserves.USDT0]
          : [reserves.USDT0, reserves.FXRP]
        return [amountIn, amountOut(amountIn, reserveIn, reserveOut)]
      }
      throw new Error(`mock swap reader: unexpected call ${functionName}`)
    },
  }
}
