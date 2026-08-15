import {
  type FeedId,
  chainFor,
  decodeFeedId,
  ftsoRegistryFor,
  ftsoV2Abi,
  isRenderableFeedId,
} from '@flarekit-dev/contracts'
import { type Amount, amount } from '../amounts.js'
import { FlareKitError } from '../errors.js'
import { type Observation, observe } from '../observation.js'
import type { RoundReader } from '../voting-round.js'
import { type FeedFeeQuote, assertFeeWithinCeiling, quoteFeedFee } from './fee.js'

/**
 * Block-latency feed reads — M4-R1.
 *
 * The rule this file exists to enforce: **decimals belong to a reading, not to a
 * feed.** `FLR/USD` is 8 decimals through `FtsoV2.getFeedById` and 6 on the
 * anchor path, on both networks. A decimals value cached against the feed id and
 * reused across paths is wrong by two orders of magnitude on the first feed
 * anyone looks at, and it is wrong *quietly* — the number still renders.
 *
 * So every reading below carries the exponent that came back with it, in the
 * same response, and there is no per-feed decimals cache anywhere in this
 * module to be tempted by.
 */

/** Which path a reading came from. Never inferred, never merged. */
export type FeedPath = 'block-latency' | 'anchor'

export interface FeedReading {
  /** The feed the value actually belongs to, after rename resolution. */
  readonly feedId: FeedId
  readonly name: string
  readonly category: number
  /**
   * The id the caller asked for, when it differs from `feedId`.
   *
   * `FtsoV2.getFeedsById` **silently resolves a retired id to its current
   * feed**: on Coston2, `getFeedsById([MATIC/USD, POL/USD])` returns `74335`
   * for both. Labelling the reading with the requested id would therefore print
   * POL/USD's price under the name `MATIC/USD` — a real number under a name it
   * does not belong to, invisible in testing precisely because the number is
   * right. M4-R10's "one feed carrying a former name" is this pair of fields.
   */
  readonly requestedFeedId?: FeedId
  readonly formerName?: string
  /**
   * The exact value with its own exponent, as an `Amount`. The quote asset is
   * the feed's own — `FLR/USD` is priced in USD — so it renders with its unit
   * and full precision rather than as a bare number.
   */
  readonly price: Amount
  /** The raw integer and exponent, kept so a proof body can be rebuilt exactly. */
  readonly rawValue: bigint
  readonly decimals: number
  readonly timestampSeconds: bigint
  readonly path: FeedPath
}

/**
 * A reader that can actually pay.
 *
 * `getFeedsById` is `payable`, and viem's `readContract` has no `value`
 * parameter — passing one is silently dropped, the call goes out with zero, and
 * it reverts on any network where the fee is not zero. Which is to say it would
 * work on Coston2 and fail on mainnet, the worst possible split.
 *
 * `simulateContract` does carry `value`, and for a payable *view* it is exactly
 * an `eth_call` with funds attached: it returns the value without spending
 * anything or needing a signer.
 */
export interface PayableReader extends RoundReader {
  simulateContract(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
    value?: bigint
    account?: `0x${string}`
  }): Promise<{ result: unknown }>
}

export interface ReadFeedsInput {
  reader: PayableReader
  chainId: number
  feedIds: readonly FeedId[]
  /** Refuse rather than spend above this. Omit to accept whatever it costs. */
  maxFeeWei?: bigint
  /**
   * Who pays. Required once the fee is non-zero.
   *
   * An `eth_call` carrying a `value` runs as `from = 0x0` when no account is
   * given, and go-flare checks `balance >= value` — so the read fails with an
   * insufficient-funds error instead of returning the feed. The fee is zero on
   * Coston2 today, which hides this completely, and it is governance-settable.
   */
  account?: `0x${string}`
  /**
   * Renames already known to the caller, to save a round trip. Omitted means
   * this function reads them itself: resolving them is not optional.
   */
  renames?: readonly FeedRename[]
  now?: () => number
}

export interface FeedReadResult {
  readonly readings: readonly FeedReading[]
  readonly fee: FeedFeeQuote
}

/**
 * A feed's quote asset, from its name.
 *
 * Every registered feed is a `BASE/QUOTE` pair, so the quote is the half after
 * the slash. A name without one keeps the whole name as its unit rather than
 * guessing USD — an invented unit on an exact value is the kind of quiet lie
 * CLAUDE.md forbids.
 */
export function quoteAssetOf(name: string): string {
  const slash = name.lastIndexOf('/')
  return slash === -1 ? name : name.slice(slash + 1)
}

/**
 * Read a batch of feeds at block latency.
 *
 * The fee is quoted for this exact batch and paid as `value`; a caller ceiling
 * refuses before anything is sent. `getFeedsById` returns one timestamp for the
 * batch and one decimals **per feed**, which is why the decimals array is zipped
 * positionally here and never looked up by id.
 */
