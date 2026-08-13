import {
  type AnchorFeedWithProof,
  type FeedHistory,
  type HistoryPointStatus,
  FEED_CATEGORY,
  createMockFtsoReader,
  encodeFeedId,
  observe,
  readFeedCatalogue,
  readFeeds,
} from '@flare-kit/core'

/**
 * Every value the M4 gallery renders.
 *
 * The catalogue and the readings are **driven through the real core functions**
 * against `createMockFtsoReader()`, never hand-written as observations. That is
 * the whole point of the mock being a reader rather than a second
 * implementation: if `readFeeds` stops resolving a renamed id, or starts caching
 * one decimals value per feed, this gallery breaks in exactly the way the live
 * path would. A hand-built observation would keep looking correct through both.
 *
 * The states the reader cannot produce — a retention boundary, a proof that
 * reverts, a refused random — are hand-built below, because they are conditions
 * of the network rather than of the read. Each carries the live figure it was
 * taken from.
 */

export const M4_NOW = 1_785_872_990_000
export const COSTON2 = 114

const idFor = (name: string) => encodeFeedId(FEED_CATEGORY.crypto, name)

export const FLR_USD = idFor('FLR/USD')
const BTC_USD = idFor('BTC/USD')
const POL_USD = idFor('POL/USD')
const SGB_USD = idFor('SGB/USD')

/** Every feed the mock deployment lists, so `BASE` is genuinely the happy path. */
const READ_IDS = [FLR_USD, SGB_USD, BTC_USD, idFor('ETH/USD'), idFor('XRP/USD'), POL_USD]

/** The Coston2 signing account, used only to satisfy the payable-read guard. */
export const PAYER = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'

/** Coston2's real shape: protocol feeds only, no custom ones, fee zero. */
const coston2Reader = createMockFtsoReader()
/** Flare mainnet's: the three registered custom feeds, and a non-zero fee. */
const mainnetReader = createMockFtsoReader({
  customFeedNames: ['sFLR/USD', 'stXRP/USD', 'stFLR/USD'],
  feeWei: 3n,
})

export const CATALOGUE = await readFeedCatalogue({
  reader: coston2Reader,
  chainId: COSTON2,
  now: () => M4_NOW - 9_000,
})

export const READINGS = await readFeeds({
  reader: coston2Reader,
  chainId: COSTON2,
  feedIds: READ_IDS,
  now: () => M4_NOW - 4_000,
})

export const CUSTOM_CATALOGUE = await readFeedCatalogue({
  reader: mainnetReader,
  chainId: COSTON2,
  now: () => M4_NOW - 9_000,
})

/**
 * A read that actually costs something, quoted at 3 wei and paid.
 *
 * The zero-fee case on Coston2 hides two real failures: a payable call with no
 * account runs as `from = 0x0` and cannot cover the value, and viem's
 * `readContract` drops a `value` silently. Driving one paid read here is the
 * only way this gallery exercises either.
 */
export const PAID_READINGS = await readFeeds({
  reader: mainnetReader,
  chainId: COSTON2,
  feedIds: READ_IDS,
  account: PAYER,
  now: () => M4_NOW - 4_000,
})

const ENTRIES = CATALOGUE.status === 'observed' ? CATALOGUE.value.entries : []

/** The row a detail screen opens onto, taken from the driven catalogue. */
export const entryFor = (name: string) => ENTRIES.find((entry) => entry.name === name)!

/** The provenance the live anchor path now carries, mirrored in the fixtures. */
export const DA_SOURCE = {
  class: 'provider' as const,
  provider: 'Data availability host',
  network: 'Flare Testnet Coston2',
  chainId: COSTON2,
}

export const SOURCE = {
  class: 'chain' as const,
  provider: 'FtsoV2',
  network: 'Coston2',
  chainId: COSTON2,
}

export const CATALOGUE_UNAVAILABLE = {
  status: 'unavailable' as const,
  reason: 'The RPC endpoint answered 503 for three consecutive attempts.',
  source: SOURCE,
  observedAt: M4_NOW - 20_000,
}

export const READINGS_UNAVAILABLE = {
  status: 'unavailable' as const,
  reason: 'getFeedsById reverted: the payable read was sent without a payer.',
  source: SOURCE,
  observedAt: M4_NOW - 20_000,
}

/**
 * FLR/USD at round 1415859 on the anchor path, at **six** decimals — against
 * the block-latency path's eight for the same asset, both measured live. The two
 * are not comparable as integers, which is the fact FTSO-02 exists to render.
 */
