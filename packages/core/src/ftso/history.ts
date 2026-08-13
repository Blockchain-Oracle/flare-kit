import {
  type FeedId,
  FTSO_PROTOCOL_ID,
  chainFor,
  randomNumberAbi,
  registryFor,
} from '@flare-kit/contracts'
import { type Observation, isObserved, observe } from '../observation.js'
import type { RoundReader } from '../voting-round.js'
import { type AnchorFeedWithProof, fetchAnchorFeeds } from './anchor.js'

/**
 * Anchor-feed history across a range of voting rounds — M4-R5.
 *
 * The state this file exists for: **the Relay's merkle root outlives the data**.
 * Measured on Coston2, the data-availability host serves leaves back to about
 * round 1130919 — roughly 297 days — while at round 1127919 the root is still
 * set and the leaves are gone.
 *
 * So there is a real, non-erroneous condition in which the chain asserts a
 * commitment for a round whose value can no longer be retrieved. Rendering that
 * as an error would be wrong (nothing failed), and rendering it as a missing
 * value would be wrong (the chain did commit to one). It gets its own state.
 */

export type HistoryPointStatus =
  /** Retrieved and available with its proof. */
  | 'retrieved'
  /**
   * The Relay published a root for this round, but the DA no longer serves the
   * leaf. Not an error and not an absence — the commitment exists.
   */
  | 'committed_not_retrievable'
  /** No root published for this round under FTSO. Nothing was ever committed. */
  | 'not_finalized'
  /** The host could not be asked. Says nothing about the round either way. */
  | 'could_not_ask'

export interface HistoryPoint {
  readonly votingRoundId: bigint
  readonly status: HistoryPointStatus
  /** Present only when `status === 'retrieved'`. */
  readonly feed?: AnchorFeedWithProof
  readonly reason?: string
}

export interface FeedHistory {
  readonly feedId: FeedId
  readonly points: readonly HistoryPoint[]
  /**
   * The oldest round in this range the host actually served, discovered rather
   * than assumed. `undefined` when nothing in the range was retrievable.
   */
  readonly oldestRetrievedRound?: bigint
  /**
   * The newest round in this range that was committed but unretrievable — the
   * observed edge of the retention window. It moves, so it is reported per query
   * and never cached as a constant.
   */
  readonly retentionBoundary?: bigint
}

export interface ReadHistoryInput {
  reader: RoundReader
  chainId: number
  feedId: FeedId
  /** Inclusive. Walked newest first, which is the order a surface reads in. */
  fromRound: bigint
  toRound: bigint
  apiKey?: string
  fetchImpl?: typeof fetch
  now?: () => number
}

/**
 * Walk a round range, classifying every round rather than dropping the ones that
 * did not answer.
 *
 * A missing interval is an explicit point in the series. The spec forbids a
 * chart precisely so that a gap cannot be smoothed into a line between the two
 * values on either side of it — a rendered interpolation across a retention
 * boundary would be an invented price.
 */
export async function readFeedHistory(
  input: ReadHistoryInput,
): Promise<Observation<FeedHistory>> {
  const { feedId } = input
  const now = input.now ?? Date.now
  const points: HistoryPoint[] = []

  for (let round = input.toRound; round >= input.fromRound; round -= 1n) {
    points.push(await readOnePoint(input, round))
  }

  const retrieved = points.filter((point) => point.status === 'retrieved')
  const unretrievable = points.filter((point) => point.status === 'committed_not_retrievable')

  // The same `provider` class the anchor client uses, for the same reason: this
  // is the host's account of a range of rounds, not the chain's. Carrying it
  // means the surface can age the history instead of showing rounds from hours
  // ago with nothing saying so.
  return observe(
    Object.freeze({
      feedId,
      points: Object.freeze(points),
      ...(retrieved.length > 0
        ? { oldestRetrievedRound: retrieved[retrieved.length - 1]?.votingRoundId }
        : {}),
      ...(unretrievable.length > 0 ? { retentionBoundary: unretrievable[0]?.votingRoundId } : {}),
    }),
    {
      class: 'provider',
      provider: 'Data availability host',
      network: chainFor(input.chainId).name,
      chainId: input.chainId,
    },
    now(),
  )
}

/**
 * How many times an absence is confirmed before it is believed.
 *
 * The data-availability host **intermittently serves an empty 200 for a round
 * it demonstrably holds** — measured 2026-08-05, where round 812988 answered
 * empty and then returned a real value on three paced retries seconds later.
 * One absence is therefore not evidence of anything.
 *
 * This matters more here than anywhere else in the module: an unconfirmed
 * absence flows into `classifyByRoot`, and a set Relay root plus a missing leaf
 * is reported as `committed_not_retrievable` — a permanent claim that the value
 * is gone forever. Manufacturing that from a blip is the exact failure the FDC
 * path already guards with "never conclude 'no proof' from a single absence".
 */
const ABSENCE_ATTEMPTS = 3

async function readOnePoint(input: ReadHistoryInput, round: bigint): Promise<HistoryPoint> {
  for (let attempt = 1; attempt <= ABSENCE_ATTEMPTS; attempt += 1) {
    const point = await readOnePointOnce(input, round)
    // Only an absence is retried. A retrieved value is already the answer, and
    // a host that could not be asked at all says nothing either way.
    if (point.status === 'retrieved' || point.status === 'could_not_ask') return point
    if (attempt === ABSENCE_ATTEMPTS) return point
  }
  /* c8 ignore next */
  throw new Error('unreachable')
}

async function readOnePointOnce(input: ReadHistoryInput, round: bigint): Promise<HistoryPoint> {
  try {
    const result = await fetchAnchorFeeds({
      chainId: input.chainId,
      feedIds: [input.feedId],
      votingRoundId: round,
      apiKey: input.apiKey,
      fetchImpl: input.fetchImpl,
    })
    // `fetchAnchorFeeds` throws on a transport or round-mismatch failure and
    // observes otherwise, so an unavailable observation here would be a reader
    // bug rather than a condition about the round. Treated as "no leaf" either
    // way, which is the conservative reading.
    const feed = isObserved(result) ? result.value.found[0] : undefined

    if (feed) return Object.freeze({ votingRoundId: round, status: 'retrieved' as const, feed })

    // Served a 200 with nothing for this feed. Ask the chain what it committed.
    return classifyByRoot(input, round, 'The host served no leaf for this feed in this round.')
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    return classifyByRoot(input, round, reason)
  }
}

/**
 * The chain decides which absence this is.
 *
 * A set root means the round finalized and its value was committed — so a
 * missing leaf is the retention window, not a missing round. A zero root means
 * nothing was ever published. These are different sentences on the surface and
 * the difference is only observable by asking.
 */
async function classifyByRoot(
  input: ReadHistoryInput,
  round: bigint,
  reason: string,
): Promise<HistoryPoint> {
  try {
    const root = (await input.reader.readContract({
      address: registryFor(input.chainId).relay,
      abi: randomNumberAbi as readonly unknown[],
      functionName: 'merkleRoots',
      args: [BigInt(FTSO_PROTOCOL_ID), round],
    })) as string

    const committed = typeof root === 'string' && /[1-9a-f]/i.test(root.slice(2))
    return Object.freeze({
      votingRoundId: round,
      status: committed
        ? ('committed_not_retrievable' as const)
        : ('not_finalized' as const),
      reason,
    })
  } catch (cause) {
    return Object.freeze({
      votingRoundId: round,
      status: 'could_not_ask' as const,
      reason: cause instanceof Error ? cause.message : String(cause),
    })
  }
}
