// packages/core/test/liquidity.test.ts
import { describe, expect, it } from 'vitest'
import { dexFor } from '@flare-kit/contracts'
import { amount } from '../src/amounts.js'
import { buildAddPlan, buildRemovePlan, createAddLiquidity, createRemoveLiquidity, applyAddQuote, applyRemoveQuote, startQuoting } from '../src/liquidity.js'
import type { AddLiquidityQuote, RemoveLiquidityQuote } from '../src/liquidity-quote.js'

const COSTON2 = 114
const dex = dexFor(COSTON2)
const RECIP = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as const
const FXRP = dex.tokens.FXRP!
const USDT0 = dex.tokens.USDT0!

const addQuote: AddLiquidityQuote = {
  tokenA: FXRP, tokenB: USDT0,
  amountA: amount(1_000000n, 6, 'FXRP'),
  amountB: amount(1_176000n, 6, 'USD₮0'),
  minA: amount(995000n, 6, 'FXRP'),
  minB: amount(1_170120n, 6, 'USD₮0'),
  expectedLp: 500000n, lpDecimals: 18, lpSymbol: 'BLAZE-LP', poolShareBips: 40, slippageBips: 50,
  pair: '0xDD598473f738df117Ee331bc07172481db60acBE', observedAt: 1000,
}

describe('buildAddPlan (M6-R4)', () => {
  const intent = { tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, recipient: RECIP, deadline: 2200 }

  it('approves each token only when its allowance is short, and never folds them into the add', () => {
    const plan = buildAddPlan(intent, addQuote, 0n, 0n, dex)
    expect(plan.approveA?.amount).toBe(1_000000n)
    expect(plan.approveB?.amount).toBe(1_176000n)
    expect(plan.add.functionName).toBe('addLiquidity')
    expect(plan.add.amountAMin).toBe(995000n)
    expect(plan.add.amountBMin).toBe(1_170120n)
    expect(plan.add.feeBipsA).toBe(0n)
    expect(plan.add.feeBipsB).toBe(0n)
  })

  it('omits an approval that is already covered', () => {
    const plan = buildAddPlan(intent, addQuote, 10n ** 30n, 0n, dex)
    expect(plan.approveA).toBeUndefined()
    expect(plan.approveB).toBeDefined()
  })
})

describe('applyAddQuote (M6-R2)', () => {
  it('goes to awaiting_approval with the plan when an allowance is short, ready when not', () => {
    const intent = { tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, recipient: RECIP, deadline: 2200 }
    let op = createAddLiquidity({ chainId: COSTON2, intent, now: 1000, id: 'op_add' })
    op = startQuoting(op, 1000).record
    const short = applyAddQuote(op, { result: { kind: 'quote', quote: addQuote }, allowanceA: 0n, allowanceB: 0n, now: 1000 }).record
    expect(short.state).toBe('awaiting_approval')
    expect(short.plan?.approveA).toBeDefined()
    let op2 = createAddLiquidity({ chainId: COSTON2, intent, now: 1000, id: 'op_add2' })
    op2 = startQuoting(op2, 1000).record
    const ready = applyAddQuote(op2, { result: { kind: 'quote', quote: addQuote }, allowanceA: 10n ** 30n, allowanceB: 10n ** 30n, now: 1000 }).record
    expect(ready.state).toBe('ready')
  })

  it('falls back to awaiting_input on a no_pool reading — no plan, no invented price', () => {
    const intent = { tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, recipient: RECIP, deadline: 2200 }
    let op = createAddLiquidity({ chainId: COSTON2, intent, now: 1000, id: 'op_add3' })
    op = startQuoting(op, 1000).record
    const out = applyAddQuote(op, { result: { kind: 'no_pool', message: 'no pool' }, allowanceA: 0n, allowanceB: 0n, now: 1000 }).record
    expect(out.state).toBe('awaiting_input')
    expect(out.plan).toBeUndefined()
  })
})

describe('buildRemovePlan (M6-R4)', () => {
  it('approves the LP token only when short and sets both minimums', () => {
    const removeQuote: RemoveLiquidityQuote = {
      tokenA: FXRP, tokenB: USDT0, liquidity: 250000n,
      amountA: amount(590000n, 6, 'FXRP'), amountB: amount(694000n, 6, 'USD₮0'),
      minA: amount(584100n, 6, 'FXRP'), minB: amount(687060n, 6, 'USD₮0'),
      slippageBips: 100, pair: '0xDD598473f738df117Ee331bc07172481db60acBE', observedAt: 1,
    }
    const intent = { tokenAKey: 'FXRP', tokenBKey: 'USDT0', liquidity: 250000n, slippageBips: 100, recipient: RECIP, deadline: 2200 }
    const plan = buildRemovePlan(intent, removeQuote, 0n, dex)
    expect(plan.approveLp?.amount).toBe(250000n)
    expect(plan.remove.functionName).toBe('removeLiquidity')
    expect(plan.remove.amountAMin).toBe(584100n)
    expect(plan.remove.liquidity).toBe(250000n)
  })
})

describe('applyRemoveQuote (M6-R2)', () => {
  const removeQuote: RemoveLiquidityQuote = {
    tokenA: FXRP, tokenB: USDT0, liquidity: 250000n,
    amountA: amount(590000n, 6, 'FXRP'), amountB: amount(694000n, 6, 'USD₮0'),
    minA: amount(584100n, 6, 'FXRP'), minB: amount(687060n, 6, 'USD₮0'),
    slippageBips: 100, pair: '0xDD598473f738df117Ee331bc07172481db60acBE', observedAt: 1,
  }
  const intent = { tokenAKey: 'FXRP', tokenBKey: 'USDT0', liquidity: 250000n, slippageBips: 100, recipient: RECIP, deadline: 2200 }

  it('goes to awaiting_approval with the LP approve when the allowance is short, ready when not', () => {
    let op = createRemoveLiquidity({ chainId: COSTON2, intent, now: 1000, id: 'op_rm' })
    op = startQuoting(op, 1000).record
    const short = applyRemoveQuote(op, { result: { kind: 'quote', quote: removeQuote }, lpAllowance: 0n, now: 1000 }).record
    expect(short.state).toBe('awaiting_approval')
    expect(short.plan?.approveLp).toBeDefined()

    let op2 = createRemoveLiquidity({ chainId: COSTON2, intent, now: 1000, id: 'op_rm2' })
    op2 = startQuoting(op2, 1000).record
    const ready = applyRemoveQuote(op2, { result: { kind: 'quote', quote: removeQuote }, lpAllowance: 10n ** 30n, now: 1000 }).record
    expect(ready.state).toBe('ready')
    expect(ready.plan?.approveLp).toBeUndefined()
  })

  it('falls back to awaiting_input on a no_pool reading — no plan, no invented amounts', () => {
    let op = createRemoveLiquidity({ chainId: COSTON2, intent, now: 1000, id: 'op_rm3' })
    op = startQuoting(op, 1000).record
    const out = applyRemoveQuote(op, { result: { kind: 'no_pool', message: 'no pool' }, lpAllowance: 0n, now: 1000 }).record
    expect(out.state).toBe('awaiting_input')
    expect(out.plan).toBeUndefined()
  })
})
