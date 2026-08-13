import { describe, expect, it } from 'vitest'
import { decodeAbiParameters } from 'viem'
import { REDEEM_COMPOSE_MESSAGE, routeByKey } from '@flarekit-dev/contracts'
import type { BridgeAdapter, BridgeCall, MessagingFee, SendParam } from '../src/bridge-adapter.js'
import { ZERO_BYTES32 } from '../src/bridge-adapter.js'
import { buildBridgePlan, buildRedeemPlan, encodeRedeemComposeMessage } from '../src/bridge.js'

const OWNER = '0x00000000000000000000000000000000000000A1' as `0x${string}`
const RECIPIENT = '0x00000000000000000000000000000000000000B2' as `0x${string}`
const bridgeRoute = routeByKey('coston2', 'coston2-sepolia')!
const redeemRoute = routeByKey('coston2', 'sepolia-coston2-redeem')!
const WIRED_PEER = `0x${'00'.repeat(11)}81672c5d42f3573ad95a0bdfbe824faac547d4e6` as `0x${string}`
const PROBE_FEE = 22_950_824_887_834_713_257n
const ONE_FXRP = 1_000_000n

interface Reads {
  peer?: bigint | `0x${string}`
  assetBalance?: bigint
  nativeBalance?: bigint
  allowance?: bigint
  amountReceivedLD?: bigint
  fee?: bigint
}

function fakeAdapter(route: typeof bridgeRoute, r: Reads = {}): BridgeAdapter {
  const reads = {
    peer: async () => r.peer ?? WIRED_PEER,
    assetBalance: async () => r.assetBalance ?? 23_000_000n,
    nativeBalance: async () => r.nativeBalance ?? 100n * 10n ** 18n,
    assetAllowance: async () => r.allowance ?? 0n,
    quoteFee: async (): Promise<MessagingFee> => ({ nativeFee: r.fee ?? PROBE_FEE, lzTokenFee: 0n }),
    quoteReceive: async () => ({ amountReceivedLD: r.amountReceivedLD ?? ONE_FXRP }),
  }
  const writes = {
    approveAsset: (spender: string, amount: bigint): BridgeCall => ({
      abiKind: 'erc20', address: route.asset.address, functionName: 'approve', args: [spender, amount], label: 'Approve',
    }),
    send: (sp: SendParam, fee: MessagingFee): BridgeCall => ({
      abiKind: 'oft', address: route.from.oft, functionName: 'send', args: [sp, fee, OWNER], value: fee.nativeFee, label: 'Bridge',
    }),
  }
  return { route, reads: reads as unknown as BridgeAdapter['reads'], writes: writes as unknown as BridgeAdapter['writes'] }
}

const FUTURE = 10_000

describe('buildBridgePlan — verified-flag gate (M8-R10)', () => {
  it('REFUSES an unverified route with no approval step and no reads that spend', async () => {
    // the redeem route is bridgeVerified:false until its own Phase B live run; any
    // route with the flag off must refuse before reading, approving or paying a fee
    const unverified = { ...bridgeRoute, bridgeVerified: false }
    const result = await buildBridgePlan(fakeAdapter(unverified), { routeKey: unverified.key, amountIn: ONE_FXRP, slippageBips: 50, deadline: FUTURE, recipient: RECIPIENT }, OWNER, 0)
    expect(result.kind).toBe('error')
    if (result.kind !== 'error') return
    expect(result.error.kind).toBe('not-verified')
  })
})

// Verify the rest of the gates against a route flipped verified in-memory (the Task-6
// live script bootstraps the same way before the registry flag is flipped).
const verifiedBridge = { ...bridgeRoute, bridgeVerified: true }
const verifiedRedeem = { ...redeemRoute, bridgeVerified: true }

