// packages/react-ui/src/card-chrome.ts
import type { OperationState } from '@flarekit-dev/core'
import type { NoteTone } from './primitives/Note.js'

/**
 * The card chrome shared by every operation card (M7-R11). Since M5 each card's
 * state file re-declared the same three state-group sets, the same `percentOf`
 * and the same `Cta`/`CardNote` shapes; this is their one home. A card's own
 * `*-card-state.ts` still owns its `ctaFor…`/`noteFor…` — the surface-specific
 * copy — and imports the vocabulary from here.
 */

// No StateChip/plan chrome until an operation commits to a plan; before that the
// card is an editor and a chip would only narrate the obvious.
export const PRE_PLAN: ReadonlySet<OperationState> = new Set(['draft', 'awaiting_input', 'quoting'])

// The spine appears only once a transaction is genuinely in flight or done — its
// "progressing on its own" reassurance is true then, and not before.
export const IN_FLIGHT: ReadonlySet<OperationState> = new Set([
  'executing',
  'submitted',
  'confirming',
  'awaiting_external',
  'action_required',
  'partially_succeeded',
  'succeeded',
])

// The operation has concluded, so a pre-execution quote is no longer a live
// estimate and must not be rendered as the amount received.
export const CONCLUDED: ReadonlySet<OperationState> = new Set([
  'succeeded',
  'partially_succeeded',
  'failed',
  'expired',
  'cancelled',
])

export interface Cta {
  readonly label: string
  readonly disabled: boolean
}

export interface CardNote {
  readonly tone: NoteTone
  readonly title: string
  readonly body: string
}

/** A bips setting as a percent, e.g. 50 → "0.50%". */
export function percentOf(bips: number): string {
  return `${(bips / 100).toFixed(2)}%`
}

/** A per-route fee in bips as a label: unknown → "—", a genuinely zero-fee route → "None", else a percent. */
export function feeBipsLabel(bips: number | null | undefined): string {
  return bips === null || bips === undefined ? '—' : bips === 0 ? 'None' : percentOf(bips)
}
