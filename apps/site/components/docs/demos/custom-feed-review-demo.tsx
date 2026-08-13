'use client'

import { M4_INCENTIVE_SECTIONS } from '@gallery/m4-incentive-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * CustomFeedReview's live preview — the gallery's `ftso-06` section, whole.
 *
 * The feed sets are driven through the real `readCustomFeeds` against
 * `createMockFtsoReader()` rather than hand-written as observations, and the
 * excluded entries are the real artifacts `FtsoV2.getCustomFeeds()` reports on
 * mainnet. Both facts are the gallery's; nothing is re-authored here.
 */
const CASES = M4_INCENTIVE_SECTIONS.find((section) => section.id === 'ftso-06')!.cases

const CODE = `import { createMockFtsoReader } from '@flarekit-dev/core'
import { useCustomFeeds, useFeeds } from '@flarekit-dev/react'
import { CustomFeedReview } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

const reader = createMockFtsoReader({ customFeedNames: ['sFLR/USD'] })

export function CustomFeeds({ payer }) {
  const feeds = useCustomFeeds(reader, 114)
  const ids = feeds.data?.status === 'observed'
    ? feeds.data.value.entries.map((entry) => entry.feedId)
    : []
  const readings = useFeeds({ reader, chainId: 114, feedIds: ids, account: payer })

  return (
    <CustomFeedReview
      feeds={feeds.data}
      readings={readings.data}
      loading={feeds.loading}
      now={Date.now()}
    />
  )
}`

export function CustomFeedReviewDemo() {
  return <GalleryDemo cases={CASES} code={CODE} label="mock reader" />
}
