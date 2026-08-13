import { describe, expect, it } from 'vitest'
import { dexFor } from '@flare-kit/contracts'
import { amount } from '../src/amounts.js'
import { applyQuote, buildSwapPlan, createSwap, startQuoting, type SwapIntent } from '../src/swap.js'
import type { SwapQuote, SwapQuoteResult } from '../src/swap-quote.js'

const COSTON2 = 114
const dex = dexFor(COSTON2)
const RECIPIENT = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'

const intent: SwapIntent = {
  fromKey: 'FXRP',
  toKey: 'USDT0',
  amountIn: 1_000000n,
  slippageBips: 50,
  recipient: RECIPIENT,
  deadline: 1_900_000_000,
}

const quote: SwapQuote = {
  from: dex.tokens.FXRP!,
  to: dex.tokens.USDT0!,
  amountIn: amount(1_000000n, 6, 'FTestXRP'),
  amountOut: amount(1_224352n, 6, 'USD₮0'),
  minReceived: amount(1_218230n, 6, 'USD₮0'),
  slippageBips: 50,
  path: [dex.tokens.FXRP!.address, dex.tokens.USDT0!.address],
  observedAt: 1_000,
}
const quoteResult: SwapQuoteResult = { kind: 'quote', quote }

const quoted = () => startQuoting(createSwap({ chainId: COSTON2, intent, now: 1, id: 'op_test' }), 2).record

describe('createSwap', () => {
  it('starts a draft swap on the operation lifecycle', () => {
    const op = createSwap({ chainId: COSTON2, intent, now: 1, id: 'op_test' })
    expect(op.state).toBe('draft')
    expect(op.capability).toBe('swap')
    expect(op.intent.amountIn).toBe(1_000000n)
  })
})

describe('applyQuote', () => {
  it('goes quoting → ready and attaches quote + plan when the allowance suffices', () => {
    const { record, stateChanged } = applyQuote(quoted(), { result: quoteResult, allowance: 2_000000n, now: 3 })
    expect(stateChanged).toBe(true)
    expect(record.state).toBe('ready')
    // The patch survived the legal hop: the quote and plan are attached.
    expect(record.quote?.amountOut.value).toBe(1_224352n)
    expect(record.plan?.approve).toBeUndefined()
    expect(record.plan?.swap.amountOutMin).toBe(1_218230n)
    expect(record.plan?.swap.functionName).toBe('swapExactTokensForTokens')
    expect(record.steps.map((s) => s.id)).toEqual(['swap'])
  })

  it('goes quoting → awaiting_approval with an approve step when the allowance is short', () => {
    const { record } = applyQuote(quoted(), { result: quoteResult, allowance: 0n, now: 3 })
    expect(record.state).toBe('awaiting_approval')
    expect(record.plan?.approve).toEqual({ token: dex.tokens.FXRP!.address, spender: dex.router, amount: 1_000000n })
    expect(record.steps.map((s) => s.id)).toEqual(['approve', 'swap'])
  })

  it('goes back to awaiting_input for a no_route — no plan, no invented price', () => {
    const { record } = applyQuote(quoted(), {
      result: { kind: 'no_route', message: 'no pool' },
      allowance: 0n,
      now: 3,
    })
    expect(record.state).toBe('awaiting_input')
    expect(record.plan).toBeUndefined()
    expect(record.quote).toBeUndefined()
  })
})

describe('buildSwapPlan', () => {
  it('enforces the slippage floor on chain via amountOutMin, and never hides an approval', () => {
    const short = buildSwapPlan(intent, quote, 0n, dex)
    expect(short.approve?.amount).toBe(1_000000n)
    expect(short.swap.amountOutMin).toBe(1_218230n)
    expect(short.swap.to).toBe(RECIPIENT)
    expect(short.swap.deadline).toBe(1_900_000_000n)

    const approved = buildSwapPlan(intent, quote, 5_000000n, dex)
    expect(approved.approve).toBeUndefined()
  })
})
