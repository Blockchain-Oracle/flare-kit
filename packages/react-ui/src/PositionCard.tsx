// packages/react-ui/src/PositionCard.tsx
import { type Amount, type DexToken, type Position, type RemoveLiquidityOperation, type RemoveLiquidityQuoteResult, formatExact } from '@flarekit-dev/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { OperationTimeline } from './OperationTimeline.js'
import { SwapLeg } from './SwapLeg.js'
import { PercentPills } from './primitives/PercentPills.js'
import { IN_FLIGHT } from './card-chrome.js'
import { ctaForRemove, noteForRemove, signedDelta } from './position-card-state.js'

/**
 * PositionCard (M6-R7). The live LP-balance position, its current
 * composition read straight from reserves, and partial removal by percent —
 * mirroring AddLiquidityCard's anatomy: SwapLeg for the held legs, the same
 * Panel/Note/DetailRow/OperationTimeline chrome, and the LP-approve→remove
 * steps on the spine.
 *
 * Honesty: V2 fees are embedded in the reserves, not a separate claimable
 * balance, so this card never renders one — `noteForRemove`'s default state
 * says so instead. A missing position is stated with its reason, never a
 * zero-filled guess. When `basis` is supplied (the kit recorded what was put
 * in at add time) the card also shows the per-asset change since supply — a
 * raw, price-free delta, never an invented valuation; when the basis is
 * unknown it shows current composition only.
 *
 * Signs via `onSubmit` only — it holds no wallet client and no key.
 */

export interface PositionCardProps {
  readonly position: Position | null
  /** The reason the position could not be read — an RPC-outage read, distinct from a real no-position. */
  readonly unavailable?: string
  readonly networkLabel?: string
  readonly tokenA?: DexToken
  readonly tokenB?: DexToken
  readonly removeOperation?: RemoveLiquidityOperation
  readonly removeQuoteResult?: RemoveLiquidityQuoteResult
  /** The amounts supplied when the kit opened this position (from the durable add operation). Present only when the kit created it — a position read from chain with no recorded add carries no basis, and this card renders no P&L for it. */
  readonly basis?: { readonly amountA: Amount; readonly amountB: Amount }
  readonly percent?: number
  readonly mockLabel?: string
  readonly onPercentChange?: (percent: number) => void
  readonly onSubmit?: () => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

export function PositionCard(props: PositionCardProps) {
  const { position, networkLabel, removeOperation: op, percent, mockLabel } = props

  if (!position) {
    if (props.unavailable) {
      return (
        <Panel title="Your liquidity" subtitle={networkLabel} className={`fk fk-liq ${props.className ?? ''}`} data-theme={props.theme}>
          <Note tone="att" title="Couldn't read your position">{`We could not read your position on chain: ${props.unavailable} This is not a zero — retry when the network settles.`}</Note>
        </Panel>
      )
    }
    const pair = props.tokenA && props.tokenB ? `${props.tokenA.symbol} / ${props.tokenB.symbol}` : 'this pool'
    return (
      <Panel title="Your liquidity" subtitle={networkLabel} className={`fk fk-liq ${props.className ?? ''}`} data-theme={props.theme}>
        <Note tone="info" title="No position">{`You hold no ${pair} liquidity yet. Add some to open a position.`}</Note>
      </Panel>
    )
  }

  const cta = ctaForRemove(op)
  const note = noteForRemove(op, props.removeQuoteResult)
  const showSpine = op ? IN_FLIGHT.has(op.state) : false
  const rq = props.removeQuoteResult?.kind === 'quote' ? props.removeQuoteResult.quote : undefined

  return (
    <Panel title="Your liquidity" subtitle={networkLabel} className={`fk fk-liq ${props.className ?? ''}`} data-theme={props.theme}>
      {mockLabel ? <Note tone="info" title="Mock">{`Driven by ${mockLabel}. No funds move.`}</Note> : null}
      <SwapLeg role="receive" label="You hold" value={formatExact(position.amountA, { asset: false })} editable={false} token={position.tokenA} />
      <SwapLeg role="receive" label="And" value={formatExact(position.amountB, { asset: false })} editable={false} token={position.tokenB} />
      <Details>
        <DetailRow label="Pool share" value={<span className="fk-mono">{(position.poolShareBips / 100).toFixed(2)}%</span>} />
      </Details>
      {props.basis ? (
        <Details>
          <DetailRow
            label="Change since supplied"
            value={<span className="fk-mono">{signedDelta(position.amountA, props.basis.amountA)} · {signedDelta(position.amountB, props.basis.amountB)}</span>}
            sub="Your share shifts with price and grows with fees — this is the change against what you supplied, not a priced valuation."
          />
        </Details>
      ) : null}
      <PercentPills value={percent ?? 0} onChange={props.onPercentChange} />
      {rq ? (
        <Details>
          <DetailRow label="You would receive" value={<span className="fk-mono">{formatExact(rq.amountA)} · {formatExact(rq.amountB)}</span>} sub={`At least ${formatExact(rq.minA)} · ${formatExact(rq.minB)} after slippage.`} />
        </Details>
      ) : null}
      {note ? <Note tone={note.tone} title={note.title}>{note.body}</Note> : null}
      {showSpine && op ? <OperationTimeline operation={op} /> : null}
      <div className="fk-panel-action">
        <Button variant="primary" block disabled={cta.disabled} onClick={props.onSubmit}>{cta.label}</Button>
      </div>
    </Panel>
  )
}
