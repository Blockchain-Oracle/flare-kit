import { describe, expect, it, vi, afterEach } from 'vitest'
import type { Address, PublicClient } from 'viem'
import { gaslessFor } from '@flare-kit/contracts'
import { makeGaslessAdapter } from '../src/gasless-adapter.js'

const DEPLOYMENT = gaslessFor('coston2')!
const OWNER: Address = '0x00000000000000000000000000000000000000A1'
const RECIPIENT: Address = '0x00000000000000000000000000000000000000B2'

type ReadArgs = { functionName: string; args?: readonly unknown[] }
type EventArgs = { eventName: string }

function fakeClient(opts: {
  reads?: Record<string, (args: readonly unknown[]) => unknown>
  events?: Record<string, unknown[]>
  latest?: bigint
}): PublicClient {
  return {
    async readContract({ functionName, args = [] }: ReadArgs) {
      const h = opts.reads?.[functionName]
      if (!h) throw new Error(`unexpected read ${functionName}`)
      return h(args)
    },
    async getBlockNumber() {
      return opts.latest ?? 1n
    },
    async getContractEvents({ eventName }: EventArgs) {
      return opts.events?.[eventName] ?? []
    },
  } as unknown as PublicClient
}

describe('gasless adapter reads (M9-R2)', () => {
  it('reads nonce, balance, allowance, decimals and the forwarder-resolved FXRP', async () => {
    const a = makeGaslessAdapter(
      fakeClient({
        reads: {
          getNonce: () => 3n,
          balanceOf: () => 5_000_000n,
          allowance: () => 0n,
          decimals: () => 6,
          fxrp: () => DEPLOYMENT.fxrp.address,
        },
      }),
      DEPLOYMENT,
    )
    expect(await a.reads.nonce(OWNER)).toBe(3n)
    expect(await a.reads.balance(OWNER)).toBe(5_000_000n)
    expect(await a.reads.allowance(OWNER)).toBe(0n)
    expect(await a.reads.decimals()).toBe(6)
    expect((await a.reads.fxrpToken()).toLowerCase()).toBe(DEPLOYMENT.fxrp.address.toLowerCase())
  })

  it('paymentSince returns in-flight when no PaymentExecuted matches (never failure from absence)', async () => {
    const a = makeGaslessAdapter(fakeClient({ latest: 200n, events: { PaymentExecuted: [] } }), DEPLOYMENT)
    expect(await a.reads.paymentSince(OWNER, 0n, 100n)).toEqual({ kind: 'in-flight' })
  })

  it('paymentSince returns confirmed with tx hash + amount when the nonce matches', async () => {
    const TX = `0x${'ab'.repeat(32)}`
    const a = makeGaslessAdapter(
      fakeClient({
        latest: 110n,
        events: {
          PaymentExecuted: [{ args: { from: OWNER, to: RECIPIENT, amount: 1_000_000n, nonce: 0n }, transactionHash: TX }],
        },
      }),
      DEPLOYMENT,
    )
    expect(await a.reads.paymentSince(OWNER, 0n, 100n)).toEqual({ kind: 'confirmed', txHash: TX, amount: 1_000_000n })
  })

  it('paymentSince ignores a PaymentExecuted with a different nonce (stays in-flight)', async () => {
    const a = makeGaslessAdapter(
      fakeClient({
        latest: 1n,
        events: { PaymentExecuted: [{ args: { from: OWNER, amount: 9n, nonce: 5n }, transactionHash: `0x${'cd'.repeat(32)}` }] },
      }),
      DEPLOYMENT,
    )
    expect(await a.reads.paymentSince(OWNER, 0n, 1n)).toEqual({ kind: 'in-flight' })
  })
})

describe('gasless adapter writes (M9-R2)', () => {
  it('approveForwarder targets FXRP with the forwarder as spender', () => {
    const a = makeGaslessAdapter(fakeClient({}), DEPLOYMENT)
    const call = a.writes.approveForwarder(1_000_000n)
    expect(call.token.toLowerCase()).toBe(DEPLOYMENT.fxrp.address.toLowerCase())
    expect(call.spender.toLowerCase()).toBe(DEPLOYMENT.forwarder.toLowerCase())
    expect(call.amount).toBe(1_000_000n)
  })
})

describe('gasless adapter relay (M9-R2)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps a relayer 500 to {accepted:false}, never throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    )
    const a = makeGaslessAdapter(fakeClient({}), DEPLOYMENT)
    const r = await a.relay({ from: OWNER, to: RECIPIENT, amount: 1n, deadline: 2n, signature: '0x00' })
    expect(r.accepted).toBe(false)
    expect(r.error).toBeDefined()
  })

  it('maps a relayer 200 with a tx hash to {accepted:true, txHash, blockNumber}', async () => {
    const TX = `0x${'ab'.repeat(32)}`
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ txHash: TX, blockNumber: '42' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const a = makeGaslessAdapter(fakeClient({}), DEPLOYMENT)
    const r = await a.relay({ from: OWNER, to: RECIPIENT, amount: 1n, deadline: 2n, signature: '0x00' })
    expect(r.accepted).toBe(true)
    expect(r.txHash).toBe(TX)
    expect(r.blockNumber).toBe('42')
  })

  it('maps a network throw to {accepted:false} (relayer-unreachable), never throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
    )
    const a = makeGaslessAdapter(fakeClient({}), DEPLOYMENT)
    const r = await a.relay({ from: OWNER, to: RECIPIENT, amount: 1n, deadline: 2n, signature: '0x00' })
    expect(r.accepted).toBe(false)
  })
})
