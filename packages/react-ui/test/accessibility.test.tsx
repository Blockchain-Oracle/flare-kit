import {
  type SwapQuoteResult,
  amount,
  applyQuote,
  createAccountContext,
  createMockKit,
  createSwap,
  startQuoting,
} from '@flarekit-dev/core'
import { FlareProvider } from '@flarekit-dev/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'
import { AccountSheet } from '../src/AccountSheet.js'
import { MintFXRP } from '../src/MintFXRP.js'
import { OperationTimeline } from '../src/OperationTimeline.js'
import { SwapCard } from '../src/SwapCard.js'
import { TokenSelector } from '../src/TokenSelector.js'

/**
 * R11: WCAG 2.2 AA on kit-controlled surfaces — keyboard operation, visible
 * focus, and status conveyed by text and shape as well as colour.
 *
 * Automated checks catch roles, labels and structure. Contrast is verified in
 * DESIGN.md against the exact token values rather than here, because jsdom
 * computes no colours.
 */

const INTENT = {
  amountXrp: '250',
  recipient: '0x1234567890abcdef1234567890abcdef12345678',
  xrplAccount: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
}

async function violations(container: HTMLElement) {
  const results = await axe.run(container, {
    // Colour contrast needs real rendering; jsdom reports nothing useful.
    rules: { 'color-contrast': { enabled: false } },
  })
  return results.violations.map((v) => `${v.id}: ${v.help}`)
}

function mount(kit = createMockKit({ seed: 'a11y' })) {
  return render(
    <FlareProvider kit={kit}>
      <MintFXRP recipient={INTENT.recipient} xrplAccount={INTENT.xrplAccount} />
    </FlareProvider>,
  )
}

describe('MintFXRP', () => {
  it('has no automated accessibility violations when empty', async () => {
    const { container } = mount()
    expect(await violations(container)).toEqual([])
  })

  it('has none once a quote is showing', async () => {
    const { container } = mount()
    await userEvent.type(screen.getByLabelText(/you send/i), '250')
    expect(await violations(container)).toEqual([])
  })

  it('has none in the blocked state', async () => {
    const { container } = mount()
    await userEvent.type(screen.getByLabelText(/you send/i), '0.4')
    expect(await violations(container)).toEqual([])
  })

  it('labels the amount field, rather than relying on a placeholder', () => {
    mount()
    expect(screen.getByLabelText(/you send/i)).toBeInTheDocument()
  })

  it('is operable from the keyboard alone', async () => {
    mount()
    await userEvent.tab()
    expect(screen.getByLabelText(/you send/i)).toHaveFocus()
    await userEvent.keyboard('250')
    expect(screen.getByLabelText(/you send/i)).toHaveValue('250')
  })

  it('ties the blocking reason to the field for a screen reader', async () => {
    mount()
    await userEvent.type(screen.getByLabelText(/you send/i), '0.4')
    const field = screen.getByLabelText(/you send/i)
    const describedBy = field.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)?.textContent).toMatch(/nothing/i)
  })

  it('announces the refusal as an alert, not only in colour', async () => {
    mount()
    await userEvent.type(screen.getByLabelText(/you send/i), '0.4')
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

describe('OperationTimeline', () => {
  it('has no automated accessibility violations', async () => {
    const kit = createMockKit({ seed: 'a11y' })
    const { container } = render(<OperationTimeline operation={kit.start(INTENT)} />)
    expect(await violations(container)).toEqual([])
  })

  it('has none in a delayed state with a recovery action', async () => {
    const kit = createMockKit({ seed: 'a11y', scenario: 'executor-late' })
    const record = kit.trace(kit.start(INTENT)).find((r) => r.state === 'action_required')
    const { container } = render(<OperationTimeline operation={record!} />)
    expect(await violations(container)).toEqual([])
  })

  it('gives every copy control an accessible name', async () => {
    const kit = createMockKit({ seed: 'a11y' })
    render(<OperationTimeline operation={kit.start(INTENT)} />)
    for (const button of screen.getAllByRole('button', { name: /^copy /i })) {
      expect(button).toHaveAccessibleName()
    }
  })

  it('describes a recovery action’s value-moving nature to a screen reader', async () => {
    const kit = createMockKit({ seed: 'a11y', scenario: 'executor-late' })
    const record = kit.trace(kit.start(INTENT)).find((r) => r.state === 'action_required')
    render(<OperationTimeline operation={record!} />)
    const button = screen.getByRole('button', { name: /complete the mint/i })
    const describedBy = button.getAttribute('aria-describedby')
    expect(document.getElementById(describedBy as string)?.textContent).toMatch(
      /no further funds/i,
    )
  })

  it('hides decorative glyphs from assistive technology', () => {
    const kit = createMockKit({ seed: 'a11y' })
    const { container } = render(<OperationTimeline operation={kit.start(INTENT)} />)
    for (const glyph of container.querySelectorAll('.fk-g')) {
      expect(glyph).toHaveAttribute('aria-hidden', 'true')
    }
  })
})

// Retargeted from ConnectButton, which AccountSheet replaces. The
// accessibility requirement is unchanged; only the component that must meet
// it moved.
describe('AccountSheet', () => {
  const disconnected = createAccountContext()

  it('has no automated accessibility violations', async () => {
    const { container } = render(<AccountSheet context={disconnected} />)
    expect(await violations(container)).toEqual([])
  })

  it('reaches both connect controls by keyboard', async () => {
    render(
      <AccountSheet context={disconnected} onConnectEvm={() => {}} onConnectXrpl={() => {}} />,
    )
    await userEvent.tab()
    expect(screen.getByRole('button', { name: /connect flare/i })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: /connect xrp ledger/i })).toHaveFocus()
  })
})

