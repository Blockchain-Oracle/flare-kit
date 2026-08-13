// packages/react-ui/src/claim-card-state.ts
import type {
  ClaimIntent,
  ClaimKind,
  ClaimPlanResult,
  FtsoReward,
  OperationRecord,
  RewardsClaimPlan,
  RewardsReads,
} from '@flarekit-dev/core'
import type { Cta } from './card-chrome.js'

/**
 * How a claim operation + the account's claimable position become the ClaimCard's chrome — the
 * state key the surface renders from and the CTA (the honest note copy lives in the split
 * `claim-card-notes.ts`). Split from `ClaimCard.tsx` at the same seam `delegation-card-state.ts`
 * / `gasless-card-state.ts` sit on; every honesty rule the card turns on is readable here.
 *
 * The four kinds are DISTINCT (R-REWARD-002) and never collapse into a generic claim: the state
 * key is prefixed per kind (`ftso-*`, `rnat-*`, `flaredrop-*`, `staking-*`), so a rendered card
 * can never be mistaken for the wrong reward. The load-bearing honesty (M10 + M11):
 *  - the FTSO proof source is the UNOFFICIAL mirror (`official:false`) — the card marks it,
 *    never rendering an absent proof as a claimable amount (`ftso-proof-unavailable`), and an
 *    empty read as the honest `ftso-empty`, never a faked zero;
 *  - the rNat `withdrawAll` path is the `rnat-locked-burn-warning` — the 50% early-exit burn
 *    is real value destruction shown BEFORE signing;
 *  - FlareDrop is `flaredrop-concluded` (Coston2 ended 2026-01-30) — a read-only archive with
 *    no new-drop affordance, unless a real historical month remains (`flaredrop-month`);
 *  - staking (M11) is NON-EXPIRING — no epoch boundary is read, and an OBSERVED `claimable 0n`
 *    is the honest `staking-empty` (a delayed leg), never a fabricated amount.
 */

export type { ClaimKind }

/** The claim operation shape — `OperationRecord` parameterised by the M10 claim intent/plan;
 *  the hook's `RewardsOperation` is the same shape. Aliased here (as `delegation-card-state.ts`
 *  aliases `DelegationOperation`) so react-ui types the card off core alone. */
export type RewardsClaimOperation = OperationRecord<ClaimIntent, unknown, RewardsClaimPlan>

/** A minimal structural view of contracts' `ProofSource`, so react-ui keeps its dependency
 *  surface (core only) while still reading `official:false`. */
export interface ProofSourceView {
  readonly url: string
  readonly official: boolean
}

/** Every state the card can be in, each reachable purely from props. */
export type ClaimStateKey =
  | 'ftso-claimable'
  | 'ftso-proof-unavailable'
  | 'ftso-empty'
  | 'ftso-expiring'
  | 'rnat-claimable'
  | 'rnat-locked-burn-warning'
  | 'rnat-empty'
  | 'flaredrop-month'
  | 'flaredrop-concluded'
  | 'staking-claimable'
  | 'staking-empty'
  | 'unavailable'
  | 'claiming'
  | 'awaiting'
  | 'succeeded'
  | 'not-verified'

export interface ClaimView {
  readonly kind: ClaimKind
  readonly operation?: RewardsClaimOperation | undefined
  readonly planResult?: ClaimPlanResult | undefined
  readonly reads?: RewardsReads | undefined
  /** The rNat withdraw intent (the 50%-burn `withdrawAll` path) is selected. */
  readonly withdrawAll?: boolean
}

/** A claimable FTSO reward is "expiring" when its epoch is at/before the on-chain expire-next
 *  boundary — the 25-epoch delegation-reward window is closing on it (distinct from the
 *  non-expiring staking rewards). */
export function ftsoExpiring(ftso: readonly FtsoReward[], expireNextEpoch: number): boolean {
  return ftso.some((reward) => reward.epoch <= expireNextEpoch)
}

/** The epoch of the first claimable reward whose Merkle proof is absent — the DECLARED
 *  `proof-unavailable` epoch, so the note names it instead of conjuring an amount. */
export function ftsoMissingProofEpoch(reads: RewardsReads | undefined): number | undefined {
  return reads?.ftso.find((reward) => reward.proof.length === 0)?.epoch
}

/**
 * The one place the card's state key is decided. An in-flight/settled operation owns the
 * state; else a plan error is the honest gate/invariant render; else — mirroring the
 * DelegationCard's `delegationPosition` — an ABSENT read (`reads === undefined`) is
 * `unavailable`, NEVER a per-kind confident empty; else the observed reads, where an absent
 * proof is `proof-unavailable` and a genuinely empty PRESENT read is the declared empty.
 * `unavailable` (whole read failed) stays DISTINCT from `ftso-proof-unavailable`.
 */
