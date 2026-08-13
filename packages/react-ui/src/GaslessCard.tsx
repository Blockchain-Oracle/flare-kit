import { type Amount, type DexToken, type GaslessPlanResult, type OperationRecord } from '@flare-kit/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { StateChip, ToneChip } from './primitives/StateChip.js'
import { LegTimeline } from './primitives/LegTimeline.js'
import { OperationTimeline } from './OperationTimeline.js'
import { SwapLeg } from './SwapLeg.js'
import { CONCLUDED, IN_FLIGHT, PRE_PLAN } from './card-chrome.js'
import { APPROVAL_NOTE, RELAYER_NOTE, USDT0_UNAVAILABLE, ctaForGasless, gaslessErrorNote, relayLegs } from './gasless-card-state.js'

/**
 * GaslessCard (M9-R10). The composer ("you send" FXRP, a recipient, the relayer identity
 * + reachability, and the "relayer covers gas · no fee" line, with USD₮0 shown
 * unavailable-on-testnet in the asset row); the loud one-time approval ("costs gas,
 * once") with the nonce/deadline + a replay note; and the relay→outcome timeline whose
 * CONFIRMED leg is entered ONLY from an on-chain transfer read — a relay acceptance is
 * `submitted`, never `succeeded`. Sign only via `onSubmit`; the card never holds a key.
 */

export interface GaslessCardProps {
  readonly operation: OperationRecord
  readonly sendToken: DexToken
  readonly planResult?: GaslessPlanResult
  /** A live read failed — a distinct unavailable note, never a confident no-balance. */
  readonly unavailable?: string
  readonly amountText?: string
  readonly recipientText?: string
  readonly fromBalance?: Amount
  readonly relayerUrl?: string
  readonly relayerReachable?: boolean
  /** The signed request's nonce/deadline, shown in the authorization review. */
  readonly nonce?: bigint
  readonly deadline?: bigint
  readonly mockLabel?: string
  readonly networkLabel?: string
  readonly onAmountChange?: (text: string) => void
  readonly onRecipientChange?: (text: string) => void
  readonly onSubmit?: () => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

export function GaslessCard(props: GaslessCardProps) {
  const { operation: op, sendToken, planResult, theme } = props
  const cta = ctaForGasless(op, planResult)
  const errorNote = planResult?.kind === 'error' ? gaslessErrorNote(planResult.error) : null
  const needsApproval = op.state === 'awaiting_approval'
  const legs = relayLegs(op)
  const hasPlan = planResult?.kind === 'plan'
  const chipLabel = op.state === 'succeeded' ? 'Paid' : undefined

  const aside = (
    <div className="fk-gasless-head">
      {props.networkLabel ? <span className="fk-gasless-net">{props.networkLabel}</span> : null}
      {props.mockLabel ? <ToneChip tone="att">{props.mockLabel}</ToneChip> : null}
      {PRE_PLAN.has(op.state) ? null : <StateChip state={op.state} {...(chipLabel ? { label: chipLabel } : {})} />}
    </div>
  )

  return (
    <Panel
      title={<span className="fk-sr">Gasless FXRP payment</span>}
      aside={aside}
      data-op-state={op.state}
      className={`fk-gasless-card${props.className ? ` ${props.className}` : ''}`}
      {...(theme ? { theme } : {})}
    >
      <SwapLeg
        role="pay"
        label="You send · FXRP"
        value={props.amountText ?? ''}
        editable={!CONCLUDED.has(op.state) && !IN_FLIGHT.has(op.state)}
        token={sendToken}
        {...(props.fromBalance ? { balance: props.fromBalance } : {})}
        {...(props.onAmountChange ? { onAmountInChange: props.onAmountChange } : {})}
      />

      {/* The declared gap lives in the asset row, not a separate catalogue (M9-R10/AC5). */}
      <div className="fk-gasless-assets" aria-label="Payment asset">
        <span className="fk-gasless-asset" data-selected="true">
          {sendToken.symbol}
        </span>
        <span className="fk-gasless-asset" data-selected="false" title={USDT0_UNAVAILABLE.reason}>
          {USDT0_UNAVAILABLE.symbol} · unavailable on testnet
        </span>
      </div>

      <label className="fk-gasless-recipient">
        <span className="fk-gasless-recipient-label">Recipient</span>
        <input
          className="fk-gasless-recipient-input fk-mono"
          value={props.recipientText ?? ''}
          disabled={CONCLUDED.has(op.state) || IN_FLIGHT.has(op.state)}
          placeholder="0x…"
          inputMode="text"
          aria-label="Recipient address"
          onChange={(event) => props.onRecipientChange?.(event.target.value)}
        />
      </label>

      {/* The relayer identity + reachability. */}
      {props.relayerUrl ? (
        <div className="fk-gasless-relayer" data-reachable={props.relayerReachable !== false}>
          <span className="fk-gasless-relayer-label">Relayer</span>
          <span className="fk-gasless-relayer-url fk-mono">{props.relayerUrl}</span>
          <span className="fk-gasless-relayer-dot" aria-hidden="true" />
          <span className="fk-gasless-relayer-state">{props.relayerReachable === false ? 'unreachable' : 'reachable'}</span>
        </div>
      ) : null}

      {props.unavailable ? (
        <Note tone="att" title="Couldn't read the forwarder">
          {props.unavailable}
        </Note>
      ) : errorNote ? (
        <Note tone={errorNote.tone} title={errorNote.title}>
          {errorNote.body}
        </Note>
      ) : (
        <Note tone={RELAYER_NOTE.tone} title={RELAYER_NOTE.title}>
          {RELAYER_NOTE.body}
        </Note>
      )}

      {/* The loud one-time approval — a distinct, gas-costing setup step (M9-R4/AC4). */}
      {needsApproval ? (
        <Note tone={APPROVAL_NOTE.tone} title={APPROVAL_NOTE.title}>
          {APPROVAL_NOTE.body}
        </Note>
      ) : null}

      {/* The authorization review: nonce/deadline + a replay note (shown once a plan exists). */}
      {hasPlan && (props.nonce !== undefined || props.deadline !== undefined) ? (
        <Details aria-label="Authorization">
          {props.nonce !== undefined ? <DetailRow label="Nonce" value={props.nonce.toString()} /> : null}
          {props.deadline !== undefined ? <DetailRow label="Deadline (unix)" value={props.deadline.toString()} /> : null}
          <DetailRow label="Replay" value="Each payment uses the next nonce; an old signature cannot be replayed." />
        </Details>
      ) : null}

      {op.steps.length > 0 && IN_FLIGHT.has(op.state) ? (
        <OperationTimeline operation={op} className="fk-gasless-spine" {...(theme ? { theme } : {})} />
      ) : null}

      {IN_FLIGHT.has(op.state) ? <LegTimeline legs={legs} ariaLabel="Relay timeline" /> : null}

      <div className="fk-panel-action">
        <Button variant="primary" block disabled={cta.disabled} onClick={props.onSubmit}>
          {cta.label}
        </Button>
      </div>
    </Panel>
  )
}
