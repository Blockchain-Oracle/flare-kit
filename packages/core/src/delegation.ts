// packages/core/src/delegation.ts
import type { DelegationDeployment } from '@flarekit-dev/contracts'
import type { OperationStep } from './operation.js'
import type { DelegationAdapter, DelegationCall, DelegationReads } from './delegation-adapter.js'

/**
 * The M10 delegation plan builder — wrap / unwrap / delegate (percentage) /
 * delegate-explicit (amount) / undelegate. It mirrors the vault plan-builder Result
 * convention (`buildDepositPlan`): a discriminated `{ kind: 'plan' } | { kind: 'error' }`,
 * never a thrown error and never a partially-built call.
 *
 * Two honesty guarantees are structural here:
 *
 *  1. The VERIFIED GATE runs FIRST — before any invariant, read or call. Until Task 5
 *     flips `deployment.delegationVerified`, the surface may show configuration but the
 *     kit refuses to emit a signable plan that would spend real vote power on a path
 *     never driven live on this network (the M10 analog of the vault `not_verified`
 *     gate and `bridge`/`gasless` verification flags).
 *
 *  2. Every invariant the protocol would silently no-op is caught BEFORE a call is built:
 *     the two-delegate cap, the 100% (10000 bips) ceiling, delegation-mode exclusivity
 *     (a percentage delegate is ignored/reverts under AMOUNT mode and vice-versa — and the
 *     mode never resets, not even after undelegating, so the conflict is permanent for
 *     the account), and the wrapped-balance floor for explicit amounts
 *     and unwraps. We refuse rather than sign a call that burns gas to do nothing.
 *
 * `reads` is a snapshot passed in (Task 3's `DelegationAdapter.read`), so the builder is
 * pure and synchronous; the `adapter` is used only for its unsigned `build*` calls.
 */

export type DelegationIntent =
  | { readonly kind: 'wrap'; readonly amount: bigint }
  | { readonly kind: 'unwrap'; readonly amount: bigint }
  | {
      readonly kind: 'delegate'
      readonly targets: readonly { readonly to: `0x${string}`; readonly bips: number }[]
    }
  | {
      readonly kind: 'delegate-explicit'
      readonly targets: readonly { readonly to: `0x${string}`; readonly amount: bigint }[]
    }
  | { readonly kind: 'undelegate' }

export type DelegationError =
  | { readonly kind: 'not-verified' }
  | { readonly kind: 'too-many-delegates'; readonly max: 2 }
  | { readonly kind: 'bips-over-100'; readonly sum: number }
  | { readonly kind: 'mode-conflict'; readonly current: 'percentage' | 'amount' }
  | { readonly kind: 'insufficient-wrapped'; readonly have: bigint; readonly need: bigint }

export interface DelegationPlan {
  readonly steps: OperationStep[]
  readonly calls: DelegationCall[]
  readonly intent: DelegationIntent
}

export type DelegationPlanResult =
  | { readonly kind: 'plan'; readonly plan: DelegationPlan }
  | { readonly kind: 'error'; readonly error: DelegationError }

/** 100% of vote power, in bips. The protocol caps a percentage delegation at this sum. */
const MAX_BIPS = 10_000

function walletStep(id: string, type: string): OperationStep {
  return { id, type, actor: 'your_wallet', state: 'pending', attempts: 0 }
}

/** The spine's trailing wait step type — Flare recording the specific intent on-chain. */
function recordType(intent: DelegationIntent): string {
  switch (intent.kind) {
    case 'wrap':
      return 'await_wrap'
    case 'unwrap':
      return 'await_unwrap'
    case 'undelegate':
      return 'await_undelegate'
    default:
      return 'await_delegation'
  }
}

/**
 * The lifecycle spine: one `your_wallet` signature per call, then one `flare` step that
 * the reconciler advances to `done` only once the chain reflects the intent. The record
 * step count is what `reconcileDelegation` walks — all wallet steps `done`, the flare
 * step `active` while awaiting, all `done` at `succeeded`.
 */
function delegationSteps(intent: DelegationIntent, calls: DelegationCall[]): OperationStep[] {
  const steps = calls.map((call, index) => walletStep(`call-${index}`, call.functionName))
  steps.push({ id: 'record', type: recordType(intent), actor: 'flare', state: 'pending', attempts: 0 })
  return steps
}

function asPlan(intent: DelegationIntent, calls: DelegationCall[]): DelegationPlanResult {
  return { kind: 'plan', plan: { steps: delegationSteps(intent, calls), calls, intent } }
}

function asError(error: DelegationError): DelegationPlanResult {
  return { kind: 'error', error }
}

/**
 * The unsigned delegation plan. The verified gate runs FIRST; then the invariants; then —
 * and only then — the adapter builds the calls. `account` is part of the signing edge's
 * contract (Task 5) and is not needed to shape the plan.
 */
export function buildDelegationPlan(
  adapter: DelegationAdapter,
  deployment: DelegationDeployment,
  account: `0x${string}`,
  intent: DelegationIntent,
  reads: DelegationReads,
): DelegationPlanResult {
  // 1. Verified gate FIRST — before any invariant, read or call.
  if (!deployment.delegationVerified) return asError({ kind: 'not-verified' })

  // 2. Invariants BEFORE producing calls; 3. build the calls once the intent is legal.
  switch (intent.kind) {
    case 'wrap':
      return asPlan(intent, [adapter.buildWrap(intent.amount)])

    case 'unwrap': {
      if (intent.amount > reads.wrappedBalance) {
        return asError({ kind: 'insufficient-wrapped', have: reads.wrappedBalance, need: intent.amount })
      }
      return asPlan(intent, [adapter.buildUnwrap(intent.amount)])
    }

    case 'delegate': {
      if (intent.targets.length > deployment.maxPercentDelegates) {
        return asError({ kind: 'too-many-delegates', max: 2 })
      }
      const sum = intent.targets.reduce((total, target) => total + target.bips, 0)
      if (sum > MAX_BIPS) return asError({ kind: 'bips-over-100', sum })
      // Mode exclusivity: a percentage delegate silently no-ops under AMOUNT mode.
      if (reads.mode === 2) return asError({ kind: 'mode-conflict', current: 'amount' })
      const targets = intent.targets.map((target) => ({ to: target.to, bips: target.bips }))
      const call =
        targets.length === 1
          ? adapter.buildDelegate(targets[0]!.to, targets[0]!.bips)
          : adapter.buildBatchDelegate(targets)
      return asPlan(intent, [call])
    }

    case 'delegate-explicit': {
      // Mode exclusivity: an explicit-amount delegate silently no-ops under PERCENTAGE mode.
      if (reads.mode === 1) return asError({ kind: 'mode-conflict', current: 'percentage' })
      const need = intent.targets.reduce((total, target) => total + target.amount, 0n)
      if (need > reads.wrappedBalance) {
        return asError({ kind: 'insufficient-wrapped', have: reads.wrappedBalance, need })
      }
      const calls = intent.targets.map((target) => adapter.buildDelegateExplicit(target.to, target.amount))
      return asPlan(intent, calls)
    }

    case 'undelegate':
      return asPlan(intent, [adapter.buildUndelegateAll()])
  }
}
