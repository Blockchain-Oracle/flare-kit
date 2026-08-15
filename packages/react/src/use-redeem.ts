import {
  type RedeemContext,
  type RedeemIntent,
  type RedeemOperation,
  type RedeemQuote,
  type SerializedError,
  isTerminal,
  toSerializedError,
} from '@flarekit-dev/core'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useFlareContext } from './provider.js'
import { type ActionBinding, useActionBinding } from './use-accounts.js'

/**
 * `useRedeem`, the mirror of `useDirectMint`.
 *
 * It is a separate hook rather than a mode on the mint hook because the two
 * capabilities have different intents, different quotes and different waits —
 * a redemption waits on a counterparty who might not perform. Sharing one hook
 * would mean a union type at every call site and a component that has to ask
 * which half it is in.
 */

export interface UseRedeemResult {
  quote(intent: RedeemIntent, context?: RedeemContext): RedeemQuote
  start(intent: RedeemIntent): RedeemOperation | undefined
  operation: RedeemOperation | undefined
  /** Typed, with its recovery class — never a bare string. */
  error: SerializedError | undefined
  isSettled: boolean
  /** The accounts this quote was made for, and whether they still hold (M2-R3). */
  binding: ActionBinding
}

export function useRedeem(operationId?: string): UseRedeemResult {
  const { kit, registry, pollMs } = useFlareContext()
  const [id, setId] = useState<string | undefined>(operationId)
  const [error, setError] = useState<SerializedError | undefined>(undefined)

  const operation = useSyncExternalStore(
    registry.subscribe,
    () => (id ? (registry.get(id) as RedeemOperation | undefined) : undefined),
    () => undefined,
  )

  const binding = useActionBinding()

  const quote = useCallback(
    (intent: RedeemIntent, context: RedeemContext = {}) => {
      const quoted = kit.quoteRedeem(intent, undefined, context)
      // A redemption burns FXRP from one account and pays XRP to another, so
      // both identities are bound, not just the signer.
      binding.record()
      return quoted
    },
    [kit, binding],
  )

  const start = useCallback(
    (intent: RedeemIntent) => {
      try {
        setError(undefined)
        // Before the burn. A switched account would otherwise burn from one
        // account against terms approved for another (M2-AC6).
        binding.assertStillValid()
        const record = kit.startRedeem(intent)
        registry.upsert(record)
        setId(record.id)
        return record
      } catch (cause) {
        // A refusal is a state to render, not an exception to escape the
        // component. The quote already said why.
        setError(toSerializedError(cause))
        return undefined
      }
    },
    [kit, registry, binding],
  )

  useEffect(() => {
    if (!operation || isTerminal(operation.state)) return

    let live = true
    const tick = async () => {
      try {
        const next = await kit.reconcileRedeem(operation)
        if (live) registry.upsert(next)
      } catch (cause) {
        // A failed reading is not a failed redemption. Record it and keep the
        // operation where the chain last put it.
        if (live) setError(toSerializedError(cause))
      }
    }

    // Reconcile at once for work already in flight. A `ready` redemption has no
    // request on chain yet, so it waits for the interval instead.
    if (operation.state !== 'ready') void tick()
    const timer = setInterval(() => void tick(), pollMs)
    return () => {
      live = false
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