export async function readFeeds(input: ReadFeedsInput): Promise<Observation<FeedReadResult>> {
  const { reader, chainId, feedIds } = input
  const now = input.now ?? Date.now
  const registry = ftsoRegistryFor(chainId)
  const chain = chainFor(chainId)

  const renames = input.renames ?? (await readFeedRenames(reader, chainId))
  const currentIdFor = new Map(renames.map((rename) => [rename.oldFeedId, rename]))

  const fee = await quoteFeedFee(reader, chainId, feedIds)
  if (input.maxFeeWei !== undefined) assertFeeWithinCeiling(fee, input.maxFeeWei)
  assertPayerForFee(fee.wei, input.account)

  // The quote is what the contract will require, and attaching it is the whole
  // point of quoting rather than assuming.
  const { result } = await reader.simulateContract({
    address: registry.ftsoV2,
    abi: ftsoV2Abi as readonly unknown[],
    functionName: 'getFeedsById',
    args: [feedIds],
    value: fee.wei,
    ...(input.account === undefined ? {} : { account: input.account }),
  })
  const raw = result as readonly [readonly bigint[], readonly number[], bigint]

  const [values, decimalsList, timestampSeconds] = raw
  const readings: FeedReading[] = []

  for (const [index, requestedId] of feedIds.entries()) {
    const rawValue = values[index]
    const decimals = decimalsList[index]
    if (rawValue === undefined || decimals === undefined) continue

    // The contract read whatever the id resolves to today, so the reading is
    // labelled with that feed and carries the requested id as the former name.
    const rename = currentIdFor.get(requestedId)
    const feedId = rename?.newFeedId ?? requestedId
    const { name, category } = decodeFeedId(feedId)

    readings.push(
      Object.freeze({
        feedId,
        name,
        category,
        rawValue,
        decimals,
        price: amount(rawValue, decimals, quoteAssetOf(name)),
        timestampSeconds,
        path: 'block-latency' as const,
        ...(rename === undefined
          ? {}
          : { requestedFeedId: requestedId, formerName: rename.from }),
      }),
    )
  }

  return observe(
    { readings: Object.freeze(readings), fee },
    { class: 'chain', provider: 'FtsoV2', network: chain.name, chainId },
    now(),
  )
}

/**
 * Refuse a paid read with nobody to pay it.
 *
 * Attempting it produces an insufficient-funds error from the node, which reads
 * as "the chain is broken" rather than "you did not say who pays". Refusing
 * first names the actual problem, and nothing is sent either way.
 */
function assertPayerForFee(feeWei: bigint, account?: `0x${string}`): void {
  if (feeWei === 0n || account !== undefined) return
  throw new FlareKitError('FTSO_FEE_NEEDS_PAYER', {
    domain: 'input',
    message: `This read costs ${feeWei} wei and no account was given to pay it. A call carrying value runs as 0x0 without one, which has no balance.`,
    recovery: 'safe_to_retry',
    valueMoved: 'no',
    evidence: { feeWei: feeWei.toString() },
  })
}

/**
 * Every feed the deployment actually serves.
 *
 * `FtsoV2.getSupportedFeedIds()` — 63 on Coston2, 66 on Flare, the extra three
 * being mainnet's custom feeds.
 *
 * **Not `FastUpdatesConfiguration.getFeedIds()`**, which returns 64 entries on
 * both networks and is a storage array with recycled slots rather than a feed
 * list: `getUnusedIndices()` is `[52]`, and index 52 carries an all-zero id
 * whose decoded name is empty. That id reverts when read, so admitting it here
 * would put a row on the catalogue that fails the moment anyone touches it.
 * `isRenderableFeedId` is the belt to that braces — a malformed id from any
 * source is dropped rather than rendered blank.
 */
export async function listSupportedFeedIds(
  reader: RoundReader,
  chainId: number,
): Promise<readonly FeedId[]> {
  const ids = (await reader.readContract({
    address: ftsoRegistryFor(chainId).ftsoV2,
    abi: ftsoV2Abi as readonly unknown[],
    functionName: 'getSupportedFeedIds',
  })) as readonly FeedId[]

  return Object.freeze(ids.filter(isRenderableFeedId))
}

export interface FeedRename {
  readonly from: string
  readonly to: string
  readonly oldFeedId: FeedId
  readonly newFeedId: FeedId
}

/**
 * Feeds that have been renamed — M4-R10.
 *
 * Live and non-empty on Coston2: `MATIC/USD → POL/USD`, `FTM/USD → S/USD`,
 * `DAI/USD → USDS/USD`, `TON/USD → GRAM/USD`. The catalogue presents each as one
 * feed carrying a former name. Showing both ids as separate rows would claim the
 * deployment serves two feeds where it serves one, and someone reconciling a
 * stored id against today's list needs to be told it moved, not that it vanished.
 */
export async function readFeedRenames(
  reader: RoundReader,
  chainId: number,
): Promise<readonly FeedRename[]> {
  const changes = (await reader.readContract({
    address: ftsoRegistryFor(chainId).ftsoV2,
    abi: ftsoV2Abi as readonly unknown[],
    functionName: 'getFeedIdChanges',
  })) as readonly { oldFeedId: FeedId; newFeedId: FeedId }[]

  return Object.freeze(
    changes.map((change) =>
      Object.freeze({
        from: decodeFeedId(change.oldFeedId).name,
        to: decodeFeedId(change.newFeedId).name,
        oldFeedId: change.oldFeedId,
        newFeedId: change.newFeedId,
      }),
    ),
  )
}
