import { describe, expect, it } from 'vitest'
import type { Address, Hex } from 'viem'
import { x402For } from '@flare-kit/contracts'
import { parseChallenge, encodeXPayment, readXPaymentResponse } from '../src/x402-client.js'

const D = x402For('coston2')!
const RECEIVED_AT = 1_700_000_000_000
const NONCE = `0x${'22'.repeat(32)}` as Hex

function body(overrides: Record<string, unknown> = {}) {
  return {
    x402Version: '1',
    accepts: [
      {
        scheme: 'exact',
        network: 'flare-coston2',
        maxAmountRequired: '100000',
        resource: '/api/demo',
        payTo: D.payee,
        maxTimeoutSeconds: 300,
        asset: 'MockUSDT0 (demo)',
        extra: { tokenAddress: D.token.address, facilitatorAddress: D.facilitator, chainId: 114 },
        ...overrides,
      },
    ],
  }
}

describe('parseChallenge (M9-R6/R7)', () => {
  it('parses the requirement and computes expiresAt from maxTimeoutSeconds', () => {
    const c = parseChallenge(body(), RECEIVED_AT)
    expect(c.maxAmountRequired).toBe(100_000n)
    expect(c.resource).toBe('/api/demo')
    expect(c.payTo).toBe(D.payee)
    expect(c.token).toBe(D.token.address)
    expect(c.facilitator).toBe(D.facilitator)
    expect(c.chainId).toBe(114)
    expect(c.expiresAt).toBe(RECEIVED_AT + 300 * 1000)
  })

  it('marks demoToken TRUE from the registry (not the server label)', () => {
    // even if the server LIED and called the asset "USDT0", the registry drives the flag
    const c = parseChallenge(body({ asset: 'USDT0' }), RECEIVED_AT)
    expect(c.demoToken).toBe(true)
  })

  it('marks demoToken FALSE for a token the registry does not know', () => {
    const c = parseChallenge(body({ extra: { tokenAddress: '0x000000000000000000000000000000000000dEaD', facilitatorAddress: D.facilitator, chainId: 114 } }), RECEIVED_AT)
    expect(c.demoToken).toBe(false)
  })

  it('throws on a malformed 402 body', () => {
    expect(() => parseChallenge({ accepts: [] }, RECEIVED_AT)).toThrow(/malformed/)
  })
})

describe('encodeXPayment / readXPaymentResponse round-trips (M9-R6)', () => {
  it('encodeXPayment is base64 JSON carrying the auth + token + split sig', () => {
    const auth = { from: '0x00000000000000000000000000000000000000A1' as Address, to: D.payee, value: 100_000n, validAfter: 0n, validBefore: 4_000_000_000n, nonce: NONCE }
    const header = encodeXPayment(auth, { v: 27, r: `0x${'ab'.repeat(32)}` as Hex, s: `0x${'cd'.repeat(32)}` as Hex }, D.token.address)
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'))
    expect(decoded.token.toLowerCase()).toBe(D.token.address.toLowerCase())
    expect(decoded.value).toBe('100000')
    expect(decoded.nonce).toBe(NONCE)
    expect(decoded.v).toBe(27)
  })

  it('readXPaymentResponse decodes the settlement fact, or null when absent', () => {
    const header = Buffer.from(JSON.stringify({ paymentId: `0x${'ee'.repeat(32)}`, transactionHash: `0x${'ff'.repeat(32)}`, settled: true })).toString('base64')
    const parsed = readXPaymentResponse(header)
    expect(parsed?.paymentId).toBe(`0x${'ee'.repeat(32)}`)
    expect(parsed?.txHash).toBe(`0x${'ff'.repeat(32)}`)
    expect(readXPaymentResponse('not-base64-json!!')).toBeNull()
    expect(readXPaymentResponse(Buffer.from(JSON.stringify({ settled: false })).toString('base64'))).toBeNull()
  })
})
