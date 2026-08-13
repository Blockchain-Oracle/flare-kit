import { type Amount, type SwapOperation, type SwapQuote, type SwapQuoteResult, amount } from '@flarekit-dev/core'
import type { Cta, CardNote } from './card-chrome.js'

/**
 * How a swap operation's state becomes the card's chrome — the CTA, the note and
 * the rate. Split from `SwapCard.tsx` at the seam `state-visuals.ts` sits on for
 * the operation lifecycle: the pure mapping lives apart from the JSX that renders
 * it, and every honesty rule the card turns on is readable on one screen.
 */

export const ORDER_TABS = [
  { id: 'swap', label: 'Swap' },
  {
    id: 'limit',
    label: 'Limit',
    disabled: true,
    // Declared-unbuilt, not faked: shown so the roadmap is honest, inert so the
    // absence is too (M5-R6, "a tab that cannot act" reasoned rather than removed).
    reason: 'No limit-order venue is wired; Uniswap V2 has no native limit order.',
  },
]

// The state-group sets (PRE_PLAN/IN_FLIGHT/CONCLUDED), the Cta/CardNote shapes and
// percentOf now live once in ./card-chrome.js (M7-R11). This file keeps only the
// swap-specific chrome: the order tabs, ctaFor/noteFor and the execution rate.

export function ctaFor(op: SwapOperation, result: SwapQuoteResult | undefined, fromSymbol: string): Cta {
  const active = op.steps.find((step) => step.state === 'active')
  switch (op.state) {
    case 'ready':
      return { label: 'Review swap', disabled: false }
    case 'awaiting_approval':
      return { label: `Approve ${fromSymbol}`, disabled: false }
    case 'executing':
    case 'submitted':
    case 'confirming':
      return { label: active?.type === 'approve' ? 'Approving…' : 'Swapping…', disabled: true }
    case 'succeeded':
      return { label: 'Swapped', disabled: true }
    case 'failed':
      return { label: 'Swap failed', disabled: true }
    case 'expired':
      return { label: 'Re-quote', disabled: false }
    case 'quoting':
      return { label: 'Fetching quote…', disabled: true }
    default:
      if (result?.kind === 'no_route') return { label: 'No route', disabled: true }
      if (result?.kind === 'unavailable') return { label: 'Quote unavailable', disabled: true }
      return { label: 'Enter an amount', disabled: true }
  }
}

export function noteFor(
  op: SwapOperation,
  result: SwapQuoteResult | undefined,
  fromSymbol: string,
): CardNote | null {
  if (op.state === 'succeeded') {
    return {
      tone: 'ok',
      title: 'Swap settled',
      body: 'The exact amount received is recorded on the swap transaction below.',
    }
  }
  if (op.error) {
    // A slippage revert is atomic and re-quotable (safe_to_retry); a hard failure
    // is not. The tone comes from the error's own recovery class, never guessed.
    const retryable = op.error.recovery === 'safe_to_retry'
    return {
      tone: retryable ? 'att' : 'bad',
      title: op.error.code === 'SLIPPAGE_EXCEEDED' ? 'Slippage exceeded' : 'Swap did not complete',
      body: op.error.message,
    }
  }
  if (op.state === 'awaiting_approval') {
    return {
      tone: 'info',
      title: `Approve ${fromSymbol} first`,
      body: 'One approval, then the swap — two transactions, never one hidden inside the other.',
    }
  }
  if (!op.quote && result?.kind === 'no_route') {
    return { tone: 'att', title: 'No route', body: result.message }
  }
  if (!op.quote && result?.kind === 'unavailable') {
    return { tone: 'info', title: 'Quote unavailable', body: result.reason }
  }
  return null
}

/**
 * The execution rate as an amount of the `to` token per 1 `from` token, computed
 * entirely from the quote so its decimal scale and its divisor come from one
 * internally-consistent source — never a prop that could have moved on.
 */
export function rateOf(quote: SwapQuote): Amount | null {
  if (quote.amountIn.value <= 0n) return null
  const scaled = (quote.amountOut.value * 10n ** BigInt(quote.from.decimals)) / quote.amountIn.value
  return amount(scaled, quote.to.decimals, quote.to.symbol)
}
