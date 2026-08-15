import {
  type AttestationChainState,
  type AttestationIntent,
  type AttestationOperation,
  FlareKitError,
  type SerializedError,
  createAttestationOperation,
  isTerminal,
  reconcileAttestation,
  toSerializedError,
} from '@flarekit-dev/core'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useFlareContext } from './provider.js'

/**
 * An attestation as one non-blocking operation (M3-R1).
 *
 * `request()` returns the moment the record exists. It does not await the
 * verifier, the round, the data availability layer or the chain — a voting
 * round is ninety seconds and finalization roughly twice that, so awaiting any
 * of it would lock a surface for minutes.
 *
 * There is no resume and no retry button. The provider's interval advances
 * every open attestation through `reconcileAttestation`, so opening the page
 * and receiving a tick are the same code path, and a request submitted before a
 * reload is picked up from its own evidence.
 */

export type ReadAttestationState = (
  operation: AttestationOperation,
) => Promise<AttestationChainState>

export interface UseAttestationOptions {
  /** Reads what the protocol says about this request. Live or mock. */
  read: ReadAttestationState
  /** Resume an attestation already in the registry. */
  operationId?: string
}

export interface UseAttestationResult {
  /**
   * Create the operation and return it immediately. The work happens on the
   * reconcile interval; nothing here blocks.
   */
  request(intent: AttestationIntent, hasConsumer: boolean): AttestationOperation | undefined
  operation: AttestationOperation | undefined
  /** Typed, with its recovery class — never a bare string. */
  error: SerializedError | undefined
  isSettled: boolean
  /**
   * Why the operation is waiting, in words, when it is. Distinct from `error`:
   * a round that has not finalized is not a failure, and rendering it as one
   * would be inventing a negative fact (M3-R10).
   */
  waitingReason: string | undefined
}

export function useAttestation(options: UseAttestationOptions): UseAttestationResult {
  const { kit, registry, pollMs } = useFlareContext()
  const [activeId, setActiveId] = useState<string | undefined>(options.operationId)
  const [error, setError] = useState<SerializedError | undefined>(undefined)

  // The reader is held in a ref, as `usePortfolio` does: a caller that rebuilds
  // it inline every render would otherwise restart the interval on every render
  // and never complete a tick.
  const readRef = useRef(options.read)
  readRef.current = options.read

  const operation = useSyncExternalStore(
    registry.subscribe,
    () => (activeId ? (registry.get(activeId) as AttestationOperation | undefined) : undefined),
    () => undefined,
  )

  const request = useCallback(
    (intent: AttestationIntent, hasConsumer: boolean) => {
      try {
        const record = createAttestationOperation({
          intent,
          network: kit.chainId,
          now: Date.now(),
          hasConsumer,
        })
        setError(undefined)
        // Persisted before anything is sent, so a request that is submitted and
        // then lost to a reload is still ours to reconcile.
        registry.upsert(record)
        setActiveId(record.id)
        return record
      } catch (cause) {
        // A refused request is a state to render, not an exception thrown at a
        // component.
        setError(toSerializedError(cause))
        return undefined
      }
    },
    [registry, kit],
  )

  useEffect(() => {
    if (!operation || isTerminal(operation.state)) return

    let cancelled = false
    const tick = async () => {
      try {
        const chain = await readRef.current(operation)
        if (cancelled) return
        registry.upsert(reconcileAttestation(operation, chain, Date.now()))
      } catch (cause) {
        // A reading that could not be taken is a failed reading. It never
        // becomes a failed attestation: the round may be perfectly healthy and
        // the request on its way to consensus.
        if (!cancelled && cause instanceof FlareKitError) setError(toSerializedError(cause))
      }
    }

    // Reconcile at once for work already in flight, so opening the page shows
    // current truth immediately. A `ready` operation has nothing to reconcile
    // against — no request has been prepared yet.
    if (operation.state !== 'ready') void tick()
    const timer = setInterval(() => void tick(), pollMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [registry, operation, pollMs])

  return {
    request,
    operation,
    error,
    isSettled: operation ? isTerminal(operation.state) : false,
    waitingReason: operation?.awaiting?.reason,
  }
}
