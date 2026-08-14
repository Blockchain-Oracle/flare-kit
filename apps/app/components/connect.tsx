'use client'

import { type FlareNetworkKey, FLARE_NETWORKS } from '@flarekit-dev/contracts'
import { type AccountContext, type ChainIdentity, truncateAddress } from '@flarekit-dev/core'
import { useInjectedWallets } from '@flarekit-dev/react'
import { AccountSheet, Button, ConnectModal, Modal, Note } from '@flarekit-dev/react-ui'
import { useEffect, useState } from 'react'
import { connectWallet, readRecentWallet, rememberWallet, toWalletOptions } from '../lib/connect'

/**
 * The account control.
 *
 * It takes the account context and hands identities back out, rather than
 * reaching into the account store itself — the same contract every kit surface
 * uses, and the reason this renders honestly with no provider, no wallet and no
 * network. Disconnected is a first-class state (R-APP-011): with nothing
 * connected this offers to connect and claims nothing else.
 *
 * The app holds no key. It asks a wallet; the wallet decides and signs.
 */
export function ConnectControl({
  context,
  network = 'coston2',
  onIdentity,
}: {
  context?: AccountContext
  network?: FlareNetworkKey
  onIdentity?: (identity: ChainIdentity) => void
} = {}) {
  const wallets = useInjectedWallets()
  const [open, setOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const chain = FLARE_NETWORKS[network]
  // The address the store actually holds, or nothing. Never a placeholder.
  const address = context?.evm.address

  // Read after mount, never during render: the server has no storage, so an
  // inline read would make the first client render disagree with the prerender.
  const [recent, setRecent] = useState<string | undefined>(undefined)
  useEffect(() => {
    setRecent(readRecentWallet(globalThis.localStorage))
  }, [])

  const select = async (walletId: string) => {
    const wallet = wallets.find((candidate) => candidate.id === walletId)
    if (!wallet) return
    setFailure(undefined)
    const result = await connectWallet(wallet, chain)
    if (!result.ok) {
      setFailure(result.message)
      return
    }
    // The rdns is a wallet's public identity, not a credential. It is the only
    // thing this app persists about a connection.
    rememberWallet(globalThis.localStorage, wallet.rdns)
    setRecent(wallet.rdns)
    onIdentity?.(result.identity)
    setOpen(false)
  }

  return (
    <div className="app-connect">
      {context && address ? (
        // A compact trigger in the bar; the sheet itself is a panel and opens
        // in the kit's modal rather than being wedged into the top bar.
        <Button variant="ghost" size="sm" onClick={() => setSheetOpen(true)}>
          <span className="fk-mono">{truncateAddress(address)}</span>
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>Connect</Button>
      )}

      {context ? (
        <Modal
          open={sheetOpen}
          title="Account"
          ariaLabel="Account"
          onClose={() => setSheetOpen(false)}
        >
          <AccountSheet context={context} onConnectEvm={() => setOpen(true)} />
        </Modal>
      ) : null}

      {failure ? (
        <Note tone="att" title="Not connected">
          {failure}
        </Note>
      ) : null}

      <ConnectModal
        open={open}
        wallets={toWalletOptions(wallets, recent)}
        evmNetwork={{ name: chain.name, testnet: chain.testnet }}
        xrplNetwork={{ name: chain.underlying.name, testnet: chain.underlying.testnet }}
        onSelect={select}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}
