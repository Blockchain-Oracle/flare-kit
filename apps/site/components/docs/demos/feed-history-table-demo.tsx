'use client'

import { M4_SECTIONS } from '@gallery/m4-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * FeedHistoryTable's live preview, taken whole from the gallery's
 * `ftso-02-history` section — including the retention boundary, which is the
 * row the component exists for: finalized on chain, no longer served by the
 * data-availability host, and neither an error nor a gap.
 */
const HISTORY_CASES = M4_SECTIONS.find((section) => section.id === 'ftso-02-history')!.cases

const CODE = `import { FLARE_NETWORKS } from '@flarekit-dev/contracts'
import { FEED_CATEGORY, createMockFtsoReader, encodeFeedId } from '@flarekit-dev/core'
import { useFeedHistory } from '@flarekit-dev/react'
import { FeedHistoryTable } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

const reader = createMockFtsoReader()
const chainId = FLARE_NETWORKS.coston2.id
const feedId = encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD')

export function History() {
  // Every round in the range comes back as its own row, including the ones that
  // answered nothing.
  const history = useFeedHistory({
    reader,
    chainId,
    feedId,
    fromRound: 1_415_856n,
    toRound: 1_415_859n,
  })

  return (
    <FeedHistoryTable
      history={history.data}
      feedName="FLR/USD"
      loading={history.loading}
      now={Date.now()}
      onRefresh={history.refresh}
    />
  )
}`

export function FeedHistoryTableDemo() {
  return <GalleryDemo cases={HISTORY_CASES} code={CODE} />
}
