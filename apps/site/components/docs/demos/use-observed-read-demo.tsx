'use client'

import { FLARE_NETWORKS } from '@flarekit-dev/contracts'
import { FEED_CATEGORY, createMockFtsoReader, encodeFeedId, readFeeds } from '@flarekit-dev/core'
import { useObservedRead } from '@flarekit-dev/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

/**
 * The mock FTSO reader, not the mock kit: `useObservedRead` takes a reader and
 * uses no context at all, so there is deliberately no `FlareProvider` here.
 * The read itself is the real `readFeeds` — the mock supplies the responses a
 * live Coston2 call returned, and the same code path decodes them.
 */
const READER = createMockFtsoReader()
const CHAIN_ID = FLARE_NETWORKS.coston2.id
const FEED_IDS = [encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD')]

const CODE = `import { readFeeds } from '@flarekit-dev/core'
import { useObservedRead } from '@flarekit-dev/react'

function Price({ reader, chainId, feedIds }) {
  const { data, loading, error, refresh } = useObservedRead(
    () => readFeeds({ reader, chainId, feedIds }),
    // The caller names what the read is a function of. The reader itself is
    // held in a ref, so rebuilding it every render does not restart the read.
    [chainId, feedIds.join(',')],
  )

  if (loading) return <Skeleton />
  // A failed read never clears what already arrived: both can be true.
  return <Reading value={data} error={error} onRefresh={refresh} />
}`

/**
 * The hook runs for real against the mock reader — the readout is its actual
 * return value on this render. It renders once while the read is in flight
 * (`loading: true`, `data: null`) and again when the observation lands.
 */
function Probe() {
  const { data, loading, error } = useObservedRead(
    () => readFeeds({ reader: READER, chainId: CHAIN_ID, feedIds: FEED_IDS }),
    [CHAIN_ID],
  )

  return (
    <HookReadout
      name="useObservedRead"
      value={{ loading, error: error ?? null, data }}
    />
  )
}

export function UseObservedReadDemo() {
  return (
    <Preview code={CODE} label="mock FTSO reader">
      <Probe />
    </Preview>
  )
}
