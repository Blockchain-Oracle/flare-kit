import {
  type ClaimIntent,
  type ClaimPlanResult,
  type OperationRecord,
  type RewardsAdapter,
  type RewardsClaimPlan,
  type RewardsReads,
  type SerializedError,
  buildRewardsClaimPlan,
  toSerializedError,
} from '@flare-kit/core'
import { useCallback, useEffect, useState } from 'react'
import { useBridge } from './use-bridge.js'

/**
 * `useRewards` — the three M10 claim ops (M10-R10). The three kinds are DISTINCT
 * (R-REWARD-002) and are never collapsed: each reuses the SAME durable op-poll
 * `useBridge` uses (its own `operation` + a host `reconcile: (op) => Promise<op>`), as
 * three genuinely independent hook instances — ftso reaching `succeeded` cannot move rnat
 * or flaredrop, because each keeps its own state. Unlike `useDelegation`'s
 * `reconcileDelegation` (which derives its own confirmation from a chain read),
 * `reconcileClaim` takes an externally-decided `confirmed: boolean` (each kind's "did
 * this land" check is genuinely different — a claimed reward, a decreased locked
 * balance, a month leaving `claimableMonths`), so the host's `reconcile` closure owns
 * that decision per kind, exactly mirroring `useGasless`'s relayer-confirmation closure.
 *
 * The claimable position (`RewardsReads`) is polled separately — it is not tied to any
 * one kind's operation, since a `no-entitlement` / `proof-unavailable` / `concluded`
 * empty read has no operation to advance at all.
 */

export type RewardsOperation = OperationRecord<ClaimIntent, unknown, RewardsClaimPlan>

export interface UseRewardsKindInput {
  readonly operation?: RewardsOperation
  /** Re-reads THIS kind's confirmation and advances its op. Read-only; holds no key. */
  readonly reconcile?: (op: RewardsOperation) => Promise<RewardsOperation>
}

export interface UseRewardsInput {
  readonly account: `0x${string}` | undefined
  /** The reads/call-builder seam (Task 7); carries the deployment `buildPlan` gates on. */
  readonly adapter: RewardsAdapter | undefined
  /** Re-reads the account's FTSO/RNat/FlareDrop claimable position. Read-only, no key. */
  readonly reconcile?: (account: `0x${string}`) => Promise<RewardsReads>
  /** Executes the plan's calls via the host's own wallet. The hook never signs. */
  readonly onSubmit?: (plan: RewardsClaimPlan) => Promise<RewardsOperation>
  /** Poll cadence in ms; the host controls it. Default 15s, matching `useBridge`. */
  readonly pollMs?: number
  readonly ftso?: UseRewardsKindInput
  readonly rnat?: UseRewardsKindInput
  readonly flaredrop?: UseRewardsKindInput
}

export interface ClaimKindResult {
  readonly operation: RewardsOperation | undefined
  readonly isSettled: boolean
  /** A failed READING for THIS kind; it never moves this kind's op to failed. */
  readonly error: SerializedError | undefined
}

/** The FTSO proof-fetch surface: a real proof, or the DECLARED `proof-unavailable` —
 *  never a claimable amount conjured from an absent proof. */
export type FtsoProofResult =
  | { readonly status: 'available'; readonly amount: bigint; readonly claimType: number; readonly proof: readonly `0x${string}`[] }
  | { readonly status: 'proof-unavailable' }

export interface UseRewardsResult {
  readonly reads: RewardsReads | undefined
  /** A failed claimable-position READING; it never fabricates an empty read. */
  readonly error: SerializedError | undefined
  /** The three claim kinds, tracked INDEPENDENTLY (R-REWARD-002) — never collapsed. */
  readonly ftso: ClaimKindResult
  readonly rnat: ClaimKindResult
  readonly flaredrop: ClaimKindResult
  /** Pure and synchronous once a read has landed; `undefined` before the first read. */
  buildPlan(intent: ClaimIntent): ClaimPlanResult | undefined
  submit(plan: RewardsClaimPlan): Promise<RewardsOperation | undefined>
  fetchProof(epoch: number): Promise<FtsoProofResult>
}

export function useRewards(input: UseRewardsInput): UseRewardsResult {
  const { account, adapter, reconcile, onSubmit, pollMs = 15_000, ftso, rnat, flaredrop } = input
  const [reads, setReads] = useState<RewardsReads | undefined>(undefined)
  const [error, setError] = useState<SerializedError | undefined>(undefined)

  useEffect(() => {
    if (!reconcile || !account) return
    let live = true
    const tick = async () => {
      try {
        const next = await reconcile(account)
        if (!live) return
        setReads(next)
        // A transient read failure clears once a later poll succeeds (the M8 fix).
        setError(undefined)
      } catch (cause) {
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

  // Each kind reuses the SAME durable op-poll useBridge/useGasless use — three
  // independent hook instances (independent React state), never collapsed.
  const ftsoPoll = useBridge({ operation: ftso?.operation, reconcile: ftso?.reconcile, pollMs })
  const rnatPoll = useBridge({ operation: rnat?.operation, reconcile: rnat?.reconcile, pollMs })
  const flaredropPoll = useBridge({ operation: flaredrop?.operation, reconcile: flaredrop?.reconcile, pollMs })

  const buildPlan = useCallback(
    (intent: ClaimIntent): ClaimPlanResult | undefined => {
      if (!adapter || !account || !reads) return undefined
      return buildRewardsClaimPlan(adapter, adapter.deployment, account, intent, reads)
    },
    [adapter, account, reads],
  )

  const submit = useCallback(
    async (plan: RewardsClaimPlan): Promise<RewardsOperation | undefined> => {
      if (!onSubmit) return undefined
      try {
        return await onSubmit(plan)
      } catch (cause) {
        setError(toSerializedError(cause))
        return undefined
      }
    },
    [onSubmit],
  )

  const fetchProof = useCallback(
    async (epoch: number): Promise<FtsoProofResult> => {
      if (!adapter || !account) return { status: 'proof-unavailable' }
      const proof = await adapter.fetchFtsoProof(epoch, account)
      if (!proof) return { status: 'proof-unavailable' }
      return { status: 'available', amount: proof.amount, claimType: proof.claimType, proof: proof.proof }
    },
    [adapter, account],
  )

  return {
    reads,
    error,
    ftso: { operation: ftsoPoll.operation, isSettled: ftsoPoll.isSettled, error: ftsoPoll.error },
    rnat: { operation: rnatPoll.operation, isSettled: rnatPoll.isSettled, error: rnatPoll.error },
    flaredrop: { operation: flaredropPoll.operation, isSettled: flaredropPoll.isSettled, error: flaredropPoll.error },
    buildPlan,
    submit,
    fetchProof,
  }
}
