import type { ActivityEntry, ActivityFeed } from '@flare-kit/core'
import { chainEventsOf } from '@flare-kit/core'
import { DataTable, EmptyRow, SkeletonRows } from './primitives/DataTable.js'
import { EvidenceChip } from './primitives/EvidenceChip.js'
import { Note } from './primitives/Note.js'
import { StateChip } from './primitives/StateChip.js'
import { formatInstant } from './primitives/Timestamp.js'

/**
 * USER-02 — every operation this installation has started, with its underlying
 * events still reachable.
 *
 * R-DATA-003 is the rule this surface exists to keep: a mint's ledger payment,
 * its attestation round and its Flare execution are three identifiers on three
 * systems. They are rendered as three chips in three groups, never reduced to
 * one "transaction hash" column — there is no such thing for this operation.
 */

const COLUMNS = [
  { key: 'operation', label: 'Operation' },
  { key: 'state', label: 'State' },
  { key: 'events', label: 'Underlying events' },
  { key: 'updated', label: 'Updated', numeric: true },
] as const

function EventGroup({ label, items }: { label: string; items: ActivityEntry['evidence'] }) {
  if (items.length === 0) return null
  return (
    <div className="fk-events-group">
      <span className="fk-events-label">{label}</span>
      {items.map((item) => (
        <EvidenceChip key={`${item.kind}-${item.value}`} item={item} />
      ))}
    </div>
  )
}

function Row({ entry }: { entry: ActivityEntry }) {
  const events = chainEventsOf(entry)
  return (
    <tr data-state={entry.state}>
      <td>
        <span className="fk-table-asset">{entry.capability}</span>
        <span className="fk-table-account" title={entry.operationId}>
          {entry.operationId}
        </span>
      </td>
      <td>
        <StateChip state={entry.state} />
      </td>
      <td>
        {/* Three groups, because they are three systems. */}
        <EventGroup label="XRP Ledger" items={events.xrpl} />
        <EventGroup label="Data Connector" items={events.attestation} />
        <EventGroup label="Flare" items={events.flare} />
        <EventGroup label="Other" items={events.other} />
        {entry.evidence.length === 0 ? (
          <span className="fk-unbuilt-reason">Nothing has been recorded for this yet.</span>
        ) : null}
      </td>
      <td data-numeric="true">{formatInstant(entry.updatedAt)}</td>
    </tr>
  )
}

export interface ActivityTableProps {
  feed?: ActivityFeed
  /** The filtered view, when a filter is applied. Defaults to every entry. */
  entries?: readonly ActivityEntry[]
  loading?: boolean
  exportError?: string
  onExport?: () => void
  theme?: 'light' | 'dark'
  className?: string
}

export function ActivityTable({
  feed,
  entries,
  loading = false,
  exportError,
  onExport,
  theme,
  className,
}: ActivityTableProps) {
  const shown = entries ?? feed?.entries ?? []
  const filtered = Boolean(entries && feed && entries.length < feed.entries.length)

  return (
    <div
      className={`fk fk-activity${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
    >
      {feed?.backfilling ? (
        <Note tone="info" title="Still reading history">
          Older operations are still being reconciled. This list will grow.
        </Note>
      ) : null}

      <DataTable caption="Operations you have started" columns={COLUMNS}>
        {loading && !feed ? (
          <SkeletonRows columns={COLUMNS.length} label="Reading your operations" />
        ) : null}

        {feed && shown.length === 0 ? (
          <EmptyRow columns={COLUMNS.length}>
            {feed.backfilling
              ? 'Nothing found yet — history is still being read.'
              : filtered
                ? 'No operation matches this filter.'
                : 'You have not started an operation on this device.'}
          </EmptyRow>
        ) : null}

        {shown.map((entry) => (
          <Row key={entry.operationId} entry={entry} />
        ))}
      </DataTable>

      {feed && !feed.coverage.complete ? (
        <Note tone="info" title="What this covers">
          {feed.coverage.reason}
        </Note>
      ) : null}

      {onExport ? (
        <div className="fk-activity-actions">
          <button type="button" className="fk-linkish" onClick={onExport}>
            Export as JSON
          </button>
        </div>
      ) : null}

      {exportError ? (
        <Note tone="att" title="Nothing was exported">
          {/* A partial file would look complete to whoever opened it later. */}
          {exportError} No file was written.
        </Note>
      ) : null}
    </div>
  )
}
