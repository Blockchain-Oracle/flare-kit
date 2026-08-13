import type { AttestationOperation, Observation } from '@flare-kit/core'
import { Note } from './primitives/Note.js'
import { OperationTimeline } from './OperationTimeline.js'
import { SourceChip } from './primitives/SourceChip.js'

/**
 * FDC-03 — where an attestation stands, on the existing operation spine.
 *
 * This composes `OperationTimeline` rather than restating it (M3-R12). The spine
 * already knows how to render steps, actors, evidence and a stated wait; what an
 * attestation adds is which evidence belongs beside which step, and the fact
 * that "no proof" is an unknown rather than a failure.
 *
 * The step split that matters: `finalize` and `retrieve` are two steps because
 * they are two moments. Measured live on 2026-08-04, `Relay.isFinalized`
 * returned true for a round whose proof the data availability layer had not yet
 * published — for minutes. A timeline that treats finalization as
 * proof-readiness shows a proof that is not there.
 */

/** Which identifiers sit beside which attestation step. */
export const ATTESTATION_STEP_EVIDENCE: Record<string, readonly string[]> = {
  prepare: ['fdc_request'],
  submit: ['flare_tx'],
  finalize: ['fdc_round'],
  retrieve: ['fdc_proof'],
  verify: ['fdc_proof'],
  consume: ['flare_tx', 'recipient_address'],
}

export interface AttestationTimelineProps {
  operation: AttestationOperation
  /**
   * Where this reading came from, and how old it is. M3-R12: every M3 value
   * that reaches a surface carries its provenance. A timeline is a claim about
   * what the protocol is doing right now, so "who said so, and when" is exactly
   * the thing a stale one must not hide.
   */
  reading?: Observation<unknown>
  /** Evaluated against the wall clock, for the chip's own freshness. */
  now?: number
  /**
   * Why there is no proof, when there is none. Rendered as an unknown with a
   * diagnostic reason — never as a negative fact about the attested data
   * (M3-R10).
   */
  unknownReason?: string
  onAction?: (actionId: string) => void
  theme?: 'light' | 'dark'
  className?: string
}

export function AttestationTimeline({
  operation,
  reading,
  now,
  unknownReason,
  onAction,
  theme,
  className,
}: AttestationTimelineProps) {
  const verifyStep = operation.steps.find((step) => step.id === 'verify')
  const verifiedFalse = verifyStep?.state === 'failed'

  return (
    <div
      className={`fk fk-fdc-timeline${className ? ` ${className}` : ''}`}
      data-state={operation.state}
    >
      {reading ? (
        <div className="fk-fdc-provenance">
          <SourceChip observation={reading} now={now ?? Date.now()} />
        </div>
      ) : null}

      <OperationTimeline
        operation={operation}
        stepEvidence={ATTESTATION_STEP_EVIDENCE}
        {...(onAction ? { onAction } : {})}
        {...(theme ? { theme } : {})}
      />

      {unknownReason && !verifiedFalse ? (
        <Note tone="info" title="No proof — outcome unknown">
          {/* Deliberately `info`, not `bad`. The underlying transaction is not
              in question here; only whether the protocol produced a proof. */}
          {unknownReason} This says nothing about whether the attested data is
          true. The request can be made again.
        </Note>
      ) : null}

      {verifiedFalse ? (
        <Note tone="bad" title="The proof did not verify on chain">
          {/* The one genuinely negative outcome, and it is a fact about the
              proof rather than about the source. */}
          FdcVerification returned false for this proof. That is a statement
          about the proof, not about the transaction it describes.
        </Note>
      ) : null}
    </div>
  )
}
