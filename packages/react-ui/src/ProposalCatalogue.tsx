import type { ProposalSource, ProposalSummary } from '@flare-kit/core'
import type { UseProposalsResult } from '@flare-kit/react'
import { DataTable, EmptyRow, SkeletonRows } from './primitives/DataTable.js'
import { Note } from './primitives/Note.js'
import { ToneChip } from './primitives/StateChip.js'
import { PROPOSAL_SOURCE_LABEL, PROPOSAL_STATE_VISUAL } from './proposal-visuals.js'

/**
 * ProposalCatalogue (M12 T10) — the mainnet-read proposal lens.
 *
 * A read lens, not an operation surface: proposals are read from Flare MAINNET
 * (the write/verify target of the rest of governance is Coston2), so every row
 * carries a cross-network "Flare mainnet" label rather than the surface claiming
 * one network for the whole app.
 *
 * The load-bearing honesty (mirrors AttestationCatalogue's three-outcomes-stay-
 * three): `useProposals` returns `proposals: ProposalSummary[] | undefined`, and
 * the two non-rows states are NOT the same claim.
 *   - `undefined` + `error`  → the discovery read FAILED → UNAVAILABLE. An RPC
 *     outage must never wear the shape of an observed-empty catalogue.
 *   - `[]`                    → a CONFIRMED-empty discovery → honest-empty. Only
 *     a successful read produces it (Coston2 hosts no proposal — probe-confirmed).
 *   - non-empty              → a row per proposal.
 * Collapsing the first two would turn a network blip into a false "no proposals"
 * statement about the chain — so they render DIFFERENTLY, and neither ever
 * fabricates a row.
 */

const COLUMNS = [
  { key: 'proposal', label: 'Proposal' },
  { key: 'state', label: 'State' },
  { key: 'network', label: 'Network' },
] as const

type Availability = 'loading' | 'unavailable' | 'empty' | 'listed'

export interface ProposalCatalogueProps {
  /** The `useProposals` result: `undefined` = failed/pending, `[]` = confirmed-empty, else rows. */
  readonly proposals: UseProposalsResult['proposals']
  readonly loading?: UseProposalsResult['loading']
  readonly error?: UseProposalsResult['error']
  /** The cross-network label stamped on every row — proposals are read from mainnet. */
  readonly networkLabel?: string
  readonly onSelect?: (id: bigint, source: ProposalSource) => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

function Row({
  proposal,
  networkLabel,
  onSelect,
}: {
  proposal: ProposalSummary
  networkLabel: string
  onSelect?: (id: bigint, source: ProposalSource) => void
}) {
  const visual = PROPOSAL_STATE_VISUAL[proposal.state]
  const id = proposal.id.toString()

  return (
    <tr data-proposal={id} data-source={proposal.source} data-state={proposal.state}>
      <td>
        {onSelect ? (
          <button type="button" className="fk-linkish" onClick={() => onSelect(proposal.id, proposal.source)}>
            <span className="fk-mono">{id}</span>
          </button>
        ) : (
          <span className="fk-mono">{id}</span>
        )}
        <span className="fk-table-account">{PROPOSAL_SOURCE_LABEL[proposal.source]}</span>
      </td>
      <td>
        <ToneChip tone={visual.tone} glyph={visual.glyph}>
          {visual.word}
        </ToneChip>
      </td>
      <td>
        {/* A LABEL, not a state: this row is read from `networkLabel`, and the
            chip carries the word alone (no outcome glyph). */}
        <ToneChip tone="neutral">{networkLabel}</ToneChip>
      </td>
    </tr>
  )
}

export function ProposalCatalogue({
  proposals,
  loading = false,
  error,
  networkLabel = 'Flare mainnet',
  onSelect,
  theme,
  className,
}: ProposalCatalogueProps) {
  const rows = proposals ?? []
  const unavailable = proposals === undefined && error !== undefined
  const confirmedEmpty = proposals !== undefined && rows.length === 0
  const stillLoading = loading && proposals === undefined && error === undefined
  const availability: Availability = stillLoading
    ? 'loading'
    : unavailable
      ? 'unavailable'
      : confirmedEmpty
        ? 'empty'
        : 'listed'

  return (
    <div
      className={`fk fk-gov-catalogue${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
      data-availability={availability}
    >
      <DataTable caption="Proposals on Flare mainnet" columns={COLUMNS}>
        {stillLoading ? <SkeletonRows columns={COLUMNS.length} label="Discovering proposals" /> : null}

        {/* `[]` — a CONFIRMED-empty discovery. Distinct sentence from the
            unavailable row below, because "nothing failed" is the whole point. */}
        {confirmedEmpty ? (
          <EmptyRow columns={COLUMNS.length}>
            No active proposals on this network. The discovery read succeeded and came back empty — nothing failed.
          </EmptyRow>
        ) : null}

        {/* `undefined` + error — the read FAILED. Never the honest-empty
            sentence: a list nobody could read is not a list that is empty. */}
        {unavailable ? (
          <EmptyRow columns={COLUMNS.length}>
            Proposals unavailable — the discovery read didn't reach {networkLabel}.
          </EmptyRow>
        ) : null}

        {rows.map((proposal) => (
          <Row
            key={`${proposal.source}:${proposal.id}`}
            proposal={proposal}
            networkLabel={networkLabel}
            {...(onSelect ? { onSelect } : {})}
          />
        ))}
      </DataTable>

      {/* The failure, stated with its reason — distinct from an empty result and
          never collapsed into one. */}
      {unavailable ? (
        <Note tone="att" title="Proposals couldn't be read">
          {error} Nothing is listed above rather than a list that would look identical to one the chain answered empty.
        </Note>
      ) : null}

      {/* A LATER read failed while a good one is still held (the hook keeps its
          last value): the rows are shown, but stated as previously-read, never
          as a fresh result. */}
      {error !== undefined && rows.length > 0 ? (
        <Note tone="att" title="The last refresh didn't land">
          {error} These are the proposals from the previous successful read — not a fresh result.
        </Note>
      ) : null}

      {availability === 'listed' ? (
        <Note tone="info" title="Read from Flare mainnet">
          These proposals are read from {networkLabel}. Delegation and voting elsewhere in this kit target Coston2 — this
          catalogue is a cross-network read lens, which is why every row is labelled.
        </Note>
      ) : null}
    </div>
  )
}
