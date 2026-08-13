import {
  type PChainStakeExecutor,
  type SerializedError,
  type StakeIntent,
  type StakeLimits,
  type StakeOperation,
  type StakePlan,
  type StakePlanResult,
  type StakePosition,
  type StakePositionView,
  type StakeReturnRead,
  type StakingDeployment,
  type StakingRewardState,
  type ValidatorInfo,
  STAKE_CAPABILITY,
  STAKE_RETURN_CAPABILITY,
  applyTransition,
  createOperation,
  isTerminal,
  planStake,
  readMirrorVotePower,
  readStakeLimits,
  readStakesOf,
  readStakingRewardState,
  readValidators,
  reconcileStake,
  stakePosition,
  toSerializedError,
} from '@flare-kit/core'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * `useStaking` — the durable M11 stake lifecycle + reward-read poll (M11-R9), a thin wrapper
 * over the same M8 durable-poll base `useBridge`/`useDelegation` use. Flare staking is a
 * cross-substrate round trip whose OUTCOME lives on the P-chain, not in a transaction receipt,
 * so a submitted delegate is only `submitted`; the hook re-reads the on-chain position on an
 * interval and `reconcileStake` advances the op. There is no Resume button.
 *
 * Two honesty rules are structural here (they mirror the core reconciler, `stake-states.ts`):
 *
 *  - `succeeded` is entered ONLY from a CONFIRMED read. The stake-in leg reaches `succeeded`
 *    only once `readStakesOf` shows the matching position; the delayed P→C return leg only
 *    once a SUCCESSFUL read shows the stake is gone (`absent`). A submitted leg the chain does
 *    not yet reflect is `awaiting_external`, never `succeeded` from the submission alone.
 *
 *  - A THROWN read is `unavailable`, never `absent` (I2, load-bearing). `readStakesOf` throws
 *    on a transport fault; on the RETURN leg — whose terminal IS `succeeded` — the hook maps a
 *    thrown read to the three-way `unavailable` signal, so the reconciler leaves the op exactly
 *    where it was rather than fabricate `succeeded` with funds still on the P-chain. Only a
 *    successful read becomes `present`/`absent`.
 *
 * Read + plan are KEYLESS (live limits + validators + the non-expiring reward, then `planStake`
 * with its verified gate). Signing is done ONLY through the injected `PChainStakeExecutor` — a
 * person's wallet or an agent key — which the hook receives as an argument and never holds
 * itself. Without an executor the hook reads and plans but cannot sign or read the P-chain
 * position (that needs the executor's P-address). No `flarejs` import lives here.
 */

/** viem's `PublicClient`, obtained transitively through core's read signatures so this package
 *  names it without a direct `viem` import — react stays viem-free. */
export type StakeEvmClient = Parameters<typeof readStakeLimits>[0]

export interface UseStakingInput {
  /** The staking deployment — carries `stakeVerified` (the plan gate) and the EVM addresses. */
  readonly deployment: StakingDeployment | undefined
  /** The C-chain (EVM) account rewards accrue to and the mirrored vote power is read for. */
  readonly account: `0x${string}` | undefined
  /** The P-chain signing seam (wallet or agent key). Absent = read/plan only; the hook never signs. */
  readonly executor?: PChainStakeExecutor
  /** Keyless viem client for the EVM reads (limits, mirrored vote power, reward). */
  readonly publicClient: StakeEvmClient | undefined
  /** The P-chain JSON-RPC base for the keyless validator/stake-position reads. */
  readonly rpcBase: string | undefined
  /** The current stake-in (`staking`) OR delayed return (`staking-return`) operation. */
  readonly operation?: StakeOperation
  /** Poll cadence in ms; the host controls it. Default 15s, matching `useBridge`. */
  readonly pollMs?: number
}

export interface UseStakingResult {
  readonly operation: StakeOperation | undefined
  readonly isSettled: boolean
  /** observed | unavailable — an absent P-chain read is NEVER a confident zero-stake. */
  readonly position: StakePositionView
  /** The live stake bounds (from `PChainStakeMirrorVerifier`); undefined before the read lands. */
  readonly limits: StakeLimits | undefined
  /** The live validator set; undefined before the read lands. */
  readonly validators: ValidatorInfo[] | undefined
  /** The NON-EXPIRING staking reward; undefined before the read lands / on an unavailable read. */
  readonly reward: StakingRewardState | undefined
  /** A failed READING is recorded here; it never moves the operation to failed. */
  readonly error: SerializedError | undefined
  /** Pure and synchronous once limits+validators have landed; undefined before. KEYLESS. */
  buildPlan(intent: StakeIntent): StakePlanResult | undefined
  /** Signs the two stake-in legs via the injected executor and adopts a SUBMITTED op; undefined without one. */
  submit(plan: StakePlan): Promise<StakeOperation | undefined>
}

interface PositionReads {
  readonly stakes: StakePosition[]
  readonly mirroredVotePower: bigint | undefined
}

/** Match a read-back position to an intent by node + unlock window (lenient present-detection:
 *  a false `absent` on the return leg would fabricate `succeeded`). */
function matchPosition(positions: StakePosition[], intent: StakeIntent): StakePosition | undefined {
  return positions.find((p) => p.nodeId === intent.nodeId && p.endTime === intent.endTime)
}

/** Walk the plan to a SUBMITTED stake-in op — the legal path, spine attached at the first legal
 *  hop (`applyTransition` drops a patch on an illegal jump). `succeeded` comes later, from the read. */
function toSubmittedStakeOp(plan: StakePlan, network: number, now: number): StakeOperation {
  const base = createOperation<StakeIntent, unknown, StakePlan>({ capability: STAKE_CAPABILITY, network, intent: plan.intent, now })
  const quoting = applyTransition(base, { to: 'quoting', at: now, patch: { steps: [...plan.steps], plan } }).record
  const ready = applyTransition(quoting, { to: 'ready', at: now }).record
  const executing = applyTransition(ready, { to: 'executing', at: now }).record
  return applyTransition(executing, { to: 'submitted', at: now }).record
}

/** Advance the in-flight op honestly for its leg. The RETURN leg maps a thrown read (`ok:false`)
 *  to `unavailable` — do NOT reconcile — never `absent`/`succeeded` (I2). */
function advanceOp(op: StakeOperation, read: { ok: true; positions: StakePosition[] } | { ok: false }, now: number): StakeOperation {
  if (op.capability === STAKE_RETURN_CAPABILITY) {
    const matched = read.ok ? matchPosition(read.positions, op.intent) : undefined
    const stakeRead: StakeReturnRead = read.ok
      ? matched
        ? { status: 'present', position: matched }
        : { status: 'absent' }
      : { status: 'unavailable' }
    return reconcileStake(op, { leg: 'return', now, stakeRead })
  }
  if (op.capability === STAKE_CAPABILITY) {
    // A failed stake-in reading leaves the op where it was; a successful read (position or the
    // honest in-flight `undefined`) advances it — `succeeded` only from a present position.
    if (!read.ok) return op
    return reconcileStake(op, { leg: 'stake', now, stakePosition: matchPosition(read.positions, op.intent) })
  }
  return op
}

export function useStaking(input: UseStakingInput): UseStakingResult {
  const { deployment, account, executor, publicClient, rpcBase, operation: incoming, pollMs = 15_000 } = input
  const [operation, setOperation] = useState<StakeOperation | undefined>(incoming)
  const [limits, setLimits] = useState<StakeLimits | undefined>(undefined)
  const [validators, setValidators] = useState<ValidatorInfo[] | undefined>(undefined)
  const [reward, setReward] = useState<StakingRewardState | undefined>(undefined)
  const [positionReads, setPositionReads] = useState<PositionReads | undefined>(undefined)
  const [error, setError] = useState<SerializedError | undefined>(undefined)

  // Adopt only a genuinely NEW operation (a different id), exactly as useBridge/useDelegation do.
  const opRef = useRef<StakeOperation | undefined>(operation)
  useEffect(() => {
    if (incoming?.id !== opRef.current?.id) {
      setOperation(incoming)
      opRef.current = incoming
    }
  }, [incoming])

  useEffect(() => {
    let live = true

    const tick = async () => {
      const now = Math.floor(Date.now() / 1000)

      // 1) Keyless planning reads (limits + validators) — no executor needed.
      if (deployment && publicClient && rpcBase) {
        try {
          const [nextLimits, nextValidators] = await Promise.all([
            readStakeLimits(publicClient, deployment.pChainStakeMirrorVerifier),
            readValidators(rpcBase),
          ])
          if (!live) return
          setLimits(nextLimits)
          setValidators(nextValidators)
          setError(undefined)
        } catch (cause) {
          if (live) setError(toSerializedError(cause))
        }
      }

      // 2) Keyless non-expiring reward read. A throw is `unavailable` — leave the last value,
      //    never a fabricated zero (a genuine on-chain (0,0) is a real read, `claimable 0n`).
      if (deployment && publicClient && account) {
        try {
          const next = await readStakingRewardState(publicClient, deployment.validatorRewardManager, account)
          if (live) setReward(next)
        } catch (cause) {
          if (live) setError(toSerializedError(cause))
        }
      }

      // 3) The stake-position read + op advance — needs the executor's P-address.
      if (executor && deployment && publicClient && rpcBase && account) {
        let read: { ok: true; positions: StakePosition[] } | { ok: false }
        try {
          const pAddress = await executor.getPAddress()
          read = { ok: true, positions: await readStakesOf(rpcBase, pAddress) }
        } catch (cause) {
          read = { ok: false }
          if (live) setError(toSerializedError(cause))
        }
        if (!live) return
        if (read.ok) {
          // Pair the observed stakes with the mirrored vote power (its own honesty: `undefined`
          // on a reverting mirror, carried through rather than collapsed to zero).
          const mirroredVotePower = await readMirrorVotePower(publicClient, deployment.pChainStakeMirror, account)
          if (!live) return
          setPositionReads({ stakes: read.positions, mirroredVotePower })
          setError(undefined)
        }
        const op = opRef.current
        if (op && !isTerminal(op.state)) {
          const advanced = advanceOp(op, read, now)
          if (advanced !== op) {
            opRef.current = advanced
            setOperation(advanced)
          }
        }
      }
    }

    void tick()
    const timer = setInterval(() => void tick(), pollMs)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [deployment, account, executor, publicClient, rpcBase, pollMs])

  const buildPlan = useCallback(
    (intent: StakeIntent): StakePlanResult | undefined => {
      if (!deployment || !limits || !validators) return undefined
      return planStake({ intent, deployment, limits, validators })
    },
    [deployment, limits, validators],
  )

  const submit = useCallback(
    async (plan: StakePlan): Promise<StakeOperation | undefined> => {
      // Signing REQUIRES the injected executor — the hook never signs on its own.
      if (!executor || !publicClient) return undefined
      const network = publicClient.chain?.id
      if (network === undefined) return undefined
      try {
        // The two signed P-chain legs: C→P export/import, then AddPermissionlessDelegator.
        await executor.transferToP(plan.intent.amount)
        await executor.delegate(plan.intent)
        const op = toSubmittedStakeOp(plan, network, Math.floor(Date.now() / 1000))
        opRef.current = op
        setOperation(op)
        return op
      } catch (cause) {
        setError(toSerializedError(cause))
        return undefined
      }
    },
    [executor, publicClient],
  )

  return {
    operation,
    isSettled: operation ? isTerminal(operation.state) : false,
    position: stakePosition(positionReads),
    limits,
    validators,
    reward,
    error,
    buildPlan,
    submit,
  }
}
