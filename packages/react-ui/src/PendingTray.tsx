import type { PendingOperation } from '@flarekit-dev/core'
import { Note } from './primitives/Note.js'
import { StateChip } from './primitives/StateChip.js'
import { SourceChip } from './primitives/SourceChip.js'
import { observe } from '@flarekit-dev/core'

/**
 * SH-10 — the persistent tray of operations still in flight.
 *
 * Operations are non-blocking and self-reconciling, so this list is never a
 * queue a person has to work through and there is no Resume button. It exists
 * so that navigating away from a mint does not mean losing it.
 */

export interface PendingTrayProps {
  pending: readonly PendingOperation[]
  loading?: boolean
  /** True when the list is what this device knows, not what the chain knows. */
  degraded?: boolean
  /** True on the first render after a reconnect, before reconciliation lands. */
  restored?: boolean
  now: number
  onOpen?: (operationId: string) => void
  theme?: 'light' | 'dark'
  className?: string
}

export function PendingTray({
  pending,
  loading = false,
  degraded = false,
  restored = false,
  now,
  onOpen,
  theme,
  className,
}: PendingTrayProps) {
  const actionRequired = pending.filter((entry) => entry.state === 'action_required')

  return (
    <div
      className={`fk fk-tray${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
    >
      {loading ? (
        <p className="fk-tray-loading" role="status">
          Checking for operations in flight
        </p>
      ) : null}

      {restored ? (
        <Note tone="info" title="Restored">
          These operations were restored from this device. Each one is being reconciled against the
          chain now; what you see is the last state we recorded.
        </Note>
      ) : null}

      {degraded ? (
        <Note tone="att" title="This device only">
          {/* USER-02's coverage limit, repeated where it changes what the list
              means. An operation started elsewhere was never in reach. */}
          This list covers operations started here. An operation you started in another browser will
          not appear.
        </Note>
      ) : null}

      {!loading && pending.length === 0 ? (
        <p className="fk-tray-empty">Nothing is in flight.</p>
      ) : null}

      {actionRequired.length > 0 ? (
        <Note
          tone="att"
          title={
            actionRequired.length === 1
              ? 'One operation needs you'
              : `${actionRequired.length} operations need you`
          }
        >
          {actionRequired.length === 1
            ? 'It cannot move without a decision from you.'
            : 'They cannot move without a decision from you.'}
        </Note>
      ) : null}

      <ul className="fk-tray-list">
        {pending.map((entry) => (
          <li key={entry.operationId} className="fk-tray-item" data-state={entry.state}>
            <StateChip state={entry.state} />
            <span className="fk-tray-cap">{entry.capability}</span>
            <span className="fk-tray-id" title={entry.operationId}>
              {entry.operationId}
            </span>
            <SourceChip
              observation={observe(entry.operationId, entry.source, entry.updatedAt)}
              now={now}
            />
            {onOpen ? (
              <button
                type="button"
                className="fk-linkish"
                onClick={() => onOpen(entry.operationId)}
              >
                Open
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
