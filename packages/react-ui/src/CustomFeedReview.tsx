import type { CustomFeedSet, FeedReadResult, Observation } from '@flarekit-dev/core'
import { CUSTOM_FEED_CREATION, formatExact, isObserved, truncateHash } from '@flarekit-dev/core'
import { DataTable, EmptyRow, SkeletonRows } from './primitives/DataTable.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { SourceChip } from './primitives/SourceChip.js'
import { ToneChip } from './primitives/StateChip.js'
import { Timestamp } from './primitives/Timestamp.js'
import { AVAILABILITY_VISUAL, TRUST_VISUAL } from './ftso-visuals.js'

/**
 * FTSO-06 — custom feeds, reviewed rather than configured.
 *
 * The trust claim is the whole surface. A protocol feed's value is what the
 * FTSO providers voted on; a custom feed's comes from a contract somebody else
 * deployed, which the Flare Foundation approved through governance. Both are
 * real and they are not the same claim, so the network is named on screen and
 * the class is never presented as protocol-equivalent.
 *
 * Creation is **blocked**, not unimplemented. `addCustomFeeds(address[])` is
 * governance-gated and the documented route is a request the Foundation reviews
 * off chain — deploying an `IICustomFeed` yields a contract its deployer can
 * read and does *not* yield a feed readable through `FtsoV2`. There is no path
 * by which this kit creates one on any network, so the surface says so with the
 * evidence rather than offering a button that cannot work.
 *
 * Coston2's empty set is an honest observation carrying its date. It is not an
 * error and not an absence of the feature.
 */

/** Why an enumeration source's entry is not rendered as a feed. All observed. */
export type ExcludedCondition = 'invalid_metadata' | 'activation_pending' | 'reverts_on_read'

export interface ExcludedCustomFeed {
  readonly feedId: string
  readonly condition: ExcludedCondition
  /** Which source reported it, named so the disagreement is addressable. */
  readonly reportedBy: string
  readonly detail: string
}

const EXCLUDED_WORD: Record<ExcludedCondition, string> = {
  invalid_metadata: 'Metadata does not decode',
  activation_pending: 'Not yet in the supported set',
  reverts_on_read: 'Reverts when read',
}

/**
 * Three columns, not four.
 *
 * "The updater contract is not reachable from the feed id" is true of **every**
 * row — `IICustomFeed` maps a contract to its id and no vendored interface maps
 * an id back to an address — so it is a property of the class rather than of a
 * feed. As a column it was prose in a narrow cell, which clipped off the panel
 * and took the availability column with it. It is stated once beneath the table.
 */
const COLUMNS = [
  { key: 'feed', label: 'Feed' },
  { key: 'value', label: 'Value through FtsoV2', numeric: true },
  { key: 'availability', label: 'Availability' },
] as const

export interface CustomFeedReviewProps {
  feeds?: Observation<CustomFeedSet>
  /** Values, read through `FtsoV2` — the only path that reaches these feeds. */
  readings?: Observation<FeedReadResult>
  /** Entries an enumeration source reported that this kit refuses to render. */
  excluded?: readonly ExcludedCustomFeed[]
  loading?: boolean
  now: number
  theme?: 'light' | 'dark'
  className?: string
}

