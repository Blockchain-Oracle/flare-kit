// packages/react-ui/src/MemoInstructionComposer.tsx
import type { MemoPlanResult, OperationRecord } from '@flarekit-dev/core'
import { Button } from './primitives/Button.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { StateChip, ToneChip } from './primitives/StateChip.js'
import { MemoChain } from './MemoChain.js'
import { OperationTimeline } from './OperationTimeline.js'
import { IN_FLIGHT } from './card-chrome.js'
import { MEMO_STEP_EVIDENCE, NO_FREE_CANCEL, ctaForMemo, memoRefusalNote } from './memo-composer-state.js'

/**
 * MemoInstructionComposer (M14-R11) — the plan surface for an instruction that travels inside
 * a direct mint.
 *
 * M13's composer already carried the hardest property a plan surface can have: approving
 * commits the user to an XRPL payment that leaves their wallet before anything on Flare is
 * knowable. This one adds two states M13 had no way to reach, and both are drawn here rather
 * than left to a host:
 *
 * - **`delayed` is neither success nor failure.** It arrives as `awaiting_external` with a
 *   known end, and the surface must never turn it into a prompt for a second payment. The
 *   timeline carries it; nothing here adds a retry control.
 * - **There is no free cancel.** Every recovery from this flow is itself an XRPL payment that
 *   pays fees and mints FAsset, so the plan says so before approval instead of discovering it
 *   at the point of failure.
 *
 * The chain lives in `MemoChain`; what stays here is the OPERATION — the verified gate, the
 * refusal, the lifecycle and the one control.
 */

export interface MemoInstructionComposerProps {
  /** The gate's own result. A refusal is a state to render, never an error to throw. */
  readonly planResult?: MemoPlanResult
  readonly record?: OperationRecord
  /**
   * Whether the AssetManager's fee settings were read. `false` means NO plan can be built —
   * a distinct state from a refusal, and rendering it as one would blame the user for an
   * unreachable node.
   */
  readonly feesRead: boolean
  readonly xrplDestination?: string
  /** The account that will bind the proof and relay it. */
  readonly relayer?: string
  readonly fassetSymbol: string
  readonly fassetDecimals: number
  readonly nativeSymbol: string
  /** Host clock in ms — a prop, never `Date.now()`, so a screenshot is deterministic. */
  readonly now: number
  /**
   * Whether anything is actually reconciling. `false` while in flight means NOTHING is
   * looking, and the leg copy would otherwise imply the kit is watching when it is not.
   */
  readonly reconciling?: boolean
  readonly networkLabel?: string
  readonly mockLabel?: string
  readonly onSign?: () => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

export function MemoInstructionComposer(props: MemoInstructionComposerProps) {
  const { planResult, record, now, theme } = props
  const cta = ctaForMemo({ planResult, record, feesRead: props.feesRead })
  const plan = planResult?.ok ? planResult.plan : undefined
  const refusal = planResult && !planResult.ok ? planResult.refusal : undefined
  const unverified = refusal?.code === 'unverified'
  const inFlight = record ? IN_FLIGHT.has(record.state) : false
  const refusalCopy = refusal && !unverified ? memoRefusalNote(refusal.code, refusal.message) : undefined

  const aside = (
    <div className="fk-sa-compose-head">
      {props.networkLabel ? <span className="fk-sa-net">{props.networkLabel}</span> : null}
      {props.mockLabel ? <ToneChip tone="att">{props.mockLabel}</ToneChip> : null}
      {record ? <StateChip state={record.state} /> : null}
    </div>
  )

  return (
    <Panel
      title="Compose a memo instruction"
      subtitle={plan ? `0x${plan.opcode.toString(16).toUpperCase()} — inside a direct mint` : undefined}
      aside={aside}
      className={`fk-sa-compose${props.className ? ` ${props.className}` : ''}`}
      data-op-state={record?.state}
      data-refusal={refusal?.code}
      {...(theme ? { theme } : {})}
    >
      {/* The verified gate, as a declared-unbuilt affordance rather than a plan that would
          misrender — the shape M10/M11/M12/M13 established. */}
      {unverified ? (
        <div className="fk-unbuilt" aria-disabled="true">
          <p className="fk-unbuilt-title">Memo instructions are not built for this network</p>
          <p className="fk-unbuilt-reason">{refusal.message}</p>
        </div>
      ) : null}

      {/* Unread fees are an availability state, not a refusal. Without the live minimum every
          check below the fee line is uncomputable, and a plan built on a guessed minimum would
          wave through a payment that burns entirely to the fee receiver. */}
      {!props.feesRead && !unverified ? (
        <Note tone="att" title="The minting fees could not be read">
          Without the deployment’s own minimum minting fee this kit cannot tell a safe payment
          from one that would be burned in full, so it will not build a plan at all. The reads
          above are what is known; nothing here is estimated.
        </Note>
      ) : null}

      {plan ? (
        <MemoChain
          plan={plan}
          fassetSymbol={props.fassetSymbol}
          fassetDecimals={props.fassetDecimals}
          nativeSymbol={props.nativeSymbol}
          {...(props.xrplDestination === undefined ? {} : { xrplDestination: props.xrplDestination })}
          {...(props.relayer === undefined ? {} : { relayer: props.relayer })}
        />
      ) : null}

      {refusalCopy ? (
        <Note tone={refusalCopy.tone} title={refusalCopy.title}>
          {refusalCopy.body}
        </Note>
      ) : null}

      {/* Shown wherever a plan is, refused or not: the cost of getting this wrong is another
          payment, and that is true before approval as much as after. */}
      {plan || refusalCopy ? (
        <Note tone={NO_FREE_CANCEL.tone} title={NO_FREE_CANCEL.title}>
          {NO_FREE_CANCEL.body}
        </Note>
      ) : null}

      {record && record.steps.length > 0 && inFlight ? (
        <OperationTimeline
          operation={record}
          stepEvidence={MEMO_STEP_EVIDENCE}
          className="fk-sa-spine"
          // The host clock travels all the way down, so a screenshot is deterministic.
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
