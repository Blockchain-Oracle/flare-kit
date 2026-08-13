import {
  type Amount,
  type DexToken,
  type StakePlanResult,
  type StakePositionView,
  type StakeOperation,
  type ValidatorInfo,
  amount,
} from '@flarekit-dev/core'
import type { StakeLimits } from '@flarekit-dev/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { LegTimeline } from './primitives/LegTimeline.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { StateChip, ToneChip } from './primitives/StateChip.js'
import { Timestamp } from './primitives/Timestamp.js'
import { SwapLeg } from './SwapLeg.js'
import { OperationTimeline } from './OperationTimeline.js'
import { IN_FLIGHT, PRE_PLAN } from './card-chrome.js'
import {
  STAKE_STEP_EVIDENCE,
  ctaForStake,
  daysOf,
  stakeCardState,
  stakeErrorNote,
  stakeLegs,
} from './stake-card-state.js'

/**
 * StakeCard (M11-R8). The staking composer built on the published core + hook: a validator
 * picker whose NodeIDs are LIVE-READ (no NodeID literal lives here); an amount + duration
 * composer whose bounds are the live-read `StakeLimits` (min 50k / 14-day / 365-day),
 * surfaced and enforced through `planStake`'s invariants; the irreversible ≥14-day value-lock
 * stated as explicit data BEFORE the sign affordance (the rNat-50%-burn precedent); the
 * observed stake position + mirrored vote power (STK-02); and the four-leg cross-substrate
 * round trip on the shared `LegTimeline` + the wallet-signed `OperationTimeline` spine.
 *
 * Honesty (M11): while `stakeVerified` is false the kit refuses a plan (`unverified`) and the
 * card shows the configured path with a declared-unbuilt affordance, NEVER an actionable sign
 * (the M10 `not-verified` idiom). An `unavailable` mirror read renders `—`, never a confident
 * zero. `succeeded` is entered only from the on-chain position read. Sign only via `onSubmit`;
 * the card never holds a key.
 */

