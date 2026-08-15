'use client'

import { type FlareNetworkKey, FLARE_NETWORKS, dexFor } from '@flarekit-dev/contracts'
import { createSwap } from '@flarekit-dev/core'
import { useSwap } from '@flarekit-dev/react'
import { SwapCard, TokenSelector } from '@flarekit-dev/react-ui'
import { useMemo, useState } from 'react'
import { publicClientFor } from '../../lib/kit'
import { type Side, draftIntent, tokenChoices } from '../../lib/swap-panel-state'

/**
 * The swap family.
 *
 * Every address, token and decimal comes from `dexFor(chainId)` — the registry
 * the R1 probe read on chain. Nothing here is a literal.
 *
 * There is no verified-flag gate, because swap has no such flag and needs none:
 * `quoteSwap` reads `getPair` live before it will price anything, so a pair with
 * no pool returns `no_route` rather than a number. The refusal is the quote
 * result itself, and this panel renders it rather than inventing a gate.
 */
export function SwapPanel({ network = 'coston2' }: { network?: FlareNetworkKey } = {}) {
  const chain = FLARE_NETWORKS[network]
  const dex = dexFor(chain.id)
  const [fromKey, setFromKey] = useState(dex.canonicalPair[0])
  const [toKey, setToKey] = useState(dex.canonicalPair[1])
  const [amountInText, setAmountInText] = useState('')
  const [picking, setPicking] = useState<Side | undefined>(undefined)

  const publicClient = useMemo(() => publicClientFor(network), [network])
  const swap = useSwap({ chainId: chain.id, dex, publicClient, fromKey, toKey })

  const fromToken = dex.tokens[fromKey]
  const toToken = dex.tokens[toKey]

  // A draft operation so the card has a lifecycle to render before anything has
  // happened. It carries no quote and claims nothing.
  const draft = useMemo(
    () => createSwap({ chainId: chain.id, intent: draftIntent(fromKey, toKey), now: Date.now() }),
    [chain.id, fromKey, toKey],
  )

  if (!fromToken || !toToken) return null

  const choose = (key: string) => {
    if (picking === 'from') setFromKey(key)
    if (picking === 'to') setToKey(key)
    setPicking(undefined)
  }

  return (
    <div className="app-swap">
      <SwapCard
        operation={swap.operation ?? draft}
        fromToken={fromToken}
        toToken={toToken}
        quoteResult={swap.quoteResult}
        amountInText={amountInText}
        networkLabel={chain.name}
        onAmountInChange={(text) => {
          setAmountInText(text)
          swap.quote(text)
        }}
        onFlip={() => {
          setFromKey(toKey)
          setToKey(fromKey)
        }}
        onSelectFrom={() => setPicking('from')}
        onSelectTo={() => setPicking('to')}
        {...(swap.canWrite ? { onSubmit: swap.submit } : {})}
      />

      <TokenSelector
        open={picking !== undefined}
        tokens={tokenChoices(dex)}
        commonBases={[...dex.canonicalPair]}
        selectedKey={picking === 'to' ? toKey : fromKey}
        counterSymbol={picking === 'to' ? fromToken.symbol : toToken.symbol}
        onSelect={choose}
        onClose={() => setPicking(undefined)}
      />
    </div>
  )
}
