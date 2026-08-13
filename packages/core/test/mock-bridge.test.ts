import { describe, expect, it } from 'vitest'
import { createMockBridgeAdapter, MOCK_BRIDGE_OBSERVED } from '../src/mock-bridge.js'
import { quoteBridge } from '../src/bridge-quote.js'
import { buildBridgePlan, buildRedeemPlan } from '../src/bridge.js'

const OWNER = '0x00000000000000000000000000000000000000A1' as `0x${string}`
const ONE_FXRP = 1_000_000n
const TEN_FXRP = 10_000_000n
const GUID = `0x${'ab'.repeat(32)}` as `0x${string}`
const FUTURE = 10_000

// The mock drives the REAL adapter/quote/plan; it reproduces the live fixtures and
// refuses anything the run never observed.

describe('mock-bridge — reproduces observed behaviour', () => {
  it('quotes the observed bridge fee and NO dust (delivered == input)', async () => {
    const adapter = createMockBridgeAdapter('coston2-sepolia')
    const result = await quoteBridge({ adapter, amountIn: ONE_FXRP, slippageBips: 50, to: OWNER, now: 1 })
    expect(result.kind).toBe('quote')
    if (result.kind !== 'quote') return
    expect(result.quote.nativeFee.value).toBe(MOCK_BRIDGE_OBSERVED['coston2-sepolia'].nativeFee)
    expect(result.quote.amountReceivedLD?.value).toBe(ONE_FXRP) // no dust
  })

  it('builds a plan through the real gate: needs-approval + the observed fee on the send', async () => {
    const adapter = createMockBridgeAdapter('coston2-sepolia', { assetAllowance: 0n })
    const result = await buildBridgePlan(adapter, { routeKey: 'coston2-sepolia', amountIn: ONE_FXRP, slippageBips: 50, deadline: FUTURE, recipient: OWNER }, OWNER, 0)
    expect(result.kind).toBe('plan')
    if (result.kind !== 'plan') return
    expect(result.plan.approve).toBeDefined()
    expect(result.plan.send.value).toBe(MOCK_BRIDGE_OBSERVED['coston2-sepolia'].nativeFee)
  })

  it('the redeem plan needs NO approve (native OFT) — copied from the live run', async () => {
    const adapter = createMockBridgeAdapter('sepolia-coston2-redeem', { assetAllowance: 0n })
    const result = await buildRedeemPlan(adapter, { routeKey: 'sepolia-coston2-redeem', amountIn: TEN_FXRP, slippageBips: 50, deadline: FUTURE, xrplDestination: 'rGEg' }, OWNER, 0)
    expect(result.kind).toBe('plan')
    if (result.kind !== 'plan') return
    expect(result.plan.approve).toBeUndefined()
  })

  it('delivery is in-flight until the configured destination read; then delivered', async () => {
    const flight = createMockBridgeAdapter('coston2-sepolia', { delivered: false })
    expect(await flight.reads.delivery(GUID, 0n)).toEqual({ kind: 'in-flight' })

    const done = createMockBridgeAdapter('coston2-sepolia', { delivered: true })
    expect(await done.reads.delivery(GUID, 0n)).toEqual({ kind: 'delivered', amountReceivedLD: 1_000_000n })
  })

  it('the redemption leg reproduces filed and the honest failed shape', async () => {
    const filed = createMockBridgeAdapter('sepolia-coston2-redeem', { redemption: 'filed' })
    const r = await filed.reads.redemption(GUID, 0n)
    expect(r.kind).toBe('filed')

    const failed = createMockBridgeAdapter('sepolia-coston2-redeem', { redemption: 'failed' })
    expect((await failed.reads.redemption(GUID, 0n)).kind).toBe('failed')

    const pending = createMockBridgeAdapter('sepolia-coston2-redeem', { redemption: 'none' })
    expect((await pending.reads.redemption(GUID, 0n)).kind).toBe('pending')
  })
})

describe('mock-bridge — refuses the unobserved', () => {
  it('throws for a route the live run never drove', () => {
    expect(() => createMockBridgeAdapter('coston2-hyperliquid')).toThrow(/never observed live/i)
  })
})
