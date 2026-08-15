import { describe, expect, it } from 'vitest'
import { type Address, maxUint256 } from 'viem'
import { gaslessFor } from '@flarekit-dev/contracts'
import {
  type GaslessAdapter,
  type GaslessIntent,
  buildGaslessPlan,
  createGasless,
  applyGaslessPlan,
} from '../src/index.js'

const OWNER: Address = '0x00000000000000000000000000000000000000A1'
const RECIPIENT: Address = '0x00000000000000000000000000000000000000B2'
const NOW = 1_700_000_000
const INTENT: GaslessIntent = { network: 'coston2', to: RECIPIENT, amount: 1_000_000n, deadlineSeconds: 3600 }
const FXRP = gaslessFor('coston2')!.fxrp.address
const FORWARDER = gaslessFor('coston2')!.forwarder

// A fake adapter with a deployment whose `gaslessVerified` we control, plus stubbed
// reads/writes — buildGaslessPlan reads balance/allowance/nonce and gates on verified.
function fakeAdapter(opts: {
  verified: boolean
  balance?: bigint
  allowance?: bigint
  nonce?: bigint
  throwOnBalance?: boolean
}): GaslessAdapter {
  return {
    deployment: { ...gaslessFor('coston2')!, gaslessVerified: opts.verified },
    forwarder: FORWARDER,
    fxrp: FXRP,
    relayer: { baseUrl: 'http://localhost:8788' },
    reads: {
      fxrpToken: async () => FXRP,
      decimals: async () => 6,
      nonce: async () => opts.nonce ?? 0n,
      balance: async () => {
        if (opts.throwOnBalance) throw new Error('rpc down')
        return opts.balance ?? 10_000_000n
      },
      allowance: async () => opts.allowance ?? 0n,
      paymentSince: async () => ({ kind: 'in-flight' }),
    },
    writes: {
      approveForwarder: (amount) => ({ token: FXRP, spender: FORWARDER, amount, label: 'Approve FTestXRP for the forwarder' }),
    },
    relay: async () => ({ accepted: false }),
  }
}

describe('buildGaslessPlan gating (M9-R2/R12)', () => {
  it('refuses an unverified forwarder with not-verified and NO plan (even before reads)', async () => {
    const r = await buildGaslessPlan(fakeAdapter({ verified: false, throwOnBalance: true }), INTENT, OWNER, NOW)
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.error.kind).toBe('not-verified')
  })

  it('emits the one-time approval step when the allowance is 0', async () => {
    const r = await buildGaslessPlan(fakeAdapter({ verified: true, allowance: 0n }), INTENT, OWNER, NOW)
    expect(r.kind).toBe('plan')
    if (r.kind === 'plan') {
      expect(r.plan.approve).toBeDefined()
      expect(r.plan.approve?.token.toLowerCase()).toBe(FXRP.toLowerCase())
      expect(r.plan.approve?.spender.toLowerCase()).toBe(FORWARDER.toLowerCase())
      expect(r.plan.approve?.amount).toBe(maxUint256)
    }
  })

  it('omits the approval step when the allowance already covers it (payment is gasless)', async () => {
    const r = await buildGaslessPlan(fakeAdapter({ verified: true, allowance: maxUint256, nonce: 4n }), INTENT, OWNER, NOW)
    expect(r.kind).toBe('plan')
    if (r.kind === 'plan') {
      expect(r.plan.approve).toBeUndefined()
      expect(r.plan.payment.nonce).toBe(4n)
      expect(r.plan.payment.deadline).toBe(BigInt(NOW + 3600))
    }
  })

  it('insufficient-balance when FXRP < amount', async () => {
    const r = await buildGaslessPlan(fakeAdapter({ verified: true, balance: 500_000n }), INTENT, OWNER, NOW)
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.error.kind).toBe('insufficient-balance')
  })

  it('expired-deadline when the window is non-positive', async () => {
    const r = await buildGaslessPlan(fakeAdapter({ verified: true }), { ...INTENT, deadlineSeconds: 0 }, OWNER, NOW)
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.error.kind).toBe('expired-deadline')
  })

  it('unavailable when a read throws — nothing safe to sign', async () => {
    const r = await buildGaslessPlan(fakeAdapter({ verified: true, throwOnBalance: true }), INTENT, OWNER, NOW)
    expect(r.kind).toBe('unavailable')
  })
})

describe('gasless operation transitions (M9-R3)', () => {
  it('createGasless lands in awaiting_input', () => {
    expect(createGasless({ chainId: 114, intent: INTENT, now: NOW }).state).toBe('awaiting_input')
  })

  it('a plan needing approval → awaiting_approval with the approve+sign+relay spine', () => {
    const op = createGasless({ chainId: 114, intent: INTENT, now: NOW })
    const plan = { approve: { token: FXRP, spender: FORWARDER, amount: maxUint256, label: 'x' }, payment: { from: OWNER, to: RECIPIENT, amount: 1_000_000n, nonce: 0n, deadline: 1n } }
    const next = applyGaslessPlan(op, { plan: { kind: 'plan', plan }, now: NOW }).record
    expect(next.state).toBe('awaiting_approval')
    expect(next.steps.map((s) => s.id)).toEqual(['approve', 'sign', 'relay'])
  })

  it('a plan with an existing allowance → ready with just the sign+relay spine', () => {
    const op = createGasless({ chainId: 114, intent: INTENT, now: NOW })
    const plan = { payment: { from: OWNER, to: RECIPIENT, amount: 1_000_000n, nonce: 0n, deadline: 1n } }
    const next = applyGaslessPlan(op, { plan: { kind: 'plan', plan }, now: NOW }).record
    expect(next.state).toBe('ready')
    expect(next.steps.map((s) => s.id)).toEqual(['sign', 'relay'])
  })

  it('a plan error returns to awaiting_input (nothing to sign)', () => {
    const op = createGasless({ chainId: 114, intent: INTENT, now: NOW })
    const next = applyGaslessPlan(op, { plan: { kind: 'error', error: { kind: 'not-verified', reason: 'x' } }, now: NOW }).record
    expect(next.state).toBe('awaiting_input')
  })
})
