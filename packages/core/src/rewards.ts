// packages/core/src/rewards.ts
import type { ClaimKind, RewardsDeployment } from '@flarekit-dev/contracts'
import type { OperationStep } from './operation.js'
import type { FtsoReward, RewardsAdapter, RewardsCall, RewardsReads } from './rewards-adapter.js'

/**
 * The claim plan builder — FOUR DISTINCT claim kinds (M10's three + M11's staking), never collapsed into one
 * generic claim (R-REWARD-002). It mirrors the vault/delegation plan-builder Result
 * convention (`{ kind: 'plan' } | { kind: 'error' }`): never a thrown error, never a
 * partially-built call.
 *
 * Two honesty guarantees are structural here:
 *
 *  1. The VERIFIED GATE runs FIRST — before any per-kind check. `rewardsVerified` is
 *     CARRIED false past M10 (the blank-slate account earned nothing across the epoch
 *     range and there is no official Coston2 reward API), so the kit refuses to emit a
 *     signable claim plan that has never been driven live on this network — exactly as
 *     M10's delegation gate and M9's gasless/x402 verification flags do.
 *
 *  2. Each kind is gated on its OWN reality and carries its OWN facts:
 *     - `ftso-delegation`: no rewards → `no-entitlement`; a reward whose Merkle proof was
 *       never fetched (the unofficial mirror had none) → `proof-unavailable` with the
 *       epoch; otherwise a `claim` on the RewardManager carrying the proofs.
 *     - `rnat`: no project assigned rewards → `no-entitlement`; otherwise `claimRewards`
 *       (or `withdrawAll`, the 50%-burn path, for the withdraw intent).
 *     - `flaredrop`: nothing claimable → `concluded` (Coston2's FlareDrop ended 2026-01-30).
 *     - `staking` (M11): the NON-EXPIRING `ValidatorRewardManager` reward — `claimable 0`
 *       (`total === claimed`) → honest `no-entitlement` (a delayed leg, never a faked amount);
 *       otherwise a `claim` for the claimable delta. It carries NO epoch expiry — it must never
 *       emit M10's "rewards expire in N epochs" / 25-epoch delegation line.
 *
 * `reads` is a snapshot passed in (Task 8's `RewardsAdapter.read`), so the builder is pure
 * and synchronous; `adapter` is used only for its unsigned `build*` calls, and `account`
 * is the reward owner (part of the signing edge's contract, as in delegation).
 */

export type { ClaimKind }

export type ClaimIntent =
  | { readonly kind: 'ftso-delegation'; readonly recipient: `0x${string}`; readonly wrap: boolean }
  | {
      readonly kind: 'rnat'
      readonly projectIds: bigint[]
      readonly month: number
      /** The withdraw intent takes the 50%-burn `withdrawAll` path instead of `claimRewards`. */
      readonly withdraw?: boolean
      readonly wrap?: boolean
    }
  | { readonly kind: 'flaredrop'; readonly recipient: `0x${string}`; readonly month: number; readonly wrap: boolean }
  /** The NON-EXPIRING staking reward — claims the claimable delta (from `reads.staking`) to `recipient`. */
  | { readonly kind: 'staking'; readonly recipient: `0x${string}`; readonly wrap: boolean }

export type ClaimError =
  | { readonly kind: 'not-verified' }
  | { readonly kind: 'no-entitlement' }
  | { readonly kind: 'proof-unavailable'; readonly epoch: number }
  | { readonly kind: 'concluded' }

/** Named `RewardsClaimPlan` (not `ClaimPlan`) to avoid colliding with the vault claim
 *  plan already exported from `vault.ts` — the three DISTINCT reward kinds, one carrier. */
export interface RewardsClaimPlan {
  readonly steps: OperationStep[]
  readonly calls: RewardsCall[]
  readonly claimKind: ClaimKind
}

export type ClaimPlanResult =
  | { readonly kind: 'plan'; readonly plan: RewardsClaimPlan }
  | { readonly kind: 'error'; readonly error: ClaimError }

function walletStep(id: string, type: string): OperationStep {
  return { id, type, actor: 'your_wallet', state: 'pending', attempts: 0 }
}

/** The trailing `flare` wait step — Flare confirming the specific, DISTINCT claim kind. */
function recordType(claimKind: ClaimKind): string {
  switch (claimKind) {
    case 'ftso-delegation':
      return 'await_ftso_claim'
    case 'rnat':
      return 'await_rnat_claim'
    case 'flaredrop':
      return 'await_flaredrop_claim'
    case 'staking':
      return 'await_staking_claim'
  }
}

/** One `your_wallet` signature per call, then one `flare` step the reconciler advances. */
function claimSteps(claimKind: ClaimKind, calls: RewardsCall[]): OperationStep[] {
  const steps = calls.map((call, index) => walletStep(`call-${index}`, call.functionName))
  steps.push({ id: 'record', type: recordType(claimKind), actor: 'flare', state: 'pending', attempts: 0 })
  return steps
}

function asPlan(claimKind: ClaimKind, calls: RewardsCall[]): ClaimPlanResult {
  return { kind: 'plan', plan: { steps: claimSteps(claimKind, calls), calls, claimKind } }
}

function asError(error: ClaimError): ClaimPlanResult {
  return { kind: 'error', error }
}

/**
 * The unsigned claim plan. The verified gate runs FIRST; then the per-kind reality; then —
 * and only then — the adapter builds the calls. `account` is the reward owner.
 *
 * Named `buildRewardsClaimPlan` (not `buildClaimPlan`) because `vault.ts` already exports a
 * `buildClaimPlan` for the vault-withdrawal claim; the two must not collide in the barrel.
 */
export function buildRewardsClaimPlan(
  adapter: RewardsAdapter,
  deployment: RewardsDeployment,
  account: `0x${string}`,
  intent: ClaimIntent,
  reads: RewardsReads,
): ClaimPlanResult {
  // 1. Verified gate FIRST — carried false past M10.
  if (!deployment.rewardsVerified) return asError({ kind: 'not-verified' })

  // 2. Per DISTINCT kind — gated on its own reality, carrying its own facts.
  switch (intent.kind) {
    case 'ftso-delegation': {
      if (reads.ftso.length === 0) return asError({ kind: 'no-entitlement' })
      const missing = reads.ftso.find((reward: FtsoReward) => reward.proof.length === 0)
      if (missing) return asError({ kind: 'proof-unavailable', epoch: missing.epoch })
      return asPlan('ftso-delegation', [adapter.buildFtsoClaim(account, intent.recipient, reads.ftso, intent.wrap)])
    }

    case 'rnat': {
      if (!reads.rnat.hasProject) return asError({ kind: 'no-entitlement' })
      const call = intent.withdraw
        ? adapter.buildRnatWithdrawAll(intent.wrap ?? false)
        : adapter.buildRnatClaim(intent.projectIds, intent.month)
      return asPlan('rnat', [call])
    }

    case 'flaredrop': {
      if (reads.flaredrop.claimableMonths.length === 0) return asError({ kind: 'concluded' })
      return asPlan('flaredrop', [adapter.buildFlareDropClaim(account, intent.recipient, intent.month, intent.wrap)])
    }

    case 'staking': {
      // Honest-empty (a delayed leg) when there is no claimable delta — never a fabricated amount.
      // NON-EXPIRING: no epoch/expiry is read or emitted here (that is M10's ftso-delegation rule).
      if (reads.staking.claimable <= 0n) return asError({ kind: 'no-entitlement' })
      return asPlan('staking', [adapter.buildStakingClaim(account, intent.recipient, reads.staking.claimable, intent.wrap)])
    }
  }
}