describe('buildBridgePlan — gates and plan shape', () => {
  const intent = { routeKey: verifiedBridge.key, amountIn: ONE_FXRP, slippageBips: 50, deadline: FUTURE, recipient: RECIPIENT }

  it('expired deadline → expired, before any read', async () => {
    const result = await buildBridgePlan(fakeAdapter(verifiedBridge), intent, OWNER, FUTURE + 1)
    expect(result.kind === 'error' && result.error.kind).toBe('expired')
  })

  it('an unset destination peer → no-peer', async () => {
    const result = await buildBridgePlan(fakeAdapter(verifiedBridge, { peer: ZERO_BYTES32 }), intent, OWNER, 0)
    expect(result.kind === 'error' && result.error.kind).toBe('no-peer')
  })

  it('FXRP balance short → insufficient-balance', async () => {
    const result = await buildBridgePlan(fakeAdapter(verifiedBridge, { assetBalance: 1n }), intent, OWNER, 0)
    expect(result.kind === 'error' && result.error.kind).toBe('insufficient-balance')
  })

  it('native balance below the fee → insufficient-fee', async () => {
    const result = await buildBridgePlan(fakeAdapter(verifiedBridge, { nativeBalance: 1n }), intent, OWNER, 0)
    expect(result.kind === 'error' && result.error.kind).toBe('insufficient-fee')
  })

  it('delivered amount below the slippage floor → dust-below-min', async () => {
    // minAmountLD = 1_000_000 * 9950/10000 = 995_000; a delivery of 994_000 breaches it
    const result = await buildBridgePlan(fakeAdapter(verifiedBridge, { amountReceivedLD: 994_000n }), intent, OWNER, 0)
    expect(result.kind === 'error' && result.error.kind).toBe('dust-below-min')
  })

  it('a short allowance produces exactly one approve step; a sufficient one produces none', async () => {
    const short = await buildBridgePlan(fakeAdapter(verifiedBridge, { allowance: 0n }), intent, OWNER, 0)
    expect(short.kind === 'plan' && short.plan.approve).toBeDefined()

    const ok = await buildBridgePlan(fakeAdapter(verifiedBridge, { allowance: ONE_FXRP }), intent, OWNER, 0)
    expect(ok.kind === 'plan' && ok.plan.approve).toBeUndefined()
    expect(ok.kind === 'plan' && ok.plan.send.value).toBe(PROBE_FEE)
  })

  it('a failed read is `unavailable`, not an unhandled rejection at the seam', async () => {
    const adapter = fakeAdapter(verifiedBridge)
    // a lagged RPC throws on a read — the plan builder must catch it, not reject
    adapter.reads.quoteFee = async () => {
      throw new Error('RPC down')
    }
    const result = await buildBridgePlan(adapter, intent, OWNER, 0)
    expect(result.kind).toBe('unavailable')
  })
})

describe('buildRedeemPlan — native OFT source, compose message', () => {
  const intent = { routeKey: verifiedRedeem.key, amountIn: ONE_FXRP, slippageBips: 50, deadline: FUTURE, xrplDestination: 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio' }

  it('a native-OFT source (Sepolia) needs NO approve — the OFT burns its own balance', async () => {
    const result = await buildRedeemPlan(fakeAdapter(verifiedRedeem, { allowance: 0n }), intent, OWNER, 0)
    expect(result.kind).toBe('plan')
    if (result.kind !== 'plan') return
    expect(result.plan.approve).toBeUndefined()
    expect(result.plan.kind).toBe('redeem')
  })

  it('the compose message round-trips the redeemer and XRPL destination', () => {
    const encoded = encodeRedeemComposeMessage(OWNER, 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio')
    const [decoded] = decodeAbiParameters(REDEEM_COMPOSE_MESSAGE, encoded) as unknown as [
      { redeemer: string; redeemerUnderlyingAddress: string; redeemWithTag: boolean },
    ]
    expect(decoded.redeemer.toLowerCase()).toBe(OWNER.toLowerCase())
    expect(decoded.redeemerUnderlyingAddress).toBe('rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio')
    expect(decoded.redeemWithTag).toBe(false)
  })
})
