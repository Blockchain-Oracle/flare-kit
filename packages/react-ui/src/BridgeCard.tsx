import {
  type Amount,
  type BridgePlanResult,
  type BridgeQuote,
  type BridgeRoute,
  type DexToken,
  type OperationRecord,
  formatExact,
} from '@flare-kit/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { StateChip, ToneChip } from './primitives/StateChip.js'
import { OperationTimeline } from './OperationTimeline.js'
import { SwapLeg } from './SwapLeg.js'
import { CONCLUDED, IN_FLIGHT, PRE_PLAN, percentOf } from './card-chrome.js'
import { asyncDeliveryNote, bridgeErrorNote, ctaFor, deliveryLegs } from './bridge-card-state.js'

/**
 * BridgeCard (M8-R8/R9). One "you send" leg (FXRP on the source chain) and one "you
 * receive" leg (the dust-adjusted amountReceivedLD on the destination); the real
 * quoteSend fee; the exact minimum under slippage; a plain-language statement that
 * delivery is asynchronous. The approve(s) and send render on the operation spine as
 * the real steps they are, followed by the DURABLE delivery timeline —
 * submitted (source tx + a LayerZeroScan link) → awaiting-delivery → delivered — whose
 * DELIVERED leg is entered only from a destination read. The redeem route extends the
 * timeline through the FAssets redemption + XRPL settlement to xrp-redeemed. Sign only
 * via `onSubmit`; the card never holds a key.
 */

export interface BridgeCardProps {
  readonly operation: OperationRecord
  readonly route: BridgeRoute
  readonly sendToken: DexToken
  readonly receiveToken: DexToken
  readonly quote?: BridgeQuote
  readonly planResult?: BridgePlanResult
  /** A live read failed — rendered as a distinct unavailable note, never a confident no-balance (M6 F1). */
  readonly unavailable?: string
  readonly amountInText?: string
  /** Override the receive leg's text (e.g. the native-XRP amount for a redeem). */
  readonly receiveValueText?: string
  readonly fromBalance?: Amount
  /** The source-chain explorer + LayerZeroScan links for the durable timeline. */
  readonly sourceExplorerUrl?: string
  readonly scanUrl?: string
  readonly mockLabel?: string
  readonly networkLabel?: string
  readonly onAmountInChange?: (text: string) => void
  readonly onSubmit?: () => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

export function BridgeCard(props: BridgeCardProps) {
  const { operation: op, route, sendToken, receiveToken, quote, planResult, theme } = props
  const concluded = CONCLUDED.has(op.state)
  const sendValue = props.amountInText ?? (quote ? formatExact(quote.amountIn, { asset: false }) : '')
  // The receive leg is the dust-adjusted delivered amount, never the input — and once
  // concluded the pre-send quote is no longer a live estimate, so it reads `—`.
  const receiveValue =
    props.receiveValueText ??
    (!concluded && quote?.amountReceivedLD ? formatExact(quote.amountReceivedLD, { asset: false }) : '—')

  const cta = ctaFor(op, planResult, route)
  const errorNote = planResult?.kind === 'error' ? bridgeErrorNote(planResult.error) : null
  const async = asyncDeliveryNote(route)
  const legs = deliveryLegs(op, route.kind)
  const chipLabel =
    op.state === 'succeeded' ? (route.kind === 'redeem' ? 'Redeemed' : 'Delivered') : undefined

  const aside = (
    <div className="fk-bridge-head">
      {props.networkLabel ? <span className="fk-bridge-net">{props.networkLabel}</span> : null}
      {props.mockLabel ? <ToneChip tone="att">{props.mockLabel}</ToneChip> : null}
      {PRE_PLAN.has(op.state) ? null : <StateChip state={op.state} {...(chipLabel ? { label: chipLabel } : {})} />}
    </div>
  )

  return (
    <Panel
      title={<span className="fk-sr">{route.kind === 'redeem' ? 'Redeem to native XRP' : 'Bridge'}</span>}
      aside={aside}
      data-op-state={op.state}
      data-route-kind={route.kind}
      className={`fk-bridge-card${props.className ? ` ${props.className}` : ''}`}
      {...(theme ? { theme } : {})}
    >
      <SwapLeg
        role="pay"
        label={`You send · ${route.from.key === 'coston2' ? 'Coston2' : 'Sepolia'}`}
        value={sendValue}
        editable
        token={sendToken}
        {...(props.fromBalance ? { balance: props.fromBalance } : {})}
        {...(props.onAmountInChange ? { onAmountInChange: props.onAmountInChange } : {})}
      />

      <SwapLeg
        role="receive"
        label={`You receive · ${route.to.key === 'coston2' ? 'Coston2' : 'Sepolia'}`}
        value={receiveValue}
        editable={false}
        token={receiveToken}
      />

      {props.unavailable ? (
        <Note tone="att" title="Couldn't read this route">
          {props.unavailable}
        </Note>
      ) : errorNote ? (
        <Note tone={errorNote.tone} title={errorNote.title}>
          {errorNote.body}
        </Note>
      ) : (
        <Note tone={async.tone} title={async.title}>
          {async.body}
        </Note>
      )}

      {quote && !concluded ? (
        <Details aria-label="Cross-chain details">
          <DetailRow label="Cross-chain fee" value={quote.nativeFee} />
          <DetailRow label="Minimum received" value={quote.minReceived} />
          <DetailRow label="Max slippage" value={percentOf(quote.slippageBips)} />
          <DetailRow label="Route" value={`${route.from.key} → ${route.to.key}`} />
        </Details>
      ) : null}

      {op.steps.length > 0 && IN_FLIGHT.has(op.state) ? (
        <OperationTimeline operation={op} className="fk-bridge-spine" {...(theme ? { theme } : {})} />
      ) : null}

      {IN_FLIGHT.has(op.state) ? (
        <div className="fk-bridge-timeline" aria-label="Delivery timeline">
          {legs.map((leg) => (
            <div key={leg.id} className="fk-bridge-leg" data-state={leg.state}>
              <span className="fk-bridge-leg-label">{leg.label}</span>
              {leg.id === 'submitted' && props.scanUrl ? (
                <a className="fk-bridge-leg-link fk-mono" href={props.scanUrl} target="_blank" rel="noreferrer">
                  LayerZeroScan
                </a>
              ) : null}
              {leg.id === 'submitted' && props.sourceExplorerUrl ? (
                <a className="fk-bridge-leg-link fk-mono" href={props.sourceExplorerUrl} target="_blank" rel="noreferrer">
                  Source tx
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="fk-panel-action">
        <Button variant="primary" block disabled={cta.disabled} onClick={props.onSubmit}>
          {cta.label}
        </Button>
      </div>
    </Panel>
  )
}
