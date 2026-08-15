import { describe, expect, it } from 'vitest'
import type { PublicClient } from 'viem'
import { routeByKey } from '@flarekit-dev/contracts'
import { buildSendParam, makeBridgeAdapter } from '../src/bridge-adapter.js'

const OWNER = '0x00000000000000000000000000000000000000A1'
const RECIPIENT = '0x00000000000000000000000000000000000000B2'
const GUID = `0x${'ab'.repeat(32)}` as `0x${string}`
const bridge = routeByKey('coston2', 'coston2-sepolia')!
const redeem = routeByKey('coston2', 'sepolia-coston2-redeem')!

type ReadArgs = { functionName: string; args?: readonly unknown[] }
type EventArgs = { eventName: string; args?: Record<string, unknown> }

function fakeClient(opts: {
  reads?: Record<string, (args: readonly unknown[]) => unknown>
  events?: Record<string, unknown[]>
}): PublicClient {
  return {
    async readContract({ functionName, args = [] }: ReadArgs) {
      const h = opts.reads?.[functionName]
      if (!h) throw new Error(`unexpected read ${functionName}`)
      return h(args)
    },
    // The chunked delivery/redemption scan reads latest then loops [since, latest] in
    // ≤25-block chunks; a single-chunk fake covers it.
    async getBlockNumber() {
      return 1n
    },
    async getContractEvents({ eventName }: EventArgs) {
      return opts.events?.[eventName] ?? []
    },
  } as unknown as PublicClient
}

describe('buildSendParam', () => {
  it('pads the recipient to bytes32, sets minAmountLD, and attaches lzReceive-only options for a bridge', () => {
    const sp = buildSendParam(bridge, { to: RECIPIENT, amountLD: 1_000_000n, minAmountLD: 995_000n })
    expect(sp.dstEid).toBe(40161)
    expect(sp.to).toHaveLength(66)
    expect(sp.to.toLowerCase().endsWith('b2')).toBe(true)
    expect(sp.amountLD).toBe(1_000_000n)
    expect(sp.minAmountLD).toBe(995_000n)
    expect(sp.composeMsg).toBe('0x')
    // bridge options carry a single lzReceive option (no lzCompose 0013 segment)
    expect(sp.extraOptions).toBe('0x00030100110100000000000000000000000000030d40')
  })

  it('a redeem SendParam targets the composer, carries the compose message and lzCompose options', () => {
    const sp = buildSendParam(redeem, {
      to: redeem.composer!,
      amountLD: 1_000_000n,
      minAmountLD: 1_000_000n,
      composeMsg: '0xdeadbeef',
    })
    expect(sp.dstEid).toBe(40294) // Coston2
    expect(sp.composeMsg).toBe('0xdeadbeef')
    expect(sp.extraOptions).toContain('0013') // the lzCompose option header
  })
})

describe('bridge adapter reads (source client)', () => {
  const src = fakeClient({
    reads: {
      token: () => bridge.asset.address, // adapter locks a separate token
      peers: () => `0x${'00'.repeat(11)}81672c5d42f3573ad95a0bdfbe824faac547d4e6`,
      sharedDecimals: () => 6,
      balanceOf: () => 23_000_000n,
      allowance: () => 0n,
      quoteSend: () => ({ nativeFee: 22_950_000_000_000_000_000n, lzTokenFee: 0n }),
      quoteOFT: () => [
        { minAmountLD: 0n, maxAmountLD: 1n << 100n },
        [],
        { amountSentLD: 1_000_000n, amountReceivedLD: 1_000_000n },
      ],
    },
  })
  const dst = fakeClient({})
  const a = makeBridgeAdapter(src, dst, bridge)

  it('reads the real fee from quoteSend and the delivered amount from quoteOFT', async () => {
    const sp = buildSendParam(bridge, { to: RECIPIENT, amountLD: 1_000_000n, minAmountLD: 995_000n })
    expect((await a.reads.quoteFee(sp)).nativeFee).toBe(22_950_000_000_000_000_000n)
    const recv = await a.reads.quoteReceive(sp)
    expect(recv.amountReceivedLD).toBe(1_000_000n) // no dust on this route
  })

  it('exposes the wired peer and the balance/allowance gates', async () => {
    expect(await a.reads.peer(40161)).not.toMatch(/^0x0{64}$/)
    expect(await a.reads.assetBalance(OWNER)).toBe(23_000_000n)
    expect(await a.reads.assetAllowance(OWNER, bridge.from.oft)).toBe(0n)
  })
})

describe('bridge adapter delivery (destination client)', () => {
  it('reports in-flight when no OFTReceived log is present — never failure from absence', async () => {
    const a = makeBridgeAdapter(fakeClient({}), fakeClient({ events: { OFTReceived: [] } }), bridge)
    expect(await a.reads.delivery(GUID, 0n)).toEqual({ kind: 'in-flight' })
  })

  it('reports delivered with the exact amount when the OFTReceived log is present', async () => {
    const dst = fakeClient({ events: { OFTReceived: [{ args: { guid: GUID, amountReceivedLD: 1_000_000n } }] } })
    const a = makeBridgeAdapter(fakeClient({}), dst, bridge)
    expect(await a.reads.delivery(GUID, 0n)).toEqual({ kind: 'delivered', amountReceivedLD: 1_000_000n })
  })
})

describe('redeem adapter second leg (composer on destination)', () => {
  it('pending when no composer event, FILED on FAssetRedeemed (not "redeemed"), failed only on FAssetRedeemFailed', async () => {
    const pending = makeBridgeAdapter(fakeClient({}), fakeClient({ events: {} }), redeem)
    expect(await pending.reads.redemption(GUID, 0n)).toEqual({ kind: 'pending' })

    // FAssetRedeemed = redemption FILED, NOT "XRP received" — settlement is a separate signal
    const filed = makeBridgeAdapter(
      fakeClient({}),
      fakeClient({ events: { FAssetRedeemed: [{ args: { redeemedAmountUBA: 990_000n, redeemerUnderlyingAddress: 'rXRP' } }] } }),
      redeem,
    )
    expect(await filed.reads.redemption(GUID, 0n)).toEqual({
      kind: 'filed',
      redeemedAmountUBA: 990_000n,
      underlyingAddress: 'rXRP',
    })

    const failed = makeBridgeAdapter(
      fakeClient({}),
      fakeClient({ events: { FAssetRedeemFailed: [{ args: {} }] } }),
      redeem,
    )
    expect(await failed.reads.redemption(GUID, 0n)).toEqual({ kind: 'failed' })
  })
})

describe('bridge adapter writes', () => {
  const a = makeBridgeAdapter(fakeClient({}), fakeClient({}), bridge)

  it('approveAsset builds an erc20 approve of the asset to the spender', () => {
    expect(a.writes.approveAsset(bridge.from.oft, 1_000_000n)).toMatchObject({
      abiKind: 'erc20',
      address: bridge.asset.address,
      functionName: 'approve',
      args: [bridge.from.oft, 1_000_000n],
    })
  })

  it('send carries value = nativeFee and targets the source OFT', () => {
    const sp = buildSendParam(bridge, { to: RECIPIENT, amountLD: 1_000_000n, minAmountLD: 995_000n })
    const fee = { nativeFee: 22_950_000_000_000_000_000n, lzTokenFee: 0n }
    const c = a.writes.send(sp, fee, OWNER)
    expect(c).toMatchObject({ abiKind: 'oft', address: bridge.from.oft, functionName: 'send', value: fee.nativeFee })
    expect(c.args).toEqual([sp, fee, OWNER])
  })
})
