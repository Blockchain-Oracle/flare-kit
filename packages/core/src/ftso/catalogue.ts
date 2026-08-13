import {
  type FeedId,
  FEED_CATEGORY,
  chainFor,
  decodeFeedId,
  ftsoRegistryFor,
  fastUpdatesConfigurationAbi,
} from '@flare-kit/contracts'
import { type Observation, observe } from '../observation.js'
import type { RoundReader } from '../voting-round.js'
import { type FeedRename, listSupportedFeedIds, readFeedRenames } from './feeds.js'

/**
 * What FTSO-01 renders: every feed the selected deployment serves, plus the two
 * artefacts of the configuration that a naive listing would either hide or turn
 * into a broken row.
 *
 * The catalogue is deliberately *metadata only*. Values arrive separately
 * through `readFeeds`, because a value costs a fee and carries its own decimals
 * and timestamp — folding them together here would invite exactly the per-feed
 * decimals cache M4-R1 forbids.
 */

export type FeedTrustClass =
  /** Registered protocol feed, category 0x01. */
  | 'protocol'
  /**
   * Contributed and governance-registered, category 0x21. Read-only here, and
   * never presented as protocol-equivalent: a custom feed's value comes from a
   * contract somebody else deployed under a governance approval, which is a
   * different claim from a value the FTSO providers voted on.
   */
  | 'custom'

export interface CatalogueEntry {
  readonly feedId: FeedId
  readonly name: string
  readonly category: number
  readonly trust: FeedTrustClass
  /**
   * The name this feed used to have, when the deployment reports a rename.
   * Present so a stored id that no longer resolves reads as "it moved" rather
   * than "it vanished".
   */
  readonly formerName?: string
}

export interface FeedCatalogue {
  readonly network: string
  readonly chainId: number
  readonly entries: readonly CatalogueEntry[]
  readonly renames: readonly FeedRename[]
  /**
   * Indices `FastUpdatesConfiguration` reports as unused — `[52]` on both
   * networks as of 2026-08-04.
   *
   * Carried as a stated fact rather than silently dropped. `getFeedIds()`
   * returns 64 entries and index 52 holds an all-zero id that reverts when
   * read; a catalogue that just filtered it would leave a reader wondering why
   * the count is 63 against a configuration that says 64.
   */
  readonly unusedIndices: readonly bigint[]
  readonly customFeedCount: number
}

export interface ReadCatalogueInput {
  reader: RoundReader
  chainId: number
  now?: () => number
}

function trustOf(category: number): FeedTrustClass {
  return category === FEED_CATEGORY.custom ? 'custom' : 'protocol'
}

/**
 * Build the catalogue from the deployment.
 *
 * Enumeration is `getSupportedFeedIds()`. The unused indices are read from
 * `FastUpdatesConfiguration` purely so the surface can *explain* the gap between
 * 63 feeds and a 64-entry configuration array — they are never a source of feeds.
 */
export async function readFeedCatalogue(
  input: ReadCatalogueInput,
): Promise<Observation<FeedCatalogue>> {
  const { reader, chainId } = input
  const now = input.now ?? Date.now
  const chain = chainFor(chainId)

  const [feedIds, renames, unusedIndices] = await Promise.all([
    listSupportedFeedIds(reader, chainId),
    readFeedRenames(reader, chainId),
    readUnusedIndices(reader, chainId),
  ])

  const formerNameByNewId = new Map(renames.map((rename) => [rename.newFeedId, rename.from]))

  const entries = feedIds.map((feedId) => {
    const { name, category } = decodeFeedId(feedId)
    const formerName = formerNameByNewId.get(feedId)
    return Object.freeze({
      feedId,
      name,
      category,
      trust: trustOf(category),
      ...(formerName === undefined ? {} : { formerName }),
    })
  })

  return observe(
    {
      network: chain.name,
      chainId,
      entries: Object.freeze(entries),
      renames,
      unusedIndices,
      customFeedCount: entries.filter((entry) => entry.trust === 'custom').length,
    },
    { class: 'chain', provider: 'FtsoV2', network: chain.name, chainId },
    now(),
  )
}

/**
 * Best-effort: the catalogue is still honest without it. A deployment that does
 * not answer this leaves the gap unexplained rather than unlisted, which is the
 * better failure — an empty array here never removes or invents a feed.
 */
async function readUnusedIndices(
  reader: RoundReader,
  chainId: number,
): Promise<readonly bigint[]> {
  try {
    const indices = (await reader.readContract({
      address: ftsoRegistryFor(chainId).fastUpdatesConfiguration,
      abi: fastUpdatesConfigurationAbi as readonly unknown[],
      functionName: 'getUnusedIndices',
    })) as readonly bigint[]
    return Object.freeze([...indices])
  } catch {
    return Object.freeze([])
  }
}
