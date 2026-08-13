'use client'

import { M4_SECTIONS } from '@gallery/m4-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * FeedCatalogue's live preview, taken whole from the gallery's `ftso-01`
 * section — the list and its values, custom feeds, the legitimate empty
 * deployment, an unreadable list, values that did not come back, stale metadata
 * and a read that actually cost something. Nothing is re-authored here.
 */
const CATALOGUE_CASES = M4_SECTIONS.find((section) => section.id === 'ftso-01')!.cases

const CODE = `import { FLARE_NETWORKS } from '@flare-kit/contracts'
import { FEED_CATEGORY, createMockFtsoReader, encodeFeedId } from '@flare-kit/core'
import { useFeedCatalogue, useFeeds } from '@flare-kit/react'
import { FeedCatalogue } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

const reader = createMockFtsoReader()
const chainId = FLARE_NETWORKS.coston2.id
const feedIds = ['FLR/USD', 'BTC/USD', 'XRP/USD'].map((name) =>
  encodeFeedId(FEED_CATEGORY.crypto, name),
)

export function Feeds() {
  // Two reads, because they are two claims: the list is free metadata, a value
  // is payable and carries its own decimals and timestamp.
  const catalogue = useFeedCatalogue(reader, chainId)
  const readings = useFeeds({ reader, chainId, feedIds })

  return (
    <FeedCatalogue
      catalogue={catalogue.data}
      readings={readings.data}
      loading={catalogue.loading}
      now={Date.now()}
      onRefresh={catalogue.refresh}
    />
  )
}`

export function FeedCatalogueDemo() {
  return <GalleryDemo cases={CATALOGUE_CASES} code={CODE} />
}
