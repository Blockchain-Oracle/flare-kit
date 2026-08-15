// packages/react-ui/src/governance-card-state.ts
import type {
  GovernanceInvariantError,
  GovernanceOperation,
  GovernancePlanResult,
  GovernancePositionView,
} from '@flarekit-dev/core'
import type { Cta, CardNote } from './card-chrome.js'

/**
 * How a governance operation's state becomes the GovernanceCard's chrome — the CTA, the
 * honest invariant notes and the state key the surface renders from. Split from
 * `GovernanceCard.tsx` at the same seam `delegation-card-state.ts` sits on.
 *
 * The load-bearing difference from M10 delegation: governance vote power is ALL-OR-NOTHING to
 * ONE delegate (`delegate(to)` / `undelegate()`), never a percentage split across two providers —
 * so there is no too-many-delegates / over-100 / mode-conflict here. The honesty rules
 * that DO carry: an `unavailable` position is a `—`, NEVER a confident zero; the verified gate
 * (`unverified`) is a declared-unbuilt hard stop, never a live sign; and `succeeded` is entered
 * only from the on-chain `getDelegateOfAtNow` read-back the hook drives — this file never
 * fabricates it (the operation reaches `succeeded` upstream, in `reconcileGovernance`).
 */

/** Every state the card can be in, each reachable purely from props. */
export type GovernanceStateKey =
  | 'compose'
  | 'delegating'
  | 'undelegating'
  | 'submitted'
  | 'awaiting'
  | 'succeeded'
  | 'unavailable'
  | 'unverified'
  | 'invalid-target'
  | 'self-delegation'
  | 'already-delegated'
  | 'no-delegate'
  | 'partially-succeeded'

export interface GovernanceView {
  readonly operation?: GovernanceOperation | undefined
  readonly planResult?: GovernancePlanResult | undefined
  readonly position: GovernancePositionView
}

/**
 * The one place the card's state key is decided. An in-flight/settled operation owns the
 * state; else a plan error is the honest invariant render; else the observed position — and
 * `unavailable` is never rendered as a confident zero.
 */
export function governanceCardState(view: GovernanceView): GovernanceStateKey {
  const { operation, planResult, position } = view

  if (operation) {
    switch (operation.state) {
      case 'executing':
      case 'confirming':
        return operation.intent.kind === 'undelegate' ? 'undelegating' : 'delegating'
      case 'submitted':
        return 'submitted'
      case 'awaiting_external':
      case 'action_required':
        return 'awaiting'
      case 'succeeded':
        return 'succeeded'
      // `reconcileGovernance` never emits this, but GovernanceCard is PUBLISHED and takes an
      // arbitrary `GovernanceOperation` — so it gets its own key rather than folding into
      // `succeeded`, whose CTA reads "Done". A partial success is not a success claim.
      case 'partially_succeeded':
        return 'partially-succeeded'
      default:
        break
    }
  }

  if (planResult && !planResult.ok) {
    switch (planResult.error.code) {
      case 'unverified':
        return 'unverified'
      case 'invalid_target':
        return 'invalid-target'
      case 'self_delegation':
        return 'self-delegation'
      case 'already_delegated':
        return 'already-delegated'
      case 'no_delegate':
        return 'no-delegate'
    }
  }

  // The observed position. `unavailable` is a distinct unknown, never a confident zero.
  if (position.status === 'unavailable') return 'unavailable'
  return 'compose'
}

const ERROR_NOTE: Record<GovernanceInvariantError['code'], { title: string; body: string }> = {
  unverified: {
    title: 'Delegation not built here',
    body: 'No live run has confirmed a governance delegation on this network, so the kit will not sign a call that would move real governance vote power along a path no live run has driven here.',
  },
  invalid_target: {
    title: 'Enter a valid delegate',
    body: 'A governance delegate must be a real address — not empty and not the zero address. Governance vote power moves all-or-nothing to one representative.',
  },
  self_delegation: {
    title: 'Choose another delegate',
    body: 'Delegating your governance vote power to your own account is a no-op the protocol would silently accept. Pick a different representative.',
  },
  already_delegated: {
    title: 'Already delegated there',
    body: 'This account already delegates all of its governance vote power to that address, so the call would change nothing on-chain. Enter a different representative, or undelegate first.',
  },
  no_delegate: {
    title: 'Nothing to undelegate',
    body: 'This account has no current governance delegate, so there is nothing to clear.',
  },
}

/** The honest note for a refused plan. The verified gate is a hard stop; the rest are correctable. */
export function governanceErrorNote(error: GovernanceInvariantError): CardNote {
  const copy = ERROR_NOTE[error.code]
  const tone = error.code === 'unverified' ? 'bad' : 'att'
  return { tone, title: copy.title, body: copy.body }
}

export interface GovernanceCtaInput {
  readonly state: GovernanceStateKey
  readonly planResult?: GovernancePlanResult | undefined
  /** The single target address input has a value — a delegate is being composed. */
  readonly hasTarget: boolean
}

/** The submit label + disabled, per state. The empty-target guard wins in `compose`. */
export function ctaForGovernance({ state, planResult, hasTarget }: GovernanceCtaInput): Cta {
  switch (state) {
    case 'delegating':
      return { label: 'Delegating…', disabled: true }
    case 'undelegating':
      return { label: 'Undelegating…', disabled: true }
    case 'submitted':
      return { label: 'Recording…', disabled: true }
    case 'awaiting':
      return { label: 'Flare recording…', disabled: true }
    case 'succeeded':
      return { label: 'Done', disabled: true }
    // Never "Done": the operation itself does not claim a full success.
    case 'partially-succeeded':
      return { label: 'Partly recorded', disabled: true }
    case 'unverified':
      return { label: 'Not available', disabled: true }
    case 'invalid-target':
      return { label: 'Enter a valid address', disabled: true }
    case 'self-delegation':
      return { label: 'Choose another delegate', disabled: true }
    case 'already-delegated':
      return { label: 'Already delegated there', disabled: true }
    case 'no-delegate':
      return { label: 'No delegate to clear', disabled: true }
    case 'unavailable':
      return { label: 'Position unavailable', disabled: true }
    default: {
      // A delegate with no target address never submits.
      if (!hasTarget) return { label: 'Enter a delegate address', disabled: true }
      if (planResult?.ok) return { label: 'Delegate vote power', disabled: false }
      return { label: 'Enter a delegate address', disabled: true }
    }
  }
}

/**
 * Which evidence sits beside which governance step on the `OperationTimeline` spine: the
 * broadcast tx hash beside the delegate/undelegate call, the recording block beside the
 * `flare` wait step. The plan's single call is `call-0`; the trailing step is `record`.
 */
export const GOVERNANCE_STEP_EVIDENCE: Record<string, readonly string[]> = {
  'call-0': ['flare_tx'],
  record: ['flare_block'],
}
