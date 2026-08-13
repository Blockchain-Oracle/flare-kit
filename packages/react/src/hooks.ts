import {
  type DirectMintIntent,
  type DirectMintOperation,
  type DirectMintQuote,
  FlareKitError,
  type SerializedError,
  isTerminal,
  toSerializedError,
} from '@flare-kit/core'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useFlareContext } from './provider.js'
import { type ActionBinding, useActionBinding } from './use-accounts.js'

/**
 * `useOperation` and `useDirectMint`.
 *
 * Neither exposes a resume or retry-polling API, because operations are
 * self-reconciling: the provider's interval advances every open operation, and
 * opening the page is the same code path as receiving an event.
 */

export function useOperation(id: string | undefined): DirectMintOperation | undefined {
  const { registry } = useFlareContext()
  return useSyncExternalStore(
    registry.subscribe,
    () => (id ? (registry.get(id) as DirectMintOperation | undefined) : undefined),
    () => undefined,
  )
}

export interface UseDirectMintResult {
  quote(intent: DirectMintIntent): DirectMintQuote
  start(intent: DirectMintIntent): DirectMintOperation | undefined
  operation: DirectMintOperation | undefined
  /** Typed, with its recovery class — never a bare string. */
  error: SerializedError | undefined
  isSettled: boolean
  /**
   * The accounts this quote was made for, and whether they are still the
   * connected ones (M2-R3). Hand it to `NetworkResolutionSheet` when
   * `binding.valid` is false.
   */
  binding: ActionBinding
}

export function useDirectMint(operationId?: string): UseDirectMintResult {
  const { kit, registry, pollMs } = useFlareContext()
  const [activeId, setActiveId] = useState<string | undefined>(operationId)
  const [error, setError] = useState<SerializedError | undefined>(undefined)
  const operation = useOperation(activeId)

  const binding = useActionBinding()

  const quote = useCallback(
    (intent: DirectMintIntent) => {
      const quoted = kit.quote(intent)
      // R-WALLET-008: the terms are bound to the accounts they were computed
      // for, at the moment they were computed.
      binding.record()
      return quoted
    },
    [kit, binding],
  )

  const start = useCallback(
    (intent: DirectMintIntent) => {
      try {
        // Before anything moves. Throws naming both accounts if the wallet
        // switched between the quote and this press (M2-AC6).
        binding.assertStillValid()
        const record = kit.start(intent)
        setError(undefined)
        registry.upsert(record)
        setActiveId(record.id)
        return record
      } catch (cause) {
        // A blocked quote is a state to render, not an exception to throw at a
        // component. AC7's refusal has to be showable.
        setError(toSerializedError(cause))
        return undefined
      }
    },
    [kit, registry, binding],
  )

  // The only clock. Every open operation reconciles on it, so there is nothing
  // for a user to press and nothing to resume.
  useEffect(() => {
    if (!operation || isTerminal(operation.state)) return

    let cancelled = false
    const tick = async () => {
      try {
        const next = await kit.reconcile(operation)
        if (!cancelled) registry.upsert(next)
      } catch (cause) {
        // A failed reading is a failed reading. It never becomes a failed
        // operation, because the canonical outcome is still unknown.
        if (!cancelled && cause instanceof FlareKitError) setError(toSerializedError(cause))
      }
    }

    // Reconcile at once for work already in flight, so opening the page shows
    // current truth immediately. A `ready` operation has nothing to reconcile
    // against — no payment exists yet — so it waits for the interval instead.
    if (operation.state !== 'ready') void tick()
    const timer = setInterval(() => void tick(), pollMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [kit, registry, operation, pollMs])

  return {
    quote,
    start,
    operation,
    error,
    isSettled: operation ? isTerminal(operation.state) : false,
    binding,
  }
}
