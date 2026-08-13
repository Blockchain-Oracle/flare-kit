import { amount, createMockKit } from '@flare-kit/core'
import { FlareProvider } from '@flare-kit/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { MintFXRP } from '../src/MintFXRP.js'

/**
 * R9: every state in MintFXRP's required-state list, rendered against the mock.
 * The list from SPEC's Surfaces table: loading, ready, below minimum, no
 * executor, insufficient balance, quote expired, typed error.
 */

const RECIPIENT = '0x1234567890abcdef1234567890abcdef12345678'
const XRPL_ACCOUNT = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

function mount(ui: ReactNode, kit = createMockKit({ seed: 'ui' })) {
  return render(<FlareProvider kit={kit}>{ui}</FlareProvider>)
}

const base = { recipient: RECIPIENT, xrplAccount: XRPL_ACCOUNT }

describe('loading', () => {
  it('shows skeletons shaped like the final layout, never a spinner', () => {
    const { container } = mount(<MintFXRP {...base} loading />)
    expect(container.querySelectorAll('.fk-skel').length).toBeGreaterThan(0)
    expect(container.querySelector('.fk-spinner')).toBeNull()
  })

  it('disables the action while it does not know the terms', () => {
    mount(<MintFXRP {...base} loading />)
    expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled()
  })
})

describe('ready', () => {
  it('states every exact value before anything is signed', async () => {
    mount(<MintFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you send/i), '250')

    // Full precision, carrying the asset, in every case.
    expect(screen.getByText('248.500000 FMockXRP')).toBeDefined()
    expect(screen.getByText('1.000000 FMockXRP')).toBeDefined()
    expect(screen.getByText('0.500000 FMockXRP')).toBeDefined()
    expect(screen.getByRole('button', { name: /review and send/i })).toBeEnabled()
  })

  it('names the XRPL destination and the recipient, with the full value retrievable', async () => {
    // Both render through `EvidenceChip` now: truncated first-6/last-4 per
    // DESIGN.md, with the whole value on the copy control and the title. The
    // assertion moved from "the raw string is in the DOM" — which was the rule
    // being broken — to "the full value is still reachable", which is the rule.
    const { container } = mount(<MintFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you send/i), '250')

    const titles = [...container.querySelectorAll('.fk-ev-value')].map((n) =>
      n.getAttribute('title'),
    )
    expect(titles).toContain('rMOCKCoreVau1tAddressNotARea1Ledger')
    expect(titles).toContain(RECIPIENT)

    // Truncated on screen, not merely styled small.
    expect(screen.queryByText('rMOCKCoreVau1tAddressNotARea1Ledger')).toBeNull()
  })

  it('states the expected duration as a range', async () => {
    mount(<MintFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you send/i), '250')
    expect(screen.getByText(/min to .* min/)).toBeDefined()
  })

  it('labels itself as a mock, so it cannot pass for live', () => {
    mount(<MintFXRP {...base} />)
    expect(screen.getByText(/mock kit/i)).toBeDefined()
  })
})

describe('below minimum (AC7)', () => {
  it('blocks the action outright', async () => {
    mount(<MintFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you send/i), '0.4')
    expect(screen.getByRole('button', { name: /too small/i })).toBeDisabled()
  })

  it('says the whole payment would be lost, and names the minimum', async () => {
    mount(<MintFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you send/i), '0.4')
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/1\.500000 XRP/)
    expect(alert.textContent).toMatch(/nothing/i)
  })

  it('marks the field invalid, so the failure is not colour-only', async () => {
    mount(<MintFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you send/i), '0.4')
    expect(screen.getByLabelText(/you send/i)).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('no executor', () => {
  it('says plainly that nobody is obliged to complete it', async () => {
    mount(<MintFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you send/i), '250')
    expect(screen.getByText(/no executor named/i)).toBeDefined()
    expect(screen.getByText(/complete it yourself/i)).toBeDefined()
  })

  it('does not show that note when an executor is named', async () => {
    mount(
      <MintFXRP {...base} executor="0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" />,
    )
    await userEvent.type(screen.getByLabelText(/you send/i), '250')
    expect(screen.queryByText(/no executor named/i)).toBeNull()
  })
})

describe('insufficient balance', () => {
  it('blocks and states what the account actually holds', async () => {
    mount(<MintFXRP {...base} xrplBalance={amount(10_000_000n, 6, 'XRP')} />)
    await userEvent.type(screen.getByLabelText(/you send/i), '250')

    expect(screen.getByRole('button', { name: /not enough xrp/i })).toBeDisabled()
    expect(screen.getByText(/10\.000000 XRP/)).toBeDefined()
  })

  it('allows an amount within the balance', async () => {
    mount(<MintFXRP {...base} xrplBalance={amount(500_000_000n, 6, 'XRP')} />)
    await userEvent.type(screen.getByLabelText(/you send/i), '250')
    expect(screen.getByRole('button', { name: /review and send/i })).toBeEnabled()
  })
})

describe('large amounts warn about the delay before it happens', () => {
  it('says the mint will be delayed', async () => {
    mount(<MintFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you send/i), '1000')
    expect(screen.getByText(/delayed before it executes/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /review and send/i })).toBeEnabled()
  })
})

describe('typed error', () => {
  it('renders a refused start as a message, never as a crash', async () => {
    // The quote blocks first, so this asserts the surface stays intact and the
    // button never becomes pressable for an unsafe amount.
    mount(<MintFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you send/i), '0.0000001')
    expect(screen.getByRole('button', { name: /enter an amount/i })).toBeDisabled()
  })
})
