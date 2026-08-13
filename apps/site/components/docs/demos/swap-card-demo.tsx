'use client'

import { M5_SWAP_SECTIONS } from '@gallery/m5-swap-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * SwapCard's live preview. The states come wholesale from the gallery's
 * `m5-swap` section — quote, needs approval, approving, swapping, success, no
 * route, slippage exceeded, and the declared-unbuilt Limit tab. Every one is
 * built from the real swap state machine, so the docs cannot show a state the
 * card never reaches.
 */
const SWAP_CASES = M5_SWAP_SECTIONS.find((section) => section.id === 'm5-swap')!.cases

const CODE = `import { dexFor } from '@flare-kit/contracts'
import { applyQuote, createSwap, quoteSwap, readAllowance, startQuoting } from '@flare-kit/core'
import { SwapCard } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

const CHAIN = 114 // Coston2
const dex = dexFor(CHAIN) // the router, factory and swappable tokens

// reader is a viem PublicClient; owner is the address that pays and receives.
export async function quoteFxrpToUsdt(reader, owner) {
  const now = Date.now()
  const intent = {
    fromKey: 'FXRP',
    toKey: 'USDT0',
    amountIn: 100_000000n, // raw units of the pay token
    slippageBips: 50,
    recipient: owner,
    deadline: Math.floor(now / 1000) + 1200,
  }

  const { fromKey, toKey, amountIn, slippageBips } = intent
  const result = await quoteSwap({ reader, chainId: CHAIN, fromKey, toKey, amountIn, slippageBips, now })
  const allowance = await readAllowance(reader, CHAIN, fromKey, owner)
  const quoting = startQuoting(createSwap({ chainId: CHAIN, intent, now }), now).record

  // ready when the allowance covers the trade, awaiting_approval when it does not.
  return applyQuote(quoting, { result, allowance, now }).record
}

export function Swap({ operation, result }) {
  return (
    <SwapCard
      operation={operation}
      quoteResult={result}
      fromToken={dex.tokens.FXRP}
      toToken={dex.tokens.USDT0}
      networkLabel="Coston2"
      onSubmit={signNextStep}
    />
  )
}`

export function SwapCardDemo() {
  return <GalleryDemo cases={SWAP_CASES} code={CODE} />
}
