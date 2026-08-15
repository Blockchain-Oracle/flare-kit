import { type OperationRecord, type SerializedError, isTerminal, toSerializedError } from '@flarekit-dev/core'
import { useEffect, useRef, useState } from 'react'

/**
 * `useBridge` — the durable delivery hook (M8-R8). Cross-chain is the first
 * capability whose outcome lives on a DIFFERENT chain than the signature, so the
 * card cannot conclude anything from the source receipt; it must re-read the
 * destination on an interval. This hook owns exactly that poll: given the current
 * operation and a host `reconcile` (which closes over the source+destination clients
 * — read-only, no key), it re-reads while the op is in flight and stops the moment it
 * settles. There is no Resume button; reopening the app re-reads the chain.
 *
 * It is deliberately decoupled from the FAssets provider/kit (the DEX family drives
 * its cards from props): the host builds the quote and unsigned plan with the pure
 * core functions and signs via its own wallet `onSubmit`; the hook only manages the
 * delivery reconcile loop. Memoise `reconcile` (useCallback) so the interval is not
 * torn down every render.
 */

export interface UseBridgeInput<T extends OperationRecord> {
  /** The current operation (the host creates/quotes/plans/submits it via core functions). */
  readonly operation: T | undefined
  /** Re-read the destination and advance the op. Read-only; holds no key. */
  readonly reconcile?: (op: T) => Promise<T>
  /** Poll cadence in ms; the host controls it. Default 15s (LZ delivery is minutes). */
  readonly pollMs?: number
}

export interface UseBridgeResult<T extends OperationRecord> {
  readonly operation: T | undefined
  readonly isSettled: boolean
  /** A failed READING is recorded here; it never moves the operation to failed. */
  readonly error: SerializedError | undefined
}

export function useBridge<T extends OperationRecord>(input: UseBridgeInput<T>): UseBridgeResult<T> {
  const { operation: incoming, reconcile, pollMs = 15_000 } = input
  const [operation, setOperation] = useState<T | undefined>(incoming)
  const [error, setError] = useState<SerializedError | undefined>(undefined)

  // Adopt only a genuinely NEW operation (a different id — the host submitted a fresh
  // send). A host that recreates the same operation object each render must not clobber
  // the poll's progress, so identity is by `id`, not object reference.
  const opRef = useRef<T | undefined>(operation)
  useEffect(() => {
    if (incoming?.id !== opRef.current?.id) {
      setOperation(incoming)
      opRef.current = incoming
    }
  }, [incoming])

  // Poll the destination while in flight. Reads the latest op from a ref so the
  // interval is stable across updates rather than torn down on every reconcile.
  useEffect(() => {
    if (!reconcile) return
    let live = true
    const tick = async () => {
      const op = opRef.current
      if (!op || isTerminal(op.state)) return
      try {
        const next = await reconcile(op)
        if (live) {
          opRef.current = next
          setOperation(next)
          // A transient read failure clears once a later poll succeeds — a lagged
          // Sepolia RPC must not leave a permanent "reading failed" on a live op.
          setError(undefined)
        }
      } catch (cause) {
        // A failed reading is not a failed delivery. Record it; leave the op where
        // the chain last put it (the destination truth has not changed).
        if (live) setError(toSerializedError(cause))
      }
    }
    void tick()
    const timer = setInterval(() => void tick(), pollMs)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [reconcile, pollMs])

  return { operation, isSettled: operation ? isTerminal(operation.state) : false, error }
}
