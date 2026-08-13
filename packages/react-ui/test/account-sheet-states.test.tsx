import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  accountChanged,
  createAccountContext,
  disconnected,
  restoredSession,
  rejected,
  supplyReadOnly,
  parseReadOnlyIdentity,
  walletConnected,
  walletUnavailable,
  wrongNetwork,
} from '@flarekit-dev/core'
import { AccountSheet } from '../src/AccountSheet.js'

// SH-02's ten required states: disconnected, connecting, rejected, unavailable
// wallet, wrong network, account changed, restored session, read-only supplied,
// invalid read-only identity, both ready.
//
// The first six assertions are migrated from `ConnectButton`, which this
// surface replaces — the requirements they encode did not change, only the
// component that has to satisfy them.

const COSTON2 = { name: 'Coston2', chainId: 114 } as const
const FLARE = { name: 'Flare Mainnet', chainId: 14 } as const
const XRPL_TESTNET = { name: 'XRPL Testnet' } as const
const EVM = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
const XRPL = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

const sheet = (context: Parameters<typeof AccountSheet>[0]['context']) =>
  render(<AccountSheet context={context} onConnectEvm={() => {}} onConnectXrpl={() => {}} />)

describe('SH-02 required states', () => {
  it('disconnected offers both chains', () => {
    sheet(createAccountContext())
    expect(screen.getByRole('button', { name: /connect flare/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect xrp ledger/i })).toBeInTheDocument()
  })

  it('connecting disables the control it is working on', () => {
    sheet(createAccountContext({ evm: { family: 'evm', status: 'connecting' } }))
    expect(screen.getByRole('button', { name: /^connecting$/i })).toBeDisabled()
  })

  it('rejected says nothing was sent', () => {
    sheet(createAccountContext({ evm: rejected('evm', 'The wallet declined.') }))
    expect(screen.getByText(/nothing was sent/i)).toBeInTheDocument()
  })

  it('an unavailable wallet says so and still offers watching', () => {
    // Not the same as disconnected: there is no wallet to connect to at all.
    sheet(
      createAccountContext({
        evm: walletUnavailable('evm', 'No EVM wallet is installed in this browser.'),
      }),
    )
    expect(screen.getByText(/no evm wallet is installed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect flare/i })).toBeDisabled()
  })

  it('wrong network says the approved terms will not execute elsewhere', () => {
    sheet(createAccountContext({ evm: wrongNetwork('evm', EVM, FLARE, COSTON2) }))
    expect(screen.getByText(/wrong network/i)).toBeInTheDocument()
    expect(screen.getByText(/bound to the account/i)).toBeInTheDocument()
  })

  it('account changed is called out, not silently accepted', () => {
    sheet(
      createAccountContext({ evm: accountChanged(walletConnected('evm', EVM, COSTON2), XRPL) }),
    )
    expect(screen.getByText(/account changed/i)).toBeInTheDocument()
  })

  it('a restored session says the wallet has not confirmed it', () => {
    sheet(createAccountContext({ evm: restoredSession('evm', EVM, COSTON2, 1_000) }))
    expect(screen.getByText(/restored session/i)).toBeInTheDocument()
    expect(screen.getByText(/has not confirmed them yet/i)).toBeInTheDocument()
  })

  it('a supplied read-only identity states that it holds no key', () => {
    sheet(createAccountContext({ xrpl: supplyReadOnly('xrpl', XRPL, XRPL_TESTNET) }))
    expect(screen.getByText(/read only — no key/i)).toBeInTheDocument()
  })

  it('an invalid read-only identity explains the format it wanted', () => {
    const invalid = parseReadOnlyIdentity('xrpl', 'not-an-address', XRPL_TESTNET)
    sheet(createAccountContext({ xrpl: invalid }))
    expect(screen.getByText(/not recognised/i)).toBeInTheDocument()
    expect(screen.getByText(/base58/i)).toBeInTheDocument()
  })

  it('both ready announces it', () => {
    sheet(
      createAccountContext({
        evm: walletConnected('evm', EVM, COSTON2),
        xrpl: walletConnected('xrpl', XRPL, XRPL_TESTNET),
      }),
    )
    expect(screen.getByRole('status').textContent).toMatch(/both accounts are connected/i)
  })
})

