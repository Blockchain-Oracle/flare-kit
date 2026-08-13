import {
  type ChainFamily,
  type Portfolio,
  type PortfolioPosition,
  formatExact,
  isObserved,
  isPortfolioEmpty,
  truncateAddress,
} from '@flare-kit/core'
import { AssetLogo } from './primitives/AssetLogo.js'
import { DataTable, EmptyRow, SkeletonRows } from './primitives/DataTable.js'
import { Note } from './primitives/Note.js'
import { SourceChip } from './primitives/SourceChip.js'

/**
 * USER-01 — what two identities hold, with the source and freshness of every
 * number beside it.
 *
 * The rule this surface exists to keep: a value that could not be read renders
 * as "not read", never as zero and never as a dash. Both of those are quantities
 * to a person scanning a column, and M2-AC4 forbids presenting silence as one.
 *
 * The unbuilt position types are listed below the table with no value column at
 * all, because an empty vault row implies a vault you do not have.
 */

const FAMILY_NAME: Record<ChainFamily, string> = { evm: 'Flare', xrpl: 'XRP Ledger' }

const COLUMNS = [
  { key: 'asset', label: 'Asset' },
  { key: 'account', label: 'Account' },
  { key: 'balance', label: 'Balance', numeric: true },
  { key: 'source', label: 'Source' },
] as const

function Row({ position, now }: { position: PortfolioPosition; now: number }) {
  return (
    <tr data-family={position.family} data-kind={position.kind}>
      <td>
        <span className="fk-am-asset">
          <AssetLogo symbol={position.asset} />
          <span className="fk-am-asset-text">
            <span className="fk-table-asset">{position.asset}</span>
            <span className="fk-table-account">{FAMILY_NAME[position.family]}</span>
          </span>
        </span>
      </td>
      <td>
        <span className="fk-table-account" title={position.account}>
          {truncateAddress(position.account)}
        </span>
      </td>
      <td data-numeric="true">
        {isObserved(position.balance) ? (
          // Full stored precision, with its asset. Never abbreviated.
          formatExact(position.balance.value)
        ) : (
          <span className="fk-unread">Not read</span>
        )}
      </td>
      <td>
        <SourceChip observation={position.balance} now={now} />
      </td>
    </tr>
  )
}

export interface PortfolioTableProps {
  portfolio?: Portfolio
  loading?: boolean
  now: number
  /** True when any source disagrees with another about the same position. */
  hasConflict?: boolean
  onOpenSources?: () => void
  theme?: 'light' | 'dark'
  className?: string
}

export function PortfolioTable({
  portfolio,
  loading = false,
  now,
  hasConflict = false,
  onOpenSources,
  theme,
  className,
}: PortfolioTableProps) {
  const positions = portfolio?.positions ?? []
  const empty = portfolio ? isPortfolioEmpty(portfolio) : false
  const unread = positions.filter((entry) => !isObserved(entry.balance))

  return (
    <div
      className={`fk fk-portfolio${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
    >
      {portfolio?.readOnly ? (
        <Note tone="info" title="Read-only">
          These balances are for an address you supplied to watch. Everything here is real; nothing
          here can be signed.
        </Note>
      ) : null}

      <DataTable caption="Balances across your connected accounts" columns={COLUMNS}>
        {loading && !portfolio ? (
          <SkeletonRows columns={COLUMNS.length} label="Reading balances" />
        ) : null}

        {!loading && !portfolio ? (
          <EmptyRow columns={COLUMNS.length}>No accounts are connected yet.</EmptyRow>
        ) : null}

        {portfolio && positions.length === 0 ? (
          <EmptyRow columns={COLUMNS.length}>
            {portfolio.coverage.evm === 'not-connected' && portfolio.coverage.xrpl === 'not-connected'
              ? 'No accounts are connected yet.'
              : 'Nothing was read for the connected accounts.'}
          </EmptyRow>
        ) : null}

        {positions.map((position) => (
          <Row key={position.id} position={position} now={now} />
        ))}
      </DataTable>

      {empty ? (
        <Note tone="info" title="No assets">
          Every source answered, and these accounts hold nothing on either chain.
        </Note>
      ) : null}

      {unread.length > 0 ? (
        <Note tone="att" title="Some balances could not be read">
          {/* The endpoint's own words, per source. A single "failed to load"
              hides which chain is silent, and they fail independently. */}
          {unread.map((entry) => (
            <span key={entry.id} className="fk-account-cannot">
              {entry.asset}:{' '}
              {entry.balance.status === 'unavailable' ? entry.balance.reason : 'No reading.'}
            </span>
          ))}
        </Note>
      ) : null}

      {portfolio?.partialCoverage && unread.length === 0 ? (
        <Note tone="att" title="This is not the whole picture">
          {portfolio.coverage.evm === 'not-connected'
            ? 'No Flare account is connected, so nothing on Flare is included.'
            : null}
          {portfolio.coverage.xrpl === 'not-connected'
            ? 'No XRP Ledger account is connected, so nothing on the XRP Ledger is included.'
            : null}
        </Note>
      ) : null}

      {hasConflict ? (
        <Note tone="att" title="Two sources disagree">
          A direct chain read and an index report different balances for the same position. The
          chain read is shown above.{' '}
          {onOpenSources ? (
            <button type="button" className="fk-linkish" onClick={onOpenSources}>
              Compare the sources
            </button>
          ) : null}
        </Note>
      ) : null}

      {portfolio ? (
        <div className="fk-unbuilt">
          <div className="fk-unbuilt-title">Not covered by this build</div>
          {portfolio.unbuilt.map((type) => (
            <div key={type.kind} className="fk-unbuilt-row">
              <span className="fk-unbuilt-kind">{type.label}</span>
              <span className="fk-unbuilt-reason">{type.reason}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
