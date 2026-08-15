import type { DexRegistry } from '@flarekit-dev/contracts'
import type { SwapIntent } from '@flarekit-dev/core'
import type { TokenChoice } from '@flarekit-dev/react-ui'

export type Side = 'from' | 'to'

/** The zero address, as the placeholder recipient a draft has no wallet for. */
const NO_RECIPIENT = '0x0000000000000000000000000000000000000000' as const

/**
 * The intent a draft operation carries before anything has been entered.
 *
 * Deliberately zero-amount with no recipient: a draft exists so the card has a
 * lifecycle to render, and it must not look like a trade somebody set up.
 * `quoteSwap` refuses a zero amount outright, so this can never become a price.
 */
export function draftIntent(fromKey: string, toKey: string): SwapIntent {
  return {
    fromKey,
    toKey,
    amountIn: 0n,
    slippageBips: 50,
    recipient: NO_RECIPIENT,
    deadline: 0,
  }
}

/**
 * The registry's tokens as selector rows.
 *
 * No `balance` is set on any row. The selector documents absence as unknown
 * rather than zero, and this app has read no balances yet — inventing one here
 * would be the fabrication the whole product exists to avoid.
 */
export function tokenChoices(dex: DexRegistry): readonly TokenChoice[] {
  return Object.entries(dex.tokens).map(([key, token]) => ({ key, token }))
}
