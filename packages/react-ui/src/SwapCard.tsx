import {
  type Amount,
  type DexToken,
  type SwapOperation,
  type SwapQuoteResult,
  amount,
  formatExact,
} from '@flarekit-dev/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { EvidenceChip } from './primitives/EvidenceChip.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { SegmentedTabs } from './primitives/SegmentedTabs.js'
import { StateChip, ToneChip } from './primitives/StateChip.js'
import { OperationTimeline } from './OperationTimeline.js'
import { SwapLeg } from './SwapLeg.js'
import { CONCLUDED, IN_FLIGHT, PRE_PLAN, percentOf } from './card-chrome.js'
import { ORDER_TABS, ctaFor, noteFor, rateOf } from './swap-card-state.js'

/**
 * SwapCard (M5-R6). One currency context over the real V2 router, prop-driven so
 * every state is reachable from props. It refuses to invent a number: an unknown
 * output is `—`, a no-route is stated with its reason, a slippage revert — atomic,
 * nothing moved — is a distinct re-quotable state, and once the trade concludes
 * the pre-trade quote is never shown as the amount received.
 *
 * The approve and swap steps render on the shared operation spine as the two real
 * steps they are (M5-R8); the transaction hashes are their own evidence, labelled
 * so the approval is never folded into the swap.
 */

export interface SwapCardProps {
  readonly operation: SwapOperation
  readonly fromToken: DexToken
  readonly toToken: DexToken
  /** The latest quote reading; drives the receive amount and the detail rows. */
  readonly quoteResult?: SwapQuoteResult
  /** Price impact in bips from a reference quote; `—` when not computed. */
  readonly priceImpactBips?: number | null
  /** The pay leg's shown text; defaults to the intent's amount. */
  readonly amountInText?: string
  readonly fromBalance?: Amount
  readonly toBalance?: Amount
  /** A labelled mock kit's name, shown as an explicit mock badge. */
  readonly mockLabel?: string
  readonly networkLabel?: string
  readonly onAmountInChange?: (text: string) => void
  readonly onFlip?: () => void
  readonly onSelectFrom?: () => void
  readonly onSelectTo?: () => void
  readonly onMax?: () => void
  readonly onSubmit?: () => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

export function SwapCard({
  operation,
  fromToken,
  toToken,
  quoteResult,
  priceImpactBips,
  amountInText,
  fromBalance,
  toBalance,
  mockLabel,
  networkLabel,
  onAmountInChange,
  onFlip,
  onSelectFrom,
  onSelectTo,
  onMax,
  onSubmit,
  theme,
  className,
}: SwapCardProps) {
  const quote = operation.quote ?? (quoteResult?.kind === 'quote' ? quoteResult.quote : undefined)
  const concluded = CONCLUDED.has(operation.state)
  const payValue =
    amountInText ??
    (operation.intent.amountIn > 0n
      ? formatExact(amount(operation.intent.amountIn, fromToken.decimals, fromToken.symbol), {
          asset: false,
        })
      : '')
  // Once the trade concludes the quoted output is no longer the amount received,
  // and the kit does not observe the exact fill — so it shows `—`, never the
  // estimate dressed up as a receipt.
  const receiveValue = !concluded && quote ? formatExact(quote.amountOut, { asset: false }) : '—'

  const cta = ctaFor(operation, quoteResult, fromToken.symbol)
  const note = noteFor(operation, quoteResult, fromToken.symbol)
  const rate = quote ? rateOf(quote) : null
  const impact =
    priceImpactBips === null || priceImpactBips === undefined ? '—' : percentOf(priceImpactBips)

  const chipLabel =
    operation.state === 'succeeded'
      ? 'Swapped'
      : operation.state === 'expired' && operation.error?.code === 'SLIPPAGE_EXCEEDED'
        ? 'Slippage exceeded'
        : undefined

  const aside = (
    <div className="fk-swap-head">
      {networkLabel ? <span className="fk-swap-net">{networkLabel}</span> : null}
      {mockLabel ? <ToneChip tone="att">{mockLabel}</ToneChip> : null}
      {PRE_PLAN.has(operation.state) ? null : (
        <StateChip state={operation.state} {...(chipLabel ? { label: chipLabel } : {})} />
      )}
    </div>
  )

  return (
    <Panel
      title={<span className="fk-sr">Swap</span>}
      aside={aside}
      data-op-state={operation.state}
      className={`fk-swap${className ? ` ${className}` : ''}`}
      {...(theme ? { theme } : {})}
    >
      <div className="fk-swap-tabs">
        <SegmentedTabs tabs={ORDER_TABS} value="swap" label="Order type" />
      </div>

      <SwapLeg
        role="pay"
        label="You pay"
        value={payValue}
        editable
        token={fromToken}
        {...(fromBalance ? { balance: fromBalance } : {})}
        {...(onSelectFrom ? { onSelect: onSelectFrom } : {})}
        {...(onAmountInChange ? { onAmountInChange } : {})}
        {...(onMax ? { onMax } : {})}
      />

      <div className="fk-swap-flip">
        <button
          type="button"
          className="fk-swap-flip-btn"
          aria-label="Switch pay and receive"
          onClick={onFlip}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l3 3M17 20l-3-3" />
          </svg>
        </button>
      </div>

      <SwapLeg
        role="receive"
        label="You receive"
        value={receiveValue}
        editable={false}
        token={toToken}
        {...(toBalance ? { balance: toBalance } : {})}
        {...(onSelectTo ? { onSelect: onSelectTo } : {})}
      />

      {note ? (
        <Note tone={note.tone} title={note.title}>
          {note.body}
        </Note>
      ) : null}

      {quote && !concluded ? (
        <Details aria-label="Quote details">
          {rate ? (
            <DetailRow label="Rate" value={`1 ${quote.from.symbol} = ${formatExact(rate)}`} />
          ) : null}
          <DetailRow label="Minimum received" value={quote.minReceived} />
          <DetailRow label="Price impact" value={impact} />
          <DetailRow label="Max slippage" value={percentOf(quote.slippageBips)} />
          <DetailRow label="Route" value={`${quote.from.symbol} → ${quote.to.symbol}`} />
        </Details>
      ) : null}

      {IN_FLIGHT.has(operation.state) && operation.steps.length > 0 ? (
        <OperationTimeline
          operation={operation}
          stepEvidence={{}}
          className="fk-swap-spine"
          {...(theme ? { theme } : {})}
        />
      ) : null}

      {operation.evidence.length > 0 ? (
        <div className="fk-swap-evidence">
          {operation.evidence.map((item) => (
            <EvidenceChip key={`${item.kind}:${item.value}`} item={item} />
          ))}
        </div>
      ) : null}

      <div className="fk-panel-action">
        <Button variant="primary" block disabled={cta.disabled} onClick={onSubmit}>
          {cta.label}
        </Button>
      </div>
    </Panel>
  )
}
