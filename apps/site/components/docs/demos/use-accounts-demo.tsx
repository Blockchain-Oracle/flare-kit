'use client'

import { FLARE_NETWORKS } from '@flare-kit/contracts'
import { MOCK_EPOCH, parseReadOnlyIdentity, restoredSession } from '@flare-kit/core'
import { useAccounts } from '@flare-kit/react'
import { MockKitProvider } from './mock-kit-provider'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

/** Networks come from the contracts registry, never from a literal here. */
const COSTON2 = { name: FLARE_NETWORKS.coston2.name, chainId: FLARE_NETWORKS.coston2.id }
/** The XRP Ledger has no chain id, which is why `chainId` is absent. */
const XRPL_TESTNET = { name: FLARE_NETWORKS.coston2.underlying.name }

/**
 * Two identities a host could hand in at mount, each built by the package's
 * own constructor rather than written out as an object: a watched address that
 * went through the real `parseReadOnlyIdentity`, and a session rebuilt from
 * storage that no wallet has re-authorized.
 *
 * The kit does not connect wallets, so there is no wallet here and none is
 * pretended. What the readout shows is the store's honest reading of what it
 * was given.
 */
const INITIAL_ACCOUNTS = {
  evm: parseReadOnlyIdentity('evm', '0x0000000000000000000000000000000000000B0B', COSTON2),
  xrpl: restoredSession('xrpl', 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', XRPL_TESTNET, MOCK_EPOCH),
}

const CODE = `import { useAccounts } from '@flare-kit/react'

function MintButton({ onQuote }) {
  const { evm, xrpl, bothReady, bind } = useAccounts()

  // Snapshot the accounts the terms are being made for. Only a settled
  // identity binds: a restored session leaves its family out rather than
  // recording a claim the wallet has not re-authorized.
  const quote = () => onQuote({ binding: bind(Date.now()) })

  return (
    <button type="button" disabled={!bothReady} onClick={quote}>
      Mint FXRP from {xrpl.address} to {evm.address}
    </button>
  )
}`

/**
 * The hook runs for real against the account store the provider created from
 * `initialAccounts` — the readout is its actual return value on this render.
 */
function Probe() {
  const { evm, xrpl, bothReady, bind, isBindingValid } = useAccounts()
  const binding = bind(MOCK_EPOCH)

  return (
    <HookReadout
      name="useAccounts"
      value={{
        bothReady,
        evm,
        xrpl,
        'bind(now)': binding,
        'isBindingValid(binding)': isBindingValid(binding),
      }}
    />
  )
}

export function UseAccountsDemo() {
  return (
    <Preview code={CODE}>
      <MockKitProvider initialAccounts={INITIAL_ACCOUNTS}>
        <Probe />
      </MockKitProvider>
    </Preview>
  )
}
