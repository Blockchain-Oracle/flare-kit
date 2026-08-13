import type { Observation, RandomResult } from '@flarekit-dev/core'
import { isObserved, isRefusal } from '@flarekit-dev/core'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { SourceChip } from './primitives/SourceChip.js'
import { ToneChip } from './primitives/StateChip.js'
import { Timestamp } from './primitives/Timestamp.js'

/**
 * FTSO-04 — the protocol's randomness, and the one policy this milestone owns.
 *
 * `isSecureRandom = false` genuinely occurs. Sampling 401 rounds across the full
 * retained range on Coston2 found four insecure ones — roughly 1%. A surface
 * that hardcoded "secure" would eventually lie about the single property anybody
 * reads this for.
 *
 * So the flag is never a footnote beside a perfectly usable number. When the
 * caller required a secure value and the protocol reports an insecure one, the
 * read returns a **refusal** carrying its reason and no value at all, and this
 * surface renders the refusal rather than reaching past it. There is nothing to
 * use, which is the point: a flag next to a number is an invitation to use the
 * number.
 */

export interface SecureRandomPanelProps {
  random?: Observation<RandomResult>
  /** Whether the read demanded a secure value. The whole policy surface. */
  requireSecure?: boolean
  /** The round asked for. Absent means the current random. */
  votingRoundId?: bigint
  /**
   * The oldest round the historical read reaches, discovered by the caller.
   * Never a constant here: the floor moves, and a compiled-in one goes stale.
   */
  floorRound?: bigint
  loading?: boolean
  now: number
  stale?: boolean
  onRefresh?: () => void
  theme?: 'light' | 'dark'
  className?: string
}

export function SecureRandomPanel({
  random,
  requireSecure = false,
  votingRoundId,
  floorRound,
  loading = false,
  now,
  stale = false,
  onRefresh,
  theme,
  className,
}: SecureRandomPanelProps) {
  const result = random && isObserved(random) ? random.value : undefined
  const refused = result && isRefusal(result) ? result : undefined
  const reading = result && !isRefusal(result) ? result : undefined
  const belowFloor =
    votingRoundId !== undefined && floorRound !== undefined && votingRoundId < floorRound

  return (
    <Panel
      title="Secure random"
      subtitle={
        votingRoundId === undefined ? (
          'The current value'
        ) : (
          <>
            Voting round <span className="fk-mono">{votingRoundId.toString()}</span>
          </>
        )
      }
      aside={
        <ToneChip
          tone={requireSecure ? 'primary' : 'neutral'}
          glyph={requireSecure ? 'action' : 'unknown'}
        >
          {requireSecure ? 'Secure required' : 'No requirement set'}
        </ToneChip>
      }
      {...(theme ? { theme } : {})}
      {...(className ? { className } : {})}
      data-stale={stale ? 'true' : 'false'}
      data-refused={refused ? 'true' : 'false'}
    >
      {belowFloor ? (
        <Note tone="att" title="This round is below the retained range">
          Historical randomness reaches back to round{' '}
          <span className="fk-mono">{floorRound?.toString()}</span> on this deployment — discovered
          by asking, because the floor moves. Round{' '}
          <span className="fk-mono">{votingRoundId?.toString()}</span> is older than that, so
          nothing is retrievable for it. That is the range's edge, not a failure and not a claim
          that the round had no randomness.
        </Note>
      ) : null}

      {loading && !random ? (
        <div aria-busy="true">
          <span className="fk-sr" role="status">
            Reading the random
          </span>
          <span className="fk-skeleton" />
        </div>
      ) : null}

      {reading ? (
        <>
          <div className="fk-ftso-random" data-secure={reading.isSecure}>
            <span className="fk-ftso-claim-head">Value</span>
            {/* Full precision, every digit. A 39-digit uint256 through any
                shortening is a different number. */}
            <span className="fk-ftso-random-value">{reading.value.toString()}</span>
          </div>

          <Details aria-label="Randomness">
            <DetailRow
              label="Protocol reports"
              value={
                <ToneChip
                  tone={reading.isSecure ? 'ok' : 'bad'}
                  glyph={reading.isSecure ? 'done' : 'failed'}
                >
                  {reading.isSecure ? 'Secure' : 'Not secure'}
                </ToneChip>
              }
            />
            <DetailRow label="Timestamp" value={<Timestamp seconds={reading.timestampSeconds} />} />
            {reading.votingRoundId === undefined ? null : (
              <DetailRow
                label="Voting round"
                value={<span className="fk-mono">{reading.votingRoundId.toString()}</span>}
              />
            )}
            <DetailRow
              label="Read from"
              value={<span className="fk-mono">Relay (RandomNumberV2)</span>}
              sub="One address under two registry names. Named for the contract rather than the alias, so it matches an explorer."
            />
          </Details>
        </>
      ) : null}

      {/* Insecure, and returned anyway, because nothing required otherwise. The
          flag is not left sitting quietly beside a usable number. */}
      {reading && !reading.isSecure ? (
        <Note tone="bad" title="This value is not secure and no requirement stopped it">
          The protocol itself reports this round's randomness as insecure. It is shown because
          nothing asked for a secure one — set the read's <span className="fk-mono">requireSecure</span>{' '}
          option and it refuses instead of returning this.
        </Note>
      ) : null}

      {reading && reading.isSecure && requireSecure ? (
        <Note tone="ok" title="The requirement was met">
          A secure value was required and the protocol reports this one as secure, so it was
          returned. The check happened at the read, not here.
        </Note>
      ) : null}

      {refused ? (
        <Note tone="att" title="The read refused, and returned no value">
          {refused.reason}
          {/* The refusal names something checkable: the round is in the header
              and the reading's own timestamp is here, so "no" is attached to a
              specific moment rather than being a bare denial. */}
          <span className="fk-ftso-refusal">
            Refused against the reading taken at{' '}
            <Timestamp seconds={refused.timestampSeconds} />.
          </span>
          <span className="fk-ftso-refusal">
            {/* A refusal is a complete answer to the question asked, not an
                error. There is deliberately nothing on this surface that could
                reach the underlying number. */}
            Nothing here holds the value. Refusing is the answer, so there is no flag to override
            and no field to read past.
          </span>
        </Note>
      ) : null}

      {random ? (
        <div className="fk-ftso-provenance">
          <SourceChip observation={random} now={now} />
        </div>
      ) : null}

      {random && !isObserved(random) ? (
        <Note tone="att" title="The random could not be read">
          {random.reason} No value is shown, and none is inferred from the last one.
          {onRefresh ? (
            <button type="button" className="fk-linkish" onClick={onRefresh}>
              Try again
            </button>
          ) : null}
        </Note>
      ) : null}

      {stale ? (
        <Note tone="info" title="This reading is past its freshness budget">
          The current random advances every voting round. What is shown is the one that was read,
          carrying the time it was read at.
          {onRefresh ? (
            <button type="button" className="fk-linkish" onClick={onRefresh}>
              Read it again
            </button>
          ) : null}
        </Note>
      ) : null}
    </Panel>
  )
}
