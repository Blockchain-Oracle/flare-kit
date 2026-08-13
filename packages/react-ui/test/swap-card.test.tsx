import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  type SwapOperation,
  type SwapQuote,
  type SwapQuoteResult,
  advanceSteps,
  amount,
  applyQuote,
  applyTransition,
  createSwap,
  startQuoting,
} from '@flare-kit/core'
import { SwapCard } from '../src/SwapCard.js'

/**
 * SwapCard (M5-R6): one currency context over the real router, the approve and
 * swap steps on the operation spine, and — the load-bearing honesty — an unknown
 * output rendered as `—` never `0`, a no-route stated with its reason, and a
 * slippage revert shown as a distinct, re-quotable state, never as a kit failure.
 *
 * Every state is reachable purely from props, so the gallery and these tests
 * drive them the same way the AC5 requirement demands.
 */

const NOW = 1_760_000_000_000
const NOW_S = Math.floor(NOW / 1000)
const RECIP = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as const
const FROM = { symbol: 'FXRP', address: '0x0b6A3645c240605887a5532109323A3E12273dc7', decimals: 6 } as const
const TO = { symbol: 'USD₮0', address: '0xC1A5B41512496B80903D1f32d6dEa3a73212E71F', decimals: 6 } as const
const base = { fromToken: FROM, toToken: TO } as const

function reading(outRaw: bigint): SwapQuoteResult {
  const quote: SwapQuote = {
    from: FROM,
    to: TO,
    amountIn: amount(100_000000n, 6, 'FXRP'),
    amountOut: amount(outRaw, 6, 'USD₮0'),
    minReceived: amount((outRaw * 9950n) / 10000n, 6, 'USD₮0'),
    slippageBips: 50,
    path: [FROM.address, TO.address],
    observedAt: NOW,
  }
  return { kind: 'quote', quote }
}

function inState(allowance: bigint, result: SwapQuoteResult): SwapOperation {
  const intent = {
    fromKey: 'FXRP',
    toKey: 'USDT0',
    amountIn: 100_000000n,
    slippageBips: 50,
    recipient: RECIP,
    deadline: NOW_S + 1200,
  }
  let op = createSwap({ chainId: 114, intent, now: NOW, id: 'op_swap' })
  op = startQuoting(op, NOW).record
  op = applyQuote(op, { result, allowance, now: NOW }).record
  return op
}

describe('SwapCard', () => {
  it('shows the quoted output and the exact minimum received, with an actionable CTA', () => {
    const result = reading(122_400000n) // 1.224 USD₮0 / FXRP, the live Coston2 quote
    render(<SwapCard operation={inState(200_000000n, result)} quoteResult={result} {...base} />)
    expect(screen.getByDisplayValue('122.400000')).toBeInTheDocument() // receive leg
    expect(screen.getByText('121.788000 USD₮0')).toBeInTheDocument() // minimum received, exact
    expect(screen.getByRole('button', { name: /review swap/i })).toBeEnabled()
  })

  it('renders an unknown output as an em dash, never a zero, and states the no-route reason', () => {
    const result: SwapQuoteResult = {
      kind: 'no_route',
      message: 'No FXRP / USD₮0 pool exists on this network yet.',
    }
    render(<SwapCard operation={inState(0n, result)} quoteResult={result} {...base} />)
    expect(screen.getByDisplayValue('—')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('0.000000')).not.toBeInTheDocument()
    expect(screen.getByText(/no .*pool exists/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /no route/i })).toBeDisabled()
  })

  it('names the approval as its own step when the allowance is short', () => {
    const result = reading(122_400000n)
    render(<SwapCard operation={inState(0n, result)} quoteResult={result} {...base} />)
    expect(screen.getByRole('button', { name: /approve fxrp/i })).toBeEnabled()
  })

  it('shows the Limit tab as declared-unbuilt: present, disabled, reasoned', () => {
    const result = reading(122_400000n)
    render(<SwapCard operation={inState(200_000000n, result)} quoteResult={result} {...base} />)
    expect(screen.getByRole('tab', { name: /limit/i })).toBeDisabled()
    expect(screen.getByText(/no native limit order/i)).toBeInTheDocument()
  })

  it('reports a submit intent from the primary action', () => {
    const onSubmit = vi.fn()
    const result = reading(122_400000n)
    render(
      <SwapCard operation={inState(200_000000n, result)} quoteResult={result} onSubmit={onSubmit} {...base} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /review swap/i }))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('gives its required states distinct shapes, not distinct colours alone', () => {
    // The state-shape signature: glyph modifiers, data-state, and disabled controls.
    const shapeOf = (op: SwapOperation, result: SwapQuoteResult): string => {
      const { container, unmount } = render(<SwapCard operation={op} quoteResult={result} {...base} />)
      const parts = [
        [...container.querySelectorAll('[class*="fk-g-"]')].map(
          (n) => (n.className.match(/fk-g-[a-z]+/) ?? [''])[0],
        ),
        [...container.querySelectorAll('[data-state]')].map((n) => n.getAttribute('data-state')),
        [...container.querySelectorAll('button')].map((n) => (n.disabled ? 'off' : 'on')),
      ]
      unmount()
      return parts.map((p) => p.join(',')).join(' | ')
    }
    const q = reading(122_400000n)
    const noRoute: SwapQuoteResult = { kind: 'no_route', message: 'No pool.' }
    const shapes = [
      shapeOf(inState(200_000000n, q), q), // quote / ready
      shapeOf(inState(0n, q), q), // needs approval
      shapeOf(inState(0n, noRoute), noRoute), // no route
    ]
    expect(new Set(shapes).size).toBe(shapes.length)
  })

  it('renders a succeeded swap as Swapped with its transaction evidence, CTA spent', () => {
    const result = reading(122_400000n)
    let op = inState(200_000000n, result) // ready, steps [swap]
    op = applyTransition(op, {
      to: 'executing',
      at: NOW,
      patch: { steps: advanceSteps(op.steps, { done: 0, current: 'active' }, NOW) },
    }).record
    op = applyTransition(op, {
      to: 'submitted',
      at: NOW,
      evidence: [
        {
          kind: 'flare_tx',
          label: 'Swap',
          value: '0x1111111111111111111111111111111111111111111111111111111111111111',
          observedAt: NOW,
        },
      ],
      patch: { steps: advanceSteps(op.steps, { done: 1, current: 'done' }, NOW) },
    }).record
    op = applyTransition(op, { to: 'succeeded', at: NOW }).record

    const { container } = render(<SwapCard operation={op} quoteResult={result} {...base} />)
    expect(container.querySelector('[data-state="succeeded"]')).not.toBeNull() // the state chip
    expect(container.querySelector('.fk-ev')).not.toBeNull() // the swap tx as evidence
    expect(screen.getByRole('button', { name: 'Swapped' })).toBeDisabled() // CTA spent
    // The kit does not observe the exact fill, so a concluded swap never shows
    // the pre-trade quote as the amount received.
    expect(screen.getByDisplayValue('—')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('122.400000')).not.toBeInTheDocument()
    expect(screen.queryByText('121.788000 USD₮0')).not.toBeInTheDocument()
  })
})
