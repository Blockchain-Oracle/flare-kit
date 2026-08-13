// packages/react-ui/src/stake-card-state.ts
import type { StakeInvariantError, StakeOperation, StakePlanResult, StakePositionView } from '@flare-kit/core'
import { STAKE_RETURN_CAPABILITY } from '@flare-kit/core'
import type { Cta, CardNote } from './card-chrome.js'
import type { Leg } from './primitives/LegTimeline.js'

/**
 * How a stake operation's state becomes the StakeCard's chrome — the CTA, the honest
 * invariant notes, the state key the surface renders from and the four-leg round-trip
 * timeline. Split from `StakeCard.tsx` at the same seam `delegation-card-state.ts` sits on;
 * every honesty rule the card turns on is readable here.
 *
 * The load-bearing ones (M11):
 *
 *  - The VERIFIED GATE is a declared-unbuilt affordance, never an actionable sign. While
 *    `stakeVerified` is false `planStake` refuses with `unverified`; the card renders the
 *    configured path but disables the sign button (the M10 `not-verified` idiom).
 *  - The bounds are the LIVE-read `StakeLimits`, surfaced honestly as the `amount_below_min`
 *    / `duration_below_min|above_max` / `ends_after_validator` invariants — never a docs literal.
 *  - `succeeded` is entered ONLY from the on-chain position read (the reconciler drives it);
 *    a leg reaches `done` on the timeline only at that confirmed terminal, never at submit.
 */

/** Every state the card can be in, each reachable purely from props. */
export type StakeStateKey =
  | 'compose'
  | 'ready'
  | 'staking'
  | 'returning'
  | 'awaiting'
  | 'locked'
  | 'unlocked'
  | 'succeeded'
  | 'unavailable'
  | 'unverified'
  | 'amount-below-min'
  | 'amount-above-max'
  | 'duration-below-min'
  | 'duration-above-max'
  | 'ends-after-validator'

export interface StakeView {
  readonly operation?: StakeOperation | undefined
  readonly planResult?: StakePlanResult | undefined
  readonly position: StakePositionView
}

function errorStateKey(error: StakeInvariantError): StakeStateKey {
  switch (error.code) {
    case 'unverified':
      return 'unverified'
    case 'amount_below_min':
      return 'amount-below-min'
    case 'amount_above_max':
      return 'amount-above-max'
    case 'duration_below_min':
      return 'duration-below-min'
    case 'duration_above_max':
      return 'duration-above-max'
    case 'ends_after_validator':
      return 'ends-after-validator'
  }
}

/**
 * The one place the card's state key is decided. An in-flight/settled operation owns the
 * state; else the plan (its invariant error or its ready `ok`) owns it — the plan is keyless
 * and independent of the position read, so a valid plan is `ready` even while the position
 * read is `unavailable`; else the observed position, where `unavailable` is a distinct
 * unknown, never a confident zero.
 */
export function stakeCardState(view: StakeView): StakeStateKey {
  const { operation, planResult, position } = view

  if (operation) {
    const isReturn = operation.capability === STAKE_RETURN_CAPABILITY
    switch (operation.state) {
      case 'executing':
      case 'confirming':
      case 'submitted':
        return isReturn ? 'returning' : 'staking'
      case 'awaiting_external':
        return isReturn ? 'locked' : 'awaiting'
      case 'action_required':
        return 'unlocked'
      case 'succeeded':
      case 'partially_succeeded':
        return 'succeeded'
      default:
        break
    }
  }

  if (planResult) {
    return planResult.ok ? 'ready' : errorStateKey(planResult.error)
  }

  if (position.status === 'unavailable') return 'unavailable'
  return 'compose'
}

const ERROR_NOTE: Record<StakeInvariantError['code'], { title: string; body: string; tone: CardNote['tone'] }> = {
  unverified: {
    title: 'Staking not built here',
    body: 'No live staking round trip has been confirmed on this build, so the kit will not sign a call that would irreversibly lock real FLR on a path never driven live on this network.',
    tone: 'bad',
  },
  amount_below_min: {
    title: 'Below the minimum stake',
    body: 'This amount is under the live minimum stake read from the network. Raise it to at least the minimum shown above.',
    tone: 'att',
  },
  amount_above_max: {
    title: 'Above the maximum stake',
    body: 'This amount is over the live maximum stake read from the network. Lower it to the maximum shown above.',
    tone: 'att',
  },
  duration_below_min: {
    title: 'Lock is too short',
    body: 'The lock is shorter than the live minimum staking period. Extend it to at least the minimum shown above.',
    tone: 'att',
  },
  duration_above_max: {
    title: 'Lock is too long',
    body: 'The lock is longer than the live maximum staking period. Shorten it to the maximum shown above.',
    tone: 'att',
  },
  ends_after_validator: {
    title: 'Ends after the validator',
    body: "This stake would outlive the chosen validator's active window. Pick a validator whose registration lasts at least as long, or shorten the stake.",
    tone: 'att',
  },
}

