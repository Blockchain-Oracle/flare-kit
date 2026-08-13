import type { DexToken } from '@flare-kit/contracts'
import { describe, expect, it } from 'vitest'
import { amount } from '../src/amounts.js'
import { type SwapQuote, priceImpactBips } from '../src/swap-quote.js'

/**
 * Price impact (M5-R4), measured against a reference quote of a small amount on
 * the same path — both rates from the router's own `getAmountsOut`, never a
 * reserves-and-fee formula. The comparison must be apples to apples, or it
 * invents a number the pool never quoted.
 */

const FXRP = { symbol: 'FXRP', address: '0x00000000000000000000000000000000000000Fx', decimals: 6 } as const
const USDT = { symbol: 'USD₮0', address: '0x00000000000000000000000000000000000000Us', decimals: 6 } as const

function quote(inRaw: bigint, outRaw: bigint, to: DexToken = USDT): SwapQuote {
  return {
    from: FXRP,
    to,
    amountIn: amount(inRaw, FXRP.decimals, FXRP.symbol),
    amountOut: amount(outRaw, to.decimals, to.symbol),
    minReceived: amount(outRaw, to.decimals, to.symbol),
    slippageBips: 50,
    path: [FXRP.address, to.address],
    observedAt: 0,
  }
}

describe('priceImpactBips', () => {
  it('is zero when the trade fills at the spot rate', () => {
    const reference = quote(1_000000n, 1_000000n) // 1 FXRP -> 1.000000 USD₮0
    const execution = quote(100_000000n, 100_000000n) // 100 FXRP at the same rate
    expect(priceImpactBips(execution, reference)).toBe(0)
  })

  it('measures the execution rate falling short of the spot rate', () => {
    const reference = quote(1_000000n, 1_000000n) // spot 1.000000
    const execution = quote(100_000000n, 98_000000n) // 0.980000, 2% below -> 200 bips
    expect(priceImpactBips(execution, reference)).toBe(200)
  })

  it('never reports a negative impact', () => {
    const reference = quote(1_000000n, 1_000000n)
    const execution = quote(100_000000n, 101_000000n) // better than the probe -> clamp to 0
    expect(priceImpactBips(execution, reference)).toBe(0)
  })

  it('is null when the reference has no output to anchor a spot rate', () => {
    const reference = quote(1_000000n, 0n)
    const execution = quote(100_000000n, 98_000000n)
    expect(priceImpactBips(execution, reference)).toBeNull()
  })

  it('is null when the reference is not a smaller probe than the execution', () => {
    // Same quote passed for both — a plausible wiring bug — must not read as 0%.
    const same = quote(100_000000n, 98_000000n)
    expect(priceImpactBips(same, same)).toBeNull()
  })

  it('is null when the two quotes are for different pairs', () => {
    const reference = quote(1_000000n, 1_000000n)
    const execution = quote(100_000000n, 98_000000n, {
      symbol: 'WNAT',
      address: '0x00000000000000000000000000000000000000Wn',
      decimals: 18,
    })
    expect(priceImpactBips(execution, reference)).toBeNull()
  })
})
