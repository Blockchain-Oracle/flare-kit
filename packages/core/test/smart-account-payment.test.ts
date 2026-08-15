import { describe, expect, it } from 'vitest'
import { buildInstructionPayment } from '../src/smart-accounts/payment.js'
import { buildDirectMintPayment } from '../src/xrpl.js'

/**
 * `buildInstructionPayment` is public API and it built the XRPL payments for the
 * live Coston2 instruction runs — and it had no test. These are the assertions
 * that were missing while it was moving real value.
 *
 * The sharpest one is the fee separation. Two different fees are both denominated
 * in drops and both `bigint`:
 *
 *   amountDrops     what reaches the operator; must cover the CONTROLLER's fee
 *   ledgerFeeDrops  what the XRP Ledger charges to include the transaction
 *
 * M13 renamed the second field precisely so a caller wiring a plan in by field
 * name could not silently burn the instruction fee as a network fee and underpay.
 * That rename is only worth anything if something checks it.
 */

const BASE = {
  account: 'rSENDER0000000000000000000000000',
  destination: 'rOPERATOR00000000000000000000000',
  amountDrops: 1_000_000n,
  reference: `0x${'ab'.repeat(32)}` as const,
  sequence: 42,
  lastLedgerSequence: 99,
  ledgerFeeDrops: 12n,
}

describe('buildInstructionPayment', () => {
  it('sends the amount to the operator, and the ledger fee to the ledger', () => {
    const payment = buildInstructionPayment(BASE)
    // The two must never be conflated: Amount pays the controller's instruction
    // fee, Fee pays the ledger. Swapping them underpays the operator and the
    // payment cannot be taken back.
    expect(payment.Amount).toBe('1000000')
    expect(payment.Fee).toBe('12')
  })

  it('carries the reference as the first memo, uppercase and unprefixed', () => {
    const payment = buildInstructionPayment(BASE)
    expect(payment.Memos[0]!.Memo.MemoData).toBe('AB'.repeat(32))
  })

  it('never sets a DestinationTag, which would let a tag-holder be credited', () => {
    expect(buildInstructionPayment(BASE).DestinationTag).toBeUndefined()
  })

  it('bounds the payment, so one that has not landed by then never will', () => {
    expect(buildInstructionPayment(BASE).LastLedgerSequence).toBe(99)
  })

  it('refuses a non-positive amount rather than building a payment for nothing', () => {
    expect(() => buildInstructionPayment({ ...BASE, amountDrops: 0n })).toThrow(/positive/i)
  })

  it('refuses a reference that is not 32 bytes', () => {
    expect(() => buildInstructionPayment({ ...BASE, reference: '0xdeadbeef' })).toThrow(
      /32-byte/i,
    )
  })
})

/**
 * The two builders stay separate — one carries an opaque reference it validates,
 * the other COMPUTES a mint memo from a target — but they assemble the same
 * envelope, and that envelope is now written once. This is the test that the
 * shared tail did not quietly change either one.
 */
describe('both builders produce the same payment envelope', () => {
  it('agrees on every field that is not the memo', () => {
    const instruction = buildInstructionPayment(BASE)
    const mint = buildDirectMintPayment({
      account: BASE.account,
      destination: BASE.destination,
      amountDrops: BASE.amountDrops,
      sequence: BASE.sequence,
      lastLedgerSequence: BASE.lastLedgerSequence,
      feeDrops: BASE.ledgerFeeDrops,
      recipient: `0x${'cd'.repeat(20)}`,
    })

    const envelope = ({ Memos: _memos, ...rest }: typeof instruction) => rest
    expect(envelope(instruction)).toEqual(envelope(mint))
  })
})
