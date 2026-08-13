import {
  type Eligibility,
  type GovernanceCall,
  type GovernanceIntent,
  type GovernanceOperation,
  type GovernancePlan,
  type GovernancePlanResult,
  type GovernancePositionView,
  type GovernanceVoteReads,
  type SerializedError,
  applyTransition,
  createOperation,
  governancePosition,
  isTerminal,
  planGovernance,
  readEligibility,
  readGovernanceVotes,
  reconcileGovernance,
  toSerializedError,
} from '@flare-kit/core'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * `useGovernance` — the durable M12 governance-delegation poll, thin over the governance
 * op (mirrors `useDelegation`/`useStaking`'s durable-poll shape: state + a write path + a
 * polled `reconcile`). Governance vote power is ALL-OR-NOTHING to one delegate
 * (`GovernanceVotePower.delegate`/`.undelegate`), and its outcome lives in
 * `getDelegateOfAtNow`, not a transaction receipt — so a broadcast delegate/undelegate is
 * only `submitted` until the SAME poll read that refreshes the VP/delegate position also
 * drives `reconcileGovernance`. `succeeded` is entered ONLY from that read-back, never from
 * the submission — a submitted-but-unreflected delegate stays `awaiting_external`.
 *
 * Reads and `plan` are KEYLESS: `readGovernanceVotes`/`readEligibility` and `planGovernance`
 * need no wallet at all. `delegate(to)`/`undelegate()` are the one exception: signing
 * REQUIRES the caller's own injected `walletClient` — a person's or an agent's key, per
 * `.thoughts/decisions/2026-08-03-agent-facing-surfaces.md`. Without one the write path is
 * a clearly-disabled no-op (`canWrite: false`); it NEVER fabricates a submission.
 *
 * Sign-in-hook, not `useDelegation`'s decoupled `onSubmit`: the M12 plan states browser
 * surfaces "sign only via the caller's injected `walletClient` and never hold a key", and
 * governance's single-target delegate has no separate quote/review leg for a host to
 * intercept — build-and-submit is one atomic action, so injecting the wallet directly (built
 * calls via `buildDelegateCall`/`buildUndelegateCall`, submitted via
 * `walletClient.writeContract`) is both the spec's literal shape and the simpler one here.
 */

/** viem's `PublicClient`, obtained transitively through core's read signature so this
 *  package names it without a direct `viem` import (mirrors `use-staking.ts`'s
 *  `StakeEvmClient` — react stays viem-free; no new dependency this milestone). */
export type GovernanceEvmClient = Parameters<typeof readGovernanceVotes>[0]

/** The governance deployment type, obtained the same transitive way (mirrors
 *  `StakingDeployment` in `use-staking.ts`) — no direct `@flare-kit/contracts` dependency. */
export type GovernanceDeployment = Parameters<typeof readGovernanceVotes>[1]

/** The one write capability `delegate`/`undelegate` need from a `viem` `WalletClient`: submit
 *  one already-built governance call, returning its transaction hash. Kept structural — not
 *  a direct `viem` import — so react stays viem-free; a real `WalletClient` satisfies it
 *  directly (mirrors `live-governance.mjs`'s `walletClient.writeContract(request)`). */
export interface GovernanceWalletClient {
  writeContract(call: GovernanceCall & { account: `0x${string}` }): Promise<`0x${string}`>
}

export interface UseGovernanceInput {
  readonly deployment: GovernanceDeployment
  readonly account: `0x${string}`
  readonly publicClient: GovernanceEvmClient
  /** The caller's own wallet (person or agent key). Absent = read/plan only; the hook never signs. */
  readonly walletClient?: GovernanceWalletClient
  /** A previously-persisted operation to resume reconciling on mount — there is no Resume button. */
  readonly operation?: GovernanceOperation
  /** Poll cadence in ms; the host controls it. Default 15s, matching `useDelegation`/`useStaking`. */
  readonly pollMs?: number
}

export interface UseGovernanceResult {
  /** The keyless VP + delegate read (`getVotes`/`getDelegateOfAtNow`); undefined before the first read. */
  readonly reads: GovernanceVoteReads | undefined
  /** The keyless eligibility read; `isMember` is `undefined` on the observed `PollingFtso` revert. */
  readonly eligibility: Eligibility | undefined
  /** observed | unavailable — an absent read is NEVER a confident zero/no-delegate. */
  readonly position: GovernancePositionView
  readonly operation: GovernanceOperation | undefined
  readonly isSettled: boolean
  /** True once a `walletClient` is injected AND a read has landed — `delegate`/`undelegate`
   *  are a no-op until both hold, so this reports the write path's actual availability, not
   *  just the presence of a wallet. */
  readonly canWrite: boolean
  /** A failed READ or a refused/failed WRITE; never moves the operation to failed itself. */
  readonly error: SerializedError | undefined
  /** Pure and synchronous once a read has landed; `undefined` before — never plans off a read
   *  the hook has not actually observed. Keyless: needs no `walletClient`. */
  plan(intent: GovernanceIntent): GovernancePlanResult | undefined
  /** Builds a delegate(to) call and submits it via the injected `walletClient`; a no-op
   *  (never a fabricated submission) without one or before a read has landed. */
  delegate(to: `0x${string}`): void
  /** Builds an undelegate() call and submits it via the injected `walletClient`; a no-op
   *  under the same conditions as `delegate`. */
  undelegate(): void
}

