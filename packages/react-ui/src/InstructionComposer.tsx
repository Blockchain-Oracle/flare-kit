// packages/react-ui/src/InstructionComposer.tsx
import type { InstructionIntent, InstructionPlanResult, OperationRecord } from '@flare-kit/core'
import { Button } from './primitives/Button.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { StateChip, ToneChip } from './primitives/StateChip.js'
import { InstructionChain } from './InstructionChain.js'
import { OperationTimeline } from './OperationTimeline.js'
import { IN_FLIGHT } from './card-chrome.js'
import {
  EXPIRY_NOTE,
  INSTRUCTION_STEP_EVIDENCE,
  ctaForInstruction,
  refusalNote,
} from './instruction-composer-state.js'
import { instructionLabel } from './instruction-visuals.js'

/**
 * InstructionComposer (SA-02, `R-SA-004`, M13-R10) — a plan surface with an unusually long
 * tail.
 *
 * Approving this commits the user to an XRPL payment that leaves their wallet BEFORE anything
 * on Flare is knowable. Every other card in this kit plans a transaction that reverts
 * harmlessly if it is wrong; here a wrong instruction costs the payment and the only way
 * forward is a new one. So the whole chain is shown before approval — the exact payment, the
 * attestation, the permissionless dispatch and the downstream call the personal account will
 * make — rather than a summary that becomes a surprise three legs later. The chain itself is
 * `InstructionChain`; what stays here is the OPERATION: the verified gate, the refusal, the
 * lifecycle and the one control.
 *
 * Two states this surface must get right, both `R-SA-008`:
 *
 * - **The deadline is wall-clock, and only once it exists.** The proof window is measured
 *   from the XRPL block timestamp, so before the payment lands there is no instant to show
 *   and printing one would assume the payment validates now. Until then it states the window
 *   and where its clock starts.
 * - **An expired operation offers nothing.** Past the deadline the controller refuses the
 *   proof forever while the XRP is already the operator's. The surface says exactly that, and
 *   carries NO retry affordance — a retry button here would invite a duplicate payment.
 */

