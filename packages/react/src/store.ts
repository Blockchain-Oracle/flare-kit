import type { OperationRecord, OperationStore } from '@flare-kit/core'
import { isTerminal } from '@flare-kit/core'

/**
 * The provider's in-memory registry of live operations, with subscriptions.
 *
 * Separate from `OperationStore` on purpose. The store is durable and async;
 * this is the synchronous snapshot React renders from, which is what
 * `useSyncExternalStore` needs to avoid tearing under concurrent rendering.
 * The two are kept in step by the provider, not by either one knowing about
 * the other.
 */
/**
 * Any capability's record. The registry is deliberately capability-agnostic:
 * a mint and a redemption share one durable record type, so one registry holds
 * both and a portfolio can list them together without knowing which is which.
 */
export type AnyOperation = OperationRecord

export interface OperationRegistry {
  get(id: string): AnyOperation | undefined
  snapshot(): readonly AnyOperation[]
  upsert(record: AnyOperation): void
  subscribe(listener: () => void): () => void
}

export function createOperationRegistry(durable?: OperationStore): OperationRegistry {
  let records: readonly AnyOperation[] = []
  const listeners = new Set<() => void>()

  const emit = () => {
    for (const listener of listeners) listener()
  }

  return {
    get(id) {
      return records.find((record) => record.id === id)
    },

    // A stable array identity matters: returning a fresh array every call makes
    // useSyncExternalStore loop forever.
    snapshot() {
      return records
    },

    upsert(record) {
      const existing = records.find((r) => r.id === record.id)
      if (existing === record) return
      // Ignore a stale write. Reconciliation can be in flight from more than
      // one place, and an older reading must never overwrite a newer one.
      if (existing && existing.updatedAt > record.updatedAt) return

      records = existing
        ? records.map((r) => (r.id === record.id ? record : r))
        : [record, ...records]

      // Persist, but never block the render path on it. A durable store that is
      // slow or unavailable must not stop the UI from showing what it knows.
      void durable?.put(record).catch(() => {})
      emit()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function openOperations(
  records: readonly AnyOperation[],
): readonly AnyOperation[] {
  return records.filter((record) => !isTerminal(record.state))
}
