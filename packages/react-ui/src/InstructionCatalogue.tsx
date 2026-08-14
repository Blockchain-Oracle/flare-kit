// packages/react-ui/src/InstructionCatalogue.tsx
import type { InstructionRow } from '@flare-kit/core'
import { DataTable, EmptyRow, SkeletonRows } from './primitives/DataTable.js'
import { Note } from './primitives/Note.js'
import { ToneChip } from './primitives/StateChip.js'
import {
  INSTRUCTION_AVAILABILITY_VISUAL,
  denominationNoun,
  feeDropsLabel,
  instructionEffect,
  instructionIdHex,
  instructionLabel,
} from './instruction-visuals.js'

/**
 * InstructionCatalogue (SA-02, M13-R10) — capability DISCOVERY, not a menu.
 *
 * The rows are the protocol's eleven built-in instructions, but every row's availability is
 * READ off the live deployment (`R-SA-002`): an instruction needing a vault type this
 * controller registers none of is `Not served here` with the reason, an instruction whose
 * vault registry could not be read is `Unknown`, and the three legacy collateral-reservation
 * commands are `Superseded` — the deployment's own documentation sends users to FAssets
 * minting, which the kit already drives.
 *
 * The three negative states stay three. Collapsing `unknown` into `unavailable` would tell a
 * user their deployment lacks a vault when in truth an RPC call failed; collapsing
 * `superseded` into either would blame the deployment for a protocol decision.
 *
 * The list is never empty and never filtered down to the composable rows. An instruction
 * hidden because this deployment cannot serve it reads as an instruction the protocol does
 * not have.
 */

const COLUMNS = [
  { key: 'instruction', label: 'Instruction' },
  { key: 'value', label: 'Value field' },
  { key: 'fee', label: 'Fee', numeric: true },
  { key: 'availability', label: 'Availability' },
] as const