/** Walk the plan to a SUBMITTED governance op — the legal state path (`applyTransition`
 *  drops a patch on an illegal jump), exactly as `useStaking`'s `toSubmittedStakeOp` does.
 *  `succeeded` comes later, only from the poll's read-back. */
function toSubmittedGovernanceOp(plan: GovernancePlan, network: number, now: number): GovernanceOperation {
  const base = createOperation<GovernanceIntent, unknown, GovernancePlan>({ capability: 'governance', network, intent: plan.intent, now })
  const quoting = applyTransition(base, { to: 'quoting', at: now, patch: { steps: [...plan.steps], plan } }).record
  const ready = applyTransition(quoting, { to: 'ready', at: now }).record
  const executing = applyTransition(ready, { to: 'executing', at: now }).record
  return applyTransition(executing, { to: 'submitted', at: now }).record
}

export function useGovernance(input: UseGovernanceInput): UseGovernanceResult {
  const { deployment, account, publicClient, walletClient, operation: incoming, pollMs = 15_000 } = input
  const [operation, setOperation] = useState<GovernanceOperation | undefined>(incoming)
  const [reads, setReads] = useState<GovernanceVoteReads | undefined>(undefined)
  const [eligibility, setEligibility] = useState<Eligibility | undefined>(undefined)
  const [error, setError] = useState<SerializedError | undefined>(undefined)

  // Adopt only a genuinely NEW operation (a different id), exactly as useDelegation/useStaking do.
  const opRef = useRef<GovernanceOperation | undefined>(operation)
  useEffect(() => {
    if (incoming?.id !== opRef.current?.id) {
      setOperation(incoming)
      opRef.current = incoming
    }
  }, [incoming])

  useEffect(() => {
    if (!publicClient || !account) return
    let live = true
    const tick = async () => {
      try {
        const [nextReads, nextEligibility] = await Promise.all([
          readGovernanceVotes(publicClient, deployment, account),
          readEligibility(publicClient, deployment, account),
        ])
        if (!live) return
        setReads(nextReads)
        setEligibility(nextEligibility)
        // Advance whatever operation is in flight from this SAME read. `succeeded` comes
        // ONLY from here — never fabricated from the submit.
        const op = opRef.current
        if (op && nextReads && !isTerminal(op.state)) {
          const advanced = reconcileGovernance(op, nextReads, Date.now())
          opRef.current = advanced
          setOperation(advanced)
        }
        // A transient read failure clears once a later poll succeeds — a lagged RPC must
        // not leave a permanent "reading failed" on a live op.
        setError(undefined)
      } catch (cause) {
        // A failed reading is not a failed governance op. Record it; leave the position and
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
  }, [publicClient, deployment, account, pollMs])

  const plan = useCallback(
    (intent: GovernanceIntent): GovernancePlanResult | undefined => {
      if (!reads) return undefined
      return planGovernance({ intent, deployment, reads, account })
    },
    [deployment, account, reads],
  )

  const submit = useCallback(
    async (intent: GovernanceIntent) => {
      // Signing REQUIRES the injected walletClient AND a landed read — the hook never
      // fabricates a submission off an intent it cannot yet plan.
      if (!walletClient || !reads) return
      const result = planGovernance({ intent, deployment, reads, account })
      if (!result.ok) {
        setError(toSerializedError(new Error(`governance plan refused: ${result.error.code}`)))
        return
      }
      const call = result.plan.calls[0]
      if (!call) return
      try {
        await walletClient.writeContract({ ...call, account })
        const op = toSubmittedGovernanceOp(result.plan, deployment.chainId, Date.now())
        opRef.current = op
        setOperation(op)
        setError(undefined)
      } catch (cause) {
        setError(toSerializedError(cause))
      }
    },
    [walletClient, reads, deployment, account],
  )

  const delegate = useCallback((to: `0x${string}`) => void submit({ kind: 'delegate', to }), [submit])
  const undelegate = useCallback(() => void submit({ kind: 'undelegate' }), [submit])

  return {
    reads,
    eligibility,
    position: governancePosition(reads),
    operation,
    isSettled: operation ? isTerminal(operation.state) : false,
    canWrite: Boolean(walletClient) && reads !== undefined,
    error,
    plan,
    delegate,
    undelegate,
  }
}
