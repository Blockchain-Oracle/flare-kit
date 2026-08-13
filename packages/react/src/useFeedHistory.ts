import {
  type FeedHistory,
  type FeedId,
  type Observation,
  type RoundReader,
  readFeedHistory,
} from '@flare-kit/core'
import { type ObservedRead, useObservedRead } from './use-observed-read.js'

/**
 * Anchor-feed history across a round range — FTSO-02's table.
 *
 * Every round in the range comes back as its own point, including the ones that
 * answered nothing. A gap is data: below the retention boundary the Relay's root
 * is still published while the leaf is gone, and that is neither an error nor a
 * missing value.
 */

export interface UseFeedHistoryOptions {
  reader: RoundReader
  chainId: number
  feedId: FeedId
  fromRound: bigint
  toRound: bigint
  apiKey?: string
}

export function useFeedHistory(
  options: UseFeedHistoryOptions,
): ObservedRead<Observation<FeedHistory>> {
  const { reader, chainId, feedId, fromRound, toRound, apiKey } = options
  return useObservedRead(
    () =>
      readFeedHistory({
        reader,
        chainId,
        feedId,
        fromRound,
        toRound,
        ...(apiKey === undefined ? {} : { apiKey }),
      }),
    [chainId, feedId, fromRound, toRound, apiKey],
  )
}
