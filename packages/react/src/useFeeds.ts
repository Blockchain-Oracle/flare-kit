import {
  type FeedCatalogue,
  type FeedId,
  type FeedReadResult,
  type Observation,
  type PayableReader,
  readFeeds,
  readFeedCatalogue,
} from '@flarekit-dev/core'
import { type ObservedRead, useObservedRead } from './use-observed-read.js'

/**
 * Current feed values and the catalogue behind them — FTSO-01 and FTSO-02.
 *
 * The catalogue and the values are separate reads because they are separate
 * claims: metadata costs nothing and changes rarely, while a value is payable
 * and carries its own decimals and timestamp. Folding them together would
 * invite exactly the per-feed decimals cache M4-R1 forbids.
 */

export interface UseFeedsOptions {
  reader: PayableReader
  chainId: number
  feedIds: readonly FeedId[]
  /** Refuse rather than spend above this. */
  maxFeeWei?: bigint
  /** Required once the fee is non-zero: a call carrying value needs a payer. */
  account?: `0x${string}`
}

export function useFeeds(
  options: UseFeedsOptions,
): ObservedRead<Observation<FeedReadResult>> {
  const { reader, chainId, feedIds, maxFeeWei, account } = options
  // Joined so a changed set of ids re-reads without the array identity doing it
  // on every render.
  const key = feedIds.join(',')

  return useObservedRead(
    () =>
      readFeeds({
        reader,
        chainId,
        feedIds,
        ...(maxFeeWei === undefined ? {} : { maxFeeWei }),
        ...(account === undefined ? {} : { account }),
      }),
    [chainId, key, maxFeeWei, account],
  )
}

export function useFeedCatalogue(
  reader: PayableReader,
  chainId: number,
): ObservedRead<Observation<FeedCatalogue>> {
  return useObservedRead(() => readFeedCatalogue({ reader, chainId }), [chainId])
}
