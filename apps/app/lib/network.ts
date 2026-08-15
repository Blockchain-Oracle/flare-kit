import { type FlareNetworkKey, FLARE_NETWORKS } from '@flarekit-dev/contracts'

/**
 * Exactly the networks the protocol has. There is no Mock entry: mock mode is a
 * documentation surface, and this app connects to a real network or shows
 * nothing. An unrecognised stored value falls back to testnet rather than
 * throwing — a corrupt preference must not brick the app — but it never falls
 * back to something that is not a chain.
 */
export const SELECTABLE_NETWORKS = Object.keys(FLARE_NETWORKS) as readonly FlareNetworkKey[]

export const NETWORK_STORAGE_KEY = 'flare-kit:app:network:v1'

const DEFAULT_NETWORK: FlareNetworkKey = 'coston2'

export function readStoredNetwork(storage: Pick<Storage, 'getItem'>): FlareNetworkKey {
  const stored = storage.getItem(NETWORK_STORAGE_KEY)
  return stored !== null && (SELECTABLE_NETWORKS as string[]).includes(stored)
    ? (stored as FlareNetworkKey)
    : DEFAULT_NETWORK
}

export function storeNetwork(storage: Pick<Storage, 'setItem'>, key: FlareNetworkKey): void {
  storage.setItem(NETWORK_STORAGE_KEY, key)
}
