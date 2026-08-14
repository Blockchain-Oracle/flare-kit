import { type Amount, type DexToken, amount, formatExact, truncateAddress } from '@flarekit-dev/core'
import type { DelegationPlanResult, DelegationPositionView } from '@flarekit-dev/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { StateChip, ToneChip } from './primitives/StateChip.js'
import { SegmentedTabs } from './primitives/SegmentedTabs.js'
import { SwapLeg } from './SwapLeg.js'
import { OperationTimeline } from './OperationTimeline.js'
import { CONCLUDED, IN_FLIGHT, PRE_PLAN, percentOf } from './card-chrome.js'
import {
  type DelegationOperation,
  DELEGATION_STEP_EVIDENCE,
  ctaForDelegation,
  delegationCardState,
  delegationErrorNote,
  modeLabel,
} from './delegation-card-state.js'

/**
 * DelegationCard (M10-R9). The delegation composer built on the published core + hook:
 * the wrap/unwrap leg between the native token and WNat (unwrap is always the FULL wrapped
 * balance — the reconciler cannot confirm a partial unwrap without a baseline, so no
 * partial affordance ships); one or two provider rows with per-provider bips or an explicit
 * amount and the current on-chain mode indicator; the observed position (DEL-02); and the
 * wrap→delegate lifecycle on the shared `OperationTimeline` spine (DEL-03).
 *
 * Honesty (M10): an `unavailable` read renders `—`, never a confident zero-delegation and
 * never `no-balance`; a mode conflict states the style is fixed for the account (the chain
 * never resets delegation mode, even after undelegating), never a silent no-op; and a
 * delegate with zero provider rows is never submittable — the card refuses to emit a no-op
 * `batchDelegate([],[])`. Sign only via `onSubmit`; the card never holds a key.
 */

export interface DelegationProviderRow {
  readonly to: string
  /** Percentage mode: this provider's share, in bips. */
  readonly bips?: number
  /** Amount mode: this provider's explicit vote-power amount. */
  readonly amount?: Amount
}

