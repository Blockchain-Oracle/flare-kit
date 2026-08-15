import { describe, expect, it } from 'vitest'
import { createOperation, applyTransition } from '../src/operation.js'
import type { MemoObservation } from '../src/smart-accounts/memo-states.js'
import { memoSpine, reconcileMemoInstruction } from '../src/smart-accounts/memo-states.js'

/**
 * The memo lifecycle, and the state that makes it different from every other flow in the kit.
 *
 * A rate-limited direct mint RETURNS WITHOUT REVERTING (`DirectMintingFacet.sol:135-139`): the
 * transaction mines, the receipt says success, `msg.value` is refunded — and nothing is
 * minted, so `handleMintedFAssets` never runs and the memo never executes. Any reader treating
 * a mined receipt as a completed mint reports something that did not happen.
 *
 * So `delayed` is a first-class state: not success, not failure, retryable with the SAME
 * proof once `executionAllowedAt` passes.
 */

const CLOCK = { now: 1_800_000_000_000 }

function submitted() {
  const now = CLOCK.now
  let record = createOperation({
    capability: 'smart-account-memo',
    network: 114,
    intent: { kind: 'memo' },
    now,
    id: 'memo1',
  })
  for (const [to, patch] of [
    ['quoting', { steps: memoSpine() }],
    ['ready', undefined],
    ['executing', undefined],
    ['submitted', undefined],
  ] as const) {
    const result = applyTransition(record, patch ? { to, at: now, patch } : { to, at: now })
    if (result.rejection) throw new Error(`illegal hop to ${to}: ${result.rejection}`)
    record = result.record
  }
  if (record.state !== 'submitted' || record.steps.length !== memoSpine().length) {
    throw new Error(`fixture stranded at ${record.state}`)
  }
  return record
}

const reconcile = (observation: MemoObservation, now = CLOCK.now) =>
  reconcileMemoInstruction(submitted(), observation, { now })

describe('a mined receipt is not a mint', () => {
  it('does NOT reach succeeded from a successful relay transaction alone', () => {
    // The relay mined. That says the AssetManager accepted the proof — not that FAssets were
    // minted, and not that the memo ran.
    const record = reconcile({ xrplPayment: { transactionId: 'ABC' }, relayHash: '0xrelay' })
    expect(record.state).not.toBe('succeeded')
    expect(record.state).toBe('awaiting_external')
  })

  it('enters `delayed` when the mint was rate-limited, which is neither outcome', () => {
    const record = reconcile({
      xrplPayment: { transactionId: 'ABC' },
      relayHash: '0xrelay',
      delayed: { executionAllowedAt: CLOCK.now + 3_600_000 },
    })
    expect(record.state).not.toBe('succeeded')
    expect(record.state).not.toBe('failed')
    expect(record.awaiting?.reason).toMatch(/rate limit|delayed/i)
  })

  it('keeps the delayed operation retryable with the SAME proof', () => {
    // Prompting for a second XRPL payment here is the named anti-pattern: the proof is still
    // valid and the mint still owed.
    const record = reconcile({
      xrplPayment: { transactionId: 'ABC' },
      relayHash: '0xrelay',
      delayed: { executionAllowedAt: CLOCK.now + 3_600_000 },
    })
    expect(record.state).toBe('awaiting_external')
    expect(record.awaiting?.availableAt).toBe(CLOCK.now + 3_600_000)
  })

  it('reaches succeeded only with the user operation AND its observed effect', () => {
    const record = reconcile({
      xrplPayment: { transactionId: 'ABC' },
      relayHash: '0xrelay',
      userOperationExecuted: { personalAccount: '0xpa', nonce: 4n },
      effectObserved: true,
    })
    expect(record.state).toBe('succeeded')
  })

  it('stays in flight when the operation executed but the effect is unconfirmed', () => {
    // The event says the controller dispatched, not that what the user wanted is real.
    const record = reconcile({
      xrplPayment: { transactionId: 'ABC' },
      relayHash: '0xrelay',
      userOperationExecuted: { personalAccount: '0xpa', nonce: 4n },
    })
    expect(record.state).toBe('awaiting_external')
  })
})

describe('the burn and the stall are not failures of ours to invent', () => {
  it('reports a payment burned below the minimum fee as its own terminal state', () => {
    // Everything went to the fee receiver, the memo never ran, and nothing is recoverable.
    // Calling this `failed` would suggest a retry; it is a loss with no path forward.
    const record = reconcile({ xrplPayment: { transactionId: 'ABC' }, paymentTooSmall: true })
    expect(record.state).toBe('failed')
    expect(record.awaiting).toBeUndefined()
  })

  it('never concludes anything from an unread relay', () => {
    // A payment on the ledger and nothing else known is a wait, not a verdict.
    const record = reconcile({ xrplPayment: { transactionId: 'ABC' } })
    expect(record.state).toBe('awaiting_external')
    expect(record.awaiting?.actor).toBe('fdc')
  })
})
