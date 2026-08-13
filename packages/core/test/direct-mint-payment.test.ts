import { describe, expect, it } from 'vitest'
import { decodeDirectMintMemo } from '../src/xrpl.js'
import { quoteDirectMint } from '../src/fassets/direct-mint-quote.js'
import type { DirectMintProtocolState } from '../src/fassets/direct-mint-quote.js'
import type { DirectMintChainState } from '../src/fassets/direct-mint-recovery.js'
import {
  attachXrplPayment,
  buildPaymentForQuote,
  createDirectMintOperation,
  reconcileDirectMint,
} from '../src/fassets/direct-mint.js'

const NOW = 1_780_000_000_000
const XRPL_TX = 'E3FE6EA3D48F0C2B639448020EA4F03D4F4F8FFDB243A852A0F59177921B4879'

const STATE: DirectMintProtocolState = {
  fAssetSymbol: 'FTestXRP',
  fAssetDecimals: 6,
  xrplDestination: 'rNBjmsJ8xLKvSbUZbGpFxk9Tt2cCPVKcRV',
  feeSettings: { mintingFeeBIPS: 20n, minimumMintingFeeUBA: 1_000_000n, executorFeeUBA: 500_000n },
  largeMintingThresholdUBA: 1_000_000_000n,
  largeMintingDelaySeconds: 3_600n,
  othersCanExecuteAfterSeconds: 600n,
  mintingPaused: false,
  emergencyPaused: false,
}

const INTENT = {
  amountXrp: '250',
  recipient: '0x1234567890abcdef1234567890abcdef12345678',
  xrplAccount: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
}

const LEDGER = { sequence: 42, lastLedgerSequence: 4_821_800, feeDrops: 12n }

describe('buildPaymentForQuote — the only signable payment path (AC7)', () => {
  it('derives every term from the quote, so nothing can drift', () => {
    const quote = quoteDirectMint(STATE, INTENT, NOW)
    const payment = buildPaymentForQuote(quote, { account: INTENT.xrplAccount, ...LEDGER })

    expect(payment.Amount).toBe('250000000')
    expect(payment.Destination).toBe(STATE.xrplDestination)
    expect(payment.Account).toBe(INTENT.xrplAccount)
    // The memo is the quote's memo, not one rebuilt from loose arguments.
    expect(`0x${payment.Memos[0]?.Memo.MemoData}`.toLowerCase()).toBe(quote.memo.toLowerCase())
    expect(decodeDirectMintMemo(quote.memo).recipient).toBe(INTENT.recipient.toLowerCase())
  })

  it('refuses to build a payment for a quote that cannot proceed', () => {
    // The whole point: a below-minimum amount can never become a signable
    // payment, because the payment can only be built from a quote and the quote
    // refuses. There is no argument list that routes around it.
    const blocked = quoteDirectMint(STATE, { ...INTENT, amountXrp: '0.4' }, NOW)
    expect(() =>
      buildPaymentForQuote(blocked, { account: INTENT.xrplAccount, ...LEDGER }),
    ).toThrow(/mints nothing|minimum/i)
  })

  it('refuses when the protocol is paused, for the same reason', () => {
    const paused = quoteDirectMint({ ...STATE, mintingPaused: true }, INTENT, NOW)
    expect(() =>
      buildPaymentForQuote(paused, { account: INTENT.xrplAccount, ...LEDGER }),
    ).toThrow(/paused/i)
  })

  it('refuses an expired quote rather than signing stale terms', () => {
    const quote = quoteDirectMint(STATE, INTENT, NOW)
    expect(() =>
      buildPaymentForQuote(quote, { account: INTENT.xrplAccount, ...LEDGER, now: quote.expiresAt + 1 }),
    ).toThrow(/expired/i)
  })

  it('carries the executor into the memo when the quote names one', () => {
    const executor = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    const quote = quoteDirectMint(STATE, { ...INTENT, executor }, NOW)
    const payment = buildPaymentForQuote(quote, { account: INTENT.xrplAccount, ...LEDGER })
    expect(decodeDirectMintMemo(`0x${payment.Memos[0]?.Memo.MemoData}`).executor).toBe(executor)
  })
})

describe('allowed-at survives to the timeline', () => {
  // SPEC's OperationTimeline lists allowed-at as data it must show. A delayed
  // mint that renders "waiting" without the deadline is exactly the
  // indeterminate spinner DESIGN.md forbids.
  const submitted = () =>
    attachXrplPayment(
      createDirectMintOperation({
        quote: quoteDirectMint(STATE, INTENT, NOW),
        intent: INTENT,
        network: 114,
        now: NOW,
      }),
      { xrplTxId: XRPL_TX, at: NOW + 1_000 },
    )

  const delayed: DirectMintChainState = {
    xrplTxId: XRPL_TX,
    xrplFinal: true,
    proofAvailable: true,
    delayState: 'Delayed',
    allowedAt: NOW + 3_600_000,
    alreadySettled: false,
  }

  it('records the exact timestamp the mint becomes executable', () => {
    const op = reconcileDirectMint(submitted(), delayed, NOW + 20_000)
    expect(op.awaiting?.availableAt).toBe(NOW + 3_600_000)
  })

  it('records it for an executor exclusivity window too', () => {
    const op = reconcileDirectMint(
      submitted(),
      { ...delayed, delayState: 'NotDelayed', executorExclusiveUntil: NOW + 600_000 },
      NOW + 20_000,
    )
    expect(op.awaiting?.actor).toBe('executor')
    expect(op.awaiting?.availableAt).toBe(NOW + 600_000)
  })

  it('leaves it unset when the wait has no known end', () => {
    // Waiting on the FDC has no deadline we can honestly state, so we state none
    // rather than inventing one.
    const op = reconcileDirectMint(
      submitted(),
      { ...delayed, proofAvailable: false, allowedAt: undefined, delayState: 'NotDelayed' },
      NOW + 20_000,
    )
    expect(op.awaiting?.actor).toBe('fdc')
    expect(op.awaiting?.availableAt).toBeUndefined()
  })
})
