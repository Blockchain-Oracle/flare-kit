import type { OperationRecord } from '@flare-kit/core'
import { useBridge, type UseBridgeInput, type UseBridgeResult } from './use-bridge.js'

/**
 * `useGasless` — the durable gasless poll (M9-R14). The relayer submits the payment on
 * the payer's behalf, so `succeeded` is a CHAIN read, not the relay's HTTP response: the
 * card cannot conclude anything from `relay_accepted`; it must re-read `paymentSince` on
 * an interval until the transfer confirms. Reads and the plan need no key — the host
 * builds the plan with `buildGaslessPlan` and signs the approval + the PaymentRequest via
 * its own wallet `onSubmit`; this hook owns only the reconcile poll.
 *
 * It reuses the same durable-operation poll as `useBridge` (M9-R13): poll a read-only
 * `reconcile` while in flight, stop at terminal, and clear a transient read error so a
 * lagged RPC never leaves a sticky failure. The default cadence is tighter (6s) because
 * the relayer submits in seconds, not the minutes a LayerZero delivery takes.
 */
export type UseGaslessInput<T extends OperationRecord> = UseBridgeInput<T>
export type UseGaslessResult<T extends OperationRecord> = UseBridgeResult<T>

export function useGasless<T extends OperationRecord>(input: UseGaslessInput<T>): UseGaslessResult<T> {
  return useBridge({ pollMs: 6_000, ...input })
}
