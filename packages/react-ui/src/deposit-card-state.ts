// packages/react-ui/src/deposit-card-state.ts
import { type DepositOperation, type DepositPlanResult, type DepositQuoteResult, type VaultError, amount, formatExact } from '@flarekit-dev/core'
import type { Cta, CardNote } from './card-chrome.js'

/**
 * How a vault deposit operation's state becomes the DepositCard's CTA and note
 * (M7-R8). The gate reasons (paused / cap / insufficient / expired) come from the
 * plan result, never guessed; an unknown quote is `unavailable`, never a zero;
 * and the "shares are a claim, not a deposit balance" honesty note is stated
 * before the first signature.
 */

export interface DepositChrome {
  readonly assetSymbol: string
  readonly assetDecimals: number
  readonly shareSymbol: string
}

function gateOf(plan?: DepositPlanResult): VaultError | undefined {
  return plan?.kind === 'error' ? plan.error : undefined
}

export function ctaForDeposit(
  op: DepositOperation,
  quoteResult: DepositQuoteResult | undefined,
  planResult: DepositPlanResult | undefined,
  chrome: DepositChrome,
): Cta {
  const gate = gateOf(planResult)
  if (gate && (op.state === 'ready' || op.state === 'awaiting_approval' || op.state === 'awaiting_input' || op.state === 'draft' || op.state === 'quoting')) {
    switch (gate.kind) {
      case 'cap_exceeded': return { label: 'Over the deposit cap', disabled: true }
      case 'insufficient_balance': return { label: `Insufficient ${chrome.assetSymbol}`, disabled: true }
      case 'paused': return { label: 'Deposits paused', disabled: true }
      case 'expired': return { label: 'Re-quote', disabled: false }
      case 'not_verified': return { label: 'Unavailable', disabled: true }
    }
  }
  const active = op.steps.find((s) => s.state === 'active')
  switch (op.state) {
    case 'ready': return { label: 'Review deposit', disabled: false }
    case 'awaiting_approval': return { label: `Approve ${chrome.assetSymbol}`, disabled: false }
    case 'executing':
    case 'submitted':
    case 'confirming': return { label: active?.type === 'approve' ? 'Approving…' : 'Depositing…', disabled: true }
    case 'succeeded': return { label: 'Deposited', disabled: true }
    case 'failed': return { label: 'Deposit did not complete', disabled: true }
    case 'expired': return { label: 'Re-quote', disabled: false }
    case 'quoting': return { label: 'Reading the vault…', disabled: true }
    default:
      if (quoteResult?.kind === 'unavailable') return { label: 'Quote unavailable', disabled: true }
      return { label: 'Enter an amount', disabled: true }
  }
}

export function noteForDeposit(
  op: DepositOperation,
  quoteResult: DepositQuoteResult | undefined,
  planResult: DepositPlanResult | undefined,
  chrome: DepositChrome,
): CardNote | null {
  if (op.state === 'succeeded') {
    return {
      tone: 'ok',
      title: 'Deposited',
      body: `The exact ${chrome.shareSymbol} minted is on the transaction below. Your shares are a claim on the vault — their ${chrome.assetSymbol} value moves as the vault earns or loses.`,
    }
  }
  if (op.error) {
    const retryable = op.error.recovery === 'safe_to_retry'
    return { tone: retryable ? 'att' : 'bad', title: 'Deposit did not complete', body: op.error.message }
  }
  const gate = gateOf(planResult)
  if (gate?.kind === 'cap_exceeded') {
    return {
      tone: 'att',
      title: 'Over the deposit cap',
      body: `This vault has room for at most ${formatExact(amount(gate.max, chrome.assetDecimals, chrome.assetSymbol))} more right now — a global vault limit, not standard maxDeposit. Lower the amount.`,
    }
  }
  if (gate?.kind === 'insufficient_balance') {
    return { tone: 'att', title: `Not enough ${chrome.assetSymbol}`, body: `Your balance can't cover this deposit. Lower the amount or top up ${chrome.assetSymbol}.` }
  }
  if (gate?.kind === 'paused') {
    return { tone: 'att', title: 'Deposits paused', body: 'This vault has paused deposits. Withdrawals and reads are unaffected.' }
  }
  if (op.state === 'awaiting_approval') {
    return { tone: 'info', title: `Approve ${chrome.assetSymbol} first`, body: `One approval, then the deposit — two transactions, never one hidden inside the other. You'll receive ${chrome.shareSymbol}, a claim on the vault.` }
  }
  if (quoteResult?.kind === 'unavailable') {
    return { tone: 'info', title: 'Quote unavailable', body: quoteResult.reason }
  }
  if (op.state === 'ready') {
    return { tone: 'info', title: 'Shares are a claim, not a deposit balance', body: `You receive ${chrome.shareSymbol} — a claim on the vault whose ${chrome.assetSymbol} value moves as the vault earns or loses. It is not a fixed balance.` }
  }
  return null
}
