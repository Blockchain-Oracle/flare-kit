import { describe, expect, it } from 'vitest'
import { routeByKey } from '@flarekit-dev/contracts'
import type { BridgeAdapter, MessagingFee, SendParam } from '../src/bridge-adapter.js'
import { quoteBridge } from '../src/bridge-quote.js'

const bridge = routeByKey('coston2', 'coston2-sepolia')!
const redeem = routeByKey('coston2', 'sepolia-coston2-redeem')!
const TO = '0x00000000000000000000000000000000000000B2'

// Probe fixtures (.thoughts/verification/2026-08-11-m8-bridge-probe.json):
// 1 FXRP quotes nativeFee 22.950824887834713257 C2FLR and delivers 1_000_000 (no dust).
const PROBE_FEE = 22_950_824_887_834_713_257n
const ONE_FXRP = 1_000_000n

function fakeAdapter(
  route: typeof bridge,
  reads: { quoteFee?: (sp: SendParam) => Promise<MessagingFee>; quoteReceive?: (sp: SendParam) => Promise<{ amountReceivedLD: bigint }> },
): BridgeAdapter {
  return { route, reads: reads as unknown as BridgeAdapter['reads'], writes: {} as BridgeAdapter['writes'] }
}

describe('quoteBridge', () => {
  it('renders the real fee, the dust-adjusted delivered amount and the slippage floor', async () => {
    const a = fakeAdapter(bridge, {
      quoteFee: async () => ({ nativeFee: PROBE_FEE, lzTokenFee: 0n }),
      quoteReceive: async () => ({ amountReceivedLD: ONE_FXRP }),
    })
    const result = await quoteBridge({ adapter: a, amountIn: ONE_FXRP, slippageBips: 50, to: TO, now: 1_000 })
    expect(result.kind).toBe('quote')
    if (result.kind !== 'quote') return
    const q = result.quote
    // fee is the OFT's own quoteSend, in the source native currency, full precision
    expect(q.nativeFee?.value).toBe(PROBE_FEE)
    expect(q.nativeFee?.asset).toBe('C2FLR')
    expect(q.nativeFee?.decimals).toBe(18)
    // the receive leg is amountReceivedLD (dust-adjusted), NOT amountIn
    expect(q.amountReceivedLD?.value).toBe(ONE_FXRP)
    expect(q.amountReceivedLD?.asset).toBe('FTestXRP')
    // minReceived = amountReceivedLD * (10000 - 50) / 10000, floor
    expect(q.minReceived?.value).toBe((ONE_FXRP * 9_950n) / 10_000n)
    expect(q.readAt).toBe(1_000)
  })

  it('an unreadable receive quote renders amountReceivedLD as null (—), never 0, and still quotes the fee', async () => {
    const a = fakeAdapter(bridge, {
      quoteFee: async () => ({ nativeFee: PROBE_FEE, lzTokenFee: 0n }),
      quoteReceive: async () => {
        throw new Error('RPC lag')
      },
    })
    const result = await quoteBridge({ adapter: a, amountIn: ONE_FXRP, slippageBips: 50, to: TO, now: 1 })
    expect(result.kind).toBe('quote')
    if (result.kind !== 'quote') return
    expect(result.quote.amountReceivedLD).toBeNull()
    // minReceived is the floor over the INPUT, so it holds even when the receive read fails
    expect(result.quote.minReceived.value).toBe((ONE_FXRP * 9_950n) / 10_000n)
    // the fee is still known, so the operation can still be reasoned about
    expect(result.quote.nativeFee?.value).toBe(PROBE_FEE)
  })

  it('an unreadable fee is unavailable — no honest plan can be signed without the fee', async () => {
    const a = fakeAdapter(bridge, {
      quoteFee: async () => {
        throw new Error('down')
      },
      quoteReceive: async () => ({ amountReceivedLD: ONE_FXRP }),
    })
    const result = await quoteBridge({ adapter: a, amountIn: ONE_FXRP, slippageBips: 50, to: TO, now: 1 })
    expect(result.kind).toBe('unavailable')
  })

  it('the redeem route quotes its fee in ETH (Sepolia native), not C2FLR', async () => {
    const a = fakeAdapter(redeem, {
      quoteFee: async () => ({ nativeFee: 3_000_000_000_000_000n, lzTokenFee: 0n }),
      quoteReceive: async () => ({ amountReceivedLD: ONE_FXRP }),
    })
    const result = await quoteBridge({ adapter: a, amountIn: ONE_FXRP, slippageBips: 50, to: redeem.composer!, now: 1 })
    expect(result.kind).toBe('quote')
    if (result.kind !== 'quote') return
    expect(result.quote.nativeFee?.asset).toBe('ETH')
  })
})
