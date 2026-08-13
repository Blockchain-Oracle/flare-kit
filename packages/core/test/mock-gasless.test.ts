import { describe, expect, it } from 'vitest'
import { type Address, maxUint256 } from 'viem'
import { MOCK_GASLESS_OBSERVED, buildGaslessPlan, createMockGaslessAdapter } from '../src/index.js'

const OWNER: Address = '0x00000000000000000000000000000000000000A1'
const intent = { network: 'coston2', to: OWNER, amount: 1_000_000n, deadlineSeconds: 3600 } as const

describe('mock-gasless — copies observed (M9-R9)', () => {
  it('drives the REAL plan code: allowance 0 → the one-time approval appears', async () => {
    const adapter = createMockGaslessAdapter({ allowance: 0n })
    const r = await buildGaslessPlan(adapter, intent, OWNER, 1_000_000)
    expect(r.kind).toBe('plan')
    if (r.kind === 'plan') expect(r.plan.approve).toBeDefined()
  })

  it('allowance already MaxUint256 → no approval (the payment is gasless)', async () => {
    const adapter = createMockGaslessAdapter({ allowance: maxUint256 })
    const r = await buildGaslessPlan(adapter, intent, OWNER, 1_000_000)
    expect(r.kind).toBe('plan')
    if (r.kind === 'plan') expect(r.plan.approve).toBeUndefined()
  })

  it('reproduces the observed confirmed transfer only when the on-chain read is asserted', async () => {
    const notYet = await createMockGaslessAdapter({ confirmed: false }).reads.paymentSince(OWNER, 0n, 0n)
    expect(notYet).toEqual({ kind: 'in-flight' })
    const landed = await createMockGaslessAdapter({ confirmed: true }).reads.paymentSince(OWNER, 0n, 0n)
    expect(landed).toEqual({ kind: 'confirmed', txHash: MOCK_GASLESS_OBSERVED.paymentTx, amount: MOCK_GASLESS_OBSERVED.paymentAmount })
  })

  it('never fabricates a confirmed transfer of 0 — absence is in-flight', async () => {
    const r = await createMockGaslessAdapter({}).reads.paymentSince(OWNER, 0n, 0n)
    expect(r.kind).toBe('in-flight')
  })

  it('the relay receipt is the observed acceptance, and its refusal shapes', async () => {
    const req = { from: OWNER, to: OWNER, amount: 1n, deadline: 2n, signature: '0x00' as const }
    expect((await createMockGaslessAdapter().relay(req)).accepted).toBe(true)
    expect((await createMockGaslessAdapter({ relay: 'unreachable' }).relay(req)).accepted).toBe(false)
    expect((await createMockGaslessAdapter({ relay: { rejected: 'short-allowance' } }).relay(req)).accepted).toBe(false)
  })

  it('refuses a network it never observed live (throws loudly)', () => {
    expect(() => createMockGaslessAdapter({}, 'flare')).toThrow(/refuses to invent/)
  })
})
