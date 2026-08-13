import {
  type FeedId,
  feeCalculatorAbi,
  ftsoRegistryFor,
  ftsoV2Abi,
} from '@flare-kit/contracts'
import { FlareKitError } from '../errors.js'
import type { RoundReader } from '../voting-round.js'

/**
 * What a feed read costs, measured rather than assumed — M4-R2.
 *
 * This is its own file because it is the piece most likely to change under
 * governance: every read method on `FtsoV2` is `payable`, the fee is settable
 * per category and per feed, and it is only zero *today*.
 *
 * The zero is not hypothetical comfort. `FastUpdater.fetchAllCurrentFeeds()`
 * already costs 1 wei right now, because it prices by index, index 52 is the
 * unused slot, that slot's category has no configured fee, and it falls through
 * to `defaultFee()`. A kit that hardcoded zero would be broken on a live call
 * today. This is the FDC fee lesson — 1000 wei on Coston2, 20 FLR on mainnet —
 * arriving on a second protocol.
 */

/**
 * Two contracts answer "what does this cost", and on mainnet they disagree.
 *
 * For the same 66 supported feeds `FtsoV2.calculateFeeByIds` answers `0` and
 * `FeeCalculator.calculateFeeByIds` answers `3`, because
 * `FeeCalculator.getCategoryFee(0x21)` reverts — the custom category has no
 * configured fee — so those three fall through to `defaultFee()`, 1 wei each.
 *
 * A live simulation settled which one binds: `FtsoV2.getFeedsById` for all 66
 * succeeds with `value = 0`. So the rule is **quote from the contract that
 * guards the call you are about to make**. `FeeCalculator`'s answer is kept when
 * it differs, because "these two oracles disagree and here is by how much" is
 * something a surface should be able to say, but it is never what gets paid.
 */
export interface FeedFeeQuote {
  readonly feedIds: readonly FeedId[]
  /** What `FtsoV2.getFeedsById` will require as `msg.value`. */
  readonly wei: bigint
  /** Always `ftsoV2` — named so the surface can say who was asked. */
  readonly quotedFrom: 'ftsoV2'
  /**
   * `FeeCalculator`'s answer, present only when it differs from `wei`. A
   * difference is not an error: it is two oracles scoped to different call
   * paths, and the surface explains it rather than picking a winner.
   */
  readonly secondOpinionWei?: bigint
}

/**
 * Quote the exact batch about to be read.
 *
 * Batched because that is the shape of the call it prices — a per-feed quote
 * summed by the caller would be a different number the moment a category fee
 * lands, and `getFeedsById` charges for the batch it is given.
 */
export async function quoteFeedFee(
  reader: RoundReader,
  chainId: number,
  feedIds: readonly FeedId[],
): Promise<FeedFeeQuote> {
  const registry = ftsoRegistryFor(chainId)

  const wei = BigInt(
    (await reader.readContract({
      address: registry.ftsoV2,
      abi: ftsoV2Abi as readonly unknown[],
      functionName: 'calculateFeeByIds',
      args: [feedIds],
    })) as bigint,
  )

  // The second opinion is best-effort: it explains a number, it does not gate
  // one. `getCategoryFee` reverting for an unconfigured category is exactly the
  // condition that makes the two disagree, so a revert here is expected and must
  // not fail the read that depends on it.
  let secondOpinionWei: bigint | undefined
  try {
    const other = BigInt(
      (await reader.readContract({
        address: registry.feeCalculator,
        abi: feeCalculatorAbi as readonly unknown[],
        functionName: 'calculateFeeByIds',
        args: [feedIds],
      })) as bigint,
    )
    if (other !== wei) secondOpinionWei = other
  } catch {
    // Left undefined. `getCategoryFee` reverting for an unconfigured category is
    // the very condition that makes the two oracles disagree, so a revert here
    // is expected and must not fail the read that depends on it.
  }

  return Object.freeze({
    feedIds: Object.freeze([...feedIds]),
    wei,
    quotedFrom: 'ftsoV2' as const,
    ...(secondOpinionWei === undefined ? {} : { secondOpinionWei }),
  })
}

/**
 * Refuse rather than spend — M4-R2.
 *
 * A ceiling is the caller's statement of what they are willing to pay without
 * being asked again. The fault is in the caller's own policy rather than in the
 * chain, and nothing was sent — so this is `policy` / `safe_to_retry` with
 * `valueMoved: 'no'`. Retrying is free and will refuse identically until the
 * caller raises the ceiling, which is the point: the refusal is the feature.
 */
export function assertFeeWithinCeiling(quote: FeedFeeQuote, ceilingWei: bigint): void {
  if (quote.wei <= ceilingWei) return
  throw new FlareKitError('FTSO_FEE_ABOVE_CEILING', {
    domain: 'policy',
    message: `Reading ${quote.feedIds.length} feed${quote.feedIds.length === 1 ? '' : 's'} costs ${quote.wei} wei, above the ${ceilingWei} wei ceiling. Nothing was sent.`,
    recovery: 'safe_to_retry',
    valueMoved: 'no',
    evidence: {
      quotedWei: quote.wei.toString(),
      ceilingWei: ceilingWei.toString(),
      feedCount: String(quote.feedIds.length),
    },
  })
}