describe('either identity is usable on its own', () => {
  it('EVM only still offers the XRPL side without demanding it', () => {
    sheet(createAccountContext({ evm: walletConnected('evm', EVM, COSTON2) }))
    expect(screen.getByRole('button', { name: /connect xrp ledger/i })).toBeInTheDocument()
    expect(screen.getByRole('status').textContent).toMatch(/at the same time/i)
  })

  it('XRPL only still offers the Flare side', () => {
    sheet(createAccountContext({ xrpl: walletConnected('xrpl', XRPL, XRPL_TESTNET) }))
    expect(screen.getByRole('button', { name: /connect flare/i })).toBeInTheDocument()
  })

  it('mixes custody classes across the two families', () => {
    sheet(
      createAccountContext({
        evm: walletConnected('evm', EVM, COSTON2),
        xrpl: supplyReadOnly('xrpl', XRPL, XRPL_TESTNET),
      }),
    )
    expect(screen.getByText(/your wallet holds the key/i)).toBeInTheDocument()
    expect(screen.getByText(/read only — no key/i)).toBeInTheDocument()
  })
})

describe('read-only is chosen, never fallen into', () => {
  it('offers watching as an explicit control', async () => {
    const supplied: string[] = []
    render(
      <AccountSheet
        context={createAccountContext()}
        onSupplyReadOnly={(_family, input) => supplied.push(input)}
      />,
    )
    await userEvent.click(screen.getAllByRole('button', { name: /watch an address/i })[0]!)
    await userEvent.type(screen.getByLabelText(/flare address to watch/i), EVM)
    await userEvent.click(screen.getByRole('button', { name: /^watch$/i }))
    expect(supplied).toEqual([EVM])
  })

  it('never reports a declined connection as read-only', () => {
    sheet(createAccountContext({ evm: rejected('evm', 'The wallet declined.') }))
    expect(screen.queryByText(/read only/i)).not.toBeInTheDocument()
  })
})

describe('every write control states what it cannot do', () => {
  it('names the reason for each attached identity that cannot sign', () => {
    // M2-AC5: "every write control states that it cannot sign."
    sheet(
      createAccountContext({
        evm: restoredSession('evm', EVM, COSTON2, 1_000),
        xrpl: supplyReadOnly('xrpl', XRPL, XRPL_TESTNET),
      }),
    )
    expect(screen.getByText(/XRP Ledger: This is a read-only identity/i)).toBeInTheDocument()
    expect(screen.getByText(/Flare: This session was restored/i)).toBeInTheDocument()
  })

  it('says nothing about signing when both identities can sign', () => {
    sheet(
      createAccountContext({
        evm: walletConnected('evm', EVM, COSTON2),
        xrpl: walletConnected('xrpl', XRPL, XRPL_TESTNET),
      }),
    )
    expect(screen.queryByText(/cannot be signed/i)).not.toBeInTheDocument()
  })
})

describe('disconnected identities carry no custody claim', () => {
  it('shows no custody line before an account exists', () => {
    sheet(createAccountContext({ evm: disconnected('evm') }))
    expect(screen.queryByText(/holds the key/i)).not.toBeInTheDocument()
  })
})

describe('a connected address is copyable in full', () => {
  it('shows the truncation but hands over the whole address on copy', () => {
    // An address is identity, not operation evidence, so it gets the copy
    // affordance without being dressed as an evidence chip.
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    sheet(createAccountContext({ evm: walletConnected('evm', EVM, COSTON2) }))

    // Truncated on screen, never the raw string...
    expect(screen.queryByText(EVM)).toBeNull()
    // ...and one click yields the whole thing.
    fireEvent.click(screen.getByRole('button', { name: /copy address/i }))
    expect(writeText).toHaveBeenCalledWith(EVM)
  })

  it('links an EVM address to its explorer on the connected network', () => {
    sheet(createAccountContext({ evm: walletConnected('evm', EVM, COSTON2) }))
    const link = screen.getByRole('link', { name: new RegExp(EVM) })
    expect(link).toHaveAttribute('href', `https://coston2-explorer.flare.network/address/${EVM}`)
    expect(link).toHaveAttribute('target', '_blank')
    // WCAG 2.4.4 / G201: the accessible name carries the whole value and warns.
    expect(link).toHaveAttribute('aria-label', `${EVM}, opens in a new tab`)
  })

  it('keeps an XRPL address copy-only — no chain id, so no guessed ledger link', () => {
    sheet(createAccountContext({ xrpl: walletConnected('xrpl', XRPL, XRPL_TESTNET) }))
    expect(screen.queryByRole('link', { name: new RegExp(XRPL) })).toBeNull()
    expect(screen.getByRole('button', { name: /copy address/i })).toBeInTheDocument()
  })

  it('offers no copy control for a chain that has no account yet', () => {
    sheet(createAccountContext({ evm: disconnected('evm') }))
    expect(screen.queryByRole('button', { name: /copy address/i })).toBeNull()
  })
})
