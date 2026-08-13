import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NetworkLogo } from '../src/primitives/NetworkLogo.js'

/**
 * NetworkLogo carries the chain's real mark, labelled by family. The testnet
 * ring is a secondary cue only — the authoritative signal is the name the
 * caller renders beside it — so the ring is present or absent, never the sole
 * difference between two networks.
 */

describe('NetworkLogo', () => {
  it('marks EVM as Flare and XRPL as the XRP Ledger', () => {
    render(
      <>
        <NetworkLogo family="evm" />
        <NetworkLogo family="xrpl" />
      </>,
    )
    expect(screen.getByRole('img', { name: 'Flare network' })).toHaveClass('fk-nm', 'fk-nm-evm')
    expect(screen.getByRole('img', { name: 'XRP Ledger' })).toHaveClass('fk-nm', 'fk-nm-xrpl')
  })

  it('draws the testnet ring only when asked', () => {
    render(
      <>
        <NetworkLogo family="evm" testnet />
        <NetworkLogo family="xrpl" />
      </>,
    )
    const [evm, xrpl] = screen.getAllByRole('img')
    expect(evm).toHaveClass('fk-nm-testnet')
    expect(evm).toHaveAttribute('data-testnet', 'true')
    expect(xrpl).not.toHaveClass('fk-nm-testnet')
    expect(xrpl).not.toHaveAttribute('data-testnet')
  })
})
