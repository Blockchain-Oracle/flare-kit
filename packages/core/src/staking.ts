// packages/core/src/staking.ts
import type { StakingDeployment } from '@flarekit-dev/contracts'
import type { OperationStep } from './operation.js'
import type { StakeIntent, StakeLimits } from './stake-adapter.js'
import type { ValidatorInfo } from './pchain-rpc.js'

/**
 * The M11 stake plan builder — turn a structured `StakeIntent` into a signable plan, or
 * refuse it. It mirrors the M10 delegation Result convention (`buildDelegationPlan`): a
 * discriminated `{ ok:true } | { ok:false }`, never a thrown error and never a
 * partially-built plan.
 *
 * Two honesty guarantees are structural here:
 *
 *  1. The VERIFIED GATE runs FIRST — before any bound. Until a live round trip flips
 *     `deployment.stakeVerified`, the surface may show the configured staking path but the
 *     kit refuses to emit a signable plan that would irreversibly lock real FLR on a path
 *     never driven live on this network (the M11 analog of the delegation `not-verified`
 *     gate).
 *
 *  2. Every bound is enforced from the LIVE-read `StakeLimits` (from
 *     `PChainStakeMirrorVerifier` / `platform.getMinStake`) and the LIVE validator set —
 *     never a docs literal. Amount ≥ min / ≤ max, min ≤ duration ≤ max, and the stake's
 *     `endTime` cannot outlive its chosen validator's active window (a stake to a validator
 *     whose registration ends first would strand the delegation).
 *
 * The plan surfaces the irreversible ≥14-day value-lock as explicit `valueLock` data so
 * the surface can state the non-reversible commitment BEFORE signing (the way the rNat 50%
 * burn was surfaced). The lifecycle (`stake-states.ts`) reconciles the resulting op.
 */

/** The irreversible value commitment, stated as explicit data before signing. */
export interface StakeValueLock {
  /** The amount irreversibly committed, in wei. */
  readonly amount: bigint
  /** The unix second the stake unlocks — equal to `intent.endTime`. */
  readonly unlockAt: bigint
  /** How long the stake is locked, in seconds (`endTime − startTime`). */
  readonly lockSeconds: bigint
  /** Structural: the stake cannot be exited before `unlockAt`. Always `true`. */
  readonly irreversible: true
}

export interface StakePlan {
  readonly steps: OperationStep[]
  readonly intent: StakeIntent
  readonly valueLock: StakeValueLock
}

export type StakeInvariantError =
  | { readonly code: 'unverified' }
  | { readonly code: 'amount_below_min'; readonly min: bigint }
  | { readonly code: 'amount_above_max'; readonly max: bigint }
  | { readonly code: 'duration_below_min'; readonly min: bigint }
  | { readonly code: 'duration_above_max'; readonly max: bigint }
  | { readonly code: 'ends_after_validator'; readonly validatorEnd: bigint }

export type StakePlanResult =
  | { readonly ok: true; readonly plan: StakePlan }
  | { readonly ok: false; readonly error: StakeInvariantError }

function walletStep(id: string, type: string): OperationStep {
  return { id, type, actor: 'your_wallet', state: 'pending', attempts: 0 }
}

/**
 * The stake-in spine: the two signed P-chain legs (`transferToP` = C→P export+import, then
 * the `AddPermissionlessDelegator` delegate) followed by the one `flare` record step the
 * reconciler advances to `done` only once `readStakesOf` reflects the position on-chain.
 * The delayed P→C return is its OWN operation (a separate spine), not a same-session step.
 */
function stakeSteps(): OperationStep[] {
  return [
    walletStep('export', 'transfer_to_p'),
    walletStep('delegate', 'delegate'),
    { id: 'record', type: 'await_stake', actor: 'flare', state: 'pending', attempts: 0 },
  ]
}

function ok(intent: StakeIntent): StakePlanResult {
  return {
    ok: true,
    plan: {
      steps: stakeSteps(),
      intent,
      valueLock: {
        amount: intent.amount,
        unlockAt: intent.endTime,
        lockSeconds: intent.endTime - intent.startTime,
        irreversible: true,
      },
    },
  }
}

function err(error: StakeInvariantError): StakePlanResult {
  return { ok: false, error }
}

/**
 * Build the unsigned stake plan. The verified gate runs FIRST; then the live-read bounds
 * in the M11-R4 order (amount, duration, validator window); then — and only then — the
 * plan (with its value-lock disclosure) is produced.
 */
export function planStake(args: {
  intent: StakeIntent
  deployment: StakingDeployment
  limits: StakeLimits
  validators: ValidatorInfo[]
}): StakePlanResult {
  const { intent, deployment, limits, validators } = args

  // 1. Verified gate FIRST — before any bound.
  if (!deployment.stakeVerified) return err({ code: 'unverified' })

  // 2. Amount within the LIVE-read bounds (inclusive).
  if (intent.amount < limits.minAmount) return err({ code: 'amount_below_min', min: limits.minAmount })
  if (intent.amount > limits.maxAmount) return err({ code: 'amount_above_max', max: limits.maxAmount })

  // 3. Duration within the LIVE-read bounds (inclusive).
  const duration = intent.endTime - intent.startTime
  if (duration < limits.minDuration) return err({ code: 'duration_below_min', min: limits.minDuration })
  if (duration > limits.maxDuration) return err({ code: 'duration_above_max', max: limits.maxDuration })

  // 4. The stake cannot outlive its validator. A validator absent from the LIVE set has no
  //    active window to honor (validatorEnd 0n), so a positive stake end is always after it.
  const validator = validators.find((candidate) => candidate.nodeId === intent.nodeId)
  const validatorEnd = validator?.endTime ?? 0n
  if (validatorEnd < intent.endTime) return err({ code: 'ends_after_validator', validatorEnd })

  return ok(intent)
}
