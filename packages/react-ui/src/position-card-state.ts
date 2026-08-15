// packages/react-ui/src/position-card-state.ts
import { type Amount, type RemoveLiquidityOperation, type RemoveLiquidityQuoteResult, amount, formatExact } from '@flarekit-dev/core'
import type { Cta, CardNote } from './card-chrome.js'

// IN_FLIGHT, Cta and CardNote now live once in ./card-chrome.js (M7-R11).

export function ctaForRemove(op: RemoveLiquidityOperation | undefined): Cta {
  if (!op) return { label: 'Select an amount to withdraw', disabled: true }
  const active = op.steps.find((s) => s.state === 'active')
  switch (op.state) {
    case 'ready': return { label: 'Review withdrawal', disabled: false }
    case 'awaiting_approval': return { label: 'Approve LP token', disabled: false }
    case 'executing':
    case 'submitted':
    case 'confirming': return { label: active?.type === 'approve' ? 'Approving…' : 'Withdrawing…', disabled: true }
    case 'succeeded': return { label: 'Withdrawn', disabled: true }
    case 'failed': return { label: 'Withdrawal did not complete', disabled: true }
    default: return { label: 'Choose how much to withdraw', disabled: true }
  }
}

export function noteForRemove(op: RemoveLiquidityOperation | undefined, removeResult?: RemoveLiquidityQuoteResult): CardNote | null {
  if (op?.state === 'succeeded') return { tone: 'ok', title: 'Withdrawn', body: 'The exact amounts returned are on the transaction below.' }
  if (op?.error) {
    const retryable = op.error.recovery === 'safe_to_retry'
    return { tone: retryable ? 'att' : 'bad', title: op.error.code === 'SLIPPAGE_EXCEEDED' ? 'The ratio moved' : 'Withdrawal did not complete', body: op.error.message }
  }
  if (op?.state === 'awaiting_approval') return { tone: 'info', title: 'Approve the LP token first', body: 'Removing liquidity spends your LP token; the approval is its own transaction, then the withdrawal.' }
  if (removeResult?.kind === 'no_pool') return { tone: 'att', title: 'No pool', body: removeResult.message }
  if (removeResult?.kind === 'unavailable') return { tone: 'info', title: 'Could not read the pool', body: removeResult.reason }
  return { tone: 'info', title: 'Fees are already in your balance', body: 'A V2 position earns by growing its share of the pool — there is no separate fee to claim.' }
}

/** The signed per-asset change of a position leg against its supplied basis (price-free — a raw delta, not a fabricated value). */
export function signedDelta(now: Amount, basis: Amount): string {
  const d = now.value - basis.value
  const mag = d < 0n ? -d : d
  const sign = d < 0n ? '−' : '+' // U+2212 minus for the mono face
  return `${sign}${formatExact(amount(mag, now.decimals, now.asset))}`
}
