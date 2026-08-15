import {
  type FeedId,
  OBSERVED_CUSTOM_FEEDS,
  chainFor,
  decodeFeedId,
  isCustomFeedId,
} from '@flarekit-dev/contracts'
import { type Observation, observe } from '../observation.js'
import type { RoundReader } from '../voting-round.js'
import { listSupportedFeedIds } from './feeds.js'

/**
 * Custom feeds — M4-R8. Read-only, and never presented as protocol-equivalent.
 *
 * A protocol feed's value is what the FTSO providers voted on. A custom feed's
 * value comes from a contract somebody else deployed, which the Flare Foundation
 * approved through governance. Both are real; they are not the same claim, and a
 * surface that renders them identically is flattening the difference that
 * matters most about them.
 */

/**
 * Enumeration does **not** use `FtsoV2.getCustomFeeds()`.
 *
 * That method is declared in no vendored interface artifact on either network,
 * yet the deployment answers it — and its mainnet answer is wrong twice over. It
 * returns `0x000000000000000000000000d1002f3820ad32145b`: category `0x00`, no
 * decodable name, absent from `getSupportedFeedIds()`, and reverting on both
 * `getFeedById` and `calculateFeeById`. And it *omits* `stFLR/USD`, which
 * `getSupportedFeedIds()` does list.
 *
 * It is to custom feeds exactly what `FastUpdatesConfiguration.getFeedIds()` is
 * to feeds: a storage array with a hole, not a list. Filtering
 * `getSupportedFeedIds()` on the category byte yields precisely the three real
 * ones, so that is what this does.
 */
export interface CustomFeedEntry {
  readonly feedId: FeedId
  readonly name: string
  /**
   * Always `'custom'`. Present as a field rather than implied by the collection
   * so it survives being merged into a catalogue row, where implication does not.
   */
  readonly trust: 'custom'
  /**
   * Whether this kit can read the feed's own contract directly.
   *
   * Always `false`, and that is a property of the deployment rather than a gap
   * here: `IICustomFeed` declares `feedId()`, mapping a contract to its id, and
   * **no vendored interface maps an id back to a contract address**.
   * `addCustomFeeds(address[])` is governance-gated and takes addresses the
   * caller already has. So a custom feed's value is readable through
   * `FtsoV2.getFeedsById` — verified live, `sFLR/USD` returns 1128983 at 8
   * decimals — and its `calculateFee()` and `getCurrentFeed()` are not reachable
   * without an address supplied out of band.
   */
  readonly directContractReadable: false
}

export interface CustomFeedSet {
  /** Named on the surface. The set is network-specific and one of them is empty. */
  readonly network: string
  readonly chainId: number
  readonly entries: readonly CustomFeedEntry[]
  /**
   * What we saw last time we looked, and when.
   *
   * An empty set is an honest observation, not an error and not an absence of
   * the feature — Coston2 genuinely has zero custom feeds. Carrying the dated
   * prior observation lets the surface say "empty, and it was empty on
   * 2026-08-04 too" rather than leaving a reader unsure whether the read failed.
   * It never substitutes for reading the chain.
   */
  readonly previouslyObserved: { readonly at: string; readonly names: readonly string[] }
}

/**
 * Creation is not merely unimplemented — it is unavailable.
 *
 * `addCustomFeeds(address[])` is `nonpayable` and governance-gated, and the
 * documented route is a "New Feed Request" issue the Flare Foundation reviews
 * off-chain. Deploying an `IICustomFeed` yields a contract the deployer can read
 * directly; it does **not** yield a feed readable through `FtsoV2`. There is no
 * path by which this project creates a custom feed on any network, so the
 * surface says blocked and names why, rather than offering a button that cannot
 * work.
 */
export const CUSTOM_FEED_CREATION = {
  status: 'blocked',
  reason:
    'Registering a custom feed calls addCustomFeeds, which is governance-gated. The Flare Foundation reviews a New Feed Request off chain; deploying an IICustomFeed contract does not make it readable through FtsoV2.',
  evidence: 'addCustomFeeds(address[]) is nonpayable and governance-restricted on both networks.',
} as const

export interface ReadCustomFeedsInput {
  reader: RoundReader
  chainId: number
  now?: () => number
}

export async function readCustomFeeds(
  input: ReadCustomFeedsInput,
): Promise<Observation<CustomFeedSet>> {
  const { reader, chainId } = input
  const now = input.now ?? Date.now
  const chain = chainFor(chainId)

  const supported = await listSupportedFeedIds(reader, chainId)
  const entries = supported.filter(isCustomFeedId).map((feedId) =>
    Object.freeze({
      feedId,
      name: decodeFeedId(feedId).name,
      trust: 'custom' as const,
      directContractReadable: false as const,
    }),
  )

  return observe(
    {
      network: chain.name,
      chainId,
      entries: Object.freeze(entries),
      previouslyObserved: {
        at: OBSERVED_CUSTOM_FEEDS.observedAt,
        names: chain.key === 'flare' ? OBSERVED_CUSTOM_FEEDS.flare : OBSERVED_CUSTOM_FEEDS.coston2,
      },
    },
    { class: 'chain', provider: 'FtsoV2', network: chain.name, chainId },
    now(),
  )
}
