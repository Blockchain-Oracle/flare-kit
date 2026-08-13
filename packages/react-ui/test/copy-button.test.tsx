import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CopyButton } from '../src/primitives/CopyButton.js'

/**
 * CopyButton is the copy control on its own, so a value that is not operation
 * evidence — a wallet address is identity, not an `EvidenceKind` — gets the
 * same affordance without being dressed as an evidence chip. It confirms in its
 * accessible name, and a clipboard the browser refuses is never an error state:
 * the value is still readable elsewhere.
 */

function stubClipboard(writeText: (v: string) => Promise<void>) {
  const fn = vi.fn(writeText)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: fn },
    configurable: true,
  })
  return fn
}

describe('CopyButton', () => {
  it('copies the value and confirms in its accessible name', async () => {
    const writeText = stubClipboard(() => Promise.resolve())
    render(<CopyButton value="rMOCKCoreVau1tAddress" label="address" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }))

    expect(writeText).toHaveBeenCalledWith('rMOCKCoreVau1tAddress')
    const confirmed = await screen.findByRole('button', { name: 'address copied' })
    expect(confirmed).toHaveAttribute('data-copied', 'true')
  })

  it('does not error and stays usable when the clipboard is refused', async () => {
    const writeText = stubClipboard(() => Promise.reject(new Error('denied')))
    render(<CopyButton value="0xdeadbeef" label="hash" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy hash' }))

    await vi.waitFor(() => expect(writeText).toHaveBeenCalled())
    // The rejection is swallowed: the name never becomes "copied".
    const button = screen.getByRole('button', { name: 'Copy hash' })
    expect(button).toHaveAttribute('data-copied', 'false')
  })

  it('takes an extra class so a chip can place it in its own anatomy', () => {
    render(<CopyButton value="x" label="bytes" className="host-placement" />)
    expect(screen.getByRole('button')).toHaveClass('fk-copy', 'host-placement')
  })
})
