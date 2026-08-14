import type { EvidenceItem, OperationRecord, OperationStep } from '@flare-kit/core'
import { EvidenceChip } from './primitives/EvidenceChip.js'
import { GlyphMark, StateChip } from './primitives/StateChip.js'
import { formatInstant } from './primitives/Timestamp.js'
import { RecoveryPanel } from './RecoveryPanel.js'
import { type Glyph, actorName } from './state-visuals.js'

/**
 * The operation spine.
 *
 * The hardest design problem in this product is time: a mint spans minutes
 * across three actors. So a wait is never a spinner — it states the stage, the
 * expected end, the actor being waited on, and the safe action, in that order.
 */

const STEP_GLYPHS: Record<OperationStep['state'], Glyph> = {
  pending: 'unknown',
  active: 'working',
  blocked: 'action',
  done: 'done',
  skipped: 'unknown',
  failed: 'failed',
}

/**
 * Which evidence belongs beside which step, so identifiers sit in context.
 *
 * The direct-mint spine's own map, and the default. A capability with different
 * steps passes its own rather than getting a spine with no identifiers on it —
 * which is why this is a prop and not a module-level constant the component
 * reaches for unconditionally.
 */
export const DIRECT_MINT_STEP_EVIDENCE: Record<string, readonly string[]> = {
  'pay-xrpl': ['xrpl_destination', 'payment_reference', 'xrpl_tx'],
  'xrpl-finality': ['xrpl_ledger'],
  'fdc-attest': ['fdc_round', 'fdc_request', 'fdc_proof'],
  'execute-mint': ['flare_tx', 'executor_address'],
  'credit-fasset': ['recipient_address'],
}

export interface OperationTimelineProps {
  /**
   * Any operation record. The spine reads only `state`, `steps`, `evidence`
   * and `awaiting`, all of which are on the base record — so an attestation and
   * a mint share one spine rather than having two that drift apart (M3-R12).
   */
  operation: OperationRecord<unknown, unknown, unknown>
  /** Which evidence sits beside which step. Defaults to the direct-mint map. */
  stepEvidence?: Record<string, readonly string[]>
  /** Called when the user takes a recovery action. */
  onAction?: (actionId: string) => void
  /**
   * The host clock in ms, forwarded to `RecoveryPanel`.
   *
   * Without it the panel falls back to `Date.now()` — so a surface that carefully takes
   * `now` as a prop for determinism (every audited M3/M4 surface, and M13's composer) had a
   * real wall clock re-enter its subtree at this boundary. Inert only while records carry no
   * time-gated recovery action; the first one makes those screens unreproducible. Found by
   * the M13 test-quality review.
   */
  nowMs?: number
  theme?: 'light' | 'dark'
  className?: string
}

export function OperationTimeline({
  operation,
  stepEvidence = DIRECT_MINT_STEP_EVIDENCE,
  onAction,
  nowMs,
  theme,
  className,
}: OperationTimelineProps) {
  const evidenceFor = (step: OperationStep): EvidenceItem[] => {
    const kinds = stepEvidence[step.id] ?? []
    return operation.evidence.filter((item) => kinds.includes(item.kind))
  }

  return (
    <div
      className={`fk${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
    >
      {/* Every state change is announced in text (R11). */}
      <p className="fk-sr" role="status">
        Operation is {operation.state.replace(/_/g, ' ')}.
      </p>

      <ol className="fk-spine">
        {operation.steps.map((step) => (
          <li key={step.id} className="fk-spine-step" data-state={step.state} data-step={step.id}>
            <span className="fk-spine-node">
              <GlyphMark glyph={STEP_GLYPHS[step.state]} />
            </span>
            <div>
              <div className="fk-spine-top">
                <span className="fk-spine-name">{step.type}</span>
                {/* The row names its owning actor, as a proper noun. */}
                <span className="fk-actor">{actorName(step.actor)}</span>
              </div>
              {evidenceFor(step).length > 0 ? (
                <div className="fk-spine-evidence">
                  {evidenceFor(step).map((item) => (
                    <EvidenceChip key={`${item.kind}:${item.value}`} item={item} />
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {operation.awaiting ? (
        <div className="fk-wait">
          <div>
            <StateChip state={operation.state} />{' '}
            <span className="fk-wait-actor">Waiting on {actorName(operation.awaiting.actor)}</span>
            {operation.awaiting.availableAt ? (
              <>
                {' until '}
                <span className="fk-wait-until">{formatInstant(operation.awaiting.availableAt)}</span>
              </>
            ) : null}
          </div>
          <div className="fk-wait-body">{operation.awaiting.reason}</div>
        </div>
      ) : null}

      <RecoveryPanel
        operation={operation}
        {...(nowMs === undefined ? {} : { nowMs })}
        {...(onAction ? { onAction } : {})}
      />
    </div>
  )
}
