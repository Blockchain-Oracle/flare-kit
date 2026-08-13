'use client'

import { M4_INCENTIVE_SECTIONS } from '@gallery/m4-incentive-sections'
import { isValidElement } from 'react'
import { GalleryDemo } from './gallery-demo'

/**
 * IncentiveEffectPanel has no gallery section of its own, because it has no
 * standalone verified state: `IncentiveComposer` mounts it once an `effect`
 * arrives, and that is where the gallery exercises it.
 *
 * So the cases here are `ftso-05`'s effect cases, mounted exactly as the gallery
 * mounts them — the panel is the block at the foot of each composer.
 * Re-authoring an `IncentiveEffect` to show the panel alone would be a second
 * set of fixtures for the same surface, which is the one thing R6 forbids.
 *
 * Selected by the prop that actually mounts the panel rather than by case name,
 * so a renamed case does not quietly empty this preview and a newly added effect
 * case arrives here on its own.
 */
const CASES = M4_INCENTIVE_SECTIONS.find((section) => section.id === 'ftso-05')!.cases.filter(
  (entry) =>
    isValidElement<{ effect?: unknown }>(entry.node) && entry.node.props.effect !== undefined,
)

const CODE = `import { confirmIncentiveEffect, isEffectExpired } from '@flare-kit/core'
import { IncentiveEffectPanel } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

// Read at the offer's own block, from the offer's own IncentiveOffered event.
const effect = await confirmIncentiveEffect({
  reader,
  chainId: 114,
  transactionHash: hash,
  blockNumber: receipt.blockNumber,
  event: { rangeIncrease, sampleSizeIncrease, offerAmount },
})

export function Effect() {
  return (
    <IncentiveEffectPanel
      effect={effect}
      durationSeconds={quote.durationSeconds}
      expired={isEffectExpired(offeredAtSeconds, quote.durationSeconds, nowSeconds)}
      nativeAsset="C2FLR"
      now={Date.now()}
    />
  )
}`

export function IncentiveEffectPanelDemo() {
  return <GalleryDemo cases={CASES} code={CODE} label="mock offer" />
}
