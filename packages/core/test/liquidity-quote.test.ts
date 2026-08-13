import { describe, expect, it } from 'vitest'
import { dexFor } from '@flarekit-dev/contracts'
import { formatExact } from '../src/amounts.js'
import { type SwapReader } from '../src/swap-quote.js'
import { quoteAddLiquidity, quoteRemoveLiquidity, readPosition, readLpAllowance } from '../src/liquidity-quote.js'

const COSTON2 = 114
const dex = dexFor(COSTON2)
const POOL = '0xDD598473f738df117Ee331bc07172481db60acBE'
// Observed on Coston2 (Task 2 probe). token0 is FXRP here.
const R_FXRP = 22_964524n
const R_USDT0 = 28_582833n
const TS = 25_544224n // LP totalSupply (probed)

function reader(handlers: Record<string, (args: readonly unknown[]) => unknown>): SwapReader {
  return {
    async readContract({ functionName, args = [] }) {
      const h = handlers[functionName]
      if (!h) throw new Error(`unexpected call ${functionName}`)
      return h(args)
    },
  }
}

const pool = {
  getPair: () => POOL,
  token0: () => dex.tokens.FXRP!.address,
  getReserves: () => [R_FXRP, R_USDT0, 0],
  totalSupply: () => TS,
  decimals: () => 18,
  symbol: () => 'BLAZE-LP',
}

describe('quoteAddLiquidity (M6-R3)', () => {
  const base = { reader: reader(pool), chainId: COSTON2, tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, now: 1_000 }

  it('pairs tokenB at the live reserve ratio and floors both by slippage', async () => {
    const r = await quoteAddLiquidity(base)
    expect(r.kind).toBe('quote')
    if (r.kind !== 'quote') return
    // amountB = 1_000000 * R_USDT0 / R_FXRP
    expect(r.quote.amountB.value).toBe((1_000000n * R_USDT0) / R_FXRP)
    // minA/minB are the 0.50% slippage floors that become amountAMin/amountBMin
    expect(r.quote.minA.value).toBe((1_000000n * 9950n) / 10000n)
    expect(r.quote.minB.value).toBe((r.quote.amountB.value * 9950n) / 10000n)
    // expected LP = min(amountA*ts/rA, amountB*ts/rB); pool share in bips > 0
    const lpFromA = (1_000000n * TS) / R_FXRP
    const lpFromB = (r.quote.amountB.value * TS) / R_USDT0
    expect(r.quote.expectedLp).toBe(lpFromA < lpFromB ? lpFromA : lpFromB)
    expect(r.quote.poolShareBips).toBeGreaterThan(0)
    expect(r.quote.lpDecimals).toBe(18)
    expect(r.quote.lpSymbol).toBe('BLAZE-LP')
  })

  it('reports no_pool — never a zero ratio — when the pair does not exist', async () => {
    const r = await quoteAddLiquidity({ ...base, reader: reader({ getPair: () => '0x0000000000000000000000000000000000000000' }) })
    expect(r.kind).toBe('no_pool')
    if (r.kind === 'no_pool') expect(r.message).toMatch(/no .*pool/i)
  })

  it('refuses the add on a network whose addLiquidity signature is unverified (never a plan that reverts)', async () => {
    // Flare mainnet (chainId 14) has no addLiquidityVerified flag.
    const r = await quoteAddLiquidity({ reader: reader(pool), chainId: 14, tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, now: 1 })
    expect(r.kind).toBe('unavailable')
    if (r.kind === 'unavailable') expect(r.reason).toMatch(/verified only on coston2/i)
  })
})

describe('quoteRemoveLiquidity (M6-R3)', () => {
  it('returns each asset pro-rata to the LP burned, floored by slippage', async () => {
    const r = await quoteRemoveLiquidity({ reader: reader(pool), chainId: COSTON2, tokenAKey: 'FXRP', tokenBKey: 'USDT0', liquidity: TS / 10n, slippageBips: 100, now: 1 })
    expect(r.kind).toBe('quote')
    if (r.kind !== 'quote') return
    expect(r.quote.amountA.value).toBe(((TS / 10n) * R_FXRP) / TS)
    expect(r.quote.amountB.value).toBe(((TS / 10n) * R_USDT0) / TS)
    expect(r.quote.minA.value).toBe((r.quote.amountA.value * 9900n) / 10000n)
  })
})

describe('readPosition (M6-R7)', () => {
  it('reads the on-chain LP balance and its current composition', async () => {
    const owner = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
    const r = await readPosition({ reader: reader({ ...pool, balanceOf: () => TS / 4n }), chainId: COSTON2, tokenAKey: 'FXRP', tokenBKey: 'USDT0', owner })
    expect(r.kind).toBe('position')
    if (r.kind !== 'position') return
    expect(r.position.lpBalance).toBe(TS / 4n)
    expect(r.position.amountA.value).toBe(((TS / 4n) * R_FXRP) / TS)
    expect(formatExact(r.position.amountA)).toMatch(new RegExp(`${dex.tokens.FXRP!.symbol}$`))
  })

  it('reports no_position when the owner holds no LP', async () => {
    const r = await readPosition({ reader: reader({ ...pool, balanceOf: () => 0n }), chainId: COSTON2, tokenAKey: 'FXRP', tokenBKey: 'USDT0', owner: '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' })
    expect(r.kind).toBe('no_position')
  })
})

describe('readLpAllowance (M6-R4)', () => {
  it('reads what the LP token has granted the router', async () => {
    const value = await readLpAllowance(reader({ ...pool, allowance: () => 7n }), COSTON2, 'FXRP', 'USDT0', '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9')
    expect(value).toBe(7n)
  })
})
