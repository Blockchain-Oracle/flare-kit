// packages/react-ui/src/AddLiquidityCard.tsx
import { type AddLiquidityOperation, type AddLiquidityQuoteResult, type Amount, type DexToken, amount, formatExact } from '@flare-kit/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { OperationTimeline } from './OperationTimeline.js'
import { SwapLeg } from './SwapLeg.js'
import { CONCLUDED, IN_FLIGHT, PRE_PLAN, percentOf } from './card-chrome.js'
import { ctaForAdd, noteForAdd } from './add-liquidity-state.js'

/**
 * AddLiquidityCard (M6-R6). Two ratio-locked supply legs over the real V2
 * router, prop-driven so every state is reachable from props — mirroring
 * SwapCard's honesty rules: a position is never rendered as a deposit, a
 * missing pool is stated with its reason, and both approvals are named when
 * both allowances are short, never one hidden inside the other.
 *
 * Signs via `onSubmit` only — it holds no wallet client and no key.
 */

export interface AddLiquidityCardProps {
  readonly operation: AddLiquidityOperation
  readonly tokenA: DexToken
  readonly tokenB: DexToken
  readonly quoteResult?: AddLiquidityQuoteResult
  readonly amountAText?: string
  readonly balanceA?: Amount
  readonly balanceB?: Amount
  readonly mockLabel?: string
  readonly networkLabel?: string
  readonly onAmountAChange?: (text: string) => void
  readonly onSelectA?: () => void
  readonly onSelectB?: () => void
  readonly onMax?: () => void
  readonly onSubmit?: () => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

export function AddLiquidityCard(props: AddLiquidityCardProps) {
  const { operation: op, tokenA, tokenB, quoteResult, amountAText, balanceA, balanceB, mockLabel, networkLabel } = props
  const quote = op.quote
  const supplyShortA = balanceA && quote ? balanceA.value < quote.amountA.value : false
  const supplyShortB = balanceB && quote ? balanceB.value < quote.amountB.value : false
  const insufficient = supplyShortA ? { symbol: tokenA.symbol } : supplyShortB ? { symbol: tokenB.symbol } : undefined
  const chrome = { insufficient, tokenASymbol: tokenA.symbol, tokenBSymbol: tokenB.symbol }
  const cta = ctaForAdd(op, quoteResult, chrome)
  const note = noteForAdd(op, quoteResult, chrome)
  const showSpine = IN_FLIGHT.has(op.state)
  const concluded = CONCLUDED.has(op.state)
  const pairedText = quote && !concluded ? formatExact(quote.amountB, { asset: false }) : '—'

  return (
    <Panel title="Add liquidity" subtitle={networkLabel} className={`fk fk-liq ${props.className ?? ''}`} data-theme={props.theme}>
      {mockLabel ? <Note tone="info" title="Mock">{`Driven by ${mockLabel}. No funds move.`}</Note> : null}
      <SwapLeg role="pay" label="You supply" value={amountAText ?? (quote ? formatExact(quote.amountA, { asset: false }) : '')} editable={PRE_PLAN.has(op.state)} token={tokenA} balance={balanceA} onSelect={props.onSelectA} onAmountInChange={props.onAmountAChange} onMax={props.onMax} />
      <SwapLeg role="pay" label="And" value={pairedText} editable={false} token={tokenB} balance={balanceB} onSelect={props.onSelectB} />
      {quote && !concluded ? (
        <Details>
          <DetailRow label="Paired at pool ratio" value={<span className="fk-mono">{formatExact(quote.amountB)}</span>} />
          <DetailRow label="Expected pool share" value={<span className="fk-mono">{percentOf(quote.poolShareBips)}</span>} />
          <DetailRow label="Expected LP" value={<span className="fk-mono">{formatExact(amount(quote.expectedLp, quote.lpDecimals, quote.lpSymbol))}</span>} />
          <DetailRow label="Minimum supplied" value={<span className="fk-mono">{formatExact(quote.minA)} · {formatExact(quote.minB)}</span>} sub={`Protected at ${percentOf(quote.slippageBips)} — the ratio can drift before the tx confirms.`} />
        </Details>
      ) : null}
      {note ? <Note tone={note.tone} title={note.title}>{note.body}</Note> : null}
      {showSpine ? <OperationTimeline operation={op} /> : null}
      <div className="fk-panel-action">
        <Button variant="primary" block disabled={cta.disabled} onClick={props.onSubmit}>{cta.label}</Button>
      </div>
    </Panel>
  )
}
