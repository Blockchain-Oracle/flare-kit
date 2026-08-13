import { describe, expect, it } from 'vitest'
import type { Address, Hex } from 'viem'
import { type X402Operation, createX402, applyX402Challenge, reconcileX402 } from '../src/index.js'
import { applyTransition } from '../src/operation.js'

const NOW = 1_700_000_000_000
const PAYEE: Address = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
const TOKEN: Address = '0x2dA725841FF6F5367E65C5d114aa66C034A3d97b'
const TX = `0x${'ab'.repeat(32)}` as Hex
const PID = `0x${'cd'.repeat(32)}` as Hex

function challenge(expiresAt: number) {
  return {
    scheme: 'exact',
    network: 'flare-coston2',
    maxAmountRequired: 100_000n,
    resource: '/api/demo',
    payTo: PAYEE,
    token: TOKEN,
    facilitator: '0x57da665Ef6Bd39F82Af6BC0764cd779E9C156DdA' as Address,
    chainId: 114,
    asset: 'MockUSDT0 (demo)',
    demoToken: true,
    maxTimeoutSeconds: 300,
    expiresAt,
  }
}

// A signed-and-submitted x402 op (state `submitted`, spine sign/settle).
function submittedOp(now: number): X402Operation {
  let op = createX402({ chainId: 114, intent: { network: 'coston2', resource: '/api/demo' }, now })
  const plan = {
    challenge: challenge(now + 300_000),
    authorization: { from: PAYEE, to: PAYEE, value: 100_000n, validAfter: 0n, validBefore: BigInt(now), nonce: `0x${'00'.repeat(32)}` as Hex },
  }
  op = applyX402Challenge(op, { plan, now }).record // → ready
  op = applyTransition(op, { to: 'executing', at: now, patch: {} }).record
  op = applyTransition(op, { to: 'submitted', at: now, patch: {} }).record
  return op
}

describe('x402 operation transitions (M9-R6/R11)', () => {
  it('a live challenge → ready with the sign/settle spine', () => {
    const op = createX402({ chainId: 114, intent: { network: 'coston2', resource: '/api/demo' }, now: NOW })
    const next = applyX402Challenge(op, { plan: { challenge: challenge(NOW + 300_000), authorization: { from: PAYEE, to: PAYEE, value: 1n, validAfter: 0n, validBefore: 1n, nonce: `0x${'00'.repeat(32)}` as Hex } }, now: NOW }).record
    expect(next.state).toBe('ready')
    expect(next.steps.map((s) => s.id)).toEqual(['sign', 'settle'])
  })

  it('an EXPIRED challenge has nothing to sign → awaiting_input', () => {
    const op = createX402({ chainId: 114, intent: { network: 'coston2', resource: '/api/demo' }, now: NOW })
    const next = applyX402Challenge(op, { plan: { challenge: challenge(NOW - 1), authorization: { from: PAYEE, to: PAYEE, value: 1n, validAfter: 0n, validBefore: 1n, nonce: `0x${'00'.repeat(32)}` as Hex } }, now: NOW }).record
    expect(next.state).toBe('awaiting_input')
  })
})

describe('reconcileX402 — settlement ≠ resource (M9-R6)', () => {
  it('pending settlement → awaiting_external(provider), never succeeded', () => {
    const r = reconcileX402(submittedOp(NOW), { kind: 'pending' }, { kind: 'undelivered' }, NOW + 1000)
    expect(r.state).toBe('awaiting_external')
    expect(r.awaiting?.actor).toBe('provider')
  })

  it('settled + delivered → succeeded (finalizes the spine, clears awaiting)', () => {
    const r = reconcileX402(submittedOp(NOW), { kind: 'settled', txHash: TX, paymentId: PID }, { kind: 'delivered', body: { demo: true } }, NOW + 2000)
    expect(r.state).toBe('succeeded')
    expect(r.awaiting).toBeUndefined()
    expect(r.steps.every((s) => s.state === 'done')).toBe(true)
  })

  it('settled + resource FAILED → partially_succeeded, NEVER succeeded (payment took, resource did not)', () => {
    const r = reconcileX402(submittedOp(NOW), { kind: 'settled', txHash: TX, paymentId: PID }, { kind: 'failed', status: 500 }, NOW + 2000)
    expect(r.state).toBe('partially_succeeded')
    expect(r.state).not.toBe('succeeded')
  })

  it('rejected settlement → failed', () => {
    const r = reconcileX402(submittedOp(NOW), { kind: 'rejected', reason: 'nonce used' }, { kind: 'undelivered' }, NOW + 2000)
    expect(r.state).toBe('failed')
  })

  it('settled but resource not yet delivered → awaiting_external(provider)', () => {
    const r = reconcileX402(submittedOp(NOW), { kind: 'settled', txHash: TX, paymentId: PID }, { kind: 'undelivered' }, NOW + 2000)
    expect(r.state).toBe('awaiting_external')
    expect(r.awaiting?.actor).toBe('provider')
  })
})
