import {
  type Observation,
  type Portfolio,
  type SourceConflict,
  formatExact,
  isObserved,
  staleness,
} from '@flare-kit/core'
import { Note } from './primitives/Note.js'
import { SourceChip, SourceLine } from './primitives/SourceChip.js'

/**
 * USER-03 — how each value on the portfolio was obtained.
 *
 * The drawer exists because R-DATA-005's source classes are only useful if a
 * person can inspect them. Its hardest job is the conflict case: when a chain
 * read and an index disagree, both claims are shown side by side and neither is
 * quietly dropped. Resolving that silently is what turns a data problem into a
 * trust problem.
 */

function Claim({
  label,
  observation,
  now,
}: {
  label: string
  observation: Observation<{ value: bigint; decimals: number; asset: string }>
  now: number
}) {
  return (
    <div className="fk-conflict-claim">
      <span className="fk-events-label">{label}</span>
      <span>{isObserved(observation) ? formatExact(observation.value) : 'Not read'}</span>
      <SourceChip observation={observation} now={now} />
    </div>
  )
}

export interface SourceDrawerProps {
  portfolio?: Portfolio
  conflicts?: readonly SourceConflict[]
  now: number
  theme?: 'light' | 'dark'
  className?: string
}

export function SourceDrawer({
  portfolio,
  conflicts = [],
  now,
  theme,
  className,
}: SourceDrawerProps) {
  const positions = portfolio?.positions ?? []
  const unavailable = positions.filter((entry) => !isObserved(entry.balance))
  const stale = positions.filter((entry) => staleness(entry.balance, now).stale)

  return (
    <div
      className={`fk fk-drawer${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
    >
      {conflicts.length > 0 ? (
        <section className="fk-drawer-group">
          <div className="fk-drawer-title">Sources that disagree</div>
          <Note tone="att" title="Both claims are shown">
            A direct chain read is canonical. An index is derived from the chain and can lag or be
            wrong. Neither is discarded here — you are seeing what each one says.
          </Note>
          {conflicts.map((conflict) => (
            <div key={conflict.positionId} className="fk-conflict">
              <span className="fk-events-label">{conflict.asset}</span>
              <Claim label="Canonical" observation={conflict.canonical} now={now} />
              <Claim label="Other source" observation={conflict.other} now={now} />
            </div>
          ))}
        </section>
      ) : null}

      {unavailable.length > 0 ? (
        <section className="fk-drawer-group">
          <div className="fk-drawer-title">Sources that did not answer</div>
          {unavailable.map((entry) => (
            <div key={entry.id} className="fk-unbuilt-row">
              <span className="fk-unbuilt-kind">{entry.asset}</span>
              <span className="fk-unbuilt-reason">
                {entry.balance.status === 'unavailable' ? entry.balance.reason : null}
              </span>
              <SourceLine observation={entry.balance} now={now} />
            </div>
          ))}
        </section>
      ) : null}

      <section className="fk-drawer-group">
        <div className="fk-drawer-title">Every value on this portfolio</div>
        {positions.length === 0 ? (
          <p className="fk-unbuilt-reason">Nothing has been read yet.</p>
        ) : null}
        {positions.map((entry) => (
          <div key={entry.id} className="fk-unbuilt-row">
            <span className="fk-unbuilt-kind">{entry.asset}</span>
            <SourceLine observation={entry.balance} now={now} />
          </div>
        ))}
      </section>

      {stale.length > 0 ? (
        <Note tone="att" title={`${stale.length} of these are past their freshness budget`}>
          A stale value is the last thing we actually saw, not a guess at the current one. It stays
          on screen with its age rather than being replaced by a blank.
        </Note>
      ) : null}

      {portfolio ? (
        <section className="fk-drawer-group">
          <div className="fk-drawer-title">Sources this build does not have</div>
          {/* Declared, not omitted: a person comparing sources needs to know
              which ones were never asked. */}
          <div className="fk-unbuilt-row">
            <span className="fk-unbuilt-kind">Indexer</span>
            <span className="fk-unbuilt-reason">
              No indexer is connected, so nothing here is indexed data.
            </span>
          </div>
          <div className="fk-unbuilt-row">
            <span className="fk-unbuilt-kind">Cache</span>
            <span className="fk-unbuilt-reason">
              Nothing is served from a cache; every value above was read when it says it was.
            </span>
          </div>
        </section>
      ) : null}
    </div>
  )
}
