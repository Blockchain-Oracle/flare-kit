import {
  type AnchorFeedWithProof,
  type FeedHistory,
  type HistoryPointStatus,
  type IncentiveEffect,
  type IncentiveQuote,
  FEED_CATEGORY,
  createMockFtsoReader,
  encodeFeedId,
  observe,
  OBSERVED_INCENTIVE_PRICING,
  priceFor,
  readCustomFeeds,
  readFeedCatalogue,
  readFeeds,
  readSecureRandom,
} from '@flarekit-dev/core'

/**
 * Fixtures for the FTSO surface tests.
 *
 * The catalogue, the readings, the custom feed sets and the random results are
 * produced by running the **real** core functions against `createMockFtsoReader`
 * — the same reader the gallery uses. Hand-written observations would keep
 * agreeing with a broken `readFeeds` forever; these break when it does.
 *
 * Only the conditions the reader cannot produce are written out: a retention
 * boundary, a proof that reverts, a decayed incentive. Each carries the live
 * figure it was measured from on 2026-08-04.
 */

export const NOW = 1_785_872_990_000
export const COSTON2 = 114
export const PAYER = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'

const idFor = (name: string) => encodeFeedId(FEED_CATEGORY.crypto, name)
export const FLR_USD = idFor('FLR/USD')
export const POL_USD = idFor('POL/USD')
const READ_IDS = [FLR_USD, idFor('SGB/USD'), idFor('BTC/USD'), POL_USD]

const reader = createMockFtsoReader()
const mainnetReader = createMockFtsoReader({
  customFeedNames: ['sFLR/USD', 'stXRP/USD', 'stFLR/USD'],
  feeWei: 3n,
})

export const CATALOGUE = await readFeedCatalogue({ reader, chainId: COSTON2, now: () => NOW })
export const READINGS = await readFeeds({
  reader,
  chainId: COSTON2,
  feedIds: READ_IDS,
  now: () => NOW,
})
export const PAID_READINGS = await readFeeds({
  reader: mainnetReader,
  chainId: COSTON2,
  feedIds: READ_IDS,
  account: PAYER,
  now: () => NOW,
})

/**
 * `sFLR/USD` is the one custom feed whose value was read live — 1128983 at 8
 * decimals. The other two were enumerated and never measured, so the mock
 * refuses them rather than answering a zero.
 */
export const CUSTOM_READINGS = await readFeeds({
  reader: mainnetReader,
  chainId: COSTON2,
  feedIds: [encodeFeedId(FEED_CATEGORY.custom, 'sFLR/USD')],
  account: PAYER,
  now: () => NOW,
})
export const CUSTOM_EMPTY = await readCustomFeeds({ reader, chainId: COSTON2, now: () => NOW })
export const CUSTOM_MAINNET = await readCustomFeeds({
  reader: mainnetReader,
  chainId: COSTON2,
  now: () => NOW,
})

export const RANDOM_SECURE = await readSecureRandom({ reader, chainId: COSTON2, now: () => NOW })
export const RANDOM_INSECURE = await readSecureRandom({
  reader,
  chainId: COSTON2,
  votingRoundId: 872_874n,
  now: () => NOW,
})
/** 872874 genuinely reports isSecureRandom = false on Coston2. */
export const RANDOM_REFUSED = await readSecureRandom({
  reader,
  chainId: COSTON2,
  votingRoundId: 872_874n,
  requireSecure: true,
  now: () => NOW,
})

const ENTRIES = CATALOGUE.status === 'observed' ? CATALOGUE.value.entries : []
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

export const UNAVAILABLE = {
  status: 'unavailable' as const,
  reason: 'The RPC endpoint answered 503.',
  source: SOURCE,
  observedAt: NOW - 20_000,
}

/** Six decimals on the anchor path against eight at block latency, both live. */
const ANCHOR_FLR_RAW: AnchorFeedWithProof = {
  body: { votingRoundId: 1_415_859, id: FLR_USD, value: 6_063, turnoutBIPS: 9_412, decimals: 6 },
  proof: [`0x${'4a'.repeat(32)}`, `0x${'9c'.repeat(32)}`],
  name: 'FLR/USD',
}

const point = (round: bigint, status: HistoryPointStatus, value?: number) => ({
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
})

const HISTORY_FULL_RAW: FeedHistory = {
  feedId: FLR_USD,
  points: [point(1_415_859n, 'retrieved', 6_063), point(1_415_858n, 'retrieved', 6_061)],
  oldestRetrievedRound: 1_415_858n,
}

/** The floor the live twelve-step bisection found: 1130920 retrievable, 1130919 not. */
const HISTORY_BOUNDARY_RAW: FeedHistory = {
  feedId: FLR_USD,
  points: [
    point(1_130_920n, 'retrieved', 4_408),
    point(1_130_919n, 'committed_not_retrievable'),
  ],
  oldestRetrievedRound: 1_130_920n,
  retentionBoundary: 1_130_919n,
}

const HISTORY_NONE_RAW: FeedHistory = {
  feedId: FLR_USD,
  points: [point(864_001n, 'not_finalized'), point(864_000n, 'could_not_ask')],
}

/** The third live bisection: accepted at this wei, rejected one wei below. */
const RANGE_INCREASE = 2_433_889_152_438_200_450_873_670_154_321n
/** The measured facts, from the file that owns them — never restated here. */
const RANGE_INCREASE_PRICE = OBSERVED_INCENTIVE_PRICING.rangeIncreasePrice
const PRECISION = OBSERVED_INCENTIVE_PRICING.precision
export const MEASURED_OFFER_WEI = 366_210_937_499_999_999n

export const QUOTE: IncentiveQuote = {
  rangeIncrease: RANGE_INCREASE,
  rangeLimit: RANGE_INCREASE * 8n,
  offerAmountWei: priceFor(RANGE_INCREASE, RANGE_INCREASE_PRICE, PRECISION),
  currentRange: RANGE_INCREASE * 100n,
  expectedSampleSize: 16n,
  durationSeconds: 3_600n,
  precision: PRECISION,
}

/** `sampleSizeIncrease` was 0 in the real mainnet offer. */
export const EFFECT: IncentiveEffect = {
  transactionHash: `0x${'5d'.repeat(32)}`,
  blockNumber: 21_884_002n,
  measuredRangeDelta: RANGE_INCREASE,
  eventRangeIncrease: RANGE_INCREASE,
  eventSampleSizeIncrease: 0n,
  eventOfferAmount: QUOTE.offerAmountWei,
  confirmed: true,
}


/**
 * The observed forms the surfaces take (M4-R9). Wrapped here rather than at each
 * call site so a fixture cannot accidentally be handed over without the
 * provenance the live path carries.
 */
export const ANCHOR_FLR = observe(ANCHOR_FLR_RAW, DA_SOURCE, NOW - 6_000)
export const HISTORY_FULL = observe(HISTORY_FULL_RAW, DA_SOURCE, NOW - 6_000)
export const HISTORY_BOUNDARY = observe(HISTORY_BOUNDARY_RAW, DA_SOURCE, NOW - 6_000)
export const HISTORY_NONE = observe(HISTORY_NONE_RAW, DA_SOURCE, NOW - 6_000)
export const HISTORY_EMPTY = observe(
  { feedId: FLR_USD, points: [] } as FeedHistory,
  DA_SOURCE,
  NOW - 6_000,
)
