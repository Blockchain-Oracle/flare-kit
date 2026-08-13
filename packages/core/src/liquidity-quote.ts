import {
  ERC20_ABI,
  UNIV2_FACTORY_ABI,
  UNIV2_PAIR_ABI,
  type Address,
  type DexToken,
  dexFor,
} from '@flarekit-dev/contracts'
import { type Amount, amount } from './amounts.js'
import type { SwapReader } from './swap-quote.js'

/**
 * The honest liquidity quote (M6-R3). Adding is ratio-locked: the paired amount
 * is read from the live reserves so a supply never leaves a silent excess, and
 * the expected LP is the pool's own mint formula, never a guess. Removing returns
 * each asset pro-rata to the LP burned. Fees are embedded in the reserves, so a
 * position's value change IS its share of a grown pool — there is no claimable
 * fee to invent. A pair with no pool is a first-class `no_pool`, never a zero.
 */

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export interface AddLiquidityQuote {
  readonly tokenA: DexToken
  readonly tokenB: DexToken
  readonly amountA: Amount
  /** The matching amount of tokenB at the live reserve ratio. */
  readonly amountB: Amount
  readonly minA: Amount
  readonly minB: Amount
  /** LP tokens the pool would mint for this supply — a raw amount; format with `lpDecimals`/`lpSymbol`. */
  readonly expectedLp: bigint
  /** The LP token's decimals, read on-chain from the pair (the LP token IS the pair). */
  readonly lpDecimals: number
  /** The LP token's symbol, read on-chain from the pair. */
  readonly lpSymbol: string
  /** The resulting share of the pool, in basis points of the post-mint supply. */
  readonly poolShareBips: number
  readonly slippageBips: number
  readonly pair: Address
  readonly observedAt: number
}

export interface RemoveLiquidityQuote {
  readonly tokenA: DexToken
  readonly tokenB: DexToken
  readonly liquidity: bigint
  readonly amountA: Amount
  readonly amountB: Amount
  readonly minA: Amount
  readonly minB: Amount
  readonly slippageBips: number
  readonly pair: Address
  readonly observedAt: number
}

export interface Position {
  readonly tokenA: DexToken
  readonly tokenB: DexToken
  readonly lpBalance: bigint
  readonly amountA: Amount
  readonly amountB: Amount
  readonly poolShareBips: number
  readonly pair: Address
}

export type AddLiquidityQuoteResult =
  | { readonly kind: 'quote'; readonly quote: AddLiquidityQuote }
  | { readonly kind: 'no_pool'; readonly message: string }
  | { readonly kind: 'unavailable'; readonly reason: string }

export type RemoveLiquidityQuoteResult =
  | { readonly kind: 'quote'; readonly quote: RemoveLiquidityQuote }
  | { readonly kind: 'no_pool'; readonly message: string }
  | { readonly kind: 'unavailable'; readonly reason: string }

export type PositionResult =
  | { readonly kind: 'position'; readonly position: Position }
  | { readonly kind: 'no_position'; readonly message: string }
  | { readonly kind: 'unavailable'; readonly reason: string }

interface PoolReading {
  readonly pair: Address
  /** Reserves oriented so `reserveA` is tokenA's. */
  readonly reserveA: bigint
  readonly reserveB: bigint
  readonly totalSupply: bigint
  /** The LP token's decimals — the pair itself is the LP token. */
  readonly lpDecimals: number
  readonly lpSymbol: string
}

interface PoolInput {
  readonly reader: SwapReader
  readonly chainId: number
  readonly tokenAKey: string
  readonly tokenBKey: string
}

const bi = (v: unknown): bigint => (typeof v === 'bigint' ? v : BigInt(v as never))

