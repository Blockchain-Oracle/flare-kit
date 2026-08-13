'use client'

import { useAccounts, useFlareContext } from '@flarekit-dev/react'
import { MockKitProvider } from './mock-kit-provider'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import { createMockKit } from '@flarekit-dev/core'
import '@flarekit-dev/react-ui/styles.css'

// One kit is one session. Create it once, outside render.
const kit = createMockKit({ seed: 'demo' })

export function App({ children }) {
  return (
    <FlareProvider kit={kit} pollMs={2_000}>
      {children}
    </MockKitProvider>
  )
}`

/**
 * The provider's own proof of wiring: a child reads the context back through
 * the public hooks, so what the readout shows is what a component under this
 * provider would get. Nothing here is authored — the kit's label, chain and
 * poll interval are read from the context on this render.
 */
function Probe() {
  const { kit, pollMs, registry } = useFlareContext()
  const { evm, xrpl, bothReady } = useAccounts()

  return (
    <HookReadout
      name="useFlareContext"
      value={{
        kit: { isMock: kit.isMock, label: kit.label, chainId: kit.chainId },
        pollMs,
        operationsInRegistry: registry.snapshot().length,
        accounts: { evm: evm.status, xrpl: xrpl.status, bothReady },
      }}
    />
  )
}

export function FlareProviderDemo() {
  return (
    <Preview code={CODE}>
      <MockKitProvider>
        <Probe />
      </MockKitProvider>
    </Preview>
  )
}
