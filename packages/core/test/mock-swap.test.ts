import { describe, expect, it } from 'vitest'
import { createMockSwapReader } from '../src/mock-swap.js'
import { priceImpactBips, quoteSwap, readAllowance } from '../src/swap-quote.js'

/**
 * The mock (M5-R5), written after the real path. It is a labelled reader the REAL
 * `quoteSwap` / `readAllowance` run against — reproducing the observed thin
 * Coston2 pool, a no-pool pair and a pool that cannot fill — so no test or demo
 * needs a network, and the mock is never a fallback triggered by a failure.
 */

const COSTON2 = 114

async function quote(reader: ReturnType<typeof createMockSwapReader>, amountIn: bigint, fromKey = 'FXRP', toKey = 'USDT0') {
  return quoteSwap({ reader, chainId: COSTON2, fromKey, toKey, amountIn, slippageBips: 300, now: 0 })
}

describe('createMockSwapReader', () => {
  it('reproduces a real quote for the observed FXRP/USD₮0 pool', async () => {
    const result = await quote(createMockSwapReader(), 1_000000n)
    expect(result.kind).toBe('quote')
    if (result.kind !== 'quote') return
    // ~1.1–1.2 USD₮0 per FXRP from the real thin reserves; a positive, floored price.
    expect(result.quote.amountOut.value).toBeGreaterThan(1_000000n)
    expect(result.quote.amountOut.value).toBeLessThan(1_300000n)
    expect(result.quote.minReceived.value).toBeLessThan(result.quote.amountOut.value)
  })

  it('reports no route for a pair the mock has no pool for', async () => {
    const result = await quote(createMockSwapReader(), 1_000000n, 'FXRP', 'WNAT')
    expect(result.kind).toBe('no_route')
  })

  it('reports no route when the pool cannot fill the trade (a revert)', async () => {
    const result = await quote(createMockSwapReader({ quoteReverts: true }), 1_000000n)
    expect(result.kind).toBe('no_route')
  })

  it('reproduces a short allowance so the plan needs an approve step', async () => {
    const reader = createMockSwapReader({ allowance: 0n })
    const allowance = await readAllowance(reader, COSTON2, 'FXRP', '0x0000000000000000000000000000000000000001')
    expect(allowance).toBe(0n)
  })

  it('reproduces non-linear price impact — a larger trade moves the thin pool more', async () => {
    const reader = createMockSwapReader()
    const small = await quote(reader, 100_000n) // 0.1 FXRP, the spot reference
    const large = await quote(reader, 5_000000n) // 5 FXRP into a ~23 FXRP pool
    expect(small.kind === 'quote' && large.kind === 'quote').toBe(true)
    if (small.kind !== 'quote' || large.kind !== 'quote') return
    const impact = priceImpactBips(large.quote, small.quote)
    expect(impact).not.toBeNull()
    expect(impact!).toBeGreaterThan(100) // >1% on a 5-FXRP trade through a thin pool
  })
})