export interface DelegationCardProps {
  readonly operation?: DelegationOperation
  readonly planResult?: DelegationPlanResult
  /** The DEL-02 state-panel source: observed | unavailable. */
  readonly position: DelegationPositionView
  readonly nativeToken: DexToken
  readonly wrappedToken: DexToken
  /** wrap (native→WNat) or unwrap (WNat→native, full amount only). Default `wrap`. */
  readonly wrapDirection?: 'wrap' | 'unwrap'
  readonly amountText?: string
  readonly nativeBalance?: Amount
  /** The composer's delegate rows (0, 1 or 2). Zero filled rows is never submittable. */
  readonly providers?: readonly DelegationProviderRow[]
  /** The per-provider entry mode the composer offers. Default `percentage`. */
  readonly delegateMode?: 'percentage' | 'amount'
  readonly mockLabel?: string
  readonly networkLabel?: string
  readonly onDirectionChange?: (direction: 'wrap' | 'unwrap') => void
  readonly onAmountChange?: (text: string) => void
  readonly onProviderChange?: (index: number, patch: Partial<DelegationProviderRow>) => void
  readonly onAddProvider?: () => void
  readonly onSubmit?: () => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

export function DelegationCard(props: DelegationCardProps) {
  const { operation: op, planResult, position, nativeToken, wrappedToken, theme } = props
  const providers = props.providers ?? []
  const delegateMode = props.delegateMode ?? 'percentage'
  const direction = props.wrapDirection ?? 'wrap'

  const filled = providers.filter((row) => row.to.trim() !== '').length
  const composingDelegate = filled > 0
  const emptyDelegate = providers.length > 0 && filled === 0

  const state = delegationCardState({ operation: op, planResult, position, composingDelegate })
  const cta = ctaForDelegation({ state, planResult, emptyDelegate })
  const errorNote = planResult?.kind === 'error' ? delegationErrorNote(planResult.error) : null

  const inFlight = op ? IN_FLIGHT.has(op.state) : false
  const editable = !inFlight && !(op ? CONCLUDED.has(op.state) : false)

  // The wrap/unwrap leg. Unwrap shows the FULL wrapped balance and is never editable — the
  // reconciler's `wrappedBalance < amount` check cannot confirm a partial unwrap.
  const wrappedAmount =
    position.status === 'observed' ? amount(position.wrappedBalance, wrappedToken.decimals, wrappedToken.symbol) : undefined
  const legToken = direction === 'wrap' ? nativeToken : wrappedToken
  const legEditable = editable && direction === 'wrap'
  const legValue =
    direction === 'wrap' ? props.amountText ?? '' : wrappedAmount ? formatExact(wrappedAmount, { asset: false }) : ''
  const legBalance = direction === 'wrap' ? props.nativeBalance : wrappedAmount

  const aside = (
    <div className="fk-delegation-head">
      {props.networkLabel ? <span className="fk-delegation-net">{props.networkLabel}</span> : null}
      {props.mockLabel ? <ToneChip tone="att">{props.mockLabel}</ToneChip> : null}
      {op && !PRE_PLAN.has(op.state) ? <StateChip state={op.state} /> : null}
    </div>
  )

  return (
    <Panel
      title={<span className="fk-sr">Delegate vote power</span>}
      aside={aside}
      data-op-state={op?.state}
      data-del-state={state}
      className={`fk-delegation-card${props.className ? ` ${props.className}` : ''}`}
      {...(theme ? { theme } : {})}
    >
      {/* DEL-01 — the wrap/unwrap leg between the native token and WNat. */}
      <SegmentedTabs
        label="Wrap direction"
        value={direction}
        tabs={[
          { id: 'wrap', label: 'Wrap' },
          { id: 'unwrap', label: 'Unwrap' },
        ]}
        {...(editable && props.onDirectionChange ? { onChange: (id) => props.onDirectionChange?.(id as 'wrap' | 'unwrap') } : {})}
      />
      <SwapLeg
        role="pay"
        label={direction === 'wrap' ? `Wrap · ${nativeToken.symbol}` : `Unwrap · ${wrappedToken.symbol}`}
        value={legValue}
        editable={legEditable}
        token={legToken}
        {...(legBalance ? { balance: legBalance } : {})}
        {...(legEditable && props.onAmountChange ? { onAmountInChange: props.onAmountChange } : {})}
      />
      {direction === 'unwrap' ? (
        <p className="fk-delegation-hint">Unwrap returns your full wrapped balance — there is no partial unwrap.</p>
      ) : null}

      {/* DEL-02 — the observed position, every value in the mono face carrying its unit. */}
      <Details aria-label="Delegation position" className="fk-delegation-position">
        {position.status === 'observed' ? (
          <>
            <DetailRow label="Wrapped balance" value={amount(position.wrappedBalance, wrappedToken.decimals, wrappedToken.symbol)} />
            <DetailRow label="Vote power" value={amount(position.votePower, wrappedToken.decimals, 'VP')} />
            {position.delegates.length > 0 ? (
              position.delegates.map((delegate) => (
                <DetailRow
                  key={delegate.address}
                  label={<span className="fk-mono">{truncateAddress(delegate.address)}</span>}
                  value={`${delegate.bips} bips · ${percentOf(delegate.bips)}`}
                />
              ))
            ) : (
              <DetailRow label="Delegations" value="None" />
            )}
          </>
        ) : (
          <>
            <DetailRow label="Wrapped balance" value="—" />
            <DetailRow label="Vote power" value="—" />
            <DetailRow label="Delegations" value="—" />
          </>
        )}
      </Details>

      {/* DEL-01 — the provider rows + the current on-chain mode indicator. */}
      <div className="fk-delegation-providers" aria-label="Delegation providers">
        <div className="fk-delegation-providers-head">
          <span className="fk-delegation-providers-title">Delegate to</span>
          {position.status === 'observed' ? (
            <ToneChip tone="neutral" className="fk-delegation-mode">
              {modeLabel(position.mode)}
            </ToneChip>
          ) : null}
        </div>
        {providers.map((row, index) => (
          <div key={index} className="fk-delegation-provider">
            <input
              className="fk-delegation-provider-addr fk-mono"
              value={row.to}
              disabled={!editable}
              placeholder="0x… FTSO provider"
              inputMode="text"
              aria-label={`Provider ${index + 1} address`}
              onChange={(event) => props.onProviderChange?.(index, { to: event.target.value })}
            />
            {delegateMode === 'amount' ? (
              // AMOUNT-mode entry is not a wired path on this composer (it was never driven live),
              // so the share cell is a read-only display — never a disabled input whose onChange
              // mis-set `bips`. It shows the row's amount if one was supplied, else `—`.
              <span className="fk-delegation-provider-share fk-mono" aria-label={`Provider ${index + 1} amount (read-only)`}>
                {row.amount ? formatExact(row.amount, { asset: false }) : '—'}
              </span>
            ) : (
              <input
                className="fk-delegation-provider-share fk-mono"
                value={row.bips ?? ''}
                disabled={!editable}
                placeholder="bips"
                inputMode="numeric"
                aria-label={`Provider ${index + 1} bips`}
                onChange={(event) => props.onProviderChange?.(index, { bips: Number(event.target.value) || 0 })}
              />
            )}
          </div>
        ))}
        {editable && providers.length < 2 && props.onAddProvider ? (
          <Button variant="ghost" size="sm" onClick={props.onAddProvider}>
            Add a provider
          </Button>
        ) : null}
      </div>

      {/* The honest invariant / position notes. */}
      {errorNote ? (
        <Note tone={errorNote.tone} title={errorNote.title}>
          {errorNote.body}
        </Note>
      ) : state === 'needs-wrap' ? (
        <Note tone="att" title="Wrap before you delegate">
          You have no wrapped balance yet. Vote power comes from WNat — wrap {nativeToken.symbol} first, then delegate it.
        </Note>
      ) : state === 'unavailable' ? (
        <Note tone="att" title="Position unavailable">
          The last read didn't land, so your delegation position is unknown — not zero. It refreshes on the next read.
        </Note>
      ) : null}

      {/* DEL-03 — the wrap→delegate lifecycle on the shared spine. */}
      {op && op.steps.length > 0 && IN_FLIGHT.has(op.state) ? (
        <OperationTimeline
          operation={op}
          stepEvidence={DELEGATION_STEP_EVIDENCE}
          className="fk-delegation-spine"
          {...(theme ? { theme } : {})}
        />
      ) : null}

      <div className="fk-panel-action">
        <Button variant="primary" block disabled={cta.disabled} onClick={props.onSubmit}>
          {cta.label}
        </Button>
      </div>
    </Panel>
  )
}
