'use client'

import type { FlareNetworkKey } from '@flarekit-dev/contracts'
import { type ReactNode, createContext, useContext } from 'react'

/**
 * The selected network, readable by any panel.
 *
 * `app/[family]/page.tsx` is a server component and the selection lives in the
 * client shell's state, so a panel cannot be handed the network as a prop. It
 * has to read it. Without this the selector changed the top bar while every
 * panel kept rendering the network it was born with — the app naming one
 * network and showing another's assets.
 *
 * Testnet is the fallback outside the provider: a panel mounted outside it is a
 * wiring mistake, and the honest failure for a wiring mistake is the safe
 * network rather than mainnet. `test/selected-network.test.tsx` is what catches
 * the mistake itself.
 */
const Context = createContext<FlareNetworkKey>('coston2')

export function SelectedNetwork({
  network,
  children,
}: {
  network: FlareNetworkKey
  children: ReactNode
}) {
  return <Context.Provider value={network}>{children}</Context.Provider>
}

export function useSelectedNetwork(): FlareNetworkKey {
  return useContext(Context)
}
