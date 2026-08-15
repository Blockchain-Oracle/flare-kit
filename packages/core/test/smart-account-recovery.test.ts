import { describe, expect, it } from 'vitest'
import { planMemoRecovery, memoRecoveryOrderFor } from '../src/smart-accounts/recovery.js'

/**
 * The five recovery opcodes.
 *
 * They exist because `executeDirectMinting` is atomic while the XRPL payment is not: any
 * revert inside `handleMintedFAssets` rolls back the mint and the memo, and the XRP stays at
 * the Core Vault — unminted, unrefunded, and stuck until the user acts.
 *
 * Every recovery is itself an XRPL payment that costs fees and mints a little FAsset. There is
 * no free cancel, and the surfaces must not imply one.
 */

const TX = '0xE4385C7AD4E316DF269BFBB96A15204CC68E549005228BB6B1808595DC04117D'
const EXECUTOR = '0xDddF991858311597bFD3D125cb342a0d4B56ea0a'

describe('0xE0 skip-memo — the only thing that works on a memo too broken to parse', () => {
  it('builds a 42-byte memo naming the stuck transaction', () => {
    const result = planMemoRecovery({ kind: 'skip-memo', targetTransactionId: TX, stuckIdUsed: false })
    expect(result.ok).toBe(true)
    expect(result.ok && (result.plan.memo.length - 2) / 2).toBe(42)
  })

  it('refuses once the stuck transaction has already been used', () => {
    // `ignoreMemo` only helps while the payment is still unconsumed; afterwards there is
    // nothing to skip and the recovery payment would be spent for nothing.
    const result = planMemoRecovery({ kind: 'skip-memo', targetTransactionId: TX, stuckIdUsed: true })
    expect(!result.ok && result.refusal.code).toBe('already_used')
  })

  it('refuses when whether it was used could not be read, rather than guessing', () => {
    const result = planMemoRecovery({ kind: 'skip-memo', targetTransactionId: TX, stuckIdUsed: undefined })
    expect(!result.ok && result.refusal.code).toBe('used_state_unknown')
  })

  it('says the recovery payment must itself mint something', () => {
    // A fee-only direct mint reverts, so the flag has to ride on a payment that mints.
    const result = planMemoRecovery({ kind: 'skip-memo', targetTransactionId: TX, stuckIdUsed: false })
    expect(result.ok && result.plan.notes.join(' ')).toMatch(/mint/i)
  })
})

describe('0xE1 fast-forward nonce', () => {
  it('requires the new nonce to be strictly greater', () => {
    const result = planMemoRecovery({ kind: 'fast-forward-nonce', currentNonce: 5n, newNonce: 5n })
    expect(!result.ok && result.refusal.code).toBe('nonce_not_greater')
  })

  it('refuses a jump beyond the protocol’s uint32 limit', () => {
    const result = planMemoRecovery({
      kind: 'fast-forward-nonce',
      currentNonce: 0n,
      newNonce: 2n ** 32n + 1n,
    })
    expect(!result.ok && result.refusal.code).toBe('nonce_jump_too_large')
  })

  it('builds a 42-byte memo for a legitimate skip', () => {
    const result = planMemoRecovery({ kind: 'fast-forward-nonce', currentNonce: 5n, newNonce: 6n })
    expect(result.ok && (result.plan.memo.length - 2) / 2).toBe(42)
  })
})

describe('0xE2 replacement fee', () => {
  it('builds a 50-byte memo — the one opcode that is not 42', () => {
    const result = planMemoRecovery({ kind: 'replacement-fee', targetTransactionId: TX, newFee: 1_000n })
    expect(result.ok && (result.plan.memo.length - 2) / 2).toBe(50)
  })

  it('refuses a fee the controller’s own +1 storage cannot hold', () => {
    // Stored as `newFee + 1` under checked arithmetic, so the true ceiling is 2^64 - 2.
    const result = planMemoRecovery({
      kind: 'replacement-fee',
      targetTransactionId: TX,
      newFee: 2n ** 64n - 1n,
    })
    expect(!result.ok && result.refusal.code).toBe('fee_too_large')
  })
})

describe('0xD0 / 0xD1 pin and unpin', () => {
  it('builds a 30-byte pin memo and a 10-byte unpin memo', () => {
    expect(
      planMemoRecovery({ kind: 'pin-executor', executor: EXECUTOR }).ok &&
        (planMemoRecovery({ kind: 'pin-executor', executor: EXECUTOR }) as { plan: { memo: string } }).plan.memo,
    ).toBeTruthy()
    const pin = planMemoRecovery({ kind: 'pin-executor', executor: EXECUTOR })
    const unpin = planMemoRecovery({ kind: 'unpin-executor' })
    expect(pin.ok && (pin.plan.memo.length - 2) / 2).toBe(30)
    expect(unpin.ok && (unpin.plan.memo.length - 2) / 2).toBe(10)
  })

  it('warns that pinning blocks ordinary mints too', () => {
    // The bypass requires a non-empty memo, so the pin applies even to a bare no-memo mint.
    // A pinned executor going dark blocks the account until a 0xD1 clears it.
    const pin = planMemoRecovery({ kind: 'pin-executor', executor: EXECUTOR })
    expect(pin.ok && pin.plan.notes.join(' ')).toMatch(/plain|ordinary|no-memo/i)
  })

  it('refuses the zero address, which the controller rejects anyway', () => {
    const result = planMemoRecovery({
      kind: 'pin-executor',
      executor: '0x0000000000000000000000000000000000000000',
    })
    expect(result.ok).toBe(false)
  })
})

describe('the ordering rule, which the docs state and a surface must not invert', () => {
  it('puts skip-memo FIRST when the stuck payment never minted', () => {
    // 0xE0 recovers the money; 0xE1 only tidies the nonce afterwards. Fast-forwarding first
    // abandons the payment.
    expect(memoRecoveryOrderFor({ stuckPaymentMinted: false })[0]).toBe('skip-memo')
  })

  it('does not offer skip-memo once the payment already minted', () => {
    // Nothing left to skip; the nonce is the only thing still parked.
    const order = memoRecoveryOrderFor({ stuckPaymentMinted: true })
    expect(order).not.toContain('skip-memo')
    expect(order[0]).toBe('fast-forward-nonce')
  })
})

describe('0xD0 pin — the refusal the review gate found untested', () => {
  it('refuses the zero address, which the controller rejects with AddressZero', () => {
    // Costs a whole XRPL payment to discover on chain, so it is refused before signing.
    const result = planMemoRecovery({ kind: 'pin-executor', executor: `0x${'00'.repeat(20)}` })
    expect(!result.ok && result.refusal.code).toBe('invalid_executor')
  })

  it('accepts a real executor address', () => {
    const result = planMemoRecovery({ kind: 'pin-executor', executor: EXECUTOR })
    expect(result.ok).toBe(true)
    expect(result.ok && (result.plan.memo.length - 2) / 2).toBe(30)
  })
})