export interface StakeCardProps {
  readonly operation?: StakeOperation
  readonly planResult?: StakePlanResult
  /** The STK-02 state-panel source: observed | unavailable. */
  readonly position: StakePositionView
  /** The native token stakes are denominated in (Coston2 `C2FLR`, 18 decimals). */
  readonly nativeToken: DexToken
  /** The LIVE-read validator set — rendered from the reads, never a literal. */
  readonly validators?: readonly ValidatorInfo[]
  /** The LIVE-read stake bounds (min/max amount, min/max duration). */
  readonly limits?: StakeLimits
  readonly selectedNodeId?: string
  readonly amountText?: string
  readonly durationDays?: number
  readonly nativeBalance?: Amount
  readonly mockLabel?: string
  readonly networkLabel?: string
  readonly onValidatorChange?: (nodeId: string) => void
  readonly onAmountChange?: (text: string) => void
  readonly onDurationChange?: (days: number) => void
  readonly onSubmit?: () => void
  /** The return-leg recovery action ("Return stake") surfaces on the spine's RecoveryPanel. */
  readonly onAction?: (actionId: string) => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

const shorten = (id: string): string => (id.length > 16 ? `${id.slice(0, 11)}…${id.slice(-4)}` : id)

export function StakeCard(props: StakeCardProps) {
  const { operation: op, planResult, position, nativeToken, theme } = props
  const validators = props.validators ?? []
  const dec = nativeToken.decimals
  const sym = nativeToken.symbol

  const state = stakeCardState({ operation: op, planResult, position })
  const cta = ctaForStake(state)
  const errorNote = planResult && !planResult.ok ? stakeErrorNote(planResult.error) : null
  const valueLock = planResult?.ok ? planResult.plan.valueLock : undefined

  const inFlight = op ? IN_FLIGHT.has(op.state) : false
  const editable = !inFlight

  const aside = (
    <div className="fk-stake-head">
      {props.networkLabel ? <span className="fk-stake-net">{props.networkLabel}</span> : null}
      {props.mockLabel ? <ToneChip tone="att">{props.mockLabel}</ToneChip> : null}
      {op && !PRE_PLAN.has(op.state) ? <StateChip state={op.state} /> : null}
    </div>
  )

  return (
    <Panel
      title={<span className="fk-sr">Stake to a validator</span>}
      aside={aside}
      data-op-state={op?.state}
      data-stake-state={state}
      className={`fk-stake-card${props.className ? ` ${props.className}` : ''}`}
      {...(theme ? { theme } : {})}
    >
      {/* STK-01 — the validator picker. NodeIDs + their active windows come from the reads;
          the window is the ceiling a stake's end may not cross (`ends_after_validator`). */}
      <div className="fk-stake-validators" aria-label="Validators">
        <span className="fk-stake-validators-title">Validator</span>
        {validators.length > 0 ? (
          validators.map((validator) => {
            const selected = validator.nodeId === props.selectedNodeId
            return (
              <button
                key={validator.nodeId}
                type="button"
                className="fk-stake-validator"
                data-selected={selected ? 'true' : undefined}
                aria-pressed={selected}
                disabled={!editable}
                onClick={editable ? () => props.onValidatorChange?.(validator.nodeId) : undefined}
              >
                <span className="fk-stake-validator-id fk-mono">{validator.nodeId}</span>
                <span className="fk-stake-validator-win">
                  Active until <Timestamp seconds={validator.endTime} />
                </span>
              </button>
            )
          })
        ) : (
          <span className="fk-stake-validators-empty">No validators read yet.</span>
        )}
      </div>

      {/* STK-01 — the amount + duration composer. */}
      <SwapLeg
        role="pay"
        label={`Stake · ${sym}`}
        value={props.amountText ?? ''}
        editable={editable}
        token={nativeToken}
        {...(props.nativeBalance ? { balance: props.nativeBalance } : {})}
        {...(editable && props.onAmountChange ? { onAmountInChange: props.onAmountChange } : {})}
      />
      <label className="fk-stake-duration">
        <span className="fk-stake-duration-label">Lock duration (days)</span>
        <input
          className="fk-stake-duration-input fk-mono"
          value={props.durationDays ?? ''}
          disabled={!editable}
          inputMode="numeric"
          placeholder="days"
          aria-label="Lock duration in days"
          onChange={(event) => props.onDurationChange?.(Number(event.target.value) || 0)}
        />
      </label>

      {/* The LIVE-read bounds, always shown so the constraints are visible — from `limits`. */}
      {props.limits ? (
        <Details aria-label="Stake limits" className="fk-stake-bounds">
          <DetailRow label="Minimum stake" value={amount(props.limits.minAmount, dec, sym)} />
          <DetailRow label="Maximum stake" value={amount(props.limits.maxAmount, dec, sym)} />
          <DetailRow
            label="Lock window"
            value={`${daysOf(props.limits.minDuration)}–${daysOf(props.limits.maxDuration)} days`}
          />
        </Details>
      ) : null}

      {/* The irreversible value-lock — explicit, unmissable data stated BEFORE the sign
          affordance below (the rNat-50%-burn precedent: a real commitment shown pre-sign). */}
      {valueLock ? (
        <div className="fk-stake-lock">
          <Details aria-label="Value lock">
            <DetailRow label="Amount locked" value={amount(valueLock.amount, dec, sym)} />
            <DetailRow label="Locked for" value={`${daysOf(valueLock.lockSeconds)} days`} />
            <DetailRow label="Unlocks" value={<Timestamp seconds={valueLock.unlockAt} />} />
          </Details>
          <Note tone="att" title="Irreversible for the full lock period">
            Once signed, this stake is committed to the P-chain and cannot be withdrawn until it unlocks. There is no
            early exit — the exact amount and unlock time are stated above.
          </Note>
        </div>
      ) : null}

      {/* The honest invariant / verified-gate note. */}
      {errorNote ? (
        <Note tone={errorNote.tone} title={errorNote.title}>
          {errorNote.body}
        </Note>
      ) : null}

      {/* STK-02 — the observed stake position + mirrored vote power, every value in the mono
          face. An `unavailable` mirror read is `—`, never a confident zero. */}
      <Details aria-label="Stake position" className="fk-stake-position">
        {position.status === 'observed' ? (
          <>
            {position.stakes.length > 0 ? (
              position.stakes.map((stake, index) => (
                <DetailRow
                  key={`${stake.nodeId}-${index}`}
                  label={<span className="fk-mono">{shorten(stake.nodeId)}</span>}
                  value={amount(stake.amount, dec, sym)}
                  sub={
                    <>
                      until <Timestamp seconds={stake.endTime} />
                    </>
                  }
                />
              ))
            ) : (
              <DetailRow label="Staked" value={amount(0n, dec, sym)} />
            )}
            <DetailRow
              label="Mirrored vote power"
              value={position.mirroredVotePower === undefined ? '—' : amount(position.mirroredVotePower, dec, 'VP')}
            />
          </>
        ) : (
          <>
            <DetailRow label="Staked" value="—" />
            <DetailRow label="Mirrored vote power" value="—" />
          </>
        )}
      </Details>

      {position.status === 'unavailable' ? (
        <Note tone="att" title="Position unavailable">
          The last P-chain read didn't land, so your stake position is unknown — not zero. It refreshes on the next read.
        </Note>
      ) : null}

      {/* STK-03 — the four-leg round trip + the wallet-signed spine (in flight only). */}
      {op && IN_FLIGHT.has(op.state) ? (
        <LegTimeline legs={stakeLegs(op)} ariaLabel="Staking round trip" className="fk-stake-legs" />
      ) : null}
      {op && op.steps.length > 0 && IN_FLIGHT.has(op.state) ? (
        <OperationTimeline
          operation={op}
          stepEvidence={STAKE_STEP_EVIDENCE}
          className="fk-stake-spine"
          {...(props.onAction ? { onAction: props.onAction } : {})}
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
