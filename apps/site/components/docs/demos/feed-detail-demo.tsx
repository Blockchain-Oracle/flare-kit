'use client'

import { M4_SECTIONS } from '@gallery/m4-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * FeedDetail's live preview, taken whole from the gallery's `ftso-02-detail`
 * section. The case to look at is the first one: the anchor value at six
 * decimals sitting beside the block-latency value at eight, for the same asset,
 * with neither presented as the price.
 */
const DETAIL_CASES = M4_SECTIONS.find((section) => section.id === 'ftso-02-detail')!.cases

const CODE = `import { FLARE_NETWORKS } from '@flare-kit/contracts'
import { FEED_CATEGORY, createMockFtsoReader, encodeFeedId, isObserved, observe } from '@flare-kit/core'
import { useAnchorProof, useFeedCatalogue, useFeeds } from '@flare-kit/react'
import { FeedDetail } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

const reader = createMockFtsoReader()
const chainId = FLARE_NETWORKS.coston2.id
const feedId = encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD')

export function Feed() {
  const catalogue = useFeedCatalogue(reader, chainId)
  const reading = useFeeds({ reader, chainId, feedIds: [feedId] })
  const proof = useAnchorProof({ reader, chainId, feedIds: [feedId] })

  const entries =
    catalogue.data && isObserved(catalogue.data) ? catalogue.data.value.entries : []
  const feed = entries.find((entry) => entry.feedId === feedId)
  if (!feed) return null

  // One feed out of the round's result, carrying the batch's own provenance.
  const retrieved = proof.data && isObserved(proof.data.retrieved) ? proof.data.retrieved : undefined
  const found = retrieved?.value.found[0]
  const anchor = retrieved && found ? observe(found, retrieved.source, retrieved.observedAt) : undefined

  return (
    <FeedDetail
      feed={feed}
      reading={reading.data}
      anchor={anchor}
      verification={proof.data?.verifications[0]}
      loading={reading.loading}
      now={Date.now()}
    />
  )
}`

export function FeedDetailDemo() {
  return <GalleryDemo cases={DETAIL_CASES} code={CODE} />
}