export interface InstructionCatalogueProps {
  /** Always the full vocabulary. `undefined` means no read has been attempted yet. */
  readonly rows?: readonly InstructionRow[]
  readonly loading?: boolean
  readonly networkLabel?: string
  readonly mockLabel?: string
  /** Offered only for rows the deployment can actually serve. */
  readonly onSelect?: (instructionId: number) => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

/**
 * The reason EVERY row shares, when they all share one.
 *
 * An unreadable controller gives all eleven rows the same sentence, and printing it eleven
 * times buries the rows it is meant to qualify. When the reasons differ — the live Coston2
 * shape, where three rows are superseded and eight are available — each row keeps its own,
 * because then it genuinely is a fact about that row.
 */
function sharedReasonOf(rows: readonly InstructionRow[]): string | undefined {
  if (rows.length === 0) return undefined
  const reasons = new Set(
    rows.map((row) => (row.availability.kind === 'available' ? '' : row.availability.reason)),
  )
  if (reasons.size !== 1) return undefined
  const only = [...reasons][0]
  return only === '' ? undefined : only
}

function Row({
  row,
  onSelect,
  showReason,
}: { row: InstructionRow; onSelect?: (id: number) => void; showReason: boolean }) {
  const { instruction, availability } = row
  const visual = INSTRUCTION_AVAILABILITY_VISUAL[availability.kind]
  const selectable = availability.kind === 'available' && onSelect

  return (
    <tr data-instruction={instructionIdHex(instruction.id)} data-availability={availability.kind}>
      <td>
        <span className="fk-sa-row-id fk-mono">{instructionIdHex(instruction.id)}</span>{' '}
        {selectable ? (
          <button type="button" className="fk-linkish" onClick={() => onSelect(instruction.id)}>
            <span className="fk-mono fk-sa-row-name">{instructionLabel(instruction)}</span>
          </button>
        ) : (
          <span className="fk-mono fk-sa-row-name">{instructionLabel(instruction)}</span>
        )}
        {/* Prose, so it renders in the body face at paragraph width — the mono face is for
            exact values, and a sentence set in it reads as data. */}
        <span className="fk-sa-row-summary">{instructionEffect(instruction)}</span>
        {/* The reason is prose and belongs under the name, at paragraph width — the
            AttestationCatalogue lesson. In the status column it clips to a sliver. */}
        {showReason && availability.kind !== 'available' ? (
          <span className="fk-sa-row-reason">{availability.reason}</span>
        ) : null}
        {/* The ids, and only the ids. The namespace warning they carry is one fact about the
            whole table, and repeating it under all eight vault rows drowned the ids it was
            meant to qualify — it is stated once, below. */}
        {row.eligibleVaultIds && row.eligibleVaultIds.length > 0 ? (
          <span className="fk-sa-row-reason">
            <span className="fk-sa-row-reason-label">Controller vault ids</span>{' '}
            <span className="fk-mono">{row.eligibleVaultIds.join(', ')}</span>
          </span>
        ) : null}
        {row.eligibleAgentVaultIds && row.eligibleAgentVaultIds.length > 0 ? (
          <span className="fk-sa-row-reason">
            <span className="fk-sa-row-reason-label">Agent vault ids</span>{' '}
            <span className="fk-mono">{row.eligibleAgentVaultIds.join(', ')}</span>
          </span>
        ) : null}
      </td>
      {/* The same 80 bits mean five different things across these eleven rows, so the
          column says which, and never renders the field as a bare quantity. */}
      <td>
        <span className="fk-mono">{denominationNoun(instruction.denomination)}</span>
      </td>
      {/* An unread fee is `—`. It is NOT the default fee: on mainnet four ids charge 950000
          against a 500000 default, so substituting it would quote a payment the controller
          refuses — with the XRP already gone. */}
      <td data-numeric="true">
        <span className="fk-mono fk-sa-row-fee">{feeDropsLabel(row.feeDrops)}</span>
      </td>
      <td>
        <ToneChip tone={visual.tone} glyph={visual.glyph}>
          {visual.word}
        </ToneChip>
      </td>
    </tr>
  )
}

export function InstructionCatalogue({
  rows,
  loading = false,
  networkLabel,
  mockLabel,
  onSelect,
  theme,
  className,
}: InstructionCatalogueProps) {
  const unknown = (rows ?? []).filter((row) => row.availability.kind === 'unknown')
  const anyVaultIds = (rows ?? []).some((row) => (row.eligibleVaultIds?.length ?? 0) > 0)
  const sharedReason = sharedReasonOf(rows ?? [])

  return (
    <div
      className={`fk fk-sa-catalogue${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
    >
      {networkLabel || mockLabel ? (
        <div className="fk-sa-catalogue-head">
          {networkLabel ? <span className="fk-sa-net">{networkLabel}</span> : null}
          {mockLabel ? <ToneChip tone="att">{mockLabel}</ToneChip> : null}
        </div>
      ) : null}

      <DataTable caption="Instructions this deployment can serve" columns={COLUMNS}>
        {loading && !rows ? (
          <SkeletonRows columns={COLUMNS.length} label="Reading the deployment" />
        ) : null}
        {/* A table with no rows and no explanation is a CLAIM — "this deployment serves
            nothing" — and here it would be made before any read was attempted. The
            vocabulary is eleven instructions long and never empty, so the only way to
            reach this is a caller that has not asked yet, and it says exactly that. */}
        {!loading && !rows ? (
          <EmptyRow columns={COLUMNS.length}>
            No deployment has been read yet, so nothing is known about what it serves. This is
            not an empty catalogue.
          </EmptyRow>
        ) : null}
        {(rows ?? []).map((row) => (
          <Row
            key={row.instruction.id}
            row={row}
            showReason={sharedReason === undefined}
            {...(onSelect ? { onSelect } : {})}
          />
        ))}
      </DataTable>

      {/* Stated ONCE, because it is one fact about the whole table. A plan that resolved a
          kit vault id against this controller would deposit somewhere else entirely. */}
      {anyVaultIds ? (
        <Note tone="info" title="These vault ids are the controller’s own">
          Vault ids come from the deployed controller, not from the kit’s vault registry. On
          this network the two namespaces disagree, so an id taken from the wrong one names a
          different vault.
        </Note>
      ) : null}

      {/* Not an error and not an empty catalogue: the vocabulary is still shown, and what we
          could not determine is named as undetermined. */}
      {sharedReason ? (
        <Note tone="info" title="Every row here says the same thing">
          {sharedReason}
        </Note>
      ) : null}

      {unknown.length > 0 ? (
        <Note tone="info" title="Some rows could not be determined">
          The deployment state these need could not be read, so their availability is unknown
          — not unavailable. Nothing about this controller is claimed from a read that did not
          land.
        </Note>
      ) : null}
    </div>
  )
}
