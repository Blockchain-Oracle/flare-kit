import {
  type AccountContext,
  type BindingMismatch,
  type ChainFamily,
  type ChainIdentity,
  type NetworkRef,
  type OperationBinding,
  assertBinding,
  bindContext,
  bothReady as bothIdentitiesReady,
  checkBinding,
  createAccountContext,
  disconnected,
  identityFor,
  parseReadOnlyIdentity,
} from '@flare-kit/core'
import { useCallback, useRef, useSyncExternalStore } from 'react'
import { useFlareContext } from './provider.js'

/**
 * Simultaneous EVM and XRPL identity as React state (M2-R2).
 *
 * The kit does not connect wallets. A host owns its wallet adapters and hands
 * the resulting identity in, which is why every M1 surface takes an
 * `onConnect` callback rather than a connector: pretending to own a connection
 * we do not own is how a kit ends up lying about custody.
 *
 * What the kit does own is the shape of the identity, its custody class, and
 * the rule that a supplied read-only address is validated before it is
 * accepted rather than after it fails a network call.
 */

export interface AccountStore {
  snapshot(): AccountContext
  subscribe(listener: () => void): () => void
  setIdentity(identity: ChainIdentity): void
  disconnect(family: ChainFamily): void
}

export function createAccountStore(initial?: Partial<AccountContext>): AccountStore {
  // A stable object identity, for the same reason the operation registry keeps
  // one: a fresh snapshot per call makes useSyncExternalStore loop forever.
  let context = createAccountContext(initial)
  const listeners = new Set<() => void>()

  const commit = (next: AccountContext) => {
    context = next
    for (const listener of listeners) listener()
  }

  return {
    snapshot: () => context,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setIdentity(identity) {
      if (identityFor(context, identity.family) === identity) return
      commit(createAccountContext({ ...context, [identity.family]: identity }))
    },
    disconnect(family) {
      commit(createAccountContext({ ...context, [family]: disconnected(family) }))
    },
  }
}

export interface UseAccountsResult {
  readonly context: AccountContext
  readonly evm: ChainIdentity
  readonly xrpl: ChainIdentity
  readonly bothReady: boolean
  /** Hand in an identity a host wallet adapter produced. */
  setIdentity(identity: ChainIdentity): void
  disconnect(family: ChainFamily): void
  /**
   * SH-02's read-only path. Returns the identity it accepted or the
   * `invalid-identity` it refused, so a surface can render the refusal without
   * the store having taken it.
   */
  supplyReadOnly(family: ChainFamily, input: string, network: NetworkRef): ChainIdentity
  /** Snapshot the accounts an action is being made for (M2-R3). */
  bind(at: number): OperationBinding
  /** Whether a previously bound action still applies to what is connected. */
  isBindingValid(binding: OperationBinding): boolean
}

export function useAccounts(): UseAccountsResult {
  const { accounts } = useFlareContext()
  const context = useSyncExternalStore(
    accounts.subscribe,
    accounts.snapshot,
    accounts.snapshot,
  )

  const supplyReadOnly = useCallback(
    (family: ChainFamily, input: string, network: NetworkRef) => {
      const identity = parseReadOnlyIdentity(family, input, network)
      // An identity we could not read is reported, never stored: storing it
      // would leave the surface claiming an account that does not exist.
      if (identity.status === 'ready') accounts.setIdentity(identity)
      return identity
    },
    [accounts],
  )

  return {
    context,
    evm: context.evm,
    xrpl: context.xrpl,
    bothReady: bothIdentitiesReady(context),
    setIdentity: accounts.setIdentity,
    disconnect: accounts.disconnect,
    supplyReadOnly,
    bind: useCallback((at: number) => bindContext(context, at), [context]),
    isBindingValid: useCallback(
      (binding: OperationBinding) => checkBinding(binding, context).valid,
      [context],
    ),
  }
}

export interface ActionBinding {
  /** The accounts the terms were computed for, once `record` has run. */
  readonly binding: OperationBinding | undefined
  /** Empty while the binding still holds. Feeds `NetworkResolutionSheet`. */
  readonly mismatches: readonly BindingMismatch[]
  readonly valid: boolean
  /** Call when a quote is produced: snapshots the accounts it was made for. */
  record(at?: number): OperationBinding
  /**
   * Call before anything executes. Throws `ACCOUNT_BINDING_MISMATCH`, naming
   * both accounts, when the wallet has moved since the quote.
   */
  assertStillValid(): void
  clear(): void
}

/**
 * M2-R3 as one implementation, used by every capability hook.
 *
 * R-WALLET-008 turns on a quote and its execution being checked against the
 * same accounts. A wallet can switch account or chain between the screen a
 * person read and the button they pressed, and without this the approved terms
 * would execute against an account they never saw. Written once here rather
 * than per capability, so a new capability cannot forget it.
 */
export function useActionBinding(): ActionBinding {
  const { context } = useAccounts()

  // A ref, deliberately not state. A composer calls `quote()` during render to
  // show the current terms, so `record()` runs in the render path — and a
  // `setState` there is an infinite loop, which is exactly what happened when
  // this held state. Nothing needs to re-render when a binding is taken: the
  // account store already re-renders everything when an identity changes, and
  // `valid` is derived below rather than stored.
  const recorded = useRef<OperationBinding | undefined>(undefined)

  const record = useCallback(
    (at: number = Date.now()) => {
      const next = bindContext(context, at)
      recorded.current = next
      return next
    },
    [context],
  )

  const check = recorded.current ? checkBinding(recorded.current, context) : undefined

  return {
    binding: recorded.current,
    mismatches: check?.mismatches ?? [],
    valid: check?.valid ?? true,
    record,
    assertStillValid: useCallback(() => {
      // No binding means nothing was quoted through this hook. Refusing here
      // would block a caller who never opted in; the gate guards a binding
      // that exists, it does not invent one.
      if (recorded.current) assertBinding(recorded.current, context)
    }, [context]),
    clear: useCallback(() => {
      recorded.current = undefined
    }, []),
  }
}
