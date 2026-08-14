'use client'

import type { FlareNetworkKey } from '@flarekit-dev/contracts'
import { usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useState } from 'react'
import { readStoredNetwork, storeNetwork } from '../lib/network'
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

  return (
    <div className="app-shell">
      <Rail currentId={currentId} />
      <div className="app-main">
        {/* No account control yet. The connect flow is R-APP-010/011/012 and
            belongs to a later plan; an affordance that cannot connect would be
            a fabricated one. */}
        <TopBar network={network} onNetworkChange={changeNetwork} />
        <div className="app-panel">{children}</div>
      </div>
    </div>
  )
}
