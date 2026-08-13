'use client'

import { FLARE_NETWORKS } from '@flare-kit/contracts'
import { FEED_CATEGORY, createMockFtsoReader, encodeFeedId } from '@flare-kit/core'
import { useFeedHistory } from '@flare-kit/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import { FEED_CATEGORY, encodeFeedId } from '@flare-kit/core'
import { useFeedHistory } from '@flare-kit/react'
import { FeedHistoryTable } from '@flare-kit/react-ui'

const FEED_ID = encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD')

export function History({ reader }) {
  // Every round in the range comes back as its own point, including the ones
  // that answered nothing. A gap is data, not a row to drop.
  const { data, loading, refresh } = useFeedHistory({
    reader,
    chainId: 114,
    feedId: FEED_ID,
    fromRound: 1415856n,
    toRound: 1415859n,
  })

  return (
    <FeedHistoryTable
      history={data}
      feedName="FLR/USD"
      loading={loading}
      now={Date.now()}
      onRefresh={refresh}
    />
  )
}`

const READER = createMockFtsoReader()
const COSTON2 = FLARE_NETWORKS.coston2.id
const FLR_USD = encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD')

/**
 * The one hook on this site whose read leaves the chain.
 *
 * `readFeedHistory` retrieves each round's leaf from the data-availability host
 * over HTTP, and `useFeedHistory` takes no fetch implementation — so there is no
 * mock that can answer it, and driving it here would mean a network call out of
 * a documentation page. These pages make none.
 *
 * So the range below is empty: `toRound` is one below `fromRound`, the walk runs
 * zero times, and no host is contacted. What the readout shows is genuinely what
 * the hook returned — the observation envelope, naming the provider it would
 * have asked, around a point list with nothing in it. The populated table, the
 * retention boundary included, is on the FeedHistoryTable page, driven by the
 * gallery's recorded Coston2 measurement.
 */
const FROM_ROUND = 1_415_856n
const TO_ROUND = FROM_ROUND - 1n

function Probe() {
  const { data, loading, error } = useFeedHistory({
    reader: READER,
    chainId: COSTON2,
    feedId: FLR_USD,
    fromRound: FROM_ROUND,
    toRound: TO_ROUND,
  })
  return (
    <HookReadout name="useFeedHistory" value={{ loading, error: error ?? null, data }} />
  )
}

export function UseFeedHistoryDemo() {
  return (
    <Preview code={CODE} label="empty range · no network">
      <Probe />
    </Preview>
  )
}
