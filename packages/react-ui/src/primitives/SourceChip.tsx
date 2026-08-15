import type { Observation, SourceClass } from '@flarekit-dev/core'
import { staleness } from '@flarekit-dev/core'
import type { Glyph, Tone } from '../state-visuals.js'
import { GlyphMark } from './StateChip.js'

/**
 * Where a value came from and how old it is. One anatomy everywhere a number
 * appears: source word, provider, observation age.
 *
 * R-DATA-005 requires the classes stay distinct on screen, not only in the
 * type — a balance read from a contract and one read from an index are two
 * different claims, and a person has to be able to tell which they are looking
 * at without opening a drawer.
 */

const CLASS_WORD: Record<SourceClass, string> = {
  chain: 'On chain',
  indexer: 'Indexed',
  provider: 'Provider',
  cache: 'Cached',
  local: 'This device',
}

/** A direct read is the canonical claim; everything else is derived from one. */
const CLASS_TONE: Record<SourceClass, Tone> = {
  chain: 'ok',
  indexer: 'primary',
  provider: 'primary',
  cache: 'neutral',
  local: 'neutral',
}

/** Exact, in the mono face, with its unit — never "a while ago". */
function formatAge(ms: number): string {
  if (ms < 1_000) return 'just now'
  const seconds = Math.floor(ms / 1_000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export interface SourceChipProps {
  observation: Observation<unknown>
  now: number
  className?: string
}

export function SourceChip({ observation, now, className }: SourceChipProps) {
  const { stale, ageMs } = staleness(observation, now)
  const unavailable = observation.status === 'unavailable'

  // Unavailable is not failure. Nobody read the source, so the outcome is
  // unknown — the dashed glyph, never the cross.
  const glyph: Glyph = unavailable ? 'unknown' : stale ? 'waiting' : 'done'
  const tone: Tone = unavailable || stale ? 'att' : CLASS_TONE[observation.source.class]
  const word = unavailable
    ? 'Not read'
    : stale
      ? `${CLASS_WORD[observation.source.class]}, stale`
      : CLASS_WORD[observation.source.class]

  return (
    <span
      className={`fk-chip fk-chip-${tone} fk-src${className ? ` ${className}` : ''}`}
      data-source={observation.source.class}
      data-stale={stale}
      data-unavailable={unavailable}
      title={`${observation.source.provider} · ${observation.source.network}`}
    >
      <GlyphMark glyph={glyph} />
      {word}
      <span className="fk-src-age">
        {unavailable ? 'no reading' : formatAge(ageMs)}
      </span>
    </span>
  )
}

export interface SourceLineProps {
  observation: Observation<unknown>
  now: number
}

/** The chip plus the provider spelled out, for a drawer or a wide row. */
export function SourceLine({ observation, now }: SourceLineProps) {
  return (
    <span className="fk-src-line">
      <SourceChip observation={observation} now={now} />
      <span className="fk-src-provider">{observation.source.provider}</span>
      <span className="fk-src-network">{observation.source.network}</span>
    </span>
  )
}
