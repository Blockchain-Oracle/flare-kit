import type { AccountContext, DirectMintKit, OperationStore } from '@flare-kit/core'
import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { type OperationRegistry, createOperationRegistry } from './store.js'
import { type AccountStore, createAccountStore } from './use-accounts.js'

/**
 * The provider takes a kit and asks nothing else of it.
 *
 * `DirectMintKit` is the whole contract, so the same component tree runs
 * against the mock or against a live kit with no branch anywhere in the UI.
 * That is what makes the mock worth having: components cannot special-case it,
 * because they cannot tell.
 */

export interface FlareContextValue {
  readonly kit: DirectMintKit
  readonly registry: OperationRegistry
  /** Simultaneous EVM and XRPL identity for this session (M2-R2). */
  readonly accounts: AccountStore
  /** How often to reconcile open operations, in milliseconds. */
  readonly pollMs: number
}

const FlareContext = createContext<FlareContextValue | undefined>(undefined)

export interface FlareProviderProps {
  kit: DirectMintKit
  /** Optional durable store. Operations survive reload when one is supplied. */
  store?: OperationStore
  /**
   * Reconciliation interval. Operations are non-blocking and self-reconciling,
   * so this is the only clock in the system.
   */
  pollMs?: number
  /**
   * Identities already known at mount — a restored session, or a read-only
   * address supplied by the host. Read once; the store owns them afterwards.
   */
  initialAccounts?: Partial<AccountContext>
  children: ReactNode
}

/**
 * One kit is one session, so its operations are shared by every provider using
 * it. A widget mounted in two places shows one operation in one state, rather
 * than two copies drifting apart. Weakly keyed, so nothing is retained once the
 * kit is gone.
 */
const REGISTRIES = new WeakMap<DirectMintKit, OperationRegistry>()

function registryFor(kit: DirectMintKit, store: OperationStore | undefined): OperationRegistry {
  const existing = REGISTRIES.get(kit)
  if (existing) return existing
  const created = createOperationRegistry(store)
  REGISTRIES.set(kit, created)
  return created
}

export function FlareProvider({
  kit,
  store,
  pollMs = 2_000,
  initialAccounts,
  children,
}: FlareProviderProps) {
  // Accounts belong to the mounted session, not to the kit: two apps sharing a
  // mock kit are still two people with two wallets. Created once, so a
  // re-render never drops a connection.
  const [accounts] = useState(() => createAccountStore(initialAccounts))

  const value = useMemo<FlareContextValue>(
    () => ({ kit, registry: registryFor(kit, store), accounts, pollMs }),
    [kit, store, accounts, pollMs],
  )

  return <FlareContext.Provider value={value}>{children}</FlareContext.Provider>
}

export function useFlareContext(): FlareContextValue {
  const value = useContext(FlareContext)
  if (!value) {
    throw new Error(
      'No FlareProvider found. Wrap your app in <FlareProvider kit={...}> — pass createMockKit() to run without a wallet or network.',
    )
  }
  return value
}

/** The kit itself, for a surface that needs to label its mode or read settings. */
export function useFlareKit(): DirectMintKit {
  return useFlareContext().kit
}
