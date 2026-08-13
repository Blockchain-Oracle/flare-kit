import {
  type DelegationAdapter,
  type DelegationIntent,
  type DelegationPlan,
  type DelegationPlanResult,
  type DelegationPositionView,
  type DelegationReads,
  type OperationRecord,
  type SerializedError,
  buildDelegationPlan,
  delegationPosition,
  isTerminal,
  reconcileDelegation,
  toSerializedError,
} from '@flare-kit/core'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * `useDelegation` — the durable delegation poll (M10-R9). Thin over the M10 delegation
 * ops, mirroring `useBridge`/`useGasless`'s shape (state + a submit path + a polled
 * reconcile on a host-controlled interval) with one necessary difference: unlike their
 * opaque `reconcile: (op) => Promise<op>` closure, `reconcileDelegation` itself needs the
 * FRESH `DelegationReads`, because the SAME read that advances a submitted wrap/delegate
 * is ALSO the live wrapped-balance/delegate/mode position DEL-02 renders
 * (`delegationPosition`). So `reconcile(account)` here does both jobs from the one
 * on-chain read: advance whatever operation is in flight — never past what
 * `delegatesOf`/`balanceOf` actually show, and NEVER succeeded from the submit, only from
 * this read — and refresh the position surfaced to the state panel.
 *
 * `reads`/`buildPlan` need no key. `submit` only forwards the plan to the host's own
 * wallet `onSubmit`; this hook never signs.
 */

export type DelegationOperation = OperationRecord<DelegationIntent, unknown, DelegationPlan>

export interface UseDelegationInput {
  readonly account: `0x${string}` | undefined
  /** The reads/call-builder seam (Task 3); carries the deployment `buildPlan` gates on. */
  readonly adapter: DelegationAdapter | undefined
  readonly operation: DelegationOperation | undefined
  /** Re-reads the account's wrap/delegate/mode position. Read-only; holds no key. */
  readonly reconcile?: (account: `0x${string}`) => Promise<DelegationReads>
  /** Executes the plan's calls via the host's own wallet. The hook never signs. */
  readonly onSubmit?: (plan: DelegationPlan) => Promise<DelegationOperation>
  /** Poll cadence in ms; the host controls it. Default 15s, matching `useBridge`. */
  readonly pollMs?: number
}

export interface UseDelegationResult {
  readonly operation: DelegationOperation | undefined
  readonly isSettled: boolean
  /** observed | unavailable — an absent read is NEVER a confident zero-delegation. */
  readonly position: DelegationPositionView
  /** A failed READING is recorded here; it never moves the operation to failed. */
  readonly error: SerializedError | undefined
  /** Pure and synchronous once a read has landed; `undefined` before the first read —
   *  never plans off reads the hook has not actually observed. */
  buildPlan(intent: DelegationIntent): DelegationPlanResult | undefined
  submit(plan: DelegationPlan): Promise<DelegationOperation | undefined>
}

export function useDelegation(input: UseDelegationInput): UseDelegationResult {
  const { account, adapter, operation: incoming, reconcile, onSubmit, pollMs = 15_000 } = input
  const [operation, setOperation] = useState<DelegationOperation | undefined>(incoming)
  const [reads, setReads] = useState<DelegationReads | undefined>(undefined)
  const [error, setError] = useState<SerializedError | undefined>(undefined)

  // Adopt only a genuinely NEW operation (a different id), exactly as useBridge does — a
  // host that recreates the same operation object every render must not clobber progress.
  const opRef = useRef<DelegationOperation | undefined>(operation)
  useEffect(() => {
    if (incoming?.id !== opRef.current?.id) {
      setOperation(incoming)
      opRef.current = incoming
    }
  }, [incoming])

  useEffect(() => {
    if (!reconcile || !account) return
    let live = true
    const tick = async () => {
      try {
        const next = await reconcile(account)
        if (!live) return
        setReads(next)
        // Advance whatever operation is in flight from this SAME read. `succeeded` comes
        // ONLY from here — never fabricated from the submit.
        const op = opRef.current
        if (op && !isTerminal(op.state)) {
          const advanced = reconcileDelegation(op, next, op.intent, Date.now())
          opRef.current = advanced
          setOperation(advanced)
        }
        // A transient read failure clears once a later poll succeeds (the M8 fix) — a
        // lagged Coston2 RPC must not leave a permanent "reading failed" on a live op.
        setError(undefined)
      } catch (cause) {
        // A failed reading is not a failed delegation. Record it; leave the position and
        // operation exactly where the last good read put them.
        if (live) setError(toSerializedError(cause))
      }
    }
    void tick()
    const timer = setInterval(() => void tick(), pollMs)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [reconcile, account, pollMs])

  const buildPlan = useCallback(
    (intent: DelegationIntent): DelegationPlanResult | undefined => {
      if (!adapter || !account || !reads) return undefined
      return buildDelegationPlan(adapter, adapter.deployment, account, intent, reads)
    },
    [adapter, account, reads],
  )

  const submit = useCallback(
    async (plan: DelegationPlan): Promise<DelegationOperation | undefined> => {
      if (!onSubmit) return undefined
      try {
        const next = await onSubmit(plan)
        opRef.current = next
        setOperation(next)
        return next
      } catch (cause) {
        setError(toSerializedError(cause))
        return undefined
      }
    },
    [onSubmit],
  )

  return {
    operation,
    isSettled: operation ? isTerminal(operation.state) : false,
    position: delegationPosition(reads),
    error,
    buildPlan,
    submit,
  }
}
