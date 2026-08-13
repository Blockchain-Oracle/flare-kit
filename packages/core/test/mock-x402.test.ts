import { describe, expect, it } from 'vitest'
import type { Address, Hex } from 'viem'
import { MOCK_X402_OBSERVED, mockX402Challenge, mockX402Outcome, reconcileX402, createX402, applyX402Challenge } from '../src/index.js'
import { applyTransition } from '../src/operation.js'

const NOW = 1_700_000_000_000

function submittedOp(now: number) {
  let op = createX402({ chainId: 114, intent: { network: 'coston2', resource: '/api/demo' }, now })
  op = applyX402Challenge(op, { plan: { challenge: mockX402Challenge(now), authorization: { from: '0x00000000000000000000000000000000000000A1' as Address, to: '0x00000000000000000000000000000000000000A1' as Address, value: 1n, validAfter: 0n, validBefore: 1n, nonce: `0x${'00'.repeat(32)}` as Hex } }, now }).record
  op = applyTransition(op, { to: 'executing', at: now, patch: {} }).record
  op = applyTransition(op, { to: 'submitted', at: now, patch: {} }).record
  return op
}

describe('mock-x402 — copies observed (M9-R9)', () => {
  it('the mock challenge preserves the demo-token label and the observed amount', () => {
    const c = mockX402Challenge(NOW)
    expect(c.demoToken).toBe(true)
    expect(c.asset).toBe('mUSDT0 (demo)')
    expect(c.maxAmountRequired).toBe(MOCK_X402_OBSERVED.maxAmountRequired)
    expect(c.expiresAt).toBe(NOW + 300 * 1000)
  })

  it('never fabricates a settlement: the default outcome is pending/undelivered', () => {
    const o = mockX402Outcome()
    expect(o.settlement.kind).toBe('pending')
    expect(o.resource.kind).toBe('undelivered')
  })

  it('reproduces the observed settled+delivered outcome with the real tx + paymentId', () => {
    const o = mockX402Outcome('settled-delivered')
    expect(o.settlement).toEqual({ kind: 'settled', txHash: MOCK_X402_OBSERVED.settlementTx, paymentId: MOCK_X402_OBSERVED.paymentId })
    expect(o.resource.kind).toBe('delivered')
  })

  it('drives the REAL reconciler: settled+delivered → succeeded', () => {
    const o = mockX402Outcome('settled-delivered')
    expect(reconcileX402(submittedOp(NOW), o.settlement, o.resource, NOW + 1000).state).toBe('succeeded')
  })

  it('drives the REAL reconciler: settled+resource-failed → partially_succeeded (never succeeded)', () => {
    const o = mockX402Outcome('settled-resource-failed')
    const r = reconcileX402(submittedOp(NOW), o.settlement, o.resource, NOW + 1000)
    expect(r.state).toBe('partially_succeeded')
    expect(r.state).not.toBe('succeeded')
  })

  it('drives the REAL reconciler: pending → awaiting_external; rejected → failed', () => {
    const p = mockX402Outcome('pending')
    expect(reconcileX402(submittedOp(NOW), p.settlement, p.resource, NOW + 1000).state).toBe('awaiting_external')
    const rj = mockX402Outcome('rejected')
    expect(reconcileX402(submittedOp(NOW), rj.settlement, rj.resource, NOW + 1000).state).toBe('failed')
  })

  it('refuses a network it never observed live (throws loudly)', () => {
    expect(() => mockX402Challenge(NOW, {}, 'flare')).toThrow(/refuses to invent/)
  })
})
