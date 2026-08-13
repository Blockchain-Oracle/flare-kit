import { amount, truncateAddress } from '@flare-kit/core'
import type { Eligibility, GovernanceOperation, GovernancePlanResult, GovernancePositionView } from '@flare-kit/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { StateChip, ToneChip } from './primitives/StateChip.js'
import { OperationTimeline } from './OperationTimeline.js'
import { CONCLUDED, IN_FLIGHT, PRE_PLAN } from './card-chrome.js'
import {
  GOVERNANCE_STEP_EVIDENCE,
  ctaForGovernance,
  governanceCardState,
  governanceErrorNote,
} from './governance-card-state.js'

/**
 * GovernanceCard (M12). The governance-delegation composer built on the published core + hook:
 * the account's governance vote power + current delegate (GOV-VP); a SINGLE-TARGET delegate
 * composer (GOV-01); the eligibility readout (GOV-ELIG); and the delegate/undelegate lifecycle
 * on the shared `OperationTimeline` spine (GOV-03).
 *
 * The load-bearing difference from the M10 DelegationCard it mirrors: governance vote power is
 * ALL-OR-NOTHING to ONE delegate (`delegate(to)` / `undelegate()`) — there is NO per-provider
 * share field and NO second-provider row. The single-target composer is the point.
 *
 * Honesty (M12): an `unavailable` VP/delegate read renders `—`, never a confident zero (an
 * observed real 0 votes / zero-address delegate is a distinct observed-empty, shown as its real
 * value); `isMember` is `boolean | undefined` and `undefined` renders `—`/unknown, NEVER
 * `false` (it reverts on-chain, probe CONCERN A); the propose/submit affordance is
 * declared-unbuilt (permissioned — never a live submit); and `succeeded` is entered ONLY from
 * the on-chain read-back (the op state the hook produces), never from the submission. The card
 * never holds a key — `delegate`/`undelegate` go through the hook's injected walletClient.
 */

