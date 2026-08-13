'use client'

import { SECTIONS } from '@gallery/sections'
import { GalleryDemo } from './gallery-demo'

/**
 * AccountSheet's live preview. The ten states are the gallery's own `sh-02`
 * section — disconnected through both-ready, including the two drift states the
 * sheet reports but does not repair. Nothing is re-authored here (R6).
 */
const ACCOUNT_CASES = SECTIONS.find((section) => section.id === 'sh-02')!.cases

const CODE = `import { walletConnected } from '@flare-kit/core'
import { useAccounts } from '@flare-kit/react'
import { AccountSheet } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

const COSTON2 = { name: 'Coston2', chainId: 114 }
const XRPL_TESTNET = { name: 'XRPL Testnet' }

export function Accounts() {
  const { context, setIdentity, supplyReadOnly } = useAccounts()

  return (
    <AccountSheet
      context={context}
      // Your wallet adapter connects; the kit is handed the result.
      onConnectEvm={async () => {
        const address = await yourEvmAdapter.connect()
        setIdentity(walletConnected('evm', address, COSTON2))
      }}
      onSupplyReadOnly={(family, input) =>
        supplyReadOnly(family, input, family === 'evm' ? COSTON2 : XRPL_TESTNET)
      }
    />
  )
}`

export function AccountSheetDemo() {
  return <GalleryDemo cases={ACCOUNT_CASES} code={CODE} />
}
