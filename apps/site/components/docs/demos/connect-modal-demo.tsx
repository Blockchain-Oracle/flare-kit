'use client'

import { RECUT_SECTIONS } from '@gallery/recut-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * ConnectModal's live preview. Both cases are the gallery's own `recut-connect`
 * section, and both are a real click target: the modal opens on the button, as
 * it does in a host. Wallet icons are host-provided at runtime (EIP-6963), so
 * with none supplied the rows show the neutral glyph — the honest default, and
 * the one worth seeing.
 */
const CONNECT_CASES = RECUT_SECTIONS.find((section) => section.id === 'recut-connect')!.cases

const CODE = `import { ConnectModal, type WalletOption } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'
import { useState } from 'react'

// The host discovers these — EIP-6963 for the EVM leg, its own adapter for XRPL.
const wallets: WalletOption[] = [
  { id: 'io.metamask', name: 'MetaMask', family: 'evm', detected: true, recent: true },
  { id: 'xaman', name: 'Xaman', family: 'xrpl', detected: true },
]

export function Connect() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Connect wallet
      </button>
      <ConnectModal
        open={open}
        wallets={wallets}
        evmNetwork={{ name: 'Coston2', testnet: true }}
        xrplNetwork={{ name: 'XRPL Testnet', testnet: true }}
        onSelect={(walletId) => {
          setOpen(false)
          yourAdapter.connect(walletId)
        }}
        onClose={() => setOpen(false)}
      />
    </>
  )
}`

export function ConnectModalDemo() {
  return <GalleryDemo cases={CONNECT_CASES} code={CODE} />
}