export interface GovernanceCardProps {
  readonly operation?: GovernanceOperation
  readonly planResult?: GovernancePlanResult
  /** The GOV-VP state-panel source: observed | unavailable. */
  readonly position: GovernancePositionView
  /** The keyless eligibility read; `isMember` is `undefined` on the observed revert. */
  readonly eligibility?: Eligibility
  /** The SINGLE target address the composer delegates all governance vote power to. */
  readonly targetText?: string
  readonly mockLabel?: string
  readonly networkLabel?: string
  readonly onTargetChange?: (text: string) => void
  readonly onDelegate?: () => void
  readonly onUndelegate?: () => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const isZero = (address: string): boolean => address.toLowerCase() === ZERO_ADDRESS
/** Governance VP is 18-decimal WNat weight labelled `VP` by definition — a constant, not an option. */
const VP_DECIMALS = 18
const VP_ASSET = 'VP'

/** isProposer/canPropose are reliable booleans; isMember reverts → `undefined` → `—`, never `No`. */
function yesNoUnknown(value: boolean | undefined): string {
  return value === undefined ? '—' : value ? 'Yes' : 'No'
}

export function GovernanceCard(props: GovernanceCardProps) {
  const { operation: op, planResult, position, eligibility, theme } = props

  const hasTarget = (props.targetText ?? '').trim() !== ''
  const state = governanceCardState({ operation: op, planResult, position })
  const cta = ctaForGovernance({ state, planResult, hasTarget })
  const errorNote = planResult && !planResult.ok ? governanceErrorNote(planResult.error) : null

  const inFlight = op ? IN_FLIGHT.has(op.state) : false
  const editable = !inFlight && !(op ? CONCLUDED.has(op.state) : false)
  // With NO plan the verified gate has not been evaluated at all, so the affordance must not
  // present itself as live — the same stance the delegate CTA already takes. The hook still
  // refuses either way; this keeps the two affordances from disagreeing on screen.
  const notVerifiedHere = planResult === undefined || (!planResult.ok && planResult.error.code === 'unverified')

  // Undelegate is offered only when a current delegate exists (an observed non-zero delegate).
  const hasDelegate = position.status === 'observed' && !isZero(position.delegate)
  const canUndelegate = editable && !notVerifiedHere

  const aside = (
    <div className="fk-gov-head">
      {props.networkLabel ? <span className="fk-gov-net">{props.networkLabel}</span> : null}
      {props.mockLabel ? <ToneChip tone="att">{props.mockLabel}</ToneChip> : null}
      {op && !PRE_PLAN.has(op.state) ? <StateChip state={op.state} /> : null}
    </div>
  )

  return (
    <Panel
      title={<span className="fk-sr">Delegate governance vote power</span>}
      aside={aside}
      data-op-state={op?.state}
      data-gov-state={state}
      className={`fk-gov-card${props.className ? ` ${props.className}` : ''}`}
      {...(theme ? { theme } : {})}
    >
      {/* GOV-VP — the vote power + current delegate, every value in the mono face. An
          `unavailable` read is `—`; an observed 0 / zero delegate is a real observed-empty. */}
      <Details aria-label="Governance vote power" className="fk-gov-vp">
        {position.status === 'observed' ? (
          <>
            <DetailRow label="Vote power" value={amount(position.votes, VP_DECIMALS, VP_ASSET)} />
            <DetailRow
              label="Delegate"
              value={isZero(position.delegate) ? 'None' : <span className="fk-mono">{truncateAddress(position.delegate)}</span>}
            />
          </>
        ) : (
          <>
            <DetailRow label="Vote power" value="—" />
            <DetailRow label="Delegate" value="—" />
          </>
        )}
      </Details>

      {/* GOV-01 — the SINGLE-TARGET composer. Governance VP is all-or-nothing: one address,
          no share cell, no second-provider row. Undelegate is offered only when a delegate exists. */}
      <div className="fk-gov-composer" aria-label="Delegate governance vote power">
        <div className="fk-gov-composer-head">
          <span className="fk-gov-composer-title">Delegate to</span>
          {hasDelegate ? (
            <Button variant="ghost" size="sm" disabled={!canUndelegate} onClick={props.onUndelegate}>
              Undelegate
            </Button>
          ) : null}
        </div>
        <input
          className="fk-gov-target fk-mono"
          value={props.targetText ?? ''}
          disabled={!editable}
          placeholder="0x… representative"
          inputMode="text"
          aria-label="Delegate address"
          onChange={(event) => props.onTargetChange?.(event.target.value)}
        />
      </div>

      {/* GOV-ELIG — eligibility, honestly. isProposer/canPropose are reliable booleans;
          isMember reverts on-chain → `undefined` → `—`, never `No`. */}
      <Details aria-label="Governance eligibility" className="fk-gov-eligibility">
        <DetailRow label="Proposer" value={yesNoUnknown(eligibility?.isProposer)} />
        <DetailRow label="Can propose" value={yesNoUnknown(eligibility?.canPropose)} />
        <DetailRow label="Management member" value={yesNoUnknown(eligibility?.isMember)} />
      </Details>

      {/* The propose/submit affordance is DECLARED-UNBUILT — a permissioned governance path
          this milestone does not ship. It is stated as scope, never a live submit button. */}
      <Note tone="info" title="Proposing isn't built here">
        Creating a proposal isn't built here — it's a permissioned governance path this kit doesn't ship this milestone.
        This card reads eligibility and delegates vote power; it never submits a proposal.
      </Note>

      {/* The honest invariant / verified-gate note, or the unavailable-position note. */}
      {errorNote ? (
        <Note tone={errorNote.tone} title={errorNote.title}>
          {errorNote.body}
        </Note>
      ) : state === 'unavailable' ? (
        <Note tone="att" title="Position unavailable">
          The last read didn't land, so your governance position is unknown — not zero. It refreshes on the next read.
        </Note>
      ) : null}

      {/* GOV-03 — the delegate/undelegate lifecycle on the shared spine (in flight only).
          `succeeded` reaches here only once the hook's read-back advanced the op. */}
      {op && op.steps.length > 0 && IN_FLIGHT.has(op.state) ? (
        <OperationTimeline
          operation={op}
          stepEvidence={GOVERNANCE_STEP_EVIDENCE}
          className="fk-gov-spine"
          {...(theme ? { theme } : {})}
        />
      ) : null}

      <div className="fk-panel-action">
        <Button variant="primary" block disabled={cta.disabled} onClick={props.onDelegate}>
          {cta.label}
        </Button>
      </div>
    </Panel>
  )
}
