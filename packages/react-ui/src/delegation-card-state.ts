// packages/react-ui/src/delegation-card-state.ts
import type {
  DelegationError,
  DelegationIntent,
  DelegationMode,
  DelegationPlan,
  DelegationPlanResult,
  DelegationPositionView,
  OperationRecord,
} from '@flare-kit/core'
import type { Cta, CardNote } from './card-chrome.js'

/**
 * The delegation operation shape. Aliased here (the analog of core's `GaslessOperation`)
 * so react-ui types the card off core alone — it is `OperationRecord` parameterised by the
 * M10 delegation intent/plan; the hook's `DelegationOperation` is the same shape.
 */
export type DelegationOperation = OperationRecord<DelegationIntent, unknown, DelegationPlan>

/**
 * How a delegation operation's state becomes the DelegationCard's chrome — the CTA, the
 * honest invariant notes and the state key the surface renders from. Split from
 * `DelegationCard.tsx` at the same seam `gasless-card-state.ts` sits on; every honesty
 * rule the card turns on is readable here.
 *
 * The load-bearing ones (M10): an `unavailable` position is a `—`, NEVER a confident
 * zero-delegation and NEVER collapsed into `no-balance`; a delegation-mode conflict reads
 * that the style is fixed for the account, never a silent no-op; and a delegate with zero provider rows is
 * never submittable — the composer refuses to emit a no-op `batchDelegate([],[])`.
 */

/** Every state the card can be in, each reachable purely from props. */
export type DelegationStateKey =
  | 'compose'
  | 'no-balance'
  | 'needs-wrap'
  | 'wrapping'
  | 'delegating'
  | 'submitted'
  | 'awaiting'
  | 'succeeded'
  | 'unavailable'
  | 'too-many-delegates'
  | 'bips-over-100'
  | 'mode-conflict'
  | 'not-verified'

export interface DelegationView {
  readonly operation?: DelegationOperation | undefined
  readonly planResult?: DelegationPlanResult | undefined
  readonly position: DelegationPositionView
  /** At least one provider row is filled — a delegate is being composed. */
  readonly composingDelegate?: boolean
}

function isWrapIntent(intent: DelegationIntent): boolean {
  return intent.kind === 'wrap' || intent.kind === 'unwrap'
}

/**
 * The one place the card's state key is decided. An in-flight/settled operation owns the
 * state; else a plan error is the honest invariant render; else the observed position — and
 * `unavailable` is never rendered as `no-balance`.
 */
export function delegationCardState(view: DelegationView): DelegationStateKey {
  const { operation, planResult, position, composingDelegate } = view

  if (operation) {
    switch (operation.state) {
      case 'executing':
      case 'confirming':
        return isWrapIntent(operation.intent) ? 'wrapping' : 'delegating'
      case 'submitted':
        return 'submitted'
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
      case 'too-many-delegates':
        return 'too-many-delegates'
      case 'bips-over-100':
        return 'bips-over-100'
      case 'mode-conflict':
        return 'mode-conflict'
      case 'insufficient-wrapped':
        return 'needs-wrap'
    }
  }

  // The observed position. `unavailable` is a distinct unknown, never a confident zero.
  if (position.status === 'unavailable') return 'unavailable'
  if (position.wrappedBalance === 0n && position.delegates.length === 0) {
    return composingDelegate ? 'needs-wrap' : 'no-balance'
  }
  return 'compose'
}

/** 0 = NOTSET, 1 = PERCENTAGE, 2 = AMOUNT — `delegationModeOf`'s value, as a word. */
export function modeLabel(mode: DelegationMode): 'NOTSET' | 'PERCENTAGE' | 'AMOUNT' {
  return mode === 1 ? 'PERCENTAGE' : mode === 2 ? 'AMOUNT' : 'NOTSET'
}

