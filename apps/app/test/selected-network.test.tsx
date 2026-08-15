import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SelectedNetwork, useSelectedNetwork } from '../lib/selected-network'

/**
 * The network selector changed the top bar and left the panel alone.
 *
 * Found in the browser, not by a test: selecting Flare mainnet kept the swap
 * card showing `FTestXRP` — Coston2's testnet symbol — while the selector read
 * "Flare Mainnet". The app was naming one network and rendering another's
 * assets, which is the exact class of claim this product exists not to make.
 *
 * The cause was structural rather than a slip. `app/[family]/page.tsx` is a
 * SERVER component and the selection lives in the client shell's `useState`, so
 * there was no way for a prop to reach a panel. A panel therefore has to read
 * the selection rather than be handed it.
 */

function Probe() {
  return <output>{useSelectedNetwork()}</output>
}

describe('the selected network reaches a panel', () => {
  it('gives a panel the network the shell has selected', () => {
    render(
      <SelectedNetwork network="flare">
        <Probe />
      </SelectedNetwork>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('flare')
  })

  it('changes what a panel reads when the selection changes', () => {
    const { rerender } = render(
      <SelectedNetwork network="coston2">
        <Probe />
      </SelectedNetwork>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('coston2')

    rerender(
      <SelectedNetwork network="flare">
        <Probe />
      </SelectedNetwork>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('flare')
  })

  /**
   * Testnet-first, and never a silent guess. A panel outside the provider is a
   * wiring mistake, and defaulting quietly would hide it — but throwing in a
   * user's face is worse than reading the safe network, so it reads testnet and
   * the wiring mistake is caught by the test above rather than by a user.
   */
  it('reads testnet outside the provider rather than guessing mainnet', () => {
    render(<Probe />)
    expect(screen.getByRole('status')).toHaveTextContent('coston2')
  })
})
