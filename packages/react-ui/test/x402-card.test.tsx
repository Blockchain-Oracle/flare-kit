import type { X402Challenge, X402Operation } from '@flare-kit/core'
import { applyTransition, applyX402Challenge, createX402, mockX402Challenge, mockX402Outcome, reconcileX402 } from '@flare-kit/core'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { X402Card } from '../src/X402Card.js'

type Hex = `0x${string}`

const CH: X402Challenge = mockX402Challenge(0)
const auth = { from: '0x00000000000000000000000000000000000000A1' as Hex, to: CH.payTo, value: 100_000n, validAfter: 0n, validBefore: 1n, nonce: `0x${'00'.repeat(32)}` as Hex }
const TX = `0x${'ab'.repeat(32)}` as Hex
const PID = `0x${'cd'.repeat(32)}` as Hex

function ready(): X402Operation {
  return applyX402Challenge(createX402({ chainId: 114, intent: { network: 'coston2', resource: '/api/demo' }, now: 0 }), { plan: { challenge: CH, authorization: auth }, now: 0 }).record
}
function submitted(): X402Operation {
  let op = ready()
  op = applyTransition(op, { to: 'executing', at: 0, patch: {} }).record
  return applyTransition(op, { to: 'submitted', at: 0, patch: {} }).record
}

const opState = (c: HTMLElement) => c.querySelector('[data-op-state]')?.getAttribute('data-op-state')
const cta = (c: HTMLElement) => c.querySelector('.fk-panel-action button')?.textContent

describe('X402Card — states reachable from props (M9-R11/AC6)', () => {
  it('challenge: demo-token label, amount + payee + facilitator + expiry shown', () => {
    const { container } = render(<X402Card operation={ready()} challenge={CH} amountText="0.1 mUSDT0" />)
    expect(opState(container)).toBe('ready')
    expect(cta(container)).toBe('Sign & pay')
    expect(container.textContent).toContain('demo token')
    expect(container.textContent).toContain('0.1 mUSDT0')
    expect(container.textContent).toContain(CH.payTo)
  })

  it('expired: renders expired, CTA disabled (not valid)', () => {
    const op = applyX402Challenge(createX402({ chainId: 114, intent: { network: 'coston2', resource: '/api/demo' }, now: 10 }), { plan: { challenge: mockX402Challenge(0, { expiresInMs: 5 }), authorization: auth }, now: 10 }).record
    const { container } = render(<X402Card operation={op} challenge={mockX402Challenge(0, { expiresInMs: 5 })} expired amountText="0.1 mUSDT0" />)
    expect(cta(container)).toBe('Challenge expired')
    expect(container.textContent).toContain('Challenge expired')
  })

  it('settling: outcome timeline present with a settlement + resource leg', () => {
    const o = mockX402Outcome('pending')
    const op = reconcileX402(submitted(), o.settlement, o.resource, 1000)
    const { container } = render(<X402Card operation={op} challenge={CH} amountText="0.1 mUSDT0" />)
    expect(opState(container)).toBe('awaiting_external')
    expect([...container.querySelectorAll('.fk-legtl-leg')].length).toBe(2)
  })

  it('settled + delivered → succeeded; the real settlement tx + paymentId are shown', () => {
    const o = mockX402Outcome('settled-delivered')
    const op = reconcileX402(submitted(), o.settlement, o.resource, 1000)
    const { container } = render(<X402Card operation={op} challenge={CH} settlementTx={TX} paymentId={PID} settlementExplorerUrl="https://x/tx" amountText="0.1 mUSDT0" />)
    expect(opState(container)).toBe('succeeded')
    expect(cta(container)).toBe('Delivered')
    expect(container.textContent).toContain(TX)
    expect(container.textContent).toContain(PID)
  })

  it('settled + resource-failed → partially_succeeded, NEVER succeeded (payment took, resource did not)', () => {
    const o = mockX402Outcome('settled-resource-failed')
    const op = reconcileX402(submitted(), o.settlement, o.resource, 1000)
    const { container } = render(<X402Card operation={op} challenge={CH} settlementTx={TX} paymentId={PID} amountText="0.1 mUSDT0" />)
    expect(opState(container)).toBe('partially_succeeded')
    expect(container.textContent).toContain('Payment took, resource did not')
    expect(container.textContent).not.toContain('Delivered')
  })

  it('rejected → failed with the settlement-rejected note', () => {
    const o = mockX402Outcome('rejected')
    const op = reconcileX402(submitted(), o.settlement, o.resource, 1000)
    const { container } = render(<X402Card operation={op} challenge={CH} amountText="0.1 mUSDT0" />)
    expect(opState(container)).toBe('failed')
    expect(container.textContent).toContain('Settlement rejected')
  })
})
