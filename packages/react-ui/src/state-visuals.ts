import type { OperationState } from '@flarekit-dev/core'

/**
 * The one map from canonical state to how it reads.
 *
 * DESIGN.md fixes this vocabulary and requires that colour is never the first
 * signal — every state carries a glyph and a word as well. Keeping the decision
 * in a single table is what stops `submitted` reading as success on one surface
 * and correctly on another.
 */

export const GLYPHS = [
  /** filled disc — complete */
  'done',
  /** ring — working */
  'working',
  /** dashed ring — waiting on an external actor */
  'waiting',
  /** filled square — your action required */
  'action',
  /** half disc — partial */
  'partial',
  /** cross — failed */
  'failed',
  /** dotted ring — outcome unknown */
  'unknown',
] as const

export type Glyph = (typeof GLYPHS)[number]

/** Maps to the `fk-chip-*` tones in state.css. */
export type Tone = 'neutral' | 'primary' | 'ok' | 'att' | 'bad' | 'part'

export interface StateVisual {
  readonly glyph: Glyph
  readonly tone: Tone
  /** The word beside the glyph. Never an identifier. */
  readonly word: string
}

const VISUALS: Record<OperationState, StateVisual> = {
  draft: { glyph: 'working', tone: 'neutral', word: 'Draft' },
  discovering: { glyph: 'working', tone: 'neutral', word: 'Finding a route' },
  quoting: { glyph: 'working', tone: 'neutral', word: 'Quoting' },
  awaiting_input: { glyph: 'action', tone: 'att', word: 'Needs input' },
  awaiting_approval: { glyph: 'action', tone: 'att', word: 'Needs approval' },
  ready: { glyph: 'action', tone: 'primary', word: 'Ready' },
  executing: { glyph: 'working', tone: 'primary', word: 'Working' },
  // Never "sent" or "done": submitted means accepted, not final.
  submitted: { glyph: 'working', tone: 'primary', word: 'Submitted' },
  confirming: { glyph: 'working', tone: 'primary', word: 'Confirming' },
  awaiting_external: { glyph: 'waiting', tone: 'primary', word: 'Waiting' },
  action_required: { glyph: 'action', tone: 'att', word: 'Action required' },
  partially_succeeded: { glyph: 'partial', tone: 'part', word: 'Partly done' },
  succeeded: { glyph: 'done', tone: 'ok', word: 'Succeeded' },
  failed: { glyph: 'failed', tone: 'bad', word: 'Failed' },
  // Cancelled and expired are outcomes, not failures. An expired quote is
  // re-quotable and nothing was lost.
  cancelled: { glyph: 'unknown', tone: 'neutral', word: 'Cancelled' },
  expired: { glyph: 'unknown', tone: 'att', word: 'Expired' },
}

export function visualFor(state: OperationState): StateVisual {
  return VISUALS[state]
}

/** The actors a timeline row can name, as the proper nouns DESIGN.md requires. */
export const ACTOR_NAMES: Record<string, string> = {
  you: 'you',
  your_wallet: 'your wallet',
  host_app: 'this app',
  xrpl: 'the XRP Ledger',
  fdc: 'the Flare Data Connector',
  flare: 'Flare',
  executor: 'the executor',
  agent: 'the agent',
  relayer: 'the relayer',
  provider: 'the provider',
  policy: 'the policy engine',
  operator: 'an operator',
}

export function actorName(actor: string): string {
  return ACTOR_NAMES[actor] ?? actor
}
