import type { FeedHistory, HistoryPoint, Observation } from '@flare-kit/core'
import { amount, formatExact, isObserved, quoteAssetOf } from '@flare-kit/core'
import { DataTable, EmptyRow, SkeletonRows } from './primitives/DataTable.js'
import { Note } from './primitives/Note.js'
import { SourceChip } from './primitives/SourceChip.js'
import { ToneChip } from './primitives/StateChip.js'
import { HISTORY_VISUAL } from './ftso-visuals.js'

/**
 * FTSO-02's history — one row per voting round, including the rounds that
 * answered nothing.
 *
 * A table rather than a chart, and that is a correctness decision rather than a
 * stylistic one. A line drawn across a gap is an invented price: the renderer
 * would interpolate between the two values either side of a retention boundary
 * and put a number on screen that no round ever committed to. A missing interval
 * is an explicit row here, and it says which of the four things it is.
 *
 * The row this file exists for is **committed, not retrievable**. The Relay's
 * merkle root outlives the data-availability host's leaves by roughly 297 days,
 * so the chain genuinely asserts a commitment for a value that can no longer be
 * fetched. Nothing failed and nothing is missing — the commitment is real and
 * the leaf is gone, and that is a third answer.
 */

const COLUMNS = [
  { key: 'round', label: 'Voting round', numeric: true },
  { key: 'value', label: 'Value', numeric: true },
  { key: 'turnout', label: 'Turnout', numeric: true },
  { key: 'status', label: 'What this round answered' },
] as const

function Row({ point }: { point: HistoryPoint }) {
  const visual = HISTORY_VISUAL[point.status]
  const feed = point.feed
  const price = feed
    ? amount(BigInt(feed.body.value), feed.body.decimals, quoteAssetOf(feed.name))
    : undefined

  return (
    <tr data-round={point.votingRoundId.toString()} data-status={point.status}>
      <td data-numeric="true">{point.votingRoundId.toString()}</td>

      <td data-numeric="true">
        {price && feed ? (
          <>
            <span className="fk-ftso-value">{formatExact(price)}</span>
            {/* Per reading, never per feed: one live batch returned 8, 9 and 2
                decimals for three feeds, and the anchor path disagrees with the
                block-latency path for the same asset. */}
            <span className="fk-table-account">{feed.body.decimals} dp</span>
          </>
        ) : (
          <span className="fk-unread">no value</span>
        )}
      </td>

      <td data-numeric="true">
        {feed ? (
          <span className="fk-mono">{feed.body.turnoutBIPS} BIPS</span>
        ) : (
          <span className="fk-unread">—</span>
        )}
      </td>

      <td>
        <ToneChip tone={visual.tone} glyph={visual.glyph}>
          {visual.word}
        </ToneChip>
        {point.reason ? <span className="fk-fdc-note">{point.reason}</span> : null}
      </td>
    </tr>
  )
}

export interface FeedHistoryTableProps {
  /**
   * Carries who served these rounds and when — M4-R9. Before it did, nothing
   * could age a table of rounds read hours ago, so FTSO-02's required `stale`
   * had nothing to hang on.
   */
  history?: Observation<FeedHistory>
  /** Which feed these rounds belong to, named in the caption. */
  feedName?: string
  loading?: boolean
  /** True when the reading is past its source class's freshness budget. */
  stale?: boolean
  now?: number
  onRefresh?: () => void
  theme?: 'light' | 'dark'
  className?: string
}

export function FeedHistoryTable({
  history,
  feedName,
  loading = false,
  stale = false,
  now,
  onRefresh,
  theme,
  className,
}: FeedHistoryTableProps) {
  const read = history && isObserved(history) ? history.value : undefined
  const points = read?.points ?? []
  const retrieved = points.filter((point) => point.status === 'retrieved')
  const unretrievable = points.filter((point) => point.status === 'committed_not_retrievable')
  const unasked = points.filter((point) => point.status === 'could_not_ask')

  return (
    <div
      className={`fk fk-ftso-history${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
      data-stale={stale ? 'true' : 'false'}
    >
      {history && now !== undefined ? (
        <div className="fk-ftso-provenance">
          <span className="fk-ftso-prov-pair">
            <span className="fk-ftso-prov-label">History</span>
            <SourceChip observation={history} now={now} />
          </span>
        </div>
      ) : null}

      <DataTable
        caption={
          /* The rounds are a column of exact prices; without the feed they
             belong to, the table is a column of numbers with no subject. */
          feedName
            ? `Anchor-feed history for ${feedName}, by voting round`
            : 'Anchor-feed history by voting round'
        }
        columns={COLUMNS}
      >
        {loading && !history ? (
          <SkeletonRows columns={COLUMNS.length} label="Walking the round range" />
        ) : null}

        {!loading && !history ? (
          <EmptyRow columns={COLUMNS.length}>No round range selected.</EmptyRow>
        ) : null}

        {read && points.length === 0 ? (
          <EmptyRow columns={COLUMNS.length}>
            The requested range holds no rounds. Nothing was asked and nothing failed.
          </EmptyRow>
        ) : null}

        {points.map((point) => (
          <Row key={point.votingRoundId.toString()} point={point} />
        ))}
      </DataTable>

      {unretrievable.length > 0 ? (
        <Note tone="att" title="The retention boundary is inside this range">
          {unretrievable.length} of these {points.length} rounds were finalized on chain — the Relay
          still publishes their merkle root — but the data-availability host no longer serves the
          leaf. Newest such round:{' '}
          <span className="fk-mono">{read?.retentionBoundary?.toString()}</span>. These values
          were committed and cannot be retrieved; they are neither errors nor gaps in the protocol.
        </Note>
      ) : null}

      {read && retrieved.length > 0 && retrieved.length < points.length ? (
        <Note tone="info" title="This range is partial">
          {retrieved.length} of {points.length} rounds came back with a value. The oldest one the
          host actually served here is round{' '}
          <span className="fk-mono">{read.oldestRetrievedRound?.toString()}</span> — discovered by
          asking, not assumed, because the boundary moves.
        </Note>
      ) : null}

      {read && retrieved.length === 0 && points.length > 0 ? (
        <Note tone="att" title="Nothing in this range could be retrieved">
          Every round here answered with something other than a value. The rows above say which,
          per round; none of them is an assertion that the price did not exist.
          {onRefresh ? (
            <button type="button" className="fk-linkish" onClick={onRefresh}>
              Ask again
            </button>
          ) : null}
        </Note>
      ) : null}

      {history && !isObserved(history) ? (
        <Note tone="att" title="The history could not be read">
          {history.reason} No rounds are shown. An unread range is not an empty one.
        </Note>
      ) : null}

      {stale ? (
        <Note tone="info" title="These rounds are past their freshness budget">
          They are shown carrying the time they were read. The retention boundary moves, so an old
          reading can name a floor that has since advanced.
          {onRefresh ? (
            <button type="button" className="fk-linkish" onClick={onRefresh}>
              Read them again
            </button>
          ) : null}
        </Note>
      ) : null}

      {unasked.length > 0 ? (
        <Note tone="info" title="Some rounds were never asked">
          {unasked.length} rounds could not be put to the host at all. Silence from a host is not an
          answer about a round, so those rows claim nothing either way.
        </Note>
      ) : null}
    </div>
  )
}
