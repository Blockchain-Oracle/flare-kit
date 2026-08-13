// packages/react-ui/src/RouteCatalogue.tsx
import { formatExact } from '@flarekit-dev/core'
import { AssetLogo } from './primitives/AssetLogo.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { SourceChip } from './primitives/SourceChip.js'
import { ToneChip } from './primitives/StateChip.js'
import { type RouteRow, primitiveLabel, routeChainsLabel, routeUnverifiedReason } from './route-catalogue-state.js'

/**
 * RouteCatalogue (M8-R7). One row per configured cross-chain route for the active
 * network: the source → destination pair, the primitive (OFT bridge / compose redeem
 * to native XRP), the live cross-chain fee, and the verified state — each from live
 * reads with a SourceChip, `—` where unknown, never a guess.
 *
 * A route whose destination delivery is not live-verified shows its config but its
 * bridge action is a declared-unbuilt affordance (present, disabled, reasoned — the
 * `fk-unbuilt` idiom shared with PoolCatalogue/VaultCatalogue), never a plan that
 * could misrender. A fee that could not be read renders unavailable, not a confident
 * zero (the M6 F1 rule).
 */

export interface RouteCatalogueProps {
  readonly rows: readonly RouteRow[]
  /** Host clock (unix seconds) for the SourceChip ages — a prop, never `Date.now()`. */
  readonly now: number
  readonly networkLabel?: string
  readonly mockLabel?: string
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

export function RouteCatalogue({ rows, now, networkLabel, mockLabel, theme, className }: RouteCatalogueProps) {
  return (
    <Panel title="Cross-chain routes" subtitle={networkLabel} className={`fk fk-route ${className ?? ''}`} data-theme={theme}>
      {mockLabel ? <Note tone="info" title="Mock">{`Driven by ${mockLabel}. No funds move.`}</Note> : null}
      {rows.length === 0 ? (
        <Note tone="info" title="No routes">No cross-chain routes are configured for this network yet.</Note>
      ) : (
        rows.map((row) => <RouteRowView key={row.route.key} row={row} now={now} />)
      )}
    </Panel>
  )
}

function RouteRowView({ row, now }: { row: RouteRow; now: number }) {
  const { route, reads, provenance } = row

  return (
    <section className="fk-route-row" data-kind={route.kind} data-verified={route.bridgeVerified ? 'true' : 'false'}>
      <div className="fk-route-row-head">
        <AssetLogo symbol={route.asset.symbol} size={24} />
        <div className="fk-route-row-id">
          <span className="fk-route-row-name">{routeChainsLabel(route)}</span>
          <span className="fk-route-row-kind">{primitiveLabel(route)}</span>
        </div>
        {route.bridgeVerified ? (
          <ToneChip tone="primary">Verified</ToneChip>
        ) : (
          <ToneChip tone="neutral">Configured</ToneChip>
        )}
        {provenance ? <SourceChip observation={provenance} now={now} /> : null}
      </div>

      {reads ? (
        <Details>
          <DetailRow label="Asset" value={<span className="fk-mono">{route.asset.symbol}</span>} />
          <DetailRow
            label="Cross-chain fee"
            value={<span className="fk-mono">{reads.fee ? formatExact(reads.fee) : '—'}</span>}
            sub="Quoted by the OFT before signing; paid in the source chain's native token."
          />
          <DetailRow label="Destination" value={<span className="fk-mono">{route.to.oft}</span>} />
        </Details>
      ) : (
        <Note tone="att" title="Couldn't read this route">
          Its live fee could not be read right now. This is not a zero — retry when the network settles.
        </Note>
      )}

      {!route.bridgeVerified ? (
        <div className="fk-unbuilt" aria-disabled="true">
          <p className="fk-unbuilt-title">Bridge not built for this route</p>
          <p className="fk-unbuilt-reason">{routeUnverifiedReason(route)}</p>
        </div>
      ) : null}
    </section>
  )
}
