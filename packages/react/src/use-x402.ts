import type { OperationRecord } from '@flare-kit/core'
import { useBridge, type UseBridgeInput, type UseBridgeResult } from './use-bridge.js'

/**
 * `useX402` — the durable x402 poll (M9-R14). x402's outcome has TWO independent legs
 * (the on-chain settlement and the HTTP resource); the host's `reconcile` re-reads both
 * and applies `reconcileX402`, and this hook polls it while the op is in flight — e.g.
 * the host re-opened the card before the settlement was read. Parse → sign →
 * settle-and-fetch is driven by the host with the pure core functions and its own
 * `onSubmit`; the hook owns only the reconcile poll, and the settlement and resource stay
 * two independent states in the operation it advances.
 *
 * Reuses the same durable-operation poll as `useBridge` / `useGasless` (M9-R13). The
 * default cadence (8s) suits a facilitator settlement that lands in seconds.
 */
export type UseX402Input<T extends OperationRecord> = UseBridgeInput<T>
export type UseX402Result<T extends OperationRecord> = UseBridgeResult<T>

export function useX402<T extends OperationRecord>(input: UseX402Input<T>): UseX402Result<T> {
  return useBridge({ pollMs: 8_000, ...input })
}
