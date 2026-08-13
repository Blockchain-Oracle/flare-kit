// packages/react-ui/src/VaultCatalogue.tsx
import { formatExact } from '@flare-kit/core'
import { AssetLogo } from './primitives/AssetLogo.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { SourceChip } from './primitives/SourceChip.js'
import { ToneChip } from './primitives/StateChip.js'
import { type VaultRow, exitLabel, feesLabel, shareModelOf, unverifiedReason } from './vault-catalogue-state.js'

/**
 * VaultCatalogue (LIQ-01). One row per configured vault for the active network:
 * protocol identity, deposit asset, share model (self-share stFXRP vs separate-LP
 * vFXRP), the live exchange rate, live fee(s), the exit modes, and any paused/cap
 * state — each from live reads with a SourceChip, `—` where unknown, never a guess.
 *
 * A vault whose withdraw path is not verified on this network shows all its reads
 * but its withdraw action is a declared-unbuilt affordance (present, disabled,
 * reasoned — the `fk-unbuilt` idiom shared with PoolCatalogue), never a plan that
 * could misrender. A read that could not be fetched renders unavailable, not a
 * confident zero (the M6 F1 rule).
 */

export interface VaultCatalogueProps {
  readonly rows: readonly VaultRow[]
  /** Host clock (unix seconds) for the SourceChip ages — a prop, never `Date.now()`. */
  readonly now: number
  readonly networkLabel?: string
  readonly mockLabel?: string
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

export function VaultCatalogue({ rows, now, networkLabel, mockLabel, theme, className }: VaultCatalogueProps) {
  return (
    <Panel title="Vaults" subtitle={networkLabel} className={`fk fk-vault ${className ?? ''}`} data-theme={theme}>
      {mockLabel ? <Note tone="info" title="Mock">{`Driven by ${mockLabel}. No funds move.`}</Note> : null}
      {rows.length === 0 ? (
        <Note tone="info" title="No vaults">No vaults are configured for this network yet.</Note>
      ) : (
        rows.map((row) => <VaultRowView key={row.config.key} row={row} now={now} />)
      )}
    </Panel>
  )
}

function VaultRowView({ row, now }: { row: VaultRow; now: number }) {
  const { config, reads, provenance } = row
  const model = shareModelOf(config)
  const paused = reads?.paused ?? false

  return (
    <section className="fk-vault-row" data-protocol={config.protocol} data-paused={paused ? 'true' : 'false'}>
      <div className="fk-vault-row-head">
        <AssetLogo symbol={config.asset.symbol} size={24} />
        <div className="fk-vault-row-id">
          <span className="fk-vault-row-name">{config.protocol === 'firelight' ? 'Firelight' : 'Upshift'}</span>
          <span className="fk-vault-row-model">
            {model.kind} · <span className="fk-mono">{model.symbol}</span>
          </span>
        </div>
        {provenance ? <SourceChip observation={provenance} now={now} /> : null}
      </div>

      {reads ? (
        <Details>
          <DetailRow label="Deposit asset" value={<span className="fk-mono">{config.asset.symbol}</span>} />
          <DetailRow
            label="Exchange rate"
            value={<span className="fk-mono">{reads.rate ? `${formatExact(reads.rate)} / ${model.symbol}` : '—'}</span>}
          />
          <DetailRow label="Withdrawal fee" value={<span className="fk-mono">{feesLabel(config, reads)}</span>} />
          <DetailRow label="Exit routes" value={exitLabel(config)} />
          {reads.depositCap ? (
            <DetailRow
              label="Deposit headroom"
              value={<span className="fk-mono">{formatExact(reads.depositCap)}</span>}
              sub="A global vault limit, not standard maxDeposit."
            />
          ) : null}
          {reads.withdrawCap ? (
            <DetailRow label="Withdrawal cap" value={<span className="fk-mono">{formatExact(reads.withdrawCap)}</span>} />
          ) : null}
        </Details>
      ) : (
        <Note tone="att" title="Couldn't read this vault">
          Its live values could not be read right now. This is not a zero — retry when the network settles.
        </Note>
      )}

      {paused ? (
        <Note tone="att" title="Withdrawals paused">
          This vault has paused withdrawals. Deposits and reads are unaffected; the withdraw action is unavailable until it resumes.
        </Note>
      ) : null}

      {reads && !config.withdrawVerified ? (
        <div className="fk-unbuilt" aria-disabled="true">
          <p className="fk-unbuilt-title">Withdraw not built for this network</p>
          <p className="fk-unbuilt-reason">{unverifiedReason(config)}</p>
        </div>
      ) : null}

      {reads && config.withdrawVerified && !paused ? (
        <div className="fk-vault-row-exits">
          {config.exitModes.map((m) => (
            <ToneChip key={m} tone={m === 'instant' ? 'primary' : 'neutral'}>
              {m === 'instant' ? 'Instant exit' : 'Delayed exit'}
            </ToneChip>
          ))}
        </div>
      ) : null}
    </section>
  )
}