const ERROR_NOTE: Record<DelegationError['kind'], (error: DelegationError) => { title: string; body: string }> = {
  'not-verified': () => ({
    title: 'Delegation not built here',
    body: 'No live run has confirmed a delegation on this build, so the kit will not sign a call that would spend real vote power on a path never driven live on this network.',
  }),
  'too-many-delegates': () => ({
    title: 'At most two providers',
    body: 'Percentage delegation supports up to two providers. Remove one before you delegate.',
  }),
  'bips-over-100': (error) => ({
    title: 'Over 100% of your vote power',
    body:
      error.kind === 'bips-over-100'
        ? `Your delegations add up to ${(error.sum / 100).toFixed(2)}% — more than 100%. Lower a share so the total is 100% or less.`
        : '',
  }),
  'mode-conflict': (error) => ({
    title: 'Delegation style is fixed for this account',
    body:
      error.kind === 'mode-conflict'
        ? `This account is in ${error.current.toUpperCase()} mode. The chain never resets an account's delegation mode — not even after undelegating — so the other style stays refused here. Delegate the other way from an account that has not used this one.`
        : '',
  }),
  'insufficient-wrapped': (error) => ({
    title: 'Wrap more first',
    body:
      error.kind === 'insufficient-wrapped'
        ? 'This delegation is larger than your wrapped balance. Wrap more before you delegate an explicit amount.'
        : '',
  }),
}

/** The honest note for a refused plan. `mode-conflict` states the style is fixed. */
export function delegationErrorNote(error: DelegationError): CardNote {
  const copy = ERROR_NOTE[error.kind](error)
  // Over-100 and too-many are correctable composer mistakes; the rest are hard stops.
  const tone = error.kind === 'bips-over-100' || error.kind === 'too-many-delegates' ? 'att' : 'bad'
  return { tone, title: copy.title, body: copy.body }
}

export interface DelegationCtaInput {
  readonly state: DelegationStateKey
  readonly planResult?: DelegationPlanResult | undefined
  /** True when a delegate is being composed but no provider row is filled. */
  readonly emptyDelegate: boolean
}

/** The submit label + disabled, per state. The empty-delegate guard wins in `compose`. */
export function ctaForDelegation({ state, planResult, emptyDelegate }: DelegationCtaInput): Cta {
  switch (state) {
    case 'wrapping':
      return { label: 'Wrapping…', disabled: true }
    case 'delegating':
      return { label: 'Delegating…', disabled: true }
    case 'submitted':
      return { label: 'Recording…', disabled: true }
    case 'awaiting':
      return { label: 'Flare recording…', disabled: true }
    case 'succeeded':
      return { label: 'Done', disabled: true }
    case 'not-verified':
      return { label: 'Not available', disabled: true }
    case 'too-many-delegates':
      return { label: 'Remove a provider', disabled: true }
    case 'bips-over-100':
      return { label: 'Over 100%', disabled: true }
    case 'mode-conflict':
      return { label: 'Delegation style fixed', disabled: true }
    case 'unavailable':
      return { label: 'Position unavailable', disabled: true }
    case 'needs-wrap':
      return { label: 'Wrap first', disabled: true }
    case 'no-balance':
      return { label: 'Wrap to begin', disabled: true }
    default: {
      // The empty-provider guard: a delegate with no filled row never submits (Task 4).
      if (emptyDelegate) return { label: 'Add a provider', disabled: true }
      if (planResult?.kind === 'plan') return { label: ctaLabelForIntent(planResult.plan.intent), disabled: false }
      return { label: 'Enter an amount or a provider', disabled: true }
    }
  }
}

function ctaLabelForIntent(intent: DelegationIntent): string {
  switch (intent.kind) {
    case 'wrap':
      return 'Wrap'
    case 'unwrap':
      return 'Unwrap'
    case 'undelegate':
      return 'Undelegate'
    default:
      return 'Delegate'
  }
}

/**
 * Which evidence sits beside which delegation step on the `OperationTimeline` spine: the
 * broadcast tx hash (`flare_tx`) beside its signing call, the recording block beside the
 * `flare` wait step. The plan's calls are `call-0`/`call-1`; the trailing step is `record`.
 */
export const DELEGATION_STEP_EVIDENCE: Record<string, readonly string[]> = {
  'call-0': ['flare_tx'],
  'call-1': ['flare_tx'],
  record: ['flare_block'],
}
