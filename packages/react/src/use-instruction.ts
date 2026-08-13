import {
  type InstructionIntent,
  type InstructionObservation,
  type InstructionPlanResult,
  type InstructionRow,
  type OperationRecord,
  type PersonalAccountState,
  type SmartAccountsDeployment,
  type DeploymentSettings,
  planInstruction,
  proofDeadlineMs,
  reconcileInstruction,
} from '@flare-kit/core'
import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * `useInstruction` — the plan and the durable four-leg lifecycle for one XRPL instruction.
 *
 * Planning is KEYLESS and pure: it needs the deployment reads `useSmartAccount` already
 * performs, and produces either a plan or a typed refusal. It never signs and never sends.
 *
 * Signing is the HOST's job, and deliberately not this hook's. The payment is an XRPL
 * transaction, so the signer is an XRPL wallet — core builds it unsigned (`xrpl.ts`'s rule
 * since M1) and the host submits it. A hook that took an XRPL seed would put key material
 * in the render tree for no gain.
 *
 * Reconciliation is durable and self-driving: the caller supplies an `observe` function that
 * reports what it can see of the four legs, and this hook walks the record through the
 * canonical table on a poll. On mount it resumes from a persisted record, so an instruction
 * that dispatched while the app was closed settles on open. There is no Resume button.
 */

export interface UseInstructionInput {
  readonly deployment: SmartAccountsDeployment
  readonly settings: DeploymentSettings | undefined
  readonly catalogue: readonly InstructionRow[]
  readonly personalAccount: PersonalAccountState | undefined
  readonly intent: InstructionIntent | undefined
  /** From `readTransactionIdUsed`. `undefined` means unread, and is never read as `false`. */
  readonly replayed?: boolean | undefined
  /**
   * From `useSmartAccount`. Distinguishes a balance that was never asked for from one whose
   * read failed — without it the planner reports the first as a failure.
   */
  readonly balanceRequested?: boolean
  /** A persisted operation to resume reconciling on mount. */
  readonly operation?: OperationRecord<InstructionIntent>
  /** What the caller can currently see of the four legs. Absent legs stay `undefined`. */
  observe?(): Promise<InstructionObservation>
  /** Poll cadence in ms while the operation is in flight. Default 15s. */
  readonly pollMs?: number
}

export interface UseInstructionResult {
  /** `undefined` until an intent is supplied. A refusal is a result, not an error. */
  readonly plan: InstructionPlanResult | undefined
  readonly record: OperationRecord<InstructionIntent> | undefined
  /**
   * When the proof stops being usable, once the XRPL payment has landed. `undefined`
   * before that — there is no block timestamp to measure from, and assuming "now" would
   * quietly invent a deadline.
   */
  readonly proofDeadline: number | undefined
  /**
   * Whether the reconcile poll is actually running. `false` while an operation is in
   * flight means NOTHING is looking — the record keeps rendering its last leg ("waiting
   * for the attestation round…") while no read is happening, so a surface must say so
   * rather than let the wait speak for itself.
   */
  readonly reconciling: boolean
  /** Drive one reconcile immediately, rather than waiting for the next poll. */
  reconcileNow(): void
}

export function useInstruction(input: UseInstructionInput): UseInstructionResult {
  const { deployment, settings, catalogue, personalAccount, intent, observe, pollMs = 15_000 } = input
  const [record, setRecord] = useState<OperationRecord<InstructionIntent> | undefined>(input.operation)
  const [observation, setObservation] = useState<InstructionObservation>({})
  const [tick, setTick] = useState(0)

  const reconcileNow = useCallback(() => setTick((value) => value + 1), [])

  const plan = useMemo(() => {
    if (!intent) return undefined
    return planInstruction({
      deployment,
      settings,
      catalogue,
      personalAccount,
      intent,
      replayed: input.replayed,
      balanceRequested: input.balanceRequested,
    })
  }, [
    deployment,
    settings,
    catalogue,
    personalAccount,
    intent,
    input.replayed,
    input.balanceRequested,
  ])

  useEffect(() => {
    setRecord(input.operation)
  }, [input.operation])

  // Named, so the lint rule can see it. `record` itself must NOT be a dependency:
  // `reconcileInstruction` returns a fresh object every poll, so listing it would restart
  // the effect on each reconcile and re-enter `run()` immediately — an unbounded loop.
  const active = record !== undefined

  useEffect(() => {
    if (!active || !observe || !settings) return
    // Per-effect, not a shared ref — see `use-smart-account.ts` for why a shared one leaks
    // a poll loop on every dependency change.
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      let next: InstructionObservation
      try {
        next = await observe()
      } catch {
        // A failed look is not an outcome. The record keeps its state and the poll retries;
        // it never advances to `failed` on the strength of an unanswered read.
        timer = setTimeout(() => void run(), pollMs)
        return
      }
      if (!live) return
      setObservation(next)
      setRecord((current) =>
        current
          ? reconcileInstruction(current, next, {
              now: Date.now(),
              proofWindowSeconds: settings.proofValidityDurationSeconds,
            })
          : current,
      )
      timer = setTimeout(() => void run(), pollMs)
    }

    void run()
    return () => {
      live = false
      if (timer) clearTimeout(timer)
    }
    // `record` is intentionally not a dependency: reconciling would otherwise restart the
    // poll on every advance, resetting the cadence each time the record moves.
  }, [observe, settings, pollMs, tick, active])

  return {
    plan,
    record,
    reconciling: Boolean(active && observe && settings),
    proofDeadline: settings
      ? proofDeadlineMs(observation, settings.proofValidityDurationSeconds)
      : undefined,
    reconcileNow,
  }
}
