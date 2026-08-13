import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectModal, type WalletOption } from '../src/ConnectModal.js'

/**
 * ConnectModal is the wallet picker, and the rules it has to keep are about
 * honesty, not chrome:
 *  - a wallet shows ITS OWN icon when it advertised one, and a neutral glyph
 *    (never a stand-in brand mark) when it did not;
 *  - both chains are always presented, because a FAsset operation crosses both;
 *  - it selects, it never connects — the callback is the whole contract.
 */

const WALLETS: WalletOption[] = [
  {
    id: 'io.metamask',
    name: 'MetaMask',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
    family: 'evm',
    detected: true,
    recent: true,
  },
  // No advertised icon: must fall back to the neutral glyph, not a fake brand.
  { id: 'app.rabby', name: 'Rabby', family: 'evm', detected: true },
  {
    id: 'xrpl.xaman',
    name: 'Xaman',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
    family: 'xrpl',
    detected: true,
  },
]

function open(overrides: Partial<React.ComponentProps<typeof ConnectModal>> = {}) {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(
    <ConnectModal
      open
      wallets={WALLETS}
      evmNetwork={{ name: 'Coston2', testnet: true }}
      xrplNetwork={{ name: 'XRPL Testnet', testnet: true }}
      onSelect={onSelect}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onSelect, onClose }
}

describe('ConnectModal', () => {
  it('renders nothing until it is opened', () => {
    render(<ConnectModal open={false} wallets={WALLETS} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('names both networks and lists each chain family', () => {
    open()
    expect(screen.getByRole('dialog', { name: 'Connect a wallet' })).toBeInTheDocument()
    expect(screen.getByText('Coston2')).toBeInTheDocument()
    expect(screen.getByText('XRPL Testnet')).toBeInTheDocument()
    expect(screen.getByText('Flare network')).toBeInTheDocument()
    expect(screen.getByText('XRP Ledger')).toBeInTheDocument()
  })

  it('resolves a wallet mark: own icon, then bundled brand, then neutral glyph', () => {
    open({
      wallets: [
        {
          id: 'io.metamask',
          name: 'MetaMask',
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
          family: 'evm',
        },
        { id: 'app.rabby', name: 'Rabby', family: 'evm' },
        { id: 'unknown.wallet', name: 'Some Wallet', family: 'evm' },
      ],
    })

    // The wallet's OWN advertised icon always wins.
    const metamask = screen.getByText('MetaMask').closest('button')!
    expect(metamask.querySelector('img')).not.toBeNull()

    // A recognised wallet with no advertised icon → its real bundled brand mark.
    const rabby = screen.getByText('Rabby').closest('button')!
    expect(rabby.querySelector('img')).toBeNull()
    expect(rabby.querySelector('.fk-wb-rabby')).not.toBeNull()

    // An unknown wallet with no icon → the neutral glyph, never a wrong brand.
    const unknown = screen.getByText('Some Wallet').closest('button')!
    expect(unknown.querySelector('.fk-wallet-brand')).toBeNull()
    expect(unknown.querySelector('.fk-i-wallet')).not.toBeNull()
  })

  it('badges a detected and a recent wallet', () => {
    open()
    const metamask = screen.getByText('MetaMask').closest('button')!
    expect(within(metamask).getByText('Detected')).toBeInTheDocument()
    expect(within(metamask).getByText('Recent')).toBeInTheDocument()
  })

  it('states an empty family honestly rather than hiding it', () => {
    open({ wallets: [] })
    expect(screen.getAllByText(/No wallet detected/)).toHaveLength(2)
  })

  it('selects — never connects — and closes', async () => {
    const user = userEvent.setup()
    const { onSelect, onClose } = open()

    await user.click(screen.getByText('MetaMask'))
    expect(onSelect).toHaveBeenCalledWith('io.metamask')

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
