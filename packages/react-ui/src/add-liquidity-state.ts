// packages/react-ui/src/add-liquidity-state.ts
import type { AddLiquidityOperation, AddLiquidityQuoteResult } from '@flarekit-dev/core'
import type { Cta, CardNote } from './card-chrome.js'

/** How an add-liquidity operation's state becomes the card's CTA and note. The
 * shared state-group sets, Cta/CardNote and percentOf live in ./card-chrome.js (M7-R11). */

export interface AddChrome {
  /** Set when the signer can't cover a supply leg; carries the short token's symbol. */
  readonly insufficient?: { readonly symbol: string }
  readonly tokenASymbol?: string
  readonly tokenBSymbol?: string
}

export function ctaForAdd(op: AddLiquidityOperation, result: AddLiquidityQuoteResult | undefined, chrome?: AddChrome): Cta {
  if (chrome?.insufficient && (op.state === 'ready' || op.state === 'awaiting_approval' || op.state === 'awaiting_input' || op.state === 'draft')) {
    return { label: `Insufficient ${chrome.insufficient.symbol}`, disabled: true }
  }
  const active = op.steps.find((s) => s.state === 'active')
  switch (op.state) {
    case 'ready': return { label: 'Review supply', disabled: false }
    case 'awaiting_approval': return { label: 'Approve tokens', disabled: false }
    case 'executing':
    case 'submitted':
    case 'confirming': return { label: active?.type === 'approve' ? 'Approving…' : 'Adding liquidity…', disabled: true }
    case 'succeeded': return { label: 'Liquidity added', disabled: true }
    case 'failed': return { label: 'Add did not complete', disabled: true }
    case 'expired': return { label: 'Re-quote', disabled: false }
    case 'quoting': return { label: 'Reading the pool…', disabled: true }
    default:
      if (result?.kind === 'no_pool') return { label: 'No pool', disabled: true }
      if (result?.kind === 'unavailable') return { label: 'Pool unavailable', disabled: true }
      return { label: 'Enter an amount', disabled: true }
  }
}

export function noteForAdd(op: AddLiquidityOperation, result: AddLiquidityQuoteResult | undefined, chrome?: AddChrome): CardNote | null {
  if (op.state === 'succeeded') {
    return { tone: 'ok', title: 'Liquidity added', body: 'Your LP position is recorded on the transaction below. Its composition will change with the pool price.' }
  }
  if (op.error) {
    const retryable = op.error.recovery === 'safe_to_retry'
    return { tone: retryable ? 'att' : 'bad', title: op.error.code === 'SLIPPAGE_EXCEEDED' ? 'The ratio moved' : 'Add did not complete', body: op.error.message }
  }
  if (chrome?.insufficient) {
    return { tone: 'att', title: `Not enough ${chrome.insufficient.symbol}`, body: `Your balance can't cover this supply. Lower the amount or top up ${chrome.insufficient.symbol}.` }
  }
  if (op.state === 'awaiting_approval') {
    const short: string[] = []
    if (op.plan?.approveA && chrome?.tokenASymbol) short.push(chrome.tokenASymbol)
    if (op.plan?.approveB && chrome?.tokenBSymbol) short.push(chrome.tokenBSymbol)
    const list = short.length === 2 ? `${short[0]} and ${short[1]}` : (short[0] ?? 'both tokens')
    return { tone: 'info', title: 'Approve, then supply', body: `You'll approve ${list} — each is its own transaction — then supply both assets at the pool ratio. Supplying liquidity is a position, not a deposit.` }
  }
  if (!op.quote && result?.kind === 'no_pool') return { tone: 'att', title: 'No pool', body: result.message }
  if (!op.quote && result?.kind === 'unavailable') return { tone: 'info', title: 'Pool unavailable', body: result.reason }
  if (op.state === 'ready') return { tone: 'info', title: 'A position, not a deposit', body: 'The two amounts are paired at the live pool ratio; their split changes as the price moves.' }
  return null
}