/** The honest note for a refused plan. `unverified` is the declared-unbuilt hard stop. */
export function stakeErrorNote(error: StakeInvariantError): CardNote {
  const copy = ERROR_NOTE[error.code]
  return { tone: copy.tone, title: copy.title, body: copy.body }
}

/** The submit label + disabled, per state. `ready` (a valid plan) is the only enabled state. */
export function ctaForStake(state: StakeStateKey): Cta {
  switch (state) {
    case 'ready':
      return { label: 'Stake', disabled: false }
    case 'staking':
      return { label: 'Staking…', disabled: true }
    case 'returning':
      return { label: 'Returning…', disabled: true }
    case 'awaiting':
      return { label: 'Flare recording…', disabled: true }
    case 'locked':
      return { label: 'Locked until it matures', disabled: true }
    case 'unlocked':
      return { label: 'Unlocked — return below', disabled: true }
    case 'succeeded':
      return { label: 'Done', disabled: true }
    case 'unverified':
      return { label: 'Not available', disabled: true }
    case 'amount-below-min':
      return { label: 'Amount below minimum', disabled: true }
    case 'amount-above-max':
      return { label: 'Amount above maximum', disabled: true }
    case 'duration-below-min':
      return { label: 'Lock too short', disabled: true }
    case 'duration-above-max':
      return { label: 'Lock too long', disabled: true }
    case 'ends-after-validator':
      return { label: 'Ends after the validator', disabled: true }
    case 'unavailable':
      return { label: 'Position unavailable', disabled: true }
    default:
      return { label: 'Enter an amount and duration', disabled: true }
  }
}

/** Whole days from a duration in seconds — for the human-facing lock window/period. */
export function daysOf(seconds: bigint): number {
  return Number(seconds / 86_400n)
}

/**
 * The four conceptual legs of the cross-substrate round trip, projected from the op — the
 * static illustration distinct from the wallet-signed `OperationTimeline` spine (mirrors the
 * BridgeCard delivery timeline). A leg reaches `done` only at a CONFIRMED terminal: the
 * stake-in legs when the stake-in op read back `succeeded`, the return leg when the delayed
 * P→C return op did. A `submitted` delegate is never `done`.
 */
export function stakeLegs(op: StakeOperation): Leg[] {
  const isReturn = op.capability === STAKE_RETURN_CAPABILITY
  const s = op.state
  const stakeInFlight = !isReturn && (s === 'executing' || s === 'submitted' || s === 'confirming')
  const recording = !isReturn && (s === 'awaiting_external' || s === 'action_required')
  const stakeInDone = isReturn || s === 'succeeded' || s === 'partially_succeeded'
  const returnActive =
    isReturn && (s === 'awaiting_external' || s === 'action_required' || s === 'executing' || s === 'submitted' || s === 'confirming')
  const returnDone = isReturn && (s === 'succeeded' || s === 'partially_succeeded')

  const transfer: Leg['state'] = stakeInDone || recording ? 'done' : stakeInFlight ? 'active' : 'pending'
  const delegate: Leg['state'] = stakeInDone ? 'done' : recording ? 'active' : 'pending'
  const ret: Leg['state'] = returnDone ? 'done' : returnActive ? 'active' : 'pending'

  return [
    { id: 'export', label: 'Export C→P', state: transfer },
    { id: 'import', label: 'Import onto P', state: transfer },
    { id: 'delegate', label: 'Delegate to validator', state: delegate },
    { id: 'return', label: 'Return P→C · after unlock', state: ret },
  ]
}

/**
 * Which evidence sits beside which stake step on the `OperationTimeline` spine: the broadcast
 * tx hash beside the two signed P-chain legs, the recording block beside the `flare` wait step.
 */
export const STAKE_STEP_EVIDENCE: Record<string, readonly string[]> = {
  export: ['flare_tx'],
  delegate: ['flare_tx'],
  record: ['flare_block'],
}
