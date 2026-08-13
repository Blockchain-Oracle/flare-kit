import {
  type ActivityEntry,
  type ActivityFeed,
  type ActivityFilter,
  type PendingOperation,
  buildActivity,
  exportActivity,
  filterActivity,
  isTerminal,
  networkName,
} from '@flare-kit/core'
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { useFlareContext } from './provider.js'

/**
 * Activity and the pending tray, from the operation registry (M2-R5, SH-10).
 *
 * Both read the same records. A pending operation is not a different kind of
 * thing from a historical one — it is the same durable operation before it
 * settled — so keeping one source for both is what stops a tray and a table
 * disagreeing about the state of the same mint.
 */

export interface UseActivityOptions {
  readonly filter?: ActivityFilter
  /** True while older operations are still being reconciled (USER-02). */
  readonly backfilling?: boolean
}

export interface UseActivityResult {
  readonly feed: ActivityFeed
  /** The filtered view. `feed.entries` stays the unfiltered truth. */
  readonly entries: readonly ActivityEntry[]
  readonly empty: boolean
  /** True when a filter hid everything, which is not the same as no history. */
  readonly filteredEmpty: boolean
  /** The last export failure. USER-02's `export error`. */
  readonly exportError: string | undefined
  /** Returns the JSON, or `undefined` if it refused — never a partial file. */
  exportJson(): string | undefined
}

export function useActivity(options: UseActivityOptions = {}): UseActivityResult {
  const { registry } = useFlareContext()
  const [exportError, setExportError] = useState<string | undefined>(undefined)
  const records = useSyncExternalStore(registry.subscribe, registry.snapshot, registry.snapshot)

  const feed = useMemo(
    () =>
      buildActivity({
        records,
        at: Date.now(),
        ...(options.backfilling === undefined ? {} : { backfilling: options.backfilling }),
      }),
    // The clock is deliberately not a dependency: the feed is a view of the
    // records, and re-deriving it on every tick would replace the array
    // identity under React for no change in content.
    [records, options.backfilling],
  )

  const entries = useMemo(
    () => (options.filter ? filterActivity(feed, options.filter) : feed.entries),
    [feed, options.filter],
  )

  const exportJson = useCallback(() => {
    try {
      const text = exportActivity(feed)
      setExportError(undefined)
      return text
    } catch (cause) {
      // A refused export is reported and nothing is written. A partial file
      // would look complete to whoever opened it later.
      setExportError(cause instanceof Error ? cause.message : String(cause))
      return undefined
    }
  }, [feed])

  return {
    feed,
    entries,
    empty: feed.empty,
    filteredEmpty: entries.length === 0 && !feed.empty,
    exportError,
    exportJson,
  }
}

export interface UsePendingResult {
  readonly pending: readonly PendingOperation[]
  readonly actionRequired: readonly PendingOperation[]
  readonly empty: boolean
}

/** SH-10's tray: everything still open, and what needs a person. */
export function usePending(): UsePendingResult {
  const { registry } = useFlareContext()
  const records = useSyncExternalStore(registry.subscribe, registry.snapshot, registry.snapshot)

  return useMemo(() => {
    const pending = records
      .filter((record) => !isTerminal(record.state))
      .map((record) => ({
        operationId: record.id,
        capability: record.capability,
        state: record.state,
        network: record.network,
        updatedAt: record.updatedAt,
        source: {
          class: 'local' as const,
          provider: 'Operation registry',
          network: networkName(record.network),
          chainId: record.network,
        },
      }))
      .sort((left, right) => right.updatedAt - left.updatedAt)

    return {
      pending,
      actionRequired: pending.filter((entry) => entry.state === 'action_required'),
      empty: pending.length === 0,
    }
  }, [records])
}
