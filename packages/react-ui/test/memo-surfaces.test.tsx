import {
  type MemoFeeSettings,
  type MemoIntent,
  type MemoRecoveryKind,
  type MemoRecoveryResult,
  OBSERVED_ACCOUNT_LIVE,
  memoRecoveryOrderFor,
  planMemoInstruction,
  planMemoRecovery,
  smartAccountsFor,
} from '@flare-kit/core'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoInstructionComposer } from '../src/MemoInstructionComposer.js'
import { RecoveryComposer } from '../src/RecoveryComposer.js'

/**
 * The M14 surfaces, driven through the honesty rules that decide whether they may ship.
 *
 * Every plan below comes from the REAL gate and the REAL recovery planner, so a passing
 * assertion means the shipped code path produced the rendering rather than a hand-built prop
 * object happening to render. The assertions are about what must never be on screen — a retry
 * on a burned payment, an override on the destination tag, a recovery that looks free, a
 * mined receipt described as a mint — because those are the failures a screenshot review is
 * worst at catching.
 */

const COSTON2 = smartAccountsFor('coston2')

const FEES: MemoFeeSettings = {
  feeBIPS: 25n,
  minimumFeeUBA: 1_000_000n,
  assetManagerExecutorFeeUBA: 500_000n,
}

const INTENT: MemoIntent = {
  calls: [{ target: `0x${'11'.repeat(20)}`, value: 0n, data: '0x12345678' }],
  netUBA: 20_000_000n,
  nonce: OBSERVED_ACCOUNT_LIVE.nonce!,
}

const plan = (overrides: Partial<Parameters<typeof planMemoInstruction>[0]> = {}) =>
  planMemoInstruction({
    deployment: COSTON2,
    personalAccount: OBSERVED_ACCOUNT_LIVE,
    fees: FEES,
    intent: INTENT,
    replayed: false,
    simulation: { ok: true },
    ...overrides,
  })

const composer = (props: Partial<React.ComponentProps<typeof MemoInstructionComposer>> = {}) =>
  render(
    <MemoInstructionComposer
      planResult={plan()}
      feesRead
      fassetSymbol="FTestXRP"
      fassetDecimals={6}
      nativeSymbol="C2FLR"
      now={1_785_823_590_000}
      {...props}
    />,
  )

describe('the memo composer states the whole chain before approval', () => {
  it('says a mined transaction is not yet a mint', () => {
    // The one disguise this protocol wears: a rate-limited mint refunds and returns WITHOUT
    // reverting, so the receipt reads as success while nothing was minted.
    const { container } = composer()
    expect(container.textContent).toMatch(/mined transaction is not yet a mint/i)
  })

  it('names the proof owner as the only account that can submit', () => {
    const { container } = composer({ relayer: `0x${'a4'.repeat(20)}` })
    expect(container.textContent).toMatch(/only this account will be able to submit/i)
  })

  it('says the payload is public when the memo carries the operation inline', () => {
    const { container } = composer()
    expect(container.textContent).toMatch(/readable\s+by anyone/i)
  })

  it('states that there is no free cancel, before anything is signed', () => {
    const { container } = composer()
    expect(container.textContent).toMatch(/no cancel on this flow that costs nothing/i)
  })

  it('offers the signing control only when the gate passed', () => {
    const { container } = composer()
    // Scoped to the panel action: the memo's own CodeWindow carries a Copy button, and
    // `querySelector('button')` finds that one first.
    const button = container.querySelector('.fk-panel-action button') as HTMLButtonElement | null
    expect(button?.textContent).toMatch(/sign the xrpl payment/i)
    expect(button?.disabled).toBe(false)
  })
})

describe('the refusals, as a surface renders them', () => {
  it('blocks a below-minimum payment and calls the loss total, with no retry', () => {
    // The payer's framing — a total they name — is the only one that can land under the
    // minimum. On the `netUBA` framing the plan computes a total that clears it by
    // construction, so this state is unreachable there.
    const result = plan({
      intent: { calls: INTENT.calls, nonce: INTENT.nonce, totalUBA: FEES.minimumFeeUBA - 1n },
    })
    expect(result.ok).toBe(false)
    const { container } = composer({ planResult: result })
    expect(container.textContent).toMatch(/burned entirely|loss is total|mints nothing to you/i)
    // Nothing on this surface may suggest trying again: the money is gone and no opcode
    // reaches it.
    expect(container.textContent).not.toMatch(/\bretry\b/i)
    expect(
      (container.querySelector('.fk-panel-action button') as HTMLButtonElement | null)?.disabled,
    ).toBe(true)
  })

  it('refuses a destination tag and offers no override anywhere on the surface', () => {
    const result = plan({ destinationTag: 0 })
    const { container } = composer({ planResult: result })
    expect(container.textContent).toMatch(/no destination tag/i)
    expect(container.textContent).toMatch(/no override/i)
    expect(container.textContent).not.toMatch(/proceed anyway|continue anyway|override this/i)
  })

  it('says tag 0 is not a safe default, because it is claimable like any other', () => {
    const { container } = composer({ planResult: plan({ destinationTag: 0 }) })
    expect(container.textContent).toMatch(/tag 0 is not a safe default|claimable like any other/i)
  })

  it('renders an unreadable nonce as a refusal to guess, not as a zero', () => {
    const result = plan({
      personalAccount: { ...OBSERVED_ACCOUNT_LIVE, nonce: undefined },
    })
    const { container } = composer({ planResult: result })
    expect(container.textContent).toMatch(/could not be read/i)
    expect(container.textContent).toMatch(/will not guess/i)
  })
})

