import { describe, expect, it } from 'vitest'
import {
  MEMO_MOCK_EPOCH,
  OBSERVED_MEMO_ACCOUNT,
  OBSERVED_MEMO_ACCOUNT_AFTER,
  OBSERVED_MEMO_BYTES,
  OBSERVED_MEMO_FEES,
  OBSERVED_MEMO_RUN,
  mockMemoObservation,
  mockMemoObservationAwaitingEffect,
  mockMemoPlan,
} from '../src/mock-smart-accounts-memo.js'
import { memoSpine, reconcileMemoInstruction } from '../src/smart-accounts/memo-states.js'
import { createOperation } from '../src/operation.js'

/**
 * The memo mock, checked against the live run rather than against itself (M14-R12).
 *
 * The point of writing a mock AFTER the run is that it can be held to what the chain did. So
 * these tests do not assert that the fixtures are internally consistent — they assert that the
 * SHIPPED planner and reconciler, driven with the observed inputs, reproduce the observed
 * outcome. A drift between the code and the record fails here.
 */

const record = () =>
  createOperation({
    capability: 'smartAccounts.memoInstruction',
    network: 114,
    intent: {},
    now: MEMO_MOCK_EPOCH,
  })

const withSpine = () => ({ ...record(), steps: memoSpine() })

describe('the shipped codec reproduces what Coston2 accepted', () => {
  it('encodes byte-for-byte the memo the ledger actually carried', () => {
    // The strongest claim this mock can make. Not "someone pasted the bytes correctly" but
    // "the encoder that ships today produces what the controller took on 2026-08-15".
    const result = mockMemoPlan()
    expect(result.ok).toBe(true)
    expect(result.ok && result.plan.memo).toBe(OBSERVED_MEMO_BYTES)
  })

  it('measures the same 810 bytes, which is why it went inline as 0xFF', () => {
    const result = mockMemoPlan()
    expect(result.ok && (result.plan.memo.length - 2) / 2).toBe(OBSERVED_MEMO_RUN.memoBytes)
    expect(result.ok && result.plan.opcode).toBe(OBSERVED_MEMO_RUN.opcode)
  })
})

describe('the fee arithmetic the run confirmed', () => {
  it('charges the MINIMUM, not the proportional fee, at this payment size', () => {
    // 0.25% of 2 000 000 is 5 000; the protocol took 100 000. A surface quoting the
    // percentage alone would have understated it twentyfold.
    const proportional = (2_000_000n * OBSERVED_MEMO_FEES.feeBIPS) / 10_000n
    expect(proportional).toBe(5_000n)
    const result = mockMemoPlan()
    expect(result.ok && result.plan.mintingFeeUBA).toBe(OBSERVED_MEMO_RUN.mintingFeeUBA)
  })

  it('credits exactly what the chain credited', () => {
    const result = mockMemoPlan()
    expect(result.ok && result.plan.creditedUBA).toBe(OBSERVED_MEMO_RUN.creditedUBA)
  })

  it('reconciles the balance the account actually ended with', () => {
    // 500 000 held + 1 900 000 credited - 400 000 moved = 2 000 000, read back from chain.
    const expected =
      OBSERVED_MEMO_ACCOUNT.fassetBalance! +
      OBSERVED_MEMO_RUN.creditedUBA -
      OBSERVED_MEMO_RUN.movedUBA
    expect(OBSERVED_MEMO_ACCOUNT_AFTER.fassetBalance).toBe(expected)
  })
})

describe('what the mock refuses to claim', () => {
  it('does not claim this kit relayed the mint', () => {
    // It did not. A third party attested the same public payment under its own proofOwner
    // and submitted first. Recording a kit relay would claim a leg the run disproved.
    expect(OBSERVED_MEMO_RUN.relayedByUs).toBe(false)
    expect(OBSERVED_MEMO_RUN.relayer).not.toBe(OBSERVED_MEMO_RUN.proofOwner)
  })

  it('offers no delayed observation, because no mint was rate-limited', () => {
    expect(mockMemoObservation().delayed).toBeUndefined()
    expect(mockMemoObservationAwaitingEffect().delayed).toBeUndefined()
  })

  it('offers no burn, because no below-minimum payment was ever sent', () => {
    expect(mockMemoObservation().paymentTooSmall).toBeUndefined()
  })

  it('carries the replay-unknown warning the run genuinely had', () => {
    // At plan time the payment did not exist, so whether it had dispatched was unknowable.
    // The mock keeps that rather than tidying it into a confident `false`.
    const result = mockMemoPlan()
    expect(result.ok && result.plan.warnings.map((w) => w.code)).toContain('replay_unknown')
  })
})

describe('the lifecycle, driven by the real reconciler', () => {
  it('reaches succeeded only with BOTH the event and the effect', () => {
    const done = reconcileMemoInstruction(withSpine(), mockMemoObservation(), {
      now: MEMO_MOCK_EPOCH + 120_000,
    })
    expect(done.state).toBe('succeeded')
  })

  it('does NOT reach succeeded from the event alone', () => {
    // The state a surface is most likely to get wrong: the operation ran, the receipt is
    // mined, and it is still not success until the consequence is observed.
    const partial = reconcileMemoInstruction(withSpine(), mockMemoObservationAwaitingEffect(), {
      now: MEMO_MOCK_EPOCH + 120_000,
    })
    expect(partial.state).not.toBe('succeeded')
    expect(partial.state).toBe('awaiting_external')
  })
})
