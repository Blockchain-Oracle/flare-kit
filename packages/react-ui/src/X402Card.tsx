import { type OperationRecord, type X402Challenge } from '@flarekit-dev/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { StateChip, ToneChip } from './primitives/StateChip.js'
import { LegTimeline } from './primitives/LegTimeline.js'
import { OperationTimeline } from './OperationTimeline.js'
import { IN_FLIGHT, PRE_PLAN } from './card-chrome.js'
import {
  DEMO_NOTE,
  SPLIT_NOTE,
  ctaForX402,
  duplicateNote,
  expiredNote,
  outcomeLegs,
  partialNote,
  rejectedNote,
} from './x402-card-state.js'

/**
 * X402Card (M9-R11). The challenge review — the resource, the amount in MockUSDT0 with
 * the demo-token label, the payee, the facilitator, the network and the expiry (an
 * expired challenge renders `expired`, not valid) — and the outcome, where the
 * SETTLEMENT (the real tx hash + payment id) and the RESOURCE delivery are independently
 * visible. A settled-but-resource-failed state reads `partially_succeeded`, never
 * `succeeded`; a duplicate/idempotent replay is shown as such, not a second charge. Sign
 * only via `onSubmit`; the card never holds a key.
 */

export interface X402CardProps {
  readonly operation: OperationRecord
  readonly challenge?: X402Challenge
  /** A live read failed — a distinct unavailable note (facilitator/server unreachable). */
  readonly unavailable?: string
  /** The amount, pre-formatted with its asset (e.g. "0.1 mUSDT0"). */
  readonly amountText?: string
  readonly settlementTx?: string
  readonly settlementExplorerUrl?: string
  readonly paymentId?: string
  readonly resourceStatus?: number
  readonly expired?: boolean
  readonly duplicate?: boolean
  readonly mockLabel?: string
  readonly networkLabel?: string
  readonly onSubmit?: () => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

export function X402Card(props: X402CardProps) {
  const { operation: op, challenge, theme } = props
  const cta = ctaForX402(op, { ...(props.expired ? { expired: props.expired } : {}) })
  const legs = outcomeLegs(op)
  const settled = op.state === 'succeeded' || op.state === 'partially_succeeded'
  const chipLabel =
    op.state === 'succeeded' ? 'Delivered' : op.state === 'partially_succeeded' ? 'Resource failed' : undefined

  const aside = (
    <div className="fk-x402-head">
      {props.networkLabel ? <span className="fk-x402-net">{props.networkLabel}</span> : null}
      {props.mockLabel ? <ToneChip tone="att">{props.mockLabel}</ToneChip> : null}
      {challenge?.demoToken ? <ToneChip tone="neutral">demo token</ToneChip> : null}
      {PRE_PLAN.has(op.state) ? null : <StateChip state={op.state} {...(chipLabel ? { label: chipLabel } : {})} />}
    </div>
  )

  return (
    <Panel
      title={<span className="fk-sr">x402 payment</span>}
      aside={aside}
      data-op-state={op.state}
      className={`fk-x402-card${props.className ? ` ${props.className}` : ''}`}
      {...(theme ? { theme } : {})}
    >
      {/* PAY-01: the challenge review. */}
      {challenge ? (
        <Details aria-label="Payment challenge">
          <DetailRow label="Resource" value={challenge.resource} />
          {/* The amount carries the demo-token label; never dressed as USD₮0 or FXRP. */}
          <DetailRow label="Amount" value={<span className="fk-mono">{props.amountText ?? '—'}{challenge.demoToken ? ' · demo' : ''}</span>} />
          <DetailRow label="Pay to" value={<span className="fk-mono">{challenge.payTo}</span>} />
          <DetailRow label="Facilitator" value={<span className="fk-mono">{challenge.facilitator}</span>} />
          <DetailRow label="Network" value={challenge.network} />
          <DetailRow label="Expires (unix ms)" value={<span className="fk-mono" data-expired={props.expired ? 'true' : 'false'}>{challenge.expiresAt}{props.expired ? ' · expired' : ''}</span>} />
        </Details>
      ) : null}

      {props.unavailable ? (
        <Note tone="att" title="Couldn't reach the facilitator">
          {props.unavailable}
        </Note>
      ) : props.expired ? (
        <Note tone={expiredNote().tone} title={expiredNote().title}>
          {expiredNote().body}
        </Note>
      ) : op.state === 'failed' ? (
        <Note tone={rejectedNote().tone} title={rejectedNote().title}>
          {rejectedNote().body}
        </Note>
      ) : op.state === 'partially_succeeded' ? (
        <Note tone={partialNote().tone} title={partialNote().title}>
          {partialNote().body}
        </Note>
      ) : props.duplicate ? (
        <Note tone={duplicateNote().tone} title={duplicateNote().title}>
          {duplicateNote().body}
        </Note>
      ) : challenge?.demoToken ? (
        <Note tone={DEMO_NOTE.tone} title={DEMO_NOTE.title}>
          {DEMO_NOTE.body}
        </Note>
      ) : null}

      {/* Settlement ≠ resource: the two independent facts, shown separately. */}
      {!props.unavailable && (settled || IN_FLIGHT.has(op.state)) ? (
        <Note tone={SPLIT_NOTE.tone} title={SPLIT_NOTE.title}>
          {SPLIT_NOTE.body}
        </Note>
      ) : null}

      {/* PAY-02: the outcome — the real settlement identifiers, shown as such. */}
      {settled && (props.settlementTx || props.paymentId) ? (
        <Details aria-label="Settlement">
          {props.settlementTx ? (
            <DetailRow
              label="Settlement tx"
              value={
                props.settlementExplorerUrl ? (
                  <a className="fk-mono fk-x402-txlink" href={props.settlementExplorerUrl} target="_blank" rel="noreferrer">
                    {props.settlementTx}
                  </a>
                ) : (
                  <span className="fk-mono">{props.settlementTx}</span>
                )
              }
            />
          ) : null}
          {props.paymentId ? <DetailRow label="Payment id" value={<span className="fk-mono">{props.paymentId}</span>} /> : null}
        </Details>
      ) : null}

      {op.steps.length > 0 && IN_FLIGHT.has(op.state) ? (
        <OperationTimeline operation={op} className="fk-x402-spine" {...(theme ? { theme } : {})} />
      ) : null}

      {IN_FLIGHT.has(op.state) ? <LegTimeline legs={legs} ariaLabel="Outcome timeline" /> : null}

      <div className="fk-panel-action">
        <Button variant="primary" block disabled={cta.disabled} onClick={props.onSubmit}>
          {cta.label}
        </Button>
      </div>
    </Panel>
  )
}