describe('unread fees are an availability state, never a refusal', () => {
  it('says no plan can be built rather than blaming the operation', () => {
    const { container } = composer({ feesRead: false, planResult: undefined })
    expect(container.textContent).toMatch(/minting fees could not be read/i)
    expect(container.textContent).toMatch(/nothing here is estimated/i)
  })

  it('disables the control with an availability word, not a failure word', () => {
    const { container } = composer({ feesRead: false, planResult: undefined })
    const button = container.querySelector('button')
    expect(button?.textContent).toMatch(/fees unavailable/i)
    expect(button?.disabled).toBe(true)
  })
})

describe('the recovery composer, in the protocol’s order', () => {
  const results = (kinds: readonly MemoRecoveryKind[]) => {
    const map: Partial<Record<MemoRecoveryKind, MemoRecoveryResult>> = {}
    for (const kind of kinds) {
      if (kind === 'skip-memo') {
        map[kind] = planMemoRecovery({
          kind,
          targetTransactionId: `0x${'3f'.repeat(32)}`,
          stuckIdUsed: false,
        })
      }
    }
    return map
  }

  it('leads with 0xE0 when the stuck payment never minted', () => {
    const order = memoRecoveryOrderFor({ stuckPaymentMinted: false })
    const { container } = render(<RecoveryComposer order={order} stuckPaymentMinted={false} />)
    const first = container.querySelector('.fk-sa-recover-path')
    expect(first?.getAttribute('data-opcode')).toBe('0xE0')
    expect(first?.textContent).toMatch(/try this first/i)
  })

  it('explains 0xE0’s absence rather than silently dropping it', () => {
    // An option that vanishes reads as a bug. The reason it is withheld is that it would cost
    // a second payment and recover nothing.
    const order = memoRecoveryOrderFor({ stuckPaymentMinted: true })
    const { container } = render(<RecoveryComposer order={order} stuckPaymentMinted />)
    expect(container.querySelector('[data-opcode="0xE0"]')).toBeNull()
    expect(container.textContent).toMatch(/not offered here/i)
    expect(container.textContent).toMatch(/recover nothing/i)
  })

  it('says every option is a real payment, including the ones that recover no money', () => {
    const order = memoRecoveryOrderFor({ stuckPaymentMinted: false })
    const { container } = render(<RecoveryComposer order={order} />)
    expect(container.textContent).toMatch(/no free cancel/i)
    expect(container.textContent).toMatch(/mints a small amount of FAsset/i)
  })

  it('states what 0xE1 does NOT do, beside what it does', () => {
    const order = memoRecoveryOrderFor({ stuckPaymentMinted: false })
    const { container } = render(<RecoveryComposer order={order} />)
    const nonce = container.querySelector('[data-opcode="0xE1"]')
    expect(nonce?.textContent).toMatch(/recovers no money/i)
    expect(nonce?.textContent).toMatch(/skip its memo first/i)
  })

  it('renders the selected plan’s memo in full and its notes', () => {
    const order = memoRecoveryOrderFor({ stuckPaymentMinted: false })
    const { container } = render(
      <RecoveryComposer order={order} results={results(order)} selected="skip-memo" />,
    )
    // The bytes are the recovery, and the lengths are exact — a truncated memo is one a user
    // cannot check.
    expect(container.textContent).toMatch(/0xe0[0-9a-f]{80,}/i)
    expect(container.textContent).toMatch(/fee-only direct mint reverts/i)
  })

  it('offers no signing control until a path is chosen and planned', () => {
    const order = memoRecoveryOrderFor({ stuckPaymentMinted: false })
    const { container } = render(<RecoveryComposer order={order} />)
    const action = container.querySelector('.fk-panel-action button') as HTMLButtonElement | null
    expect(action?.disabled).toBe(true)
    expect(action?.textContent).toMatch(/choose a recovery/i)
  })
})