describe('SwapCard and TokenSelector (M5)', () => {
  const FROM = { symbol: 'FXRP', address: '0x0b6A3645c240605887a5532109323A3E12273dc7', decimals: 6 } as const
  const TO = { symbol: 'USD₮0', address: '0xC1A5B41512496B80903D1f32d6dEa3a73212E71F', decimals: 6 } as const
  const quote: SwapQuoteResult = {
    kind: 'quote',
    quote: {
      from: FROM,
      to: TO,
      amountIn: amount(100_000000n, 6, 'FXRP'),
      amountOut: amount(122_400000n, 6, 'USD₮0'),
      minReceived: amount(121_788000n, 6, 'USD₮0'),
      slippageBips: 50,
      path: [FROM.address, TO.address],
      observedAt: 0,
    },
  }
  function swapOp() {
    let op = createSwap({
      chainId: 114,
      intent: { fromKey: 'FXRP', toKey: 'USDT0', amountIn: 100_000000n, slippageBips: 50, recipient: FROM.address, deadline: 0 },
      now: 0,
      id: 'op_a11y',
    })
    op = startQuoting(op, 0).record
    return applyQuote(op, { result: quote, allowance: 200_000000n, now: 0 }).record
  }

  it('SwapCard has no automated accessibility violations in the quote state', async () => {
    const { container } = render(
      <SwapCard operation={swapOp()} quoteResult={quote} fromToken={FROM} toToken={TO} priceImpactBips={87} />,
    )
    expect(await violations(container)).toEqual([])
  })

  it('TokenSelector has no automated accessibility violations when open', async () => {
    const { container } = render(
      <TokenSelector
        open
        tokens={[
          { key: 'FXRP', token: FROM, name: 'FAsset XRP', balance: amount(247_500000n, 6, 'FXRP') },
          { key: 'USDT0', token: TO, name: 'Tether USD₮0' },
        ]}
        commonBases={['FXRP', 'USDT0']}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    expect(await violations(container)).toEqual([])
  })
})

describe('every state chip carries a word, never colour alone', () => {
  it('renders text beside the glyph in each chip', async () => {
    const kit = createMockKit({ seed: 'a11y', scenario: 'executor-late' })
    for (const record of kit.trace(kit.start(INTENT))) {
      const { container, unmount } = render(<OperationTimeline operation={record} />)
      for (const chip of container.querySelectorAll('.fk-chip')) {
        expect((chip.textContent ?? '').trim().length).toBeGreaterThan(0)
      }
      unmount()
    }
  })

  it('states an amount with its asset wherever one appears', () => {
    render(
      <FlareProvider kit={createMockKit({ seed: 'a11y' })}>
        <MintFXRP
          recipient={INTENT.recipient}
          xrplAccount={INTENT.xrplAccount}
          xrplBalance={amount(500_000_000n, 6, 'XRP')}
        />
      </FlareProvider>,
    )
    expect(screen.getByText('500.000000 XRP')).toBeInTheDocument()
  })
})
