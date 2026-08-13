'use client'

import { M4_INCENTIVE_SECTIONS } from '@gallery/m4-incentive-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * IncentiveComposer's live preview — the gallery's `ftso-05` section, whole.
 *
 * The quote in those cases is not a typed-in number: the gallery computes the
 * offer amount with `priceFor` from the constants bisected against the live
 * Coston2 contract, so a change to the pricing formula changes this preview
 * rather than leaving it agreeing with a stale figure.
 */
const CASES = M4_INCENTIVE_SECTIONS.find((section) => section.id === 'ftso-05')!.cases

const CODE = `import { useIncentiveOffer } from '@flare-kit/react'
import { IncentiveComposer } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

// The reader is the host's — a viem public client on the network it configured.
// Signing belongs to the host too: this component quotes, it never spends.
export function Incentive({ reader, payer, onOffer }) {
  const quote = useIncentiveOffer({
    reader,
    chainId: 114,
    rangeIncrease: 608472288109550112718417538580n,
  })

  return (
    <IncentiveComposer
      quote={quote.data}
      loading={quote.loading}
      payer={payer}
      nativeAsset="C2FLR"
      now={Date.now()}
      onRequote={quote.refresh}
      onSubmit={onOffer}
    />
  )
}`

export function IncentiveComposerDemo() {
  return <GalleryDemo cases={CASES} code={CODE} label="mock quote" />
}
