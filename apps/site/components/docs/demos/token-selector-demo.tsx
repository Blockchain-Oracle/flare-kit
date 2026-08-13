'use client'

import { M5_SWAP_SECTIONS } from '@gallery/m5-swap-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * TokenSelector's live preview. The three cases are the gallery's own
 * `m5-token-selector` section — search filtered from props, the balance-sorted
 * list, and the counter-side gate that shows an unpoolable token disabled with
 * the missing pair named. The gallery mounts each inside a transformed wrapper
 * so the modal renders in its cell rather than over the page.
 */
const SELECTOR_CASES = M5_SWAP_SECTIONS.find((section) => section.id === 'm5-token-selector')!.cases

const CODE = `import { dexFor } from '@flare-kit/contracts'
import { TokenSelector } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

const dex = dexFor(114) // Coston2

export function PickToken({ open, balances, pooledWith, onClose, onSelect }) {
  const tokens = Object.entries(dex.tokens).map(([key, token]) => ({
    key,
    token,
    // Omit balance when it has not been read — absence is unknown, never zero.
    ...(balances[key] ? { balance: balances[key] } : {}),
    // false = no pool pairs this with the chosen side, so the row cannot be picked.
    pooled: pooledWith.includes(key),
  }))

  return (
    <TokenSelector
      open={open}
      tokens={tokens}
      commonBases={['FXRP', 'USDT0']}
      counterSymbol="FXRP"
      onSelect={onSelect}
      onClose={onClose}
    />
  )
}`

export function TokenSelectorDemo() {
  return <GalleryDemo cases={SELECTOR_CASES} code={CODE} />
}
