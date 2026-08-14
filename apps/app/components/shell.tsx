'use client'

import type { FlareNetworkKey } from '@flarekit-dev/contracts'
import { FlareProvider } from '@flarekit-dev/react'
import { usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useState } from 'react'
import { useAppKit } from '../lib/kit'
import { readStoredNetwork, storeNetwork } from '../lib/network'
import { AccountArea } from './account-area'
import { Rail } from './rail'
import { TopBar } from './top-bar'

/**
 * The frame every route renders inside. `layout.tsx` stays a server component
 * and mounts this, exactly as `apps/site/app/docs/layout.tsx` mounts
 * `DocsSidebar`: the client component owns the current-route derivation, the
 * server passes only children.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const currentId = pathname.split('/')[1] ?? ''

  // The stored preference is restored after mount, never during render: the
  // server has no localStorage, so reading it inline would make the first
  // client render disagree with the server's and hydration would tear.
  const [network, setNetwork] = useState<FlareNetworkKey>('coston2')
  useEffect(() => {
    setNetwork(readStoredNetwork(window.localStorage))
  }, [])

  const changeNetwork = (key: FlareNetworkKey) => {
    setNetwork(key)
    storeNetwork(window.localStorage, key)
  }

  const kit = useAppKit(network)

  const frame = (
    <div className="app-shell">
      <Rail currentId={currentId} />
      <div className="app-main">
        <TopBar
          network={network}
          onNetworkChange={changeNetwork}
          account={<AccountArea kit={kit} network={network} />}
        />
        <div className="app-panel">{children}</div>
      </div>
    </div>
  )

  // The provider carries the kit AND the account store, so it can only mount
  // once the kit exists. The frame renders either way: a network that will not
  // answer is a stated condition in the top bar, never a blank app.
  return kit.status === 'ready' ? <FlareProvider kit={kit.kit}>{frame}</FlareProvider> : frame
}
