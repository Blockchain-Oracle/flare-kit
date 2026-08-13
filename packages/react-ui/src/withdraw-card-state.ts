// packages/react-ui/src/withdraw-card-state.ts
import type { ExitRoute, VaultError, VaultPositionResult, WithdrawOperation, WithdrawPlanResult, WithdrawQuoteResult } from '@flarekit-dev/core'
import { type Cta, type CardNote, PRE_PLAN } from './card-chrome.js'

/**
 * How a vault withdraw operation's state becomes the WithdrawCard's chrome
 * (M7-R9). The load-bearing honesty rule lives here: a withdrawal REQUEST is
 * never rendered as assets received. `awaiting_external` (waiting on the vault's
 * period/epoch clock), `action_required` (claimable) and `succeeded` (claimed,
 * carrying the actual assets) are each a distinct phase. A failed balance read is
 * `unavailable`, never a confident `no_position` (the M6 F1 rule). The instant
 * route concludes in one step; the delayed route walks request → wait → claim.
 */

export interface WithdrawChrome {
  readonly assetSymbol: string
  readonly shareSymbol: string
}

/**
 * The durable-timeline phase — only the WAIT → CLAIM tail. In-flight tx states
 * (executing/submitted/confirming) render on the shared spine and the CTA, not
 * here, so they map to `null`; the request-vs-claim wording lives on the CTA,
 * derived from the active step. Only the wait, the claimable badge and the
 * concluded receipt are timeline phases.
 */
export type TimelinePhase =
  | { readonly kind: 'waiting' }
  | { readonly kind: 'claimable' }
  | { readonly kind: 'concluded'; readonly instant: boolean }
  | null

export function timelinePhase(op: WithdrawOperation | undefined, route: ExitRoute): TimelinePhase {
  if (!op) return null
  switch (op.state) {
    case 'awaiting_external':
      return { kind: 'waiting' }
    case 'action_required':
      return { kind: 'claimable' }
    case 'succeeded':
      return { kind: 'concluded', instant: route === 'instant' }
    default:
      return null
  }
}

function gateOf(plan?: WithdrawPlanResult): VaultError | undefined {
  return plan?.kind === 'error' ? plan.error : undefined
}

const reviewLabel = (route: ExitRoute) => (route === 'instant' ? 'Review instant redeem' : 'Review withdrawal')

export function ctaForWithdraw(
  op: WithdrawOperation | undefined,
  position: VaultPositionResult | undefined,
  quoteResult: WithdrawQuoteResult | undefined,
  planResult: WithdrawPlanResult | undefined,
  route: ExitRoute,
  chrome: WithdrawChrome,
): Cta {
  // Before a plan is committed, the position and the plan gates govern.
  if (!op || PRE_PLAN.has(op.state)) {
    if (position?.kind === 'unavailable') return { label: 'Balance unavailable', disabled: true }
    if (position?.kind === 'no_position') return { label: `No ${chrome.shareSymbol} to withdraw`, disabled: true }
    const gate = gateOf(planResult)
    if (gate) return gateCta(gate, chrome)
    if (quoteResult?.kind === 'quote') return { label: reviewLabel(route), disabled: false }
    return { label: 'Choose an amount', disabled: true }
  }
  const active = op.steps.find((s) => s.state === 'active')
  switch (op.state) {
    case 'ready': return { label: reviewLabel(route), disabled: false }
    case 'awaiting_approval': return { label: `Approve ${chrome.shareSymbol}`, disabled: false }
    case 'executing':
    case 'submitted':
    case 'confirming':
      if (active?.type === 'approve') return { label: 'Approving…', disabled: true }
      if (active?.type === 'claim') return { label: 'Claiming…', disabled: true }
      return { label: route === 'instant' ? 'Redeeming…' : 'Requesting…', disabled: true }
    case 'awaiting_external': return { label: 'Waiting to claim…', disabled: true }
    case 'action_required': return { label: 'Claim withdrawal', disabled: false }
    case 'succeeded': return { label: route === 'instant' ? 'Redeemed' : 'Withdrawn', disabled: true }
    case 'failed': return { label: 'Withdrawal did not complete', disabled: true }
    default: return { label: 'Choose an amount', disabled: true }
  }
}

function gateCta(gate: VaultError, chrome: WithdrawChrome): Cta {
  switch (gate.kind) {
    case 'paused': return { label: 'Withdrawals paused', disabled: true }
    case 'cap_exceeded': return { label: 'Over the withdrawal cap', disabled: true }
    case 'insufficient_balance': return { label: `Not enough ${chrome.shareSymbol}`, disabled: true }
    case 'not_verified': return { label: 'Withdraw not built here', disabled: true }
    case 'expired': return { label: 'Re-quote', disabled: false }
  }
}

export function noteForWithdraw(
  op: WithdrawOperation | undefined,
  quoteResult: WithdrawQuoteResult | undefined,
  planResult: WithdrawPlanResult | undefined,
  route: ExitRoute,
  chrome: WithdrawChrome,
): CardNote | null {
  const phase = timelinePhase(op, route)
  if (phase?.kind === 'concluded') {
    return phase.instant
      ? { tone: 'ok', title: 'Redeemed', body: `The exact ${chrome.assetSymbol} received is on the transaction below — an instant redemption net of its fee.` }
      : { tone: 'ok', title: 'Withdrawn', body: `The exact ${chrome.assetSymbol} claimed is on the transaction below.` }
  }
  if (op?.error) {
    const retryable = op.error.recovery === 'safe_to_retry'
    return { tone: retryable ? 'att' : 'bad', title: 'Withdrawal did not complete', body: op.error.message }
  }
  if (phase?.kind === 'waiting') {
    return { tone: 'att', title: 'A request is not a withdrawal', body: `Your ${chrome.shareSymbol} is queued. The ${chrome.assetSymbol} arrives only when you claim, after the wait below — nothing has moved yet.` }
  }
  if (phase?.kind === 'claimable') {
    return { tone: 'ok', title: 'Ready to claim', body: `The wait is over. Claim to receive your ${chrome.assetSymbol}.` }
  }
  const gate = gateOf(planResult)
  if (gate?.kind === 'paused') return { tone: 'att', title: 'Withdrawals paused', body: 'This vault has paused withdrawals. Deposits and reads are unaffected.' }
  if (gate?.kind === 'cap_exceeded') return { tone: 'att', title: 'Over the withdrawal cap', body: `This vault caps a single withdrawal. Lower the amount.` }
  if (gate?.kind === 'not_verified') return { tone: 'info', title: 'Withdraw not built for this network', body: gate.reason }
  if (op?.state === 'awaiting_approval') return { tone: 'info', title: `Approve ${chrome.shareSymbol} first`, body: `This vault pulls your ${chrome.shareSymbol}, so the approval is its own transaction, then the withdrawal.` }
  if (quoteResult?.kind === 'unavailable') return { tone: 'info', title: 'Quote unavailable', body: quoteResult.reason }
  if (route === 'instant') return { tone: 'info', title: 'Instant costs more', body: `Instant redemption pays out immediately at a higher fee. The delayed route is cheaper but waits for the vault's period.` }
  return { tone: 'info', title: 'Delayed withdrawal', body: `A request now, then a claim after the vault's period. Cheaper than instant; the assets arrive at claim, not at request.` }
}
