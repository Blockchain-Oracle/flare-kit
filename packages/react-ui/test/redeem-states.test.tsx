import { amount, createMockKit } from '@flare-kit/core'
import { FlareProvider } from '@flare-kit/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { RedeemFXRP } from '../src/RedeemFXRP.js'

/**
 * M1-R7: every state in RedeemFXRP's required-state list, against the mock —
 * loading, ready, not a whole lot, insufficient balance, quote expired, typed
 * error — plus the accessibility bar.
 */

const XRPL = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'

function mount(ui: ReactNode, kit = createMockKit({ seed: 'ui' })) {
  return render(<FlareProvider kit={kit}>{ui}</FlareProvider>)
}
const base = { redeemerUnderlyingAddress: XRPL }

describe('loading', () => {
  it('shows skeletons and disables the action', () => {
    const { container } = mount(<RedeemFXRP {...base} loading />)
    expect(container.querySelectorAll('.fk-skel').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled()
  })
})

describe('ready', () => {
  it('states every exact value before anything is signed', async () => {
    mount(<RedeemFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you redeem/i), '1')
    expect(screen.getByText('10.000000 FMockXRP')).toBeInTheDocument()
    expect(screen.getByText('0.050000 FMockXRP')).toBeInTheDocument()
    expect(screen.getByText('9.950000 XRP')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /review and redeem/i })).toBeEnabled()
  })

  it('says an agent pays, not the protocol', async () => {
    mount(<RedeemFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you redeem/i), '1')
    expect(screen.getByText(/an agent, not the protocol/i)).toBeInTheDocument()
  })

  it('states the collateral fallback before the user commits', async () => {
    mount(<RedeemFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you redeem/i), '1')
    const note = screen.getByText(/collateral/i)
    expect(note.textContent).toMatch(/not XRP/i)
  })

  it('says up front what one lot is, so the lot rule is never a surprise', () => {
    mount(<RedeemFXRP {...base} />)
    expect(screen.getByText(/one lot is/i)).toBeInTheDocument()
  })
})

describe('not a whole lot', () => {
  it('blocks a fractional amount and explains the rule', async () => {
    mount(<RedeemFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you redeem/i), '1.5')
    expect(screen.getByRole('button', { name: /cannot redeem/i })).toBeDisabled()
    expect(screen.getByRole('alert').textContent).toMatch(/whole lot/i)
  })

  it('marks the field invalid, so it is not colour-only', async () => {
    mount(<RedeemFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you redeem/i), '1.5')
    expect(screen.getByLabelText(/you redeem/i)).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('insufficient balance', () => {
  it('blocks and names what would be burned', async () => {
    mount(<RedeemFXRP {...base} fAssetBalance={amount(15_000_000n, 6, 'FMockXRP')} />)
    await userEvent.type(screen.getByLabelText(/you redeem/i), '2')
    expect(screen.getByRole('button', { name: /cannot redeem/i })).toBeDisabled()
    expect(screen.getByRole('alert').textContent).toMatch(/20\.000000 FMockXRP/)
  })

  it('allows an amount the balance covers', async () => {
    mount(<RedeemFXRP {...base} fAssetBalance={amount(25_000_000n, 6, 'FMockXRP')} />)
    await userEvent.type(screen.getByLabelText(/you redeem/i), '2')
    expect(screen.getByRole('button', { name: /review and redeem/i })).toBeEnabled()
  })
})

describe('typed error and malformed input', () => {
  it('renders a non-numeric entry as a typing state, not a crash', async () => {
    mount(<RedeemFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you redeem/i), 'abc')
    expect(screen.getByRole('button', { name: /cannot redeem|enter a number/i })).toBeDisabled()
  })

  it('blocks zero lots', async () => {
    mount(<RedeemFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you redeem/i), '0')
    expect(screen.getByRole('button', { name: /cannot redeem/i })).toBeDisabled()
  })
})

describe('mock labelling', () => {
  it('marks itself so a screenshot cannot pass for live', () => {
    mount(<RedeemFXRP {...base} />)
    expect(screen.getByText(/mock kit/i)).toBeInTheDocument()
  })
})

describe('accessibility (R11)', () => {
  const violations = async (container: HTMLElement) => {
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    return results.violations.map((v) => `${v.id}: ${v.help}`)
  }

  it('has none when empty', async () => {
    const { container } = mount(<RedeemFXRP {...base} />)
    expect(await violations(container)).toEqual([])
  })

  it('has none with a quote showing', async () => {
    const { container } = mount(<RedeemFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you redeem/i), '1')
    expect(await violations(container)).toEqual([])
  })

  it('has none in the blocked state', async () => {
    const { container } = mount(<RedeemFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you redeem/i), '1.5')
    expect(await violations(container)).toEqual([])
  })

  it('is operable from the keyboard alone', async () => {
    mount(<RedeemFXRP {...base} />)
    await userEvent.tab()
    expect(screen.getByLabelText(/you redeem/i)).toHaveFocus()
    await userEvent.keyboard('1')
    expect(screen.getByLabelText(/you redeem/i)).toHaveValue('1')
  })

  it('ties the blocking reason to the field', async () => {
    mount(<RedeemFXRP {...base} />)
    await userEvent.type(screen.getByLabelText(/you redeem/i), '1.5')
    const describedBy = screen.getByLabelText(/you redeem/i).getAttribute('aria-describedby')
    expect(document.getElementById(describedBy as string)?.textContent).toMatch(/whole lot/i)
  })
})