export function claimCardState(view: ClaimView): ClaimStateKey {
  const { kind, operation, planResult, reads, withdrawAll } = view

  if (operation) {
    switch (operation.state) {
      case 'executing':
      case 'confirming':
      case 'submitted':
        return 'claiming'
      case 'awaiting_external':
      case 'action_required':
        return 'awaiting'
      case 'succeeded':
      case 'partially_succeeded':
        return 'succeeded'
      default:
        break
    }
  }

  if (planResult?.kind === 'error') {
    switch (planResult.error.kind) {
      case 'not-verified':
        return 'not-verified'
      case 'proof-unavailable':
        return 'ftso-proof-unavailable'
      case 'no-entitlement':
        if (kind === 'rnat') return 'rnat-empty'
        if (kind === 'staking') return 'staking-empty'
        return 'ftso-empty'
      case 'concluded':
        return 'flaredrop-concluded'
    }
  }

  // The whole read never landed (dead RPC / first load): unknown, never a confident empty —
  // returned BEFORE any per-kind empty branch, for every kind. Distinct from an observed empty.
  if (reads === undefined) return 'unavailable'

  switch (kind) {
    case 'ftso-delegation': {
      const ftso = reads?.ftso ?? []
      if (ftso.length === 0) return 'ftso-empty'
      if (ftso.some((reward) => reward.proof.length === 0)) return 'ftso-proof-unavailable'
      if (ftsoExpiring(ftso, reads?.expireNextEpoch ?? 0)) return 'ftso-expiring'
      return 'ftso-claimable'
    }
    case 'rnat': {
      const rnat = reads?.rnat
      if (!rnat?.hasProject) return 'rnat-empty'
      if (withdrawAll && rnat.locked > 0n) return 'rnat-locked-burn-warning'
      return 'rnat-claimable'
    }
    case 'flaredrop': {
      const months = reads?.flaredrop.claimableMonths ?? []
      return months.length === 0 ? 'flaredrop-concluded' : 'flaredrop-month'
    }
    case 'staking': {
      // NON-EXPIRING (T8): no epoch/expiry boundary is read here (that is M10's ftso-delegation
      // rule). Honest-empty is the OBSERVED `claimable 0n` (total === claimed) — a delayed leg,
      // never a fabricated amount; distinct from `unavailable` (a read that never landed, above).
      return (reads?.staking.claimable ?? 0n) > 0n ? 'staking-claimable' : 'staking-empty'
    }
  }
}

/** ClaimType {0 DIRECT, 1 FEE (a provider fee reward), 2 WNAT (a delegator reward)} — a number,
 *  never narrowed away; the FEE distinction is the honest reading of the reward's "fee" facet. */
export function claimTypeLabel(claimType: number): string {
  switch (claimType) {
    case 0:
      return 'DIRECT'
    case 1:
      return 'FEE · provider'
    case 2:
      return 'WNAT · delegator'
    default:
      return `type ${claimType}`
  }
}

/** The human title for each DISTINCT kind. */
export function claimKindLabel(kind: ClaimKind): string {
  switch (kind) {
    case 'ftso-delegation':
      return 'FTSO delegation rewards'
    case 'rnat':
      return 'RNat project rewards'
    case 'flaredrop':
      return 'FlareDrop airdrop'
    case 'staking':
      return 'Staking rewards'
  }
}

/** Half the still-locked rNat is destroyed on an early `withdrawAll`. */
export function rnatBurn(locked: bigint): bigint {
  return locked / 2n
}

export interface ClaimCtaInput {
  readonly kind: ClaimKind
  readonly state: ClaimStateKey
  readonly planResult?: ClaimPlanResult | undefined
  readonly withdrawAll?: boolean
}

/** The submit label + disabled, per state. A claimable state is signable ONLY with a real plan
 *  (the carried not-verified gate keeps `planResult` an error, so the CTA stays disabled). */
export function ctaForClaim({ kind, state, planResult, withdrawAll }: ClaimCtaInput): Cta {
  switch (state) {
    case 'claiming':
      return { label: 'Claiming…', disabled: true }
    case 'awaiting':
      return { label: 'Flare recording…', disabled: true }
    case 'succeeded':
      return { label: 'Claimed', disabled: true }
    case 'not-verified':
      return { label: 'Not available', disabled: true }
    case 'ftso-empty':
      return { label: 'Nothing to claim', disabled: true }
    case 'ftso-proof-unavailable':
      return { label: 'Proof unavailable', disabled: true }
    case 'rnat-empty':
      return { label: 'Nothing assigned', disabled: true }
    case 'flaredrop-concluded':
      return { label: 'Distribution concluded', disabled: true }
    case 'staking-empty':
      return { label: 'Nothing to claim', disabled: true }
    case 'unavailable':
      return { label: 'Rewards unavailable', disabled: true }
    default: {
      // ftso-claimable / ftso-expiring / rnat-claimable / rnat-locked-burn-warning / flaredrop-month
      // / staking-claimable.
      return { label: claimActionLabel(kind, withdrawAll), disabled: planResult?.kind !== 'plan' }
    }
  }
}

function claimActionLabel(kind: ClaimKind, withdrawAll?: boolean): string {
  switch (kind) {
    case 'ftso-delegation':
      return 'Claim rewards'
    case 'rnat':
      return withdrawAll ? 'Withdraw all · burns 50%' : 'Claim RNat rewards'
    case 'flaredrop':
      return 'Claim FlareDrop'
    case 'staking':
      return 'Claim staking rewards'
  }
}

/**
 * Which evidence sits beside which claim step on the `OperationTimeline` spine: the broadcast
 * tx hash (`flare_tx`) beside the signing call, the recording block (`flare_block`) beside the
 * trailing `flare` wait step (`record`). All three claim kinds build exactly ONE call (`call-0`),
 * unlike delegate-explicit's per-target calls — so there is no `call-1` here.
 */
export const CLAIM_STEP_EVIDENCE: Record<string, readonly string[]> = {
  'call-0': ['flare_tx'],
  record: ['flare_block'],
}
