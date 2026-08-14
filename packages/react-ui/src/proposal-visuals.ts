import type { ProposalSource, ProposalState } from '@flarekit-dev/core'
import type { Glyph, Tone } from './state-visuals.js'

/**
 * The one map from a `ProposalState` to how it reads (M12 T10).
 *
 * `ProposalState` is NOT an `OperationState` — a proposal has a governance
 * lifecycle of its own (the two DEPLOYED enums are source-dispatched in core's
 * `proposal-mapping.ts`), so it cannot reuse `StateChip`/`visualFor`. It shares
 * the DESIGN.md rule those obey: colour is never the first signal — every state
 * carries a glyph and a word.
 *
 * `defeated` is a terminal negative OUTCOME, not a system fault; the word
 * carries the meaning and the cross-glyph reads as its opposition to
 * `succeeded`. `unknown` is the honest "a read did not land / an out-of-range
 * index" state — a dotted ring, never coerced into a confident verdict.
 */
export const PROPOSAL_STATE_VISUAL: Record<ProposalState, { tone: Tone; glyph: Glyph; word: string }> = {
  pending: { tone: 'neutral', glyph: 'waiting', word: 'Pending' },
  active: { tone: 'primary', glyph: 'working', word: 'Active' },
  defeated: { tone: 'bad', glyph: 'failed', word: 'Defeated' },
  succeeded: { tone: 'ok', glyph: 'done', word: 'Succeeded' },
  queued: { tone: 'primary', glyph: 'waiting', word: 'Queued' },
  expired: { tone: 'att', glyph: 'unknown', word: 'Expired' },
  executed: { tone: 'ok', glyph: 'done', word: 'Executed' },
  canceled: { tone: 'neutral', glyph: 'unknown', word: 'Canceled' },
  unknown: { tone: 'neutral', glyph: 'unknown', word: 'Unknown' },
}

/** The human name for a proposal's contract SOURCE — the two surfaces are two shapes. */
export const PROPOSAL_SOURCE_LABEL: Record<ProposalSource, string> = {
  ftso: 'FTSO management proposal',
  foundation: 'Foundation governor proposal',
}
