import {
  type AnchorFeedsResult,
  type FeedId,
  type Observation,
  type RoundReader,
  type VerificationResult,
  fetchAnchorFeeds,
  isObserved,
  verifyAnchorFeed,
} from '@flarekit-dev/core'
import { type ObservedRead, useObservedRead } from './use-observed-read.js'

/**
 * Retrieve an anchor-feed proof and check it on chain — FTSO-03.
 *
 * The verification is three-valued and the hook keeps it that way. A revert from
 * `verifyFeedData` means "we could not check this", never "this is not proven";
 * collapsing the two would render an unknown as a negative fact.
 */

export interface AnchorProofState {
  /** Carries who served the leaves and when — M4-R9. */
  readonly retrieved: Observation<AnchorFeedsResult>
  readonly verifications: readonly VerificationResult[]
}

export interface UseAnchorProofOptions {
  reader: RoundReader
  chainId: number
  feedIds: readonly FeedId[]
  votingRoundId?: bigint
  apiKey?: string
}

export function useAnchorProof(options: UseAnchorProofOptions): ObservedRead<AnchorProofState> {
  const { reader, chainId, feedIds, votingRoundId, apiKey } = options
  const key = feedIds.join(',')

  return useObservedRead(async () => {
    const retrieved = await fetchAnchorFeeds({
      chainId,
      feedIds,
      ...(votingRoundId === undefined ? {} : { votingRoundId }),
      ...(apiKey === undefined ? {} : { apiKey }),
    })
    const verifications = isObserved(retrieved)
      ? await Promise.all(
          retrieved.value.found.map((feed) => verifyAnchorFeed(reader, chainId, feed)),
        )
      : []
    return { retrieved, verifications }
  }, [chainId, key, votingRoundId, apiKey])
}
