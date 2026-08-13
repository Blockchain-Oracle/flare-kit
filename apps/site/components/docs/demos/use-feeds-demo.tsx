'use client'

import { FLARE_NETWORKS } from '@flarekit-dev/contracts'
import { FEED_CATEGORY, createMockFtsoReader, encodeFeedId } from '@flarekit-dev/core'
import { useFeeds } from '@flarekit-dev/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import type { PayableReader } from '@flarekit-dev/core'
import { FEED_CATEGORY, encodeFeedId, formatExact, isObserved } from '@flarekit-dev/core'
import { useFeeds } from '@flarekit-dev/react'

const FEED_IDS = [
  encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD'),
  encodeFeedId(FEED_CATEGORY.crypto, 'BTC/USD'),
]

export function Prices({ reader }: { reader: PayableReader }) {
  const { data, loading, error } = useFeeds({
    reader,
    chainId: 114,
    feedIds: FEED_IDS,
  })

  if (loading) return <p>Reading the feeds…</p>
  if (error) return <p>The read failed: {error}</p>
  if (!data) return null
  if (!isObserved(data)) return <p>{data.reason}</p>

  // Every reading carries the exponent that came back with it, so it renders at
  // its own precision. There is no per-feed decimals cache to reach for.
  return (
    <ul className="mono">
      {data.value.readings.map((reading) => (
        <li key={reading.feedId}>
          {reading.name} {formatExact(reading.price)}
        </li>
      ))}
    </ul>
  )
}`

/**
 * The reader and the id list live at module scope so their identity is stable:
 * `useFeeds` keys its read on the joined ids, and a list rebuilt every render
 * would still be one read, but a reader rebuilt every render is the mistake
 * `useObservedRead` holds its callback in a ref to survive.
 */
const READER = createMockFtsoReader()
const COSTON2 = FLARE_NETWORKS.coston2.id

/**
 * Two feeds with two different exponents, on purpose: `FLR/USD` came back at 8
 * decimals and `BTC/USD` at 2 in the same live `getFeedsById` response. A
 * readout that showed one shared exponent would be hiding the rule this hook is
 * built around.
 */
const FEED_IDS = [
  encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD'),
  encodeFeedId(FEED_CATEGORY.crypto, 'BTC/USD'),
]

/**
 * The real hook, running the real `readFeeds` against the mock FTSO reader —
 * whose responses are what Coston2 returned on 2026-08-04. No provider wraps
 * it, because it does not consume one: the reader is a parameter.
 */
function Probe() {
  const { data, loading, error } = useFeeds({
    reader: READER,
    chainId: COSTON2,
    feedIds: FEED_IDS,
  })
  return (
    <HookReadout name="useFeeds" value={{ loading, error: error ?? null, data }} />
  )
}

export function UseFeedsDemo() {
  return (
    <Preview code={CODE} label="mock FTSO reader">
      <Probe />
    </Preview>
  )
}