const ANCHOR_FLR_RAW: AnchorFeedWithProof = {
  body: { votingRoundId: 1_415_859, id: FLR_USD, value: 6_063, turnoutBIPS: 9_412, decimals: 6 },
  proof: [`0x${'4a'.repeat(32)}`, `0x${'9c'.repeat(32)}`, `0x${'e1'.repeat(32)}`],
  name: 'FLR/USD',
}

/** A round whose tree held one leaf. No siblings is valid, not truncated. */
const ANCHOR_SINGLE_LEAF_RAW: AnchorFeedWithProof = {
  ...ANCHOR_FLR_RAW,
  body: { ...ANCHOR_FLR_RAW.body, votingRoundId: 1_415_402 },
  proof: [],
}

/** A visibly divergent pair, for the conflicting-source case. */
const ANCHOR_DIVERGENT_RAW: AnchorFeedWithProof = {
  ...ANCHOR_FLR_RAW,
  body: { ...ANCHOR_FLR_RAW.body, value: 9_988, votingRoundId: 1_411_002 },
}

const REASONS: Partial<Record<HistoryPointStatus, string>> = {
  could_not_ask: 'The host answered 502. That says nothing about the round either way.',
  committed_not_retrievable:
    'The Relay still publishes a root for this round; the host no longer serves the leaf.',
}

function point(round: bigint, status: HistoryPointStatus, value?: number) {
  const reason = REASONS[status]
  return {
    votingRoundId: round,
    status,
    ...(value === undefined
      ? {}
      : {
          feed: {
            body: {
              votingRoundId: Number(round),
              id: FLR_USD,
              value,
              turnoutBIPS: 9_388,
              decimals: 6,
            },
            proof: [`0x${'4a'.repeat(32)}` as const],
            name: 'FLR/USD',
          },
        }),
    ...(reason === undefined ? {} : { reason }),
  }
}

const HISTORY_FULL_RAW: FeedHistory = {
  feedId: FLR_USD,
  points: [
    point(1_415_859n, 'retrieved', 6_063),
    point(1_415_858n, 'retrieved', 6_061),
    point(1_415_857n, 'retrieved', 6_058),
    point(1_415_856n, 'retrieved', 6_070),
  ],
  oldestRetrievedRound: 1_415_856n,
}

/**
 * The boundary sits inside the range: retrievable above it, committed and gone
 * below. Rounds taken from the live twelve-step bisection, which put the floor
 * at 1130919 with 1130920 retrievable.
 */
const HISTORY_BOUNDARY_RAW: FeedHistory = {
  feedId: FLR_USD,
  points: [
    point(1_130_921n, 'retrieved', 4_412),
    point(1_130_920n, 'retrieved', 4_408),
    point(1_130_919n, 'committed_not_retrievable'),
    point(1_130_918n, 'committed_not_retrievable'),
  ],
  oldestRetrievedRound: 1_130_920n,
  retentionBoundary: 1_130_919n,
}

/** All three non-retrieved answers at once, so none of them can be conflated. */
const HISTORY_NONE_RAW: FeedHistory = {
  feedId: FLR_USD,
  points: [
    point(864_002n, 'committed_not_retrievable'),
    point(864_001n, 'not_finalized'),
    point(864_000n, 'could_not_ask'),
  ],
  retentionBoundary: 864_002n,
}


/**
 * The observed forms the surfaces take (M4-R9). Wrapped here rather than at each
 * call site so a fixture cannot accidentally be handed over without the
 * provenance the live path carries.
 */
export const ANCHOR_FLR = observe(ANCHOR_FLR_RAW, DA_SOURCE, M4_NOW - 6_000)
export const ANCHOR_SINGLE_LEAF = observe(ANCHOR_SINGLE_LEAF_RAW, DA_SOURCE, M4_NOW - 6_000)
export const ANCHOR_DIVERGENT = observe(ANCHOR_DIVERGENT_RAW, DA_SOURCE, M4_NOW - 6_000)
export const HISTORY_FULL = observe(HISTORY_FULL_RAW, DA_SOURCE, M4_NOW - 6_000)
export const HISTORY_BOUNDARY = observe(HISTORY_BOUNDARY_RAW, DA_SOURCE, M4_NOW - 6_000)
export const HISTORY_NONE = observe(HISTORY_NONE_RAW, DA_SOURCE, M4_NOW - 6_000)
export const HISTORY_EMPTY = observe(
  { feedId: FLR_USD, points: [] } as FeedHistory,
  DA_SOURCE,
  M4_NOW - 6_000,
)
/** A history the host could not be asked for at all. */
export const HISTORY_UNAVAILABLE = {
  status: 'unavailable' as const,
  reason: 'The data-availability host answered 502 for every round in the range.',
  source: DA_SOURCE,
  observedAt: M4_NOW - 30_000,
}
