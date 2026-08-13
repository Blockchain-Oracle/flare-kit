// packages/core/test/mock-liquidity.test.ts
import { describe, expect, it } from 'vitest'
import { quoteAddLiquidity, readPosition } from '../src/liquidity-quote.js'
import { createMockLiquidityReader, MOCK_LIQUIDITY } from '../src/mock-liquidity.js'

const COSTON2 = 114

describe('mock liquidity reader (M6-R5)', () => {
  it('drives the real add quote off observed reserves and supply', async () => {
    const r = await quoteAddLiquidity({ reader: createMockLiquidityReader(), chainId: COSTON2, tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, now: 1 })
    expect(r.kind).toBe('quote')
    if (r.kind !== 'quote') return
    expect(r.quote.amountB.value).toBe((1_000000n * MOCK_LIQUIDITY.reserveB) / MOCK_LIQUIDITY.reserveA)
    expect(r.quote.expectedLp).toBeGreaterThan(0n)
  })

  it('surfaces a chosen LP balance as a position', async () => {
    const r = await readPosition({ reader: createMockLiquidityReader({ lpBalance: MOCK_LIQUIDITY.totalSupply / 4n }), chainId: COSTON2, tokenAKey: 'FXRP', tokenBKey: 'USDT0', owner: '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' })
    expect(r.kind).toBe('position')
  })

  it('refuses a call it never observed rather than inventing a value', async () => {
    const reader = createMockLiquidityReader()
    await expect(reader.readContract({ address: '0x0', abi: [], functionName: 'getAmountsIn', args: [] })).rejects.toThrow(/unexpected/i)
  })
})
