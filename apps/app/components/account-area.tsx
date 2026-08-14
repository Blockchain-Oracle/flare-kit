'use client'

import type { FlareNetworkKey } from '@flarekit-dev/contracts'
import { useAccounts } from '@flarekit-dev/react'
import { Note } from '@flarekit-dev/react-ui'
import type { KitState } from '../lib/kit'
import { ConnectControl } from './connect'

/**
 * The bridge between the account control and the account store.
 *
 * `ConnectControl` takes the context and hands identities back, so this is the
 * only place that touches the store — one source of truth for who is connected,
 * and a control that stays testable without a provider.
 */
function Connected({ network }: { network: FlareNetworkKey }) {
  const { context, setIdentity } = useAccounts()
  return <ConnectControl context={context} network={network} onIdentity={setIdentity} />
}

/**
 * What the top bar shows while the kit is still being built, or could not be.
 *
 * A kit that cannot read the chain is reported as exactly that. It does not
 * fall back to a simulation, and it does not offer a Connect button that would
 * attach a wallet to an app that cannot read anything for it.
 */
export function AccountArea({ kit, network }: { kit: KitState; network: FlareNetworkKey }) {
  if (kit.status === 'ready') return <Connected network={network} />
  if (kit.status === 'loading') return <span className="app-kit-status fk-mono">Connecting…</span>
  return (
    <Note tone="att" title="Network unavailable">
      {kit.reason}
    </Note>
  )
}
