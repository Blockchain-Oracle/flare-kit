import type { FamilyRow, FamilyStatus, Observation } from '@flarekit-dev/core'
import { isObserved } from '@flarekit-dev/core'
import { DataTable, EmptyRow, SkeletonRows } from './primitives/DataTable.js'
import { Note } from './primitives/Note.js'
import { SourceChip } from './primitives/SourceChip.js'
import { ToneChip } from './primitives/StateChip.js'
import type { Glyph, Tone } from './state-visuals.js'

/**
 * FDC-01 — which attestation families this deployment actually serves.
 *
 * The surface exists to stop a built-in table being mistaken for protocol
 * truth. Every row says both what the kit claims and what the verifier
 * answered, and where those differ the deployment wins and the row says so.
 *
 * The three outcomes stay three. "The verifier disagreed", "we could not reach
 * the verifier" and "this family is unavailable" render differently, because
 * collapsing the middle one turns a network blip into a false statement about
 * the protocol.
 */

/** Colour is never the first signal: every status carries a glyph and a word. */
const STATUS_VISUAL: Record<FamilyStatus, { tone: Tone; glyph: Glyph; word: string }> = {
  supported: { tone: 'ok', glyph: 'done', word: 'Supported' },
  planned: { tone: 'neutral', glyph: 'waiting', word: 'Planned' },
  deprecated: { tone: 'att', glyph: 'failed', word: 'Withdrawn' },
  unavailable: { tone: 'neutral', glyph: 'unknown', word: 'Not served here' },
}

/**
 * Three columns, not five.
 *
 * The consumer sentence and the deprecation note are prose, and prose in a
 * narrow cell is either clipped or rendered as a one-word-per-line sliver —
 * both were true of the first version of this table. They belong under the
 * family name, where they have the width of a paragraph. What stays in a column
 * is what is genuinely tabular: a status, and a group/source pair.
 */
const COLUMNS = [
  { key: 'family', label: 'Family' },
  { key: 'status', label: 'Status' },
  { key: 'sources', label: 'Verifier group / source' },
] as const

function Row({ row, onSelect }: { row: FamilyRow; onSelect?: (name: string) => void }) {
  const visual = STATUS_VISUAL[row.status] ?? STATUS_VISUAL.unavailable
  const sources = row.family.sources.coston2
  const selectable = row.status === 'supported' && onSelect

  return (
    <tr data-family={row.family.name} data-status={row.status} data-agreement={row.agreement}>
      <td>
        {selectable ? (
          <button type="button" className="fk-linkish" onClick={() => onSelect(row.family.name)}>
            <span className="fk-mono">{row.family.name}</span>
          </button>
        ) : (
          <span className="fk-mono">{row.family.name}</span>
        )}
        <span className="fk-table-account">{row.family.summary}</span>

        {/* `planned` is never rendered as supported (M3-R4): the reason it is
            not supported is stated, not implied by the absence of a link. */}
        {row.status === 'planned' ? (
          <span className="fk-fdc-note">Served here; this kit ships no builder for it.</span>
        ) : null}
        {row.family.deprecationNote ? (
          <span className="fk-fdc-note">{row.family.deprecationNote}</span>
        ) : null}
        <span className="fk-fdc-note">
          <span className="fk-fdc-note-label">Consumed by</span> {row.family.consumer}
        </span>
        {row.family.bindsProofOwner ? (
          <span className="fk-fdc-note">
            <span className="fk-fdc-note-label">Proof owner</span> bound in the request; only that
            address can present the proof.
          </span>
        ) : null}
      </td>
      <td>
        <ToneChip tone={visual.tone} glyph={visual.glyph}>
          {visual.word}
        </ToneChip>
      </td>
      <td>
        {sources.length === 0 ? (
          <span className="fk-unread">None on this network</span>
        ) : (
          sources.map((source) => (
            <span key={source.sourceId} className="fk-fdc-source">
              <span className="fk-mono">{source.group}</span>
              <span className="fk-mono fk-fdc-source-id">{source.sourceId}</span>
              <span className="fk-table-account">{source.chain}</span>
            </span>
          ))
        )}
      </td>
    </tr>
  )
}

export interface AttestationCatalogueProps {
  catalogue?: Observation<readonly FamilyRow[]>
  loading?: boolean
  now: number
  /** True when the catalogue is older than its source class's budget. */
  stale?: boolean
  onSelect?: (familyName: string) => void
  onRefresh?: () => void
  theme?: 'light' | 'dark'
  className?: string
}

export function AttestationCatalogue({
  catalogue,
  loading = false,
  now,
  stale = false,
  onSelect,
  onRefresh,
  theme,
  className,
}: AttestationCatalogueProps) {
  const rows = catalogue && isObserved(catalogue) ? catalogue.value : []
  const disagreements = rows.filter(
    (row) => row.agreement === 'table_claims_more' || row.agreement === 'verifier_serves_more',
  )
  const unchecked = rows.filter((row) => row.agreement === 'unreachable')

  return (
    <div
      className={`fk fk-fdc-catalogue${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
      data-stale={stale ? 'true' : 'false'}
    >
      {catalogue ? (
        <div className="fk-fdc-provenance">
          <SourceChip observation={catalogue} now={now} />
        </div>
      ) : null}

      <DataTable caption="Attestation families this deployment serves" columns={COLUMNS}>
        {loading && !catalogue ? (
          <SkeletonRows columns={COLUMNS.length} label="Asking the verifier" />
        ) : null}

        {!loading && !catalogue ? (
          <EmptyRow columns={COLUMNS.length}>No deployment selected.</EmptyRow>
        ) : null}

        {rows.map((row) => (
          <Row key={row.family.name} row={row} {...(onSelect ? { onSelect } : {})} />
        ))}
      </DataTable>

      {/* The verifier could not be reached at all. Not an empty catalogue, and
          not the built-in table presented as though it had been checked. */}
      {catalogue && !isObserved(catalogue) ? (
        <Note tone="att" title="The family list could not be checked">
          {catalogue.reason} Nothing is shown above rather than a list that would
          look identical to a verified one.
          {onRefresh ? (
            <button type="button" className="fk-linkish" onClick={onRefresh}>
              Ask again
            </button>
          ) : null}
        </Note>
      ) : null}

      {disagreements.length > 0 ? (
        <Note tone="att" title="The built-in table and this verifier disagree">
          {disagreements.map((row) => (
            <span key={row.family.name} className="fk-account-cannot">
              <span className="fk-mono">{row.family.name}</span>: {row.note}
            </span>
          ))}
        </Note>
      ) : null}

      {unchecked.length > 0 ? (
        <Note tone="info" title="Some rows were not checked">
          {/* Distinct from unavailable on purpose. A group we could not reach
              has said nothing, and silence is not a denial. */}
          {unchecked.map((row) => (
            <span key={row.family.name} className="fk-account-cannot">
              <span className="fk-mono">{row.family.name}</span>: {row.note}
            </span>
          ))}
        </Note>
      ) : null}

      {stale ? (
        <Note tone="info" title="This list is not current">
          It was read at a moment now past its freshness budget. The protocol can
          add or withdraw a family between reads.
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