export interface InstructionComposerProps {
  /** The planner's own result. A refusal is a state to render, never an error to throw. */
  readonly planResult?: InstructionPlanResult
  readonly record?: OperationRecord<InstructionIntent>
  /**
   * When the proof stops being usable, in ms. `undefined` before the XRPL payment lands —
   * there is no block timestamp to measure from, and assuming one invents a deadline.
   */
  readonly proofDeadline?: number
  /** Host clock in ms — a prop, never `Date.now()`, so a screenshot is deterministic. */
  readonly now: number
  /** The FDC request fee in wei, read at request time. `—` until it is read. */
  readonly fdcRequestFee?: bigint
  /** Native symbol for the dispatch value and the FDC fee. */
  readonly nativeSymbol?: string
  /**
   * Whether anything is actually reconciling. `false` while in flight means NOTHING is
   * looking, and the leg copy would otherwise imply the kit is watching when it is not.
   */
  readonly reconciling?: boolean
  /**
   * Whether THIS kit sent the `executeInstruction` transaction.
   *
   * A separate fact from the operation's state, and it has to be, because dispatch is
   * permissionless: the live deposit executed and its effect is real, but an operator's
   * backend submitted the proof first. Reading "we dispatched it" off `succeeded` would be
   * an inference the chain does not support. `undefined` claims nothing either way.
   */
  readonly dispatchedByUs?: boolean
  /** The address that actually dispatched, where it was read. */
  readonly dispatchedBy?: string
  readonly networkLabel?: string
  readonly mockLabel?: string
  readonly onSign?: () => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

export function InstructionComposer(props: InstructionComposerProps) {
  const { planResult, record, now, theme, nativeSymbol = 'FLR' } = props
  const cta = ctaForInstruction({ planResult, record })
  const plan = planResult?.ok ? planResult.plan : undefined
  const refusal = planResult && !planResult.ok ? planResult.refusal : undefined
  const unverified = refusal?.code === 'unverified'
  const inFlight = record ? IN_FLIGHT.has(record.state) : false
  const expired = record?.state === 'expired'
  // Hoisted rather than bound inside JSX: every sibling card in this package computes its
  // chrome above the return, and the one IIFE in the tree was this file's alone.
  const refusalCopy = refusal && !unverified ? refusalNote(refusal.code, refusal.message) : undefined

  const aside = (
    <div className="fk-sa-compose-head">
      {props.networkLabel ? <span className="fk-sa-net">{props.networkLabel}</span> : null}
      {props.mockLabel ? <ToneChip tone="att">{props.mockLabel}</ToneChip> : null}
      {record ? <StateChip state={record.state} /> : null}
    </div>
  )

  return (
    <Panel
      title="Compose an instruction"
      subtitle={plan ? instructionLabel(plan.row.instruction) : undefined}
      aside={aside}
      className={`fk-sa-compose${props.className ? ` ${props.className}` : ''}`}
      data-op-state={record?.state}
      data-refusal={refusal?.code}
      {...(theme ? { theme } : {})}
    >
      {/* The verified gate, as a declared-unbuilt affordance rather than a plan that would
          misrender — the shape M10/M11/M12 established. */}
      {unverified ? (
        <div className="fk-unbuilt" aria-disabled="true">
          <p className="fk-unbuilt-title">Instructions are not built for this network</p>
          <p className="fk-unbuilt-reason">{refusal.message}</p>
        </div>
      ) : null}

      {plan ? (
        <InstructionChain
          plan={plan}
          now={now}
          nativeSymbol={nativeSymbol}
          expired={expired}
          {...(props.proofDeadline === undefined ? {} : { proofDeadline: props.proofDeadline })}
          {...(props.fdcRequestFee === undefined ? {} : { fdcRequestFee: props.fdcRequestFee })}
        />
      ) : null}

      {refusalCopy ? (
        <Note tone={refusalCopy.tone} title={refusalCopy.title}>
          {refusalCopy.body}
        </Note>
      ) : null}

      {expired ? (
        <Note tone={EXPIRY_NOTE.tone} title={EXPIRY_NOTE.title}>
          {EXPIRY_NOTE.body}
        </Note>
      ) : null}

      {/* Executed, but not by us. Neither a success of this kit's nor a failure — the true
          third thing, and the only honest way to draw the live deposit. */}
      {props.dispatchedByUs === false ? (
        <Note tone="info" title="Dispatched by another submitter">
          The instruction executed and its effect is real, but this kit did not send the
          transaction — another submitter presented the proof first
          {props.dispatchedBy ? (
            <>
              {' ('}
              <span className="fk-mono">{props.dispatchedBy}</span>
              {')'}
            </>
          ) : null}
          . That is the protocol working as designed, not a fallback.
        </Note>
      ) : null}

      {record && record.steps.length > 0 && (inFlight || expired) ? (
        <OperationTimeline
          operation={record}
          stepEvidence={INSTRUCTION_STEP_EVIDENCE}
          className="fk-sa-spine"
          // The host clock travels all the way down. This surface declares it takes `now` as
          // a prop so a screenshot is deterministic, and the timeline was where that promise
          // used to end — its recovery panel fell back to `Date.now()`.
          nowMs={now}
          {...(theme ? { theme } : {})}
        />
      ) : null}

      {/* A wait that nothing is watching must say so: the leg copy otherwise reads as though
          the kit is polling when no reconcile loop is running. */}
      {inFlight && props.reconciling === false ? (
        <Note tone="att" title="Nothing is watching this right now">
          The reconcile loop is not running, so the leg above is the last thing observed rather
          than the current state. It resumes when the app reads again.
        </Note>
      ) : null}

      {!unverified ? (
        <div className="fk-panel-action">
          <Button variant="primary" block disabled={cta.disabled} onClick={props.onSign}>
            {cta.label}
          </Button>
        </div>
      ) : null}
    </Panel>
  )
}
