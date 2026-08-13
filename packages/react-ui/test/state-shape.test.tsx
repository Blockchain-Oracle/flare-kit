import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import {
  MOCK_EPOCH,
  createAccountContext,
  createMockKit,
  mockPortfolio,
  networkName,
  rejected,
  restoredSession,
  supplyReadOnly,
  walletConnected,
  walletUnavailable,
  wrongNetwork,
  type PendingOperation,
} from '@flare-kit/core'
import { AccountSheet } from '../src/AccountSheet.js'
import { OperationTimeline } from '../src/OperationTimeline.js'
import { PendingTray } from '../src/PendingTray.js'
import { PortfolioTable } from '../src/PortfolioTable.js'

/**
 * Two different states must not render the same shape.
 *
 * This is the check that was missing for the whole of M1. Every step of the
 * operation spine rendered the `unknown` glyph in every state — a succeeded
 * mint looked exactly like a submitted one — and no test noticed, because the
 * tests asserted words and the words did change. The glyphs did not.
 *
 * The signature below is deliberately blind to colour and to prose. It reads
 * only the things that carry meaning through *shape*: glyph modifiers,
 * `data-state`, and which controls are disabled. DESIGN.md requires colour is
 * never the first signal, so a surface whose states differ only in hue fails
 * here — as it should.
 */

function shapeOf(ui: ReactElement): string {
  const { container, unmount } = render(ui)
  const parts = [
    [...container.querySelectorAll('[class*="fk-g-"]')].map((n) =>
      (n.className.match(/fk-g-[a-z]+/) ?? [''])[0],
    ),
    [...container.querySelectorAll('[data-state]')].map((n) => n.getAttribute('data-state')),
    [...container.querySelectorAll('[data-status]')].map((n) => n.getAttribute('data-status')),
    [...container.querySelectorAll('button')].map((n) => (n.disabled ? 'off' : 'on')),
  ]
  unmount()
  return parts.map((part) => part.join(',')).join(' | ')
}

/** Every pair must be distinguishable, and the failure names the pair. */
function expectAllDistinct(cases: Record<string, ReactElement>) {
  const seen = new Map<string, string>()
  const collisions: string[] = []
  for (const [name, ui] of Object.entries(cases)) {
    const shape = shapeOf(ui)
    const previous = seen.get(shape)
    if (previous) collisions.push(`${previous} and ${name} render an identical shape`)
    else seen.set(shape, name)
  }
  expect(collisions).toEqual([])
}

const COSTON2 = { name: 'Coston2', chainId: 114 } as const
const XRPL_TESTNET = { name: 'XRPL Testnet' } as const
const EVM = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
const XRPL = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

describe('OperationTimeline distinguishes its states by shape', () => {
  const kit = createMockKit({ seed: 'shape' })
  const trace = kit.trace(
    kit.start({
      amountXrp: '25.000000',
      recipient: '0xDeaDbeefDeAdbeefdEadbEEFdeadbeEFdEaDbeeF',
      xrplAccount: XRPL,
    }),
  )
  const pick = (state: string) => trace.find((record) => record.state === state)

  it('renders submitted and succeeded differently', () => {
    // The exact collision that survived all of M1, including a live mint.
    const submitted = pick('submitted')
    const succeeded = pick('succeeded')
    expect(submitted && succeeded).toBeTruthy()
    expect(shapeOf(<OperationTimeline operation={submitted!} />)).not.toBe(
      shapeOf(<OperationTimeline operation={succeeded!} />),
    )
  })

  it('gives every state the trace visits its own shape', () => {
    const cases: Record<string, ReactElement> = {}
    for (const record of trace) {
      cases[record.state] ??= <OperationTimeline operation={record} />
    }
    expect(Object.keys(cases).length).toBeGreaterThan(2)
    expectAllDistinct(cases)
  })
})

describe('AccountSheet distinguishes its states by shape', () => {
  it('gives each SH-02 state its own shape', () => {
    const sheet = (over: Parameters<typeof createAccountContext>[0]) => (
      <AccountSheet context={createAccountContext(over)} onConnectEvm={() => {}} />
    )
    expectAllDistinct({
      disconnected: sheet({}),
      connecting: sheet({ evm: { family: 'evm', status: 'connecting' } }),
      rejected: sheet({ evm: rejected('evm', 'Declined.') }),
      unavailable: sheet({ evm: walletUnavailable('evm', 'None installed.') }),
      'wrong-network': sheet({ evm: wrongNetwork('evm', EVM, XRPL_TESTNET, COSTON2) }),
      restored: sheet({ evm: restoredSession('evm', EVM, COSTON2, 1_000) }),
      ready: sheet({ evm: walletConnected('evm', EVM, COSTON2) }),
      'read-only': sheet({ evm: supplyReadOnly('evm', EVM, COSTON2) }),
    })
  })
})

describe('PendingTray distinguishes its states by shape', () => {
  const entry = (state: PendingOperation['state']): PendingOperation => ({
    operationId: 'op_1',
    capability: 'fassets.direct-mint',
    state,
    network: 114,
    updatedAt: MOCK_EPOCH - 30_000,
    source: {
      class: 'local',
      provider: 'Operation registry',
      network: networkName(114),
      chainId: 114,
    },
  })

  it('gives each SH-10 state its own shape', () => {
    expectAllDistinct({
      empty: <PendingTray pending={[]} now={MOCK_EPOCH} />,
      active: <PendingTray pending={[entry('awaiting_external')]} now={MOCK_EPOCH} />,
      submitted: <PendingTray pending={[entry('submitted')]} now={MOCK_EPOCH} />,
      'action required': <PendingTray pending={[entry('action_required')]} now={MOCK_EPOCH} />,
    })
  })
})

describe('PortfolioTable distinguishes its states by shape', () => {
  it('does not render an unread balance the same as a zero one', () => {
    // M2-AC4 as a shape rule: "not read" and "0.000000" must never look alike.
    expect(shapeOf(<PortfolioTable portfolio={mockPortfolio('no-assets')} now={MOCK_EPOCH} />)).not.toBe(
      shapeOf(
        <PortfolioTable portfolio={mockPortfolio('provider-unavailable')} now={MOCK_EPOCH} />,
      ),
    )
  })

  it('does not render a stale portfolio the same as a fresh one', () => {
    expect(shapeOf(<PortfolioTable portfolio={mockPortfolio('ready')} now={MOCK_EPOCH} />)).not.toBe(
      shapeOf(<PortfolioTable portfolio={mockPortfolio('stale')} now={MOCK_EPOCH} />),
    )
  })
})
