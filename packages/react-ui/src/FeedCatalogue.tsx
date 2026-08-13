import type {
  FeedCatalogue as FeedCatalogueModel,
  FeedId,
  FeedReadResult,
  Observation,
} from '@flarekit-dev/core'
import { isObserved } from '@flarekit-dev/core'
import { DataTable, EmptyRow, SkeletonRows } from './primitives/DataTable.js'
import { FeeNote } from './primitives/FeeNote.js'
import { Note } from './primitives/Note.js'
import { SourceChip } from './primitives/SourceChip.js'
import { FeedCatalogueRow } from './FeedCatalogueRow.js'

/**
 * FTSO-01 — every feed this deployment actually serves.
 *
 * Two claims, two reads, two provenance chips. The catalogue is metadata and
 * costs nothing; a value is payable and carries its **own** decimals and its own
 * timestamp. Folding them into one read is exactly how a per-feed decimals cache
 * gets built, and FLR/USD is 6 decimals on the anchor path against 8 at block
 * latency — so a shared exponent is wrong by two orders of magnitude on the
 * first feed anyone opens.
 *
 * Two `AVAIL` members are structurally unreachable here and are not faked.
 * `planned` and `experimental` would need a forward-looking registry to read
 * them from, and there is none: `getSupportedFeedIds()` answers what is served
 * now, so a feed this deployment does not serve is simply absent from it. The M4
 * spec scopes this surface's `AVAIL` to the members that do occur.
 */

const COLUMNS = [
  { key: 'feed', label: 'Feed' },
  { key: 'class', label: 'Class' },
  { key: 'value', label: 'Value at block latency', numeric: true },
  { key: 'availability', label: 'Availability' },
] as const

export interface FeedCatalogueProps {
  /** Metadata: what the deployment serves. Free, and changes rarely. */
  catalogue?: Observation<FeedCatalogueModel>
  /** Values: payable, and each one carries its own decimals and timestamp. */
  readings?: Observation<FeedReadResult>
  loading?: boolean
  now: number
  /** True when the metadata is older than its source class's budget. */
  stale?: boolean
  onSelect?: (feedId: FeedId) => void
  onRefresh?: () => void
  theme?: 'light' | 'dark'
  className?: string
}

export function FeedCatalogue({
  catalogue,
  readings,
  loading = false,
  now,
  stale = false,
  onSelect,
  onRefresh,
  theme,
  className,
}: FeedCatalogueProps) {
  const model = catalogue && isObserved(catalogue) ? catalogue.value : undefined
  const entries = model?.entries ?? []
  const read = readings && isObserved(readings) ? readings.value : undefined
  const byFeedId = new Map((read?.readings ?? []).map((reading) => [reading.feedId, reading]))

  return (
    <div
      className={`fk fk-ftso-catalogue${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
      data-stale={stale ? 'true' : 'false'}
    >
      {/* Two chips because they are two claims. The feed list can be current
          while every value in it is minutes old, and one chip would hide that. */}
      <div className="fk-ftso-provenance">
        {catalogue ? (
          <span className="fk-ftso-prov-pair">
            <span className="fk-ftso-prov-label">Feed list</span>
            <SourceChip observation={catalogue} now={now} />
          </span>
        ) : null}
        {readings ? (
          <span className="fk-ftso-prov-pair">
            <span className="fk-ftso-prov-label">Values</span>
            <SourceChip observation={readings} now={now} />
          </span>
        ) : null}
      </div>

      <DataTable caption="Feeds this deployment serves" columns={COLUMNS}>
        {loading && !catalogue ? (
          <SkeletonRows columns={COLUMNS.length} label="Reading the feed list" />
        ) : null}

        {!loading && !catalogue ? (
          <EmptyRow columns={COLUMNS.length}>No deployment selected.</EmptyRow>
        ) : null}

        {catalogue && isObserved(catalogue) && entries.length === 0 ? (
          <EmptyRow columns={COLUMNS.length}>
            This deployment serves no feeds. The list was read and came back empty — nothing failed.
          </EmptyRow>
        ) : null}

        {entries.map((entry) => {
          const reading = byFeedId.get(entry.feedId)
          return (
            <FeedCatalogueRow
              key={entry.feedId}
              entry={entry}
              asked={readings !== undefined}
              readFailed={readings !== undefined && !isObserved(readings)}
              {...(reading ? { reading } : {})}
              {...(onSelect ? { onSelect } : {})}
            />
          )
        })}
      </DataTable>

      {catalogue && !isObserved(catalogue) ? (
        <Note tone="att" title="The feed list could not be read">
          {catalogue.reason} Nothing is shown above rather than a list that would look identical to
          one the deployment answered.
          {onRefresh ? (
            <button type="button" className="fk-linkish" onClick={onRefresh}>
              Ask again
            </button>
          ) : null}
        </Note>
      ) : null}

      {readings && !isObserved(readings) ? (
        <Note tone="att" title="No values were read">
          {readings.reason} The feeds above are still the ones this deployment serves; only their
          current values are unknown.
        </Note>
      ) : null}

      {read ? <FeeNote quote={read.fee} /> : null}

      {model && model.unusedIndices.length > 0 ? (
        <Note tone="info" title="Why the configuration array is longer than this list">
          <span className="fk-mono">FastUpdatesConfiguration</span> reports index{' '}
          <span className="fk-mono">
            {model.unusedIndices.map((index) => index.toString()).join(', ')}
          </span>{' '}
          as unused. That slot holds an all-zero feed id which reverts when read, so it is stated
          here rather than rendered as a row — {entries.length} feeds against a longer configuration
          array is the deployment's own shape, not a row this surface lost.
        </Note>
      ) : null}

      {model && model.customFeedCount > 0 ? (
        <Note tone="info" title={`${model.customFeedCount} of these are custom feeds`}>
          A custom feed's value comes from a contract registered through Flare Foundation
          governance, not from the FTSO providers' vote. It is a different claim from the protocol
          feeds beside it, which is why the class is a column rather than a footnote.
        </Note>
      ) : null}

      {entries.length > 0 ? (
        <Note tone="info" title="Anchor history and proofs are not claimed from this list">
          Whether a feed is anchored is answered by the data-availability host for one specific
          voting round, never by metadata. Open a feed to ask.
        </Note>
      ) : null}

      {stale ? (
        <Note tone="info" title="This list is not current">
          It was read at a moment now past its freshness budget. A deployment can add or withdraw a
          feed between reads.
          {onRefresh ? (
            <button type="button" className="fk-linkish" onClick={onRefresh}>
              Read it again
            </button>
          ) : null}
        </Note>
      ) : null}
    </div>
  )
}
