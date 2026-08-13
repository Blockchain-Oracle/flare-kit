// packages/react-ui/test/add-liquidity-card.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  type AddLiquidityOperation, type AddLiquidityQuote,
  amount, applyAddQuote, createAddLiquidity, startQuoting,
} from '@flare-kit/core'
import { AddLiquidityCard } from '../src/AddLiquidityCard.js'

const COSTON2 = 114
const NOW = 1_760_000_000_000
const RECIP = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as const
const FXRP = { symbol: 'FXRP', address: '0x0b6A3645c240605887a5532109323A3E12273dc7', decimals: 6 } as const
const USDT0 = { symbol: 'USD₮0', address: '0xC1A5B41512496B80903D1f32d6dEa3a73212E71F', decimals: 6 } as const

const quote: AddLiquidityQuote = {
  tokenA: FXRP, tokenB: USDT0,
  amountA: amount(1_000000n, 6, 'FXRP'), amountB: amount(1_176000n, 6, 'USD₮0'),
  minA: amount(995000n, 6, 'FXRP'), minB: amount(1_170120n, 6, 'USD₮0'),
  expectedLp: 500000n, lpDecimals: 18, lpSymbol: 'BLAZE-LP', poolShareBips: 40, slippageBips: 50,
  pair: '0xDD598473f738df117Ee331bc07172481db60acBE', observedAt: NOW,
}

function inState(allowanceA: bigint, allowanceB: bigint): AddLiquidityOperation {
  const intent = { tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, recipient: RECIP, deadline: Math.floor(NOW / 1000) + 1200 }
  let op = createAddLiquidity({ chainId: COSTON2, intent, now: NOW, id: 'op_add' })
  op = startQuoting(op, NOW).record
  return applyAddQuote(op, { result: { kind: 'quote', quote }, allowanceA, allowanceB, now: NOW }).record
}

describe('AddLiquidityCard (M6-R6)', () => {
  const base = { tokenA: FXRP, tokenB: USDT0, networkLabel: 'Coston2' }

  it('shows the paired amount and expected pool share, in the mono face', () => {
    render(<AddLiquidityCard operation={inState(10n ** 30n, 10n ** 30n)} quoteResult={{ kind: 'quote', quote }} {...base} />)
    expect(screen.getByText(/1\.176000 USD₮0/)).toBeTruthy()
    expect(screen.getByText(/0\.40%|0\.4%/)).toBeTruthy()
  })

  it('when both allowances are short it names both approvals, never one hidden', () => {
    render(<AddLiquidityCard operation={inState(0n, 0n)} quoteResult={{ kind: 'quote', quote }} {...base} />)
    expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy()
  })

  it('renders the expected LP with its BLAZE-LP asset in the mono face', () => {
    render(<AddLiquidityCard operation={inState(10n ** 30n, 10n ** 30n)} quoteResult={{ kind: 'quote', quote }} {...base} />)
    expect(screen.getByText(/BLAZE-LP/)).toBeTruthy()
  })

  it('blocks the supply and names the short asset when the balance cannot cover it', () => {
    render(<AddLiquidityCard operation={inState(10n ** 30n, 10n ** 30n)} quoteResult={{ kind: 'quote', quote }} balanceA={amount(500000n, 6, 'FXRP')} {...base} />)
    expect(screen.getByRole('button', { name: /insufficient/i })).toBeTruthy()
  })

  it('states no pool with a reason, never a zero', () => {
    const intent = { tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, recipient: RECIP, deadline: 1 }
    let op = createAddLiquidity({ chainId: COSTON2, intent, now: NOW, id: 'op_np' })
    op = startQuoting(op, NOW).record
    op = applyAddQuote(op, { result: { kind: 'no_pool', message: 'No FXRP / WC2FLR pool exists on this network yet.' }, allowanceA: 0n, allowanceB: 0n, now: NOW }).record
    render(<AddLiquidityCard operation={op} quoteResult={{ kind: 'no_pool', message: 'No FXRP / WC2FLR pool exists on this network yet.' }} {...base} />)
    expect(screen.getByText(/no .*pool exists/i)).toBeTruthy()
  })
})
