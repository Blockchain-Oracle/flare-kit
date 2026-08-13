import {
  type CustomFeedSet,
  type Observation,
  type RoundReader,
  readCustomFeeds,
} from '@flare-kit/core'
import { type ObservedRead, useObservedRead } from './use-observed-read.js'

/**
 * Custom feeds on the selected network — FTSO-06.
 *
 * The set is network-specific and one of the two networks is legitimately empty.
 * An empty result here is a real observation, never an error and never an
 * absence of the feature, which is why it arrives as an `Observation` carrying
 * the network it was read on.
 */

export function useCustomFeeds(
  reader: RoundReader,
  chainId: number,
): ObservedRead<Observation<CustomFeedSet>> {
  return useObservedRead(() => readCustomFeeds({ reader, chainId }), [chainId])
}