/** Reads the pool once and orients its reserves to (tokenA, tokenB). `null` = no pool. */
async function readPool(input: PoolInput): Promise<PoolReading | 'no_pool' | { unavailable: string }> {
  const dex = dexFor(input.chainId)
  const a = dex.tokens[input.tokenAKey]
  const b = dex.tokens[input.tokenBKey]
  if (!a || !b) return { unavailable: `No ${!a ? input.tokenAKey : input.tokenBKey} on this network.` }
  let pair: unknown
  try {
    pair = await input.reader.readContract({ address: dex.factory, abi: UNIV2_FACTORY_ABI, functionName: 'getPair', args: [a.address, b.address] })
  } catch (error) {
    return { unavailable: reasonOf(error, 'Could not reach the factory') }
  }
  if (typeof pair !== 'string' || pair === ZERO_ADDRESS) return 'no_pool'
  try {
    const [reserves, token0, totalSupply, decimals, symbol] = await Promise.all([
      input.reader.readContract({ address: pair as Address, abi: UNIV2_PAIR_ABI, functionName: 'getReserves' }),
      input.reader.readContract({ address: pair as Address, abi: UNIV2_PAIR_ABI, functionName: 'token0' }),
      input.reader.readContract({ address: pair as Address, abi: ERC20_ABI, functionName: 'totalSupply' }),
      input.reader.readContract({ address: pair as Address, abi: ERC20_ABI, functionName: 'decimals' }),
      input.reader.readContract({ address: pair as Address, abi: ERC20_ABI, functionName: 'symbol' }),
    ])
    const [r0, r1] = reserves as [unknown, unknown, unknown]
    const aIsToken0 = String(token0).toLowerCase() === a.address.toLowerCase()
    return {
      pair: pair as Address,
      reserveA: aIsToken0 ? bi(r0) : bi(r1),
      reserveB: aIsToken0 ? bi(r1) : bi(r0),
      totalSupply: bi(totalSupply),
      lpDecimals: Number(decimals),
      lpSymbol: String(symbol),
    }
  } catch (error) {
    return { unavailable: reasonOf(error, 'Could not read the pool') }
  }
}

const floor = (v: bigint, slippageBips: number): bigint => (v * BigInt(10_000 - slippageBips)) / 10_000n

export async function quoteAddLiquidity(input: PoolInput & { amountADesired: bigint; slippageBips: number; now: number }): Promise<AddLiquidityQuoteResult> {
  const dex = dexFor(input.chainId)
  const a = dex.tokens[input.tokenAKey]!
  const b = dex.tokens[input.tokenBKey]!
  if (!dex.addLiquidityVerified) {
    return { kind: 'unavailable', reason: `Adding liquidity is verified only on Coston2 in this build — ${a.symbol}/${b.symbol} on this network uses an addLiquidity signature that has not been verified on chain.` }
  }
  if (input.amountADesired <= 0n) return { kind: 'unavailable', reason: 'Enter an amount to supply.' }
  const pool = await readPool(input)
  if (pool === 'no_pool') return { kind: 'no_pool', message: `No ${a.symbol} / ${b.symbol} pool exists on this network yet.` }
  if ('unavailable' in pool) return { kind: 'unavailable', reason: pool.unavailable }
  if (pool.reserveA <= 0n || pool.totalSupply <= 0n) return { kind: 'no_pool', message: `The ${a.symbol} / ${b.symbol} pool holds no liquidity to price against.` }

  const amountB = (input.amountADesired * pool.reserveB) / pool.reserveA
  const lpFromA = (input.amountADesired * pool.totalSupply) / pool.reserveA
  const lpFromB = (amountB * pool.totalSupply) / pool.reserveB
  const expectedLp = lpFromA < lpFromB ? lpFromA : lpFromB
  const denom = pool.totalSupply + expectedLp
  const poolShareBips = denom > 0n ? Number((expectedLp * 10_000n) / denom) : 0
  return {
    kind: 'quote',
    quote: {
      tokenA: a,
      tokenB: b,
      amountA: amount(input.amountADesired, a.decimals, a.symbol),
      amountB: amount(amountB, b.decimals, b.symbol),
      minA: amount(floor(input.amountADesired, input.slippageBips), a.decimals, a.symbol),
      minB: amount(floor(amountB, input.slippageBips), b.decimals, b.symbol),
      expectedLp,
      lpDecimals: pool.lpDecimals,
      lpSymbol: pool.lpSymbol,
      poolShareBips,
      slippageBips: input.slippageBips,
      pair: pool.pair,
      observedAt: input.now,
    },
  }
}

