import type { HistoryPointStatus, VerificationOutcome } from '@flare-kit/core'
import type { Glyph, Tone } from './state-visuals.js'

/**
 * How FTSO's own vocabularies read on screen — the FTSO half of what
 * `state-visuals.ts` is for the operation lifecycle.
 *
 * These live in one table for the same reason the operation states do: four
 * surfaces render a trust class, three render a verification outcome, and the
 * moment each keeps its own copy `could not check` starts reading as a failure
 * on one screen and as an unknown on another. Colour is never the first signal,
 * so every entry carries a glyph and a word as well.
 */

export interface FtsoVisual {
  readonly tone: Tone
  readonly glyph: Glyph
  readonly word: string
}

/**
 * A protocol feed's value is what the FTSO providers voted on. A custom feed's
 * comes from a contract somebody else deployed under a governance approval.
 * Both are real; they are not the same claim, and the half disc says so without
 * calling the custom one worse.
 */
export const TRUST_VISUAL: Record<'protocol' | 'custom', FtsoVisual> = {
  protocol: { tone: 'ok', glyph: 'done', word: 'Protocol' },
  custom: { tone: 'primary', glyph: 'partial', word: 'Custom' },
}

/**
 * `degraded` rather than `unavailable` for a listed feed that did not answer:
 * the deployment still carries it, so claiming it is gone would be a stronger
 * statement than anything we observed. `not_read` is the third answer — nobody
 * asked, which says nothing about the feed either way.
 */
export type FeedAvailability = 'supported' | 'degraded' | 'not_answered' | 'not_read'

export const AVAILABILITY_VISUAL: Record<FeedAvailability, FtsoVisual> = {
  supported: { tone: 'ok', glyph: 'done', word: 'Serving' },
  degraded: { tone: 'att', glyph: 'waiting', word: 'No value' },
  /**
   * A read was attempted and it failed. Distinct from `not_read`, which claims
   * nobody asked — rendering an observed failure as an absence of observation
   * put "Not read" on every row of a screen whose own note said the read had
   * been attempted and had failed.
   */
  not_answered: { tone: 'att', glyph: 'unknown', word: 'No answer' },
  not_read: { tone: 'neutral', glyph: 'unknown', word: 'Not read' },
}

/**
 * The three-valued verification result, kept three-valued.
 *
 * `FtsoV2.verifyFeedData` **reverts** on a bad proof rather than returning
 * false, so `could_not_check` is the common outcome and `not_proven` is the rare
 * one. Giving them one visual would render "we could not check this" as "this is
 * not proven" — an unknown shown as a negative fact.
 */
export const VERIFICATION_VISUAL: Record<VerificationOutcome, FtsoVisual> = {
  proven: { tone: 'ok', glyph: 'done', word: 'Proven on chain' },
  not_proven: { tone: 'bad', glyph: 'failed', word: 'Not proven' },
  could_not_check: { tone: 'att', glyph: 'unknown', word: 'Could not be checked' },
}

/**
 * Whether the proof itself arrived, before anything is said about whether it
 * verifies. Four answers, and `pending` is why they are not three.
 *
 * `Relay.isFinalized` returning true does **not** mean the proof can be
 * fetched: the data-availability layer indexes a round minutes after finality,
 * so a young round with no leaf is waiting rather than gone. An old round with
 * no leaf is past retention. Both are "the host served nothing", and collapsing
 * them would tell somebody their proof is unavailable ninety seconds before it
 * appears.
 */
export type ProofAvailability = 'retrieved' | 'pending' | 'unavailable' | 'could_not_ask'

export const PROOF_AVAILABILITY_VISUAL: Record<ProofAvailability, FtsoVisual> = {
  retrieved: { tone: 'ok', glyph: 'done', word: 'Proof retrieved' },
  /** Dashed ring: genuinely waiting on an external actor to finish indexing. */
  pending: { tone: 'primary', glyph: 'waiting', word: 'Waiting on the host' },
  /**
   * The host answered and had nothing. Not the half disc — that means a partial
   * outcome, and this is a complete answer to a narrow question. Whether the
   * round committed one is a different question, unanswered here, so the outcome
   * is unknown and the word carries the distinction from `could_not_ask`.
   */
  unavailable: { tone: 'att', glyph: 'unknown', word: 'No proof served' },
  /**
   * Dashed neutral, not the dashed ring. Nobody is being waited on — the
   * request did not complete, so the outcome is unknown rather than pending.
   */
  could_not_ask: { tone: 'att', glyph: 'unknown', word: 'Host could not be asked' },
}

/**
 * A round's four possible answers. `committed_not_retrievable` is the one this
 * vocabulary exists for: the Relay's root outlives the data-availability host's
 * leaves by design, so the chain can assert a commitment for a value that can no
 * longer be fetched. Nothing failed and nothing is missing.
 */
export const HISTORY_VISUAL: Record<HistoryPointStatus, FtsoVisual> = {
  retrieved: { tone: 'ok', glyph: 'done', word: 'Retrieved' },
  committed_not_retrievable: { tone: 'part', glyph: 'partial', word: 'Committed, not retrievable' },
  /**
   * A zero root. That is equally true of a round not finalized *yet*, and the
   * Relay cannot tell the two apart from one read — so the word states what was
   * seen rather than asserting a permanent negative from a momentary look.
   */
  not_finalized: { tone: 'neutral', glyph: 'unknown', word: 'No root published' },
  /** Dashed neutral, matching PROOF_AVAILABILITY_VISUAL: nobody is being
      waited on, so the outcome is unknown rather than pending. */
  could_not_ask: { tone: 'att', glyph: 'unknown', word: 'Host could not be asked' },
}
