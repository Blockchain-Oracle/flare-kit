import {
  ERC20_ABI,
  UNIV2_FACTORY_ABI,
  UNIV2_ROUTER_ABI,
  type Address,
  type DexToken,
  dexFor,
} from '@flarekit-dev/contracts'
import { type Amount, amount } from './amounts.js'

/**
 * The honest quote (M5-R4). The amount out is the router's own `getAmountsOut`,
 * never a reserves-and-fee formula computed here: the two live venues price the
 * same pair differently — Coston2's BlazeSwap carries FTSO-reward mechanics and
 * quoted 1.224 USD₮0/FXRP where mainnet SparkDEX's textbook 0.3% quoted 0.984 —
 * so only the router that guards the swap can say what a swap will actually
 * return. A pair with no pool is a first-class `no_route`, not a zero.
 */

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/** viem's `PublicClient`, structurally — the one call a quote needs. */
export interface SwapReader {
  readContract(args: {
    address: Address
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
  }): Promise<unknown>
}

export interface SwapQuote {
  readonly from: DexToken
  readonly to: DexToken
  readonly amountIn: Amount
  readonly amountOut: Amount
  /** `amountOut` after slippage — the floor the swap enforces on chain. */
  readonly minReceived: Amount
  readonly slippageBips: number
  /** The token path the router priced, for the swap that follows. */
  readonly path: readonly Address[]
  readonly observedAt: number
}

export type SwapQuoteResult =
  | { readonly kind: 'quote'; readonly quote: SwapQuote }
  /** The pool does not exist, or holds too little to fill this trade. Never a price. */
  | { readonly kind: 'no_route'; readonly message: string }
  /** The read itself failed; the last quote, if any, is not refreshed by this. */
  | { readonly kind: 'unavailable'; readonly reason: string }

export interface QuoteSwapInput {
  readonly reader: SwapReader
  readonly chainId: number
  /** Token keys in the network's `dex` registry, e.g. `FXRP` → `USDT0`. */
  readonly fromKey: string
  readonly toKey: string
  /** Raw units of the `from` token. */
  readonly amountIn: bigint
  readonly slippageBips: number
  readonly now: number
}

const isRevert = (error: unknown): boolean =>
  /revert|insufficient|INSUFFICIENT/i.test(error instanceof Error ? error.message : String(error))

export async function quoteSwap(input: QuoteSwapInput): Promise<SwapQuoteResult> {
  const dex = dexFor(input.chainId)
  const from = dex.tokens[input.fromKey]
  const to = dex.tokens[input.toKey]
  if (!from || !to) {
    return { kind: 'unavailable', reason: `No ${!from ? input.fromKey : input.toKey} on this network.` }
  }
  if (from.address === to.address) {
    return { kind: 'no_route', message: 'A token cannot be swapped for itself.' }
  }
  if (input.amountIn <= 0n) {
    return { kind: 'unavailable', reason: 'Enter an amount to swap.' }
  }

  const path = [from.address, to.address] as const

  // A pool must exist before a price can. A missing pair is a real, common
  // state on a young network — the router would revert, and that is not a price.
  let pair: unknown
  try {
    pair = await input.reader.readContract({
      address: dex.factory,
      abi: UNIV2_FACTORY_ABI,
      functionName: 'getPair',
      args: [from.address, to.address],
    })
  } catch (error) {
    return { kind: 'unavailable', reason: reasonOf(error, 'Could not reach the factory') }
  }
  if (typeof pair !== 'string' || pair === ZERO_ADDRESS) {
    return {
      kind: 'no_route',
      message: `No ${from.symbol} / ${to.symbol} pool exists on this network yet.`,
    }
  }

  let amounts: unknown
  try {
    amounts = await input.reader.readContract({
      address: dex.router,
      abi: UNIV2_ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [input.amountIn, path],
    })
  } catch (error) {
    // A revert here means the pool cannot fill the trade (too little liquidity),
    // which is a route problem, not an outage. A non-revert failure is an outage.
    return isRevert(error)
      ? { kind: 'no_route', message: `The ${from.symbol} / ${to.symbol} pool cannot fill this trade — its liquidity is too small.` }
      : { kind: 'unavailable', reason: reasonOf(error, 'Could not read the quote') }
  }

  const outRaw = lastAmount(amounts)
  if (outRaw === undefined || outRaw <= 0n) {
    return { kind: 'no_route', message: `The ${from.symbol} / ${to.symbol} pool returned no output for this trade.` }
  }

  const minRaw = (outRaw * BigInt(10_000 - input.slippageBips)) / 10_000n
  return {
    kind: 'quote',
    quote: {
      from,
      to,
      amountIn: amount(input.amountIn, from.decimals, from.symbol),
      amountOut: amount(outRaw, to.decimals, to.symbol),
      minReceived: amount(minRaw, to.decimals, to.symbol),
      slippageBips: input.slippageBips,
      path: [...path],
      observedAt: input.now,
    },
  }
}

/**
 * Price impact in basis points (M5-R4), measured honestly: the execution rate
 * against a **reference** quote of a small amount on the same path. Both rates
 * come from the router's own `getAmountsOut`, never a reserves-and-fee formula —
 * mixing a reserves spot price with a router execution price would manufacture a
 * number the pool never quoted, the very refusal `quoteSwap` is built around.
 *
 * `null` when the reference cannot anchor a spot rate (no output, zero input, or
 * a different pair). Clamped at zero: a trade that prints better than the small
 * probe is not "negative impact", it is rounding.
 */
export function priceImpactBips(execution: SwapQuote, reference: SwapQuote): number | null {
  if (
    execution.from.address !== reference.from.address ||
    execution.to.address !== reference.to.address
  ) {
    return null
  }
  const aIn = execution.amountIn.value
  const aOut = execution.amountOut.value
  const rIn = reference.amountIn.value
  const rOut = reference.amountOut.value
  if (aIn <= 0n || rIn <= 0n || rOut <= 0n) return null
  // The reference must be a smaller probe than the execution, or it anchors no
  // spot rate — most often the same quote passed for both. Refuse, rather than
  // report a fabricated 0.00% impact.
  if (rIn >= aIn) return null
  // impact = 1 − (aOut/aIn)/(rOut/rIn) = (aIn·rOut − aOut·rIn) / (aIn·rOut)
  const denominator = aIn * rOut
  const numerator = denominator - aOut * rIn
  if (numerator <= 0n) return 0
  // 10000 bips × 2 decimals of bip precision, kept in bigint so a 1e12 product
  // never crosses 2^53 and loses digits.
  const scaled = (10_000n * 100n * numerator) / denominator
  return Number(scaled) / 100
}

/**
 * The ERC-20 allowance the `from` token has granted the router. The plan needs
 * an approve step exactly when this is short of the amount, and never hides one.
 */
export async function readAllowance(
  reader: SwapReader,
  chainId: number,
  tokenKey: string,
  owner: Address,
): Promise<bigint> {
  const dex = dexFor(chainId)
  const token = dex.tokens[tokenKey]
  if (!token) throw new Error(`No ${tokenKey} on this network.`)
  const value = await reader.readContract({
    address: token.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner, dex.router],
  })
  return typeof value === 'bigint' ? value : BigInt(value as never)
}

function lastAmount(amounts: unknown): bigint | undefined {
  if (!Array.isArray(amounts) || amounts.length === 0) return undefined
  const last = amounts[amounts.length - 1]
  return typeof last === 'bigint' ? last : undefined
}

function reasonOf(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > 0 ? `${fallback}: ${message.slice(0, 120)}` : fallback
}