export async function quoteRemoveLiquidity(input: PoolInput & { liquidity: bigint; slippageBips: number; now: number }): Promise<RemoveLiquidityQuoteResult> {
  const dex = dexFor(input.chainId)
  const a = dex.tokens[input.tokenAKey]!
  const b = dex.tokens[input.tokenBKey]!
  if (input.liquidity <= 0n) return { kind: 'unavailable', reason: 'Choose how much to withdraw.' }
  const pool = await readPool(input)
  if (pool === 'no_pool') return { kind: 'no_pool', message: `No ${a.symbol} / ${b.symbol} pool exists on this network yet.` }
  if ('unavailable' in pool) return { kind: 'unavailable', reason: pool.unavailable }
  if (pool.totalSupply <= 0n) return { kind: 'no_pool', message: `The ${a.symbol} / ${b.symbol} pool holds no liquidity.` }

  const outA = (input.liquidity * pool.reserveA) / pool.totalSupply
  const outB = (input.liquidity * pool.reserveB) / pool.totalSupply
  return {
    kind: 'quote',
    quote: {
      tokenA: a,
      tokenB: b,
      liquidity: input.liquidity,
      amountA: amount(outA, a.decimals, a.symbol),
      amountB: amount(outB, b.decimals, b.symbol),
      minA: amount(floor(outA, input.slippageBips), a.decimals, a.symbol),
      minB: amount(floor(outB, input.slippageBips), b.decimals, b.symbol),
      slippageBips: input.slippageBips,
      pair: pool.pair,
      observedAt: input.now,
    },
  }
}

export async function readPosition(input: PoolInput & { owner: Address }): Promise<PositionResult> {
  const dex = dexFor(input.chainId)
  const a = dex.tokens[input.tokenAKey]!
  const b = dex.tokens[input.tokenBKey]!
  const pool = await readPool(input)
  if (pool === 'no_pool') return { kind: 'no_position', message: `No ${a.symbol} / ${b.symbol} pool exists on this network yet.` }
  if ('unavailable' in pool) return { kind: 'unavailable', reason: pool.unavailable }
  let lp: unknown
  try {
    lp = await input.reader.readContract({ address: pool.pair, abi: ERC20_ABI, functionName: 'balanceOf', args: [input.owner] })
  } catch (error) {
    return { kind: 'unavailable', reason: reasonOf(error, 'Could not read the LP balance') }
  }
  const lpBalance = bi(lp)
  if (lpBalance <= 0n) return { kind: 'no_position', message: `You hold no ${a.symbol} / ${b.symbol} liquidity.` }
  const denom = pool.totalSupply > 0n ? pool.totalSupply : 1n
  return {
    kind: 'position',
    position: {
      tokenA: a,
      tokenB: b,
      lpBalance,
      amountA: amount((lpBalance * pool.reserveA) / denom, a.decimals, a.symbol),
      amountB: amount((lpBalance * pool.reserveB) / denom, b.decimals, b.symbol),
      poolShareBips: Number((lpBalance * 10_000n) / denom),
      pair: pool.pair,
    },
  }
}

/** The LP token's allowance to the router — the remove plan needs an approve when it is short. */
export async function readLpAllowance(reader: SwapReader, chainId: number, tokenAKey: string, tokenBKey: string, owner: Address): Promise<bigint> {
  const dex = dexFor(chainId)
  const a = dex.tokens[tokenAKey]
  const b = dex.tokens[tokenBKey]
  if (!a || !b) throw new Error('Unknown token on this network.')
  const pair = await reader.readContract({ address: dex.factory, abi: UNIV2_FACTORY_ABI, functionName: 'getPair', args: [a.address, b.address] })
  if (typeof pair !== 'string' || pair === ZERO_ADDRESS) throw new Error('No pool to withdraw from.')
  const value = await reader.readContract({ address: pair as Address, abi: ERC20_ABI, functionName: 'allowance', args: [owner, dex.router] })
  return bi(value)
}

function reasonOf(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > 0 ? `${fallback}: ${message.slice(0, 120)}` : fallback
}
