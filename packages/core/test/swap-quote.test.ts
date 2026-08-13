import { describe, expect, it } from 'vitest'
import { dexFor } from '@flare-kit/contracts'
import { formatExact } from '../src/amounts.js'
import { type SwapReader, quoteSwap, readAllowance } from '../src/swap-quote.js'

const COSTON2 = 114
const dex = dexFor(COSTON2)
const POOL = '0xDD598473f738df117Ee331bc07172481db60acBE'

// A reader driven by a table: (functionName) -> value or throw. Mirrors the
// live shapes the R1 probe observed.
function reader(handlers: Record<string, (args: readonly unknown[]) => unknown>): SwapReader {
  return {
    async readContract({ functionName, args = [] }) {
      const h = handlers[functionName]
      if (!h) throw new Error(`unexpected call ${functionName}`)
      return h(args)
    },
  }
}

describe('quoteSwap', () => {
  const base = { reader: reader({}), chainId: COSTON2, fromKey: 'FXRP', toKey: 'USDT0', amountIn: 1_000000n, slippageBips: 50, now: 1_000 }

  it('quotes from the router getAmountsOut and floors the min received by slippage', async () => {
    const r = await quoteSwap({
      ...base,
      reader: reader({
        getPair: () => POOL,
        // 1 FXRP -> 1.224352 USD₮0, the live Coston2 quote
        getAmountsOut: () => [1_000000n, 1_224352n],
      }),
    })
    expect(r.kind).toBe('quote')
    if (r.kind !== 'quote') return
    expect(formatExact(r.quote.amountOut)).toBe('1.224352 USD₮0')
    // 0.50% slippage: 1_224352 * 9950 / 10000 = 1_218230
    expect(r.quote.minReceived.value).toBe(1_218230n)
    expect(r.quote.slippageBips).toBe(50)
    expect(r.quote.path).toEqual([dex.tokens.FXRP?.address, dex.tokens.USDT0?.address])
  })

  it('reports no_route — never a zero price — when the pool does not exist', async () => {
    const r = await quoteSwap({
      ...base,
      reader: reader({ getPair: () => '0x0000000000000000000000000000000000000000' }),
    })
    expect(r.kind).toBe('no_route')
    if (r.kind === 'no_route') expect(r.message).toMatch(/no .*pool/i)
  })

  it('reads a getAmountsOut revert as no_route (too little liquidity), not an outage', async () => {
    const r = await quoteSwap({
      ...base,
      reader: reader({
        getPair: () => POOL,
        getAmountsOut: () => { throw new Error('execution reverted: INSUFFICIENT_LIQUIDITY') },
      }),
    })
    expect(r.kind).toBe('no_route')
    if (r.kind === 'no_route') expect(r.message).toMatch(/too small|cannot fill/i)
  })

  it('reads a factory network failure as unavailable, not no_route', async () => {
    const r = await quoteSwap({
      ...base,
      reader: reader({ getPair: () => { throw new Error('fetch failed') } }),
    })
    expect(r.kind).toBe('unavailable')
  })

  it('refuses a token swapped for itself and a non-positive amount', async () => {
    expect((await quoteSwap({ ...base, toKey: 'FXRP' })).kind).toBe('no_route')
    expect((await quoteSwap({ ...base, amountIn: 0n })).kind).toBe('unavailable')
  })
})

describe('readAllowance', () => {
  it('reads what the from-token has granted the router', async () => {
    const value = await readAllowance(
      reader({ allowance: () => 42n }),
      COSTON2,
      'FXRP',
      '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9',
    )
    expect(value).toBe(42n)
  })
})
