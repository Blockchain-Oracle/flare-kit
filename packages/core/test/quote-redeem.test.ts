import { describe, expect, it } from 'vitest'
import { amount, formatExact } from '../src/amounts.js'
import { lotsForAmount, quoteRedeem } from '../src/fassets/quote-redeem.js'
import type { RedeemProtocolState } from '../src/fassets/quote-redeem.js'

// M1-R2. Values read live from Coston2 on 2026-08-04.
const STATE: RedeemProtocolState = {
  fAssetSymbol: 'FTestXRP',
  fAssetDecimals: 6,
  lotSizeUBA: 10_000_000n, // 10 XRP
  redemptionFeeBIPS: 50n, // 0.50%
  underlyingSecondsForPayment: 900n, // the agent has 15 minutes
  defaultPremiumBIPS: 10_500n, // default pays 105% in collateral
  emergencyPaused: false,
}

const NOW = 1_780_000_000_000
const ADDR = 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio'
const intent = (lots: number) => ({ lots, redeemerUnderlyingAddress: ADDR })

describe('quoteRedeem', () => {
  it('states exactly what is burned and what arrives', () => {
    const q = quoteRedeem(STATE, intent(1), NOW)
    expect(formatExact(q.burned)).toBe('10.000000 FTestXRP')
    expect(formatExact(q.fee)).toBe('0.050000 FTestXRP')
    expect(formatExact(q.receives)).toBe('9.950000 XRP')
  })

  it('scales by whole lots', () => {
    const q = quoteRedeem(STATE, intent(3), NOW)
    expect(formatExact(q.burned)).toBe('30.000000 FTestXRP')
    expect(formatExact(q.receives)).toBe('29.850000 XRP')
  })

  it('never lets the parts drift from what is burned', () => {
    for (const lots of [1, 2, 7, 100]) {
      const q = quoteRedeem(STATE, intent(lots), NOW)
      expect(q.receives.value + q.fee.value).toBe(q.burned.value)
    }
  })

  it('says the XRP arrives from a counterparty, not from the protocol', () => {
    // The agent pays. That is why the timeline waits on a named actor.
    expect(quoteRedeem(STATE, intent(1), NOW).paidByAgent).toBe(true)
  })

  it('states the agent deadline as an absolute moment', () => {
    const q = quoteRedeem(STATE, intent(1), NOW)
    expect(q.agentDeadline).toBe(NOW + 900_000)
  })

  it('states the collateral premium before the user commits (M1-R5)', () => {
    const q = quoteRedeem(STATE, intent(1), NOW)
    expect(q.defaultPremiumBIPS).toBe(10_500n)
    expect(q.ifAgentDoesNotPay).toMatch(/collateral/i)
    expect(q.ifAgentDoesNotPay).toMatch(/105/)
  })

  it('is a frozen snapshot', () => {
    expect(Object.isFrozen(quoteRedeem(STATE, intent(1), NOW))).toBe(true)
  })
})

describe('what it refuses', () => {
  it('refuses zero or negative lots', () => {
    expect(quoteRedeem(STATE, intent(0), NOW).canProceed).toBe(false)
    expect(quoteRedeem(STATE, intent(-1), NOW).canProceed).toBe(false)
  })

  it('refuses a fractional lot, because the protocol cannot do it', () => {
    expect(quoteRedeem(STATE, { ...intent(1), lots: 1.5 }, NOW).canProceed).toBe(false)
    expect(quoteRedeem(STATE, { ...intent(1), lots: 1.5 }, NOW).blockedReason).toMatch(/whole lot/i)
  })

  it('refuses an empty underlying address', () => {
    const q = quoteRedeem(STATE, { lots: 1, redeemerUnderlyingAddress: '' }, NOW)
    expect(q.canProceed).toBe(false)
    expect(q.blockedReason).toMatch(/address/i)
  })

  it('refuses under an emergency pause, naming it', () => {
    const q = quoteRedeem({ ...STATE, emergencyPaused: true }, intent(1), NOW)
    expect(q.canProceed).toBe(false)
    expect(q.blockedReason).toMatch(/paused/i)
  })

  it('refuses when the holder cannot cover what would be burned', () => {
    const q = quoteRedeem(STATE, intent(2), NOW, {
      fAssetBalance: amount(15_000_000n, 6, 'FTestXRP'),
    })
    expect(q.canProceed).toBe(false)
    expect(q.blockedReason).toMatch(/20\.000000 FTestXRP/)
  })

  it('proceeds when the balance covers it', () => {
    const q = quoteRedeem(STATE, intent(2), NOW, {
      fAssetBalance: amount(20_000_000n, 6, 'FTestXRP'),
    })
    expect(q.canProceed).toBe(true)
  })
})

describe('lotsForAmount', () => {
  it('converts a holding into the whole lots it can redeem', () => {
    expect(lotsForAmount(amount(25_000_000n, 6, 'FTestXRP'), STATE.lotSizeUBA)).toBe(2)
    expect(lotsForAmount(amount(10_000_000n, 6, 'FTestXRP'), STATE.lotSizeUBA)).toBe(1)
  })

  it('is zero below one lot, rather than rounding up into a refusal', () => {
    expect(lotsForAmount(amount(9_999_999n, 6, 'FTestXRP'), STATE.lotSizeUBA)).toBe(0)
  })
})
