'use client'

import { type FlareNetworkKey, FLARE_NETWORKS } from '@flarekit-dev/contracts'
import type { ReactNode } from 'react'
import { SELECTABLE_NETWORKS } from '../lib/network'

/**
 * Two controls and nothing else: which network, and who you are. Anything else
 * competing for this row makes both harder to find.
 */
export function TopBar({
  network,
  onNetworkChange,
  account,
}: {
  network: FlareNetworkKey
  onNetworkChange: (key: FlareNetworkKey) => void
  account?: ReactNode
}) {
  return (
    <div className="app-topbar">
      <label className="app-network">
        <span className="app-network-label">Network</span>
        {/* fk-mono, not mono: the mono face is the kit's class. `.mono` is a
            site-only helper and would be an undefined class here. */}
        <select
          className="fk-mono"
          value={network}
          onChange={(event) => onNetworkChange(event.target.value as FlareNetworkKey)}
        >
          {SELECTABLE_NETWORKS.map((key) => (
            <option key={key} value={key}>
              {FLARE_NETWORKS[key].name}
            </option>
          ))}
        </select>
      </label>
      <div className="app-account">{account}</div>
    </div>
  )
}