export function CustomFeedReview({
  feeds,
  readings,
  excluded = [],
  loading = false,
  now,
  theme,
  className,
}: CustomFeedReviewProps) {
  const set = feeds && isObserved(feeds) ? feeds.value : undefined
  const entries = set?.entries ?? []
  const read = readings && isObserved(readings) ? readings.value : undefined
  const byFeedId = new Map((read?.readings ?? []).map((reading) => [reading.feedId, reading]))
  const trust = TRUST_VISUAL.custom

  return (
    <Panel
      title="Custom feeds"
      subtitle={
        set ? (
          <>
            Read on <span className="fk-mono">{set.network}</span> · chain id{' '}
            <span className="fk-mono">{set.chainId}</span>
          </>
        ) : (
          'No network selected'
        )
      }
      aside={
        <ToneChip tone={trust.tone} glyph={trust.glyph}>
          {trust.word}
        </ToneChip>
      }
      {...(theme ? { theme } : {})}
      {...(className ? { className } : {})}
    >
      <Note tone="info" title="These are not protocol feeds">
        A custom feed's value comes from a contract registered through Flare Foundation governance,
        not from the FTSO providers' vote. It is a different claim from the feeds beside it, and
        this surface will not present the two as equivalent.
      </Note>

      <DataTable caption="Custom feeds on this network" columns={COLUMNS}>
        {loading && !feeds ? (
          <SkeletonRows columns={COLUMNS.length} label="Reading the supported set" />
        ) : null}

        {!loading && !feeds ? (
          <EmptyRow columns={COLUMNS.length}>No network selected.</EmptyRow>
        ) : null}

        {set && entries.length === 0 ? (
          <EmptyRow columns={COLUMNS.length}>
            <span className="fk-mono">{set.network}</span> carries no custom feeds. The supported set
            was read and held none — this is the network's real shape, not a failed read.
          </EmptyRow>
        ) : null}

        {entries.map((entry) => {
          const reading = byFeedId.get(entry.feedId)
          const availability = reading ? 'supported' : read ? 'degraded' : 'not_read'
          const visual = AVAILABILITY_VISUAL[availability]
          return (
            <tr key={entry.feedId} data-feed={entry.name} data-availability={availability}>
              <td>
                <span className="fk-mono">{entry.name}</span>
                {/* Truncated for the same reason as the catalogue's: an
                    unbreakable 42-character id sets the column width. */}
                <span className="fk-table-account" title={entry.feedId}>
                  {truncateHash(entry.feedId)}
                </span>
              </td>
              <td data-numeric="true">
                {reading ? (
                  <>
                    <span className="fk-ftso-value">{formatExact(reading.price)}</span>
                    <span className="fk-table-account">
                      {reading.decimals} dp
                      <br />
                      <Timestamp seconds={reading.timestampSeconds} />
                    </span>
                  </>
                ) : (
                  <span className="fk-unread">{read ? 'no value came back' : 'not read'}</span>
                )}
              </td>
              <td>
                <ToneChip tone={visual.tone} glyph={visual.glyph}>
                  {visual.word}
                </ToneChip>
              </td>
            </tr>
          )
        })}
      </DataTable>

      {/* True of every row, so it is said once. Not a gap in this kit:
          `IICustomFeed` declares `feedId()`, mapping a contract to its id, and no
          vendored interface maps an id back to an address — so the feed's own
          `calculateFee()` and `getCurrentFeed()` are unreachable without an
          address supplied out of band. */}
      {entries.length > 0 ? (
        <Note tone="att" title="The updater contracts are not reachable from here">
          A custom feed's id does not resolve to its updater's address — the interface only maps
          the other way — so each feed's own <span className="fk-mono">calculateFee()</span> and{' '}
          <span className="fk-mono">getCurrentFeed()</span> cannot be called without an address
          supplied out of band. Every value above therefore comes through{' '}
          <span className="fk-mono">FtsoV2.getFeedsById</span>, and the direct read ships declared
          rather than faked.
        </Note>
      ) : null}

      {set && entries.length === 0 ? (
        <Note tone="info" title="It was empty last time too">
          Observed empty on <span className="fk-mono">{set.previouslyObserved.at}</span>. Carrying
          the dated prior observation is what makes this an answer rather than an ambiguous blank.
          {set.previouslyObserved.names.length > 0 ? (
            <>
              {' '}
              Then it held:{' '}
              <span className="fk-mono">{set.previouslyObserved.names.join(', ')}</span>.
            </>
          ) : null}
        </Note>
      ) : null}

      {excluded.length > 0 ? (
        <div className="fk-unbuilt">
          <div className="fk-unbuilt-title">Reported, and not rendered as feeds</div>
          {excluded.map((item) => (
            <div key={item.feedId} className="fk-unbuilt-row" data-condition={item.condition}>
              <span className="fk-unbuilt-kind">{EXCLUDED_WORD[item.condition]}</span>
              <span className="fk-unbuilt-reason">
                <span className="fk-mono fk-fdc-value">{item.feedId}</span>
                <br />
                Reported by <span className="fk-mono">{item.reportedBy}</span>. {item.detail}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <Note tone="att" title="Creating a custom feed is blocked">
        {CUSTOM_FEED_CREATION.reason}
        <span className="fk-fdc-note">
          <span className="fk-fdc-note-label">Evidence</span> {CUSTOM_FEED_CREATION.evidence}
        </span>
      </Note>

      {feeds ? (
        <div className="fk-ftso-provenance">
          <span className="fk-ftso-prov-pair">
            <span className="fk-ftso-prov-label">Feed set</span>
            <SourceChip observation={feeds} now={now} />
          </span>
          {readings ? (
            <span className="fk-ftso-prov-pair">
              <span className="fk-ftso-prov-label">Values</span>
              <SourceChip observation={readings} now={now} />
            </span>
          ) : null}
        </div>
      ) : null}

      {feeds && !isObserved(feeds) ? (
        <Note tone="att" title="The custom feed set could not be read">
          {feeds.reason} Nothing is shown above. An unread set is not an empty one, and the two must
          not look the same.
        </Note>
      ) : null}
    </Panel>
  )
}
