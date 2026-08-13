import { describe, expect, it } from 'vitest'
import type { PublicClient } from 'viem'
import { vaultByKey } from '@flarekit-dev/contracts'
import { makeVaultAdapter } from '../src/vault-adapter.js'
import { quoteDeposit, quoteWithdraw, readVaultPosition } from '../src/vault-quote.js'

const OWNER = '0x00000000000000000000000000000000000000A1'
const firelightCfg = vaultByKey('coston2', 'firelight-fxrp')!
const upshiftCfg = vaultByKey('coston2', 'upshift-fxrp')!

function fakeClient(handlers: Record<string, (args: readonly unknown[]) => unknown>): PublicClient {
  return {
    async readContract({ functionName, args = [] }: { functionName: string; args?: readonly unknown[] }) {
      const h = handlers[functionName]
      if (!h) throw new Error(`unexpected read ${functionName}`)
      return h(args)
    },
  } as unknown as PublicClient
}

function throwingClient(): PublicClient {
  return {
    async readContract() {
      throw new Error('RPC down')
    },
  } as unknown as PublicClient
}

describe('quoteDeposit', () => {
  const a = makeVaultAdapter(
    fakeClient({ previewDeposit: ([assets]) => assets, convertToAssets: ([s]) => s }), // 1:1
    firelightCfg,
  )

  it('expected shares from previewDeposit, minimum from slippage, mono-carrying', async () => {
    const r = await quoteDeposit(a, 1_000_000n, 50, 1_000)
    expect(r.kind).toBe('quote')
    if (r.kind !== 'quote') return
    expect(r.quote.expectedShares.value).toBe(1_000_000n)
    expect(r.quote.expectedShares.asset).toBe('stFXRP')
    expect(r.quote.minShares.value).toBe(995_000n) // 1e6 * (10000-50)/10000
    expect(r.quote.assetsIn.asset).toBe('FTestXRP')
  })

  it('rejects a non-positive amount, and reports an RPC failure as unavailable (never 0)', async () => {
    expect((await quoteDeposit(a, 0n, 50, 1_000)).kind).toBe('unavailable')
    const down = makeVaultAdapter(throwingClient(), firelightCfg)
    expect((await quoteDeposit(down, 1_000_000n, 50, 1_000)).kind).toBe('unavailable')
  })
})

describe('quoteWithdraw', () => {
  const upshift = makeVaultAdapter(
    fakeClient({
      previewRedemption: ([, isInstant]) => (isInstant ? [1_000_000n, 950_000n] : [1_000_000n, 990_000n]),
    }),
    upshiftCfg,
  )

  it('renders the vault-computed net-of-fee amount and the fee, per route', async () => {
    const delayed = await quoteWithdraw(upshift, 1_000_000n, 'delayed', 100, 1_000)
    expect(delayed.kind).toBe('quote')
    if (delayed.kind !== 'quote') return
    expect(delayed.quote.expectedAssets.value).toBe(990_000n) // assetsAfterFee
    expect(delayed.quote.feeAssets.value).toBe(10_000n) // gross - net
    expect(delayed.quote.minAssets.value).toBe(980_100n) // 990000 * 9900/10000

    const instant = await quoteWithdraw(upshift, 1_000_000n, 'instant', 100, 1_000)
    if (instant.kind !== 'quote') return
    expect(instant.quote.expectedAssets.value).toBe(950_000n) // higher fee on the instant route
    expect(instant.quote.feeAssets.value).toBe(50_000n)
  })

  it('refuses a route the vault does not offer', async () => {
    const firelight = makeVaultAdapter(fakeClient({}), firelightCfg)
    const r = await quoteWithdraw(firelight, 1_000_000n, 'instant', 100, 1_000)
    expect(r.kind).toBe('unavailable') // Firelight is delayed-only
  })
})

describe('readVaultPosition', () => {
  it('reports shares and asset value at the current rate', async () => {
    const a = makeVaultAdapter(fakeClient({ balanceOf: () => 2_000_000n, convertToAssets: ([s]) => s }), firelightCfg)
    const r = await readVaultPosition(a, OWNER)
    expect(r.kind).toBe('position')
    if (r.kind !== 'position') return
    expect(r.position.shares.value).toBe(2_000_000n)
    expect(r.position.assetsValue?.value).toBe(2_000_000n) // 1:1 rate
  })

  it('a zero balance is a real no_position; a failed read is unavailable, not no_position (M6 F1)', async () => {
    const zero = makeVaultAdapter(fakeClient({ balanceOf: () => 0n }), firelightCfg)
    expect((await readVaultPosition(zero, OWNER)).kind).toBe('no_position')
    const down = makeVaultAdapter(throwingClient(), firelightCfg)
    expect((await readVaultPosition(down, OWNER)).kind).toBe('unavailable')
  })

  it('renders value as null when the rate read fails, never a guessed number', async () => {
    const noRate = makeVaultAdapter(
      fakeClient({
        balanceOf: () => 2_000_000n,
        convertToAssets: () => {
          throw new Error('rate down')
        },
      }),
      firelightCfg,
    )
    const r = await readVaultPosition(noRate, OWNER)
    if (r.kind !== 'position') return
    expect(r.position.assetsValue).toBeNull()
  })
})
