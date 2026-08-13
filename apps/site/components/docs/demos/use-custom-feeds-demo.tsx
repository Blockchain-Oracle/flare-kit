'use client'

import { FLARE_NETWORKS, OBSERVED_CUSTOM_FEEDS } from '@flare-kit/contracts'
import { createMockFtsoReader } from '@flare-kit/core'
import { useCustomFeeds } from '@flare-kit/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import type { RoundReader } from '@flare-kit/core'
import { useCustomFeeds } from '@flare-kit/react'
import { CustomFeedReview } from '@flare-kit/react-ui'

export function CustomFeeds({ reader }: { reader: RoundReader }) {
  const { data, loading, error } = useCustomFeeds(reader, 14)

  if (error) return <p>The set could not be read: {error}</p>

  // An empty set is a real reading of a network that has none — never an error,
  // and never "this network does not support custom feeds".
  return <CustomFeedReview feeds={data} loading={loading} now={Date.now()} />
}`

/**
 * The mock reader shaped like Flare Mainnet: the three custom feeds
 * `getSupportedFeedIds()` listed there on 2026-08-04, taken from the constant
 * that records the observation rather than retyped here.
 *
 * Coston2 genuinely has none, which is why the empty set has to be an honest
 * reading rather than an error — see the states below the preview.
 */
const READER = createMockFtsoReader({ customFeedNames: OBSERVED_CUSTOM_FEEDS.flare })
const FLARE = FLARE_NETWORKS.flare.id

/**
 * The real hook running the real `readCustomFeeds`. The set comes from
 * filtering `getSupportedFeedIds()` on the category byte — not from
 * `FtsoV2.getCustomFeeds()`, whose mainnet answer omits `stFLR/USD` and
 * includes an id that reverts on read.
 */
function Probe() {
  const { data, loading, error } = useCustomFeeds(READER, FLARE)
  return (
    <HookReadout name="useCustomFeeds" value={{ loading, error: error ?? null, data }} />
  )
}

export function UseCustomFeedsDemo() {
  return (
    <Preview code={CODE} label="mock FTSO reader">
      <Probe />
    </Preview>
  )
}
