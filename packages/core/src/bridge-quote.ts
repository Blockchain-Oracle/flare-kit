// packages/core/src/bridge-quote.ts
import type { Address, Hex } from 'viem'
import { type Amount, amount } from './amounts.js'
import { type BridgeAdapter, buildSendParam } from './bridge-adapter.js'
import { floorMin } from './bridge.js'

/**
 * The honest cross-chain quote (M8-R4). Every number comes from the OFT's own
 * reads, never a formula computed here:
 *
 * - `nativeFee` is `quoteSend`'s fee, rendered in the source's native currency with
 *   full precision, and carried into the plan as the `value` the send must pay.
 * - `amountReceivedLD` is `quoteOFT`'s dust-adjusted delivered amount — the "you
 *   receive" leg renders THIS, never the input. An unreadable receive renders `—`
 *   (null), never `0`.
 * - `minReceived` = `amountIn · (10000 − slippageBips) / 10000`, floored — the floor
 *   over what the user SENDS, so it is always computable and is exactly the
 *   `minAmountLD` the send enforces. A delivered amount that would breach it reverts
 *   on chain as the distinct `dust-below-min` state (Task 5), not a failure here.
 *
 * A fee that cannot be read is `unavailable` — no honest plan can be signed without
 * it. A receive that cannot be read still yields a quote (the fee is known), with
 * the delivered/min legs null. `readAt` carries the caller's `now`; nothing reads
 * the wall clock.
 */

export interface BridgeQuote {
  readonly routeKey: string
  readonly amountIn: Amount
  /** Dust-adjusted delivered amount from `quoteOFT`; null renders `—`, never `0`. */
  readonly amountReceivedLD: Amount | null
  /** The slippage floor over the INPUT — the `minAmountLD` the send enforces. Always known. */
  readonly minReceived: Amount
  /** `quoteSend`'s fee in the source native currency (C2FLR / ETH), mono full precision. */
  readonly nativeFee: Amount
  readonly slippageBips: number
  readonly readAt: number
}

export type BridgeQuoteResult =
  | { readonly kind: 'quote'; readonly quote: BridgeQuote }
  /** The fee read failed — there is nothing safe to sign. Never a fabricated fee. */
  | { readonly kind: 'unavailable'; readonly reason: string }

export interface QuoteBridgeInput {
  readonly adapter: BridgeAdapter
  readonly amountIn: bigint
  readonly slippageBips: number
  /** The on-chain `to` for the SendParam: the recipient (bridge) or the composer (redeem). */
  readonly to: Address
  readonly now: number
  /** The redeem compose message, when quoting a compose route (does not affect the fee shape). */
  readonly composeMsg?: Hex
}

function reasonOf(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > 0 ? `${fallback}: ${message.slice(0, 120)}` : fallback
}

export async function quoteBridge(input: QuoteBridgeInput): Promise<BridgeQuoteResult> {
  const { adapter, amountIn, slippageBips, to, now } = input
  const route = adapter.route
  const sp = buildSendParam(route, {
    to,
    amountLD: amountIn,
    minAmountLD: amountIn,
    ...(input.composeMsg ? { composeMsg: input.composeMsg } : {}),
  })

  let nativeFee: bigint
  try {
    nativeFee = (await adapter.reads.quoteFee(sp)).nativeFee
  } catch (error) {
    return { kind: 'unavailable', reason: reasonOf(error, 'Could not read the cross-chain fee') }
  }

  let receivedRaw: bigint | null = null
  try {
    receivedRaw = (await adapter.reads.quoteReceive(sp)).amountReceivedLD
  } catch {
    // Unknown delivered amount → null (renders `—`), never a fabricated 0.
  }
  // The floor is over the INPUT (shared with the plan's minAmountLD), so it holds even
  // when the receive read fails, and it clamps an out-of-range slippage.
  const minRaw = floorMin(amountIn, slippageBips)

  const fee = route.from.nativeCurrency
  return {
    kind: 'quote',
    quote: {
      routeKey: route.key,
      amountIn: amount(amountIn, route.asset.decimals, route.asset.symbol),
      amountReceivedLD: receivedRaw !== null ? amount(receivedRaw, route.asset.decimals, route.asset.symbol) : null,
      minReceived: amount(minRaw, route.asset.decimals, route.asset.symbol),
      nativeFee: amount(nativeFee, fee.decimals, fee.symbol),
      slippageBips,
      readAt: now,
    },
  }
}
