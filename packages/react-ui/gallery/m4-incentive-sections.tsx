import {
  type IncentiveEffect,
  type IncentiveQuote,
  createMockFtsoReader,
  OBSERVED_INCENTIVE_PRICING,
  priceFor,
  readCustomFeeds,
  readFeeds,
} from '@flarekit-dev/core'
import { CustomFeedReview, type ExcludedCustomFeed, IncentiveComposer } from '@flarekit-dev/react-ui'
import type { GallerySection } from './m3-sections'
import { COSTON2, M4_NOW, PAYER, SOURCE } from './m4-fixtures'

/**
 * FTSO-05 and FTSO-06, in every state the M4 spec requires.
 *
 * The incentive numbers are the **live-bisected** ones: a range increase of
 * 2433889152438200450873670154321 was accepted at 366210937499999999 wei and
 * rejected one wei below, on Coston2 on 2026-08-04. The amount is computed here
 * by `priceFor` rather than typed in, so a change to the formula changes this
 * screen instead of leaving it agreeing with a stale constant.
 *
 * FTSO-06's excluded entries are the real mainnet artifacts of
 * `FtsoV2.getCustomFeeds()` — the category-`0x00` entry that decodes to nothing
 * and reverts on read. They are shown as *reported and not rendered as feeds*,
 * with the source named, because a surface that silently dropped them would be
 * hiding a disagreement between two enumeration sources.
 */

/** The measured facts, from the file that owns them — never restated here. */
const RANGE_INCREASE_PRICE = OBSERVED_INCENTIVE_PRICING.rangeIncreasePrice
const PRECISION = OBSERVED_INCENTIVE_PRICING.precision
const RANGE_INCREASE = 2_433_889_152_438_200_450_873_670_154_321n

const QUOTE: IncentiveQuote = {
  rangeIncrease: RANGE_INCREASE,
  rangeLimit: RANGE_INCREASE * 8n,
  offerAmountWei: priceFor(RANGE_INCREASE, RANGE_INCREASE_PRICE, PRECISION),
  currentRange: RANGE_INCREASE * 100n,
  expectedSampleSize: 16n,
  durationSeconds: 3_600n,
  precision: PRECISION,
}

const OVER_LIMIT: IncentiveQuote = { ...QUOTE, rangeLimit: RANGE_INCREASE / 2n }

const TX: `0x${string}` = `0x${'5d'.repeat(32)}`

/** `sampleSizeIncrease` was 0 in the real mainnet offer. Rendered as exactly that. */
const EFFECT_CONFIRMED: IncentiveEffect = {
  transactionHash: TX,
  blockNumber: 21_884_002n,
  measuredRangeDelta: RANGE_INCREASE,
  eventRangeIncrease: RANGE_INCREASE,
  eventSampleSizeIncrease: 0n,
  eventOfferAmount: QUOTE.offerAmountWei,
  confirmed: true,
}

/** Another offer landed in the same block, so the delta cannot be attributed. */
const EFFECT_UNATTRIBUTED: IncentiveEffect = {
  ...EFFECT_CONFIRMED,
  measuredRangeDelta: RANGE_INCREASE * 2n,
  confirmed: false,
}

const coston2Reader = createMockFtsoReader()
const mainnetReader = createMockFtsoReader({
  customFeedNames: ['sFLR/USD', 'stXRP/USD', 'stFLR/USD'],
  feeWei: 3n,
})

/** Coston2 genuinely has none. An honest empty state, not an error. */
const CUSTOM_EMPTY = await readCustomFeeds({
  reader: coston2Reader,
  chainId: COSTON2,
  now: () => M4_NOW - 6_000,
})
const CUSTOM_MAINNET = await readCustomFeeds({
  reader: mainnetReader,
  chainId: COSTON2,
  now: () => M4_NOW - 6_000,
})

/**
 * Only `sFLR/USD` was ever read live; the other two were enumerated and never
 * measured. Asking the mock for them is a refusal by design, so the surface
 * shows one real value beside two honest "no value came back" rows — which is
 * also the AVAIL state this screen has to render anyway.
 */
const CUSTOM_IDS =
  CUSTOM_MAINNET.status === 'observed'
    ? CUSTOM_MAINNET.value.entries.filter((e) => e.name === 'sFLR/USD').map((e) => e.feedId)
    : []

/**
 * The payer is not decoration. This mock quotes a 3 wei fee, and `readFeeds`
 * refuses a paid read with no account — an `eth_call` carrying value runs as
 * `from = 0x0`, which has no balance, so it would fail on chain. The first run
 * of this gallery threw exactly that, which is the argument for driving the real
 * function instead of hand-writing the observation.
 */
const CUSTOM_READINGS = await readFeeds({
  reader: mainnetReader,
  chainId: COSTON2,
  feedIds: CUSTOM_IDS,
  account: PAYER,
  now: () => M4_NOW - 4_000,
})

const CUSTOM_UNAVAILABLE = {
  status: 'unavailable' as const,
  reason: 'getSupportedFeedIds reverted on this node.',
  source: SOURCE,
  observedAt: M4_NOW - 25_000,
}

const EXCLUDED: readonly ExcludedCustomFeed[] = [
  {
    feedId: '0x000000000000000000000000d1002f3820ad32145b',
    condition: 'invalid_metadata',
    reportedBy: 'FtsoV2.getCustomFeeds()',
    detail:
      'Category 0x00 with no decodable name, and absent from getSupportedFeedIds(). Rendering it as a feed would put a nameless row beside three real ones.',
  },
  {
    feedId: '0x21734654657374466565642f555344000000000000',
    condition: 'activation_pending',
    reportedBy: 'FtsoV2.getCustomFeeds()',
    detail:
      'Reported by one enumeration source and not yet in the supported set. Until it is there, FtsoV2.getFeedsById cannot read it.',
  },
  {
    feedId: '0x21646561644665656400000000000000000000000',
    condition: 'reverts_on_read',
    reportedBy: 'FtsoV2.getCustomFeeds()',
    detail:
      'Both getFeedById and calculateFeeById revert for this id. It is listed and it is not readable, which are two different facts.',
  },
]

export const M4_INCENTIVE_SECTIONS: GallerySection[] = [
  {
    id: 'ftso-05',
    title: 'FTSO-05 IncentiveComposer',
    cases: [
      { name: 'loading', node: <IncentiveComposer loading nativeAsset="C2FLR" now={M4_NOW} /> },
      {
        name: 'PLAN — quoted, no signer connected',
        node: <IncentiveComposer quote={QUOTE} nativeAsset="C2FLR" now={M4_NOW} />,
      },
      {
        name: 'AUTH — payer connected, ready to sign',
        node: (
          <IncentiveComposer
            quote={QUOTE}
            payer={PAYER}
            nativeAsset="C2FLR"
            now={M4_NOW}
            onSubmit={() => {}}
            onRequote={() => {}}
          />
        ),
      },
      {
        name: 'AVAIL — this deployment is not accepting offers',
        node: (
          <IncentiveComposer
            quote={QUOTE}
            eligible={false}
            ineligibleReason="The incentive manager reports the range is already at its limit for this epoch."
            payer={PAYER}
            nativeAsset="C2FLR"
            now={M4_NOW}
          />
        ),
      },
      {
        name: 'fee stale — the range moved under the quote',
        node: (
          <IncentiveComposer
            quote={QUOTE}
            payer={PAYER}
            quoteStale
            nativeAsset="C2FLR"
            now={M4_NOW}
            onRequote={() => {}}
          />
        ),
      },
      {
        name: 'not eligible — increase above the contract limit',
        node: (
          <IncentiveComposer quote={OVER_LIMIT} payer={PAYER} nativeAsset="C2FLR" now={M4_NOW} />
        ),
      },
      {
        name: 'OP submitted — accepted, never rendered as succeeded',
        node: (
          <IncentiveComposer
            quote={QUOTE}
            payer={PAYER}
            state="submitted"
            transactionHash={TX}
            nativeAsset="C2FLR"
            now={M4_NOW}
          />
        ),
      },
      {
        name: 'effect confirmed — sampleSizeIncrease is zero',
        node: (
          <IncentiveComposer
            quote={QUOTE}
            payer={PAYER}
            state="succeeded"
            transactionHash={TX}
            effect={EFFECT_CONFIRMED}
            nativeAsset="C2FLR"
            now={M4_NOW}
          />
        ),
      },
      {
        name: 'effect expired — a decayed widening, not a failed offer',
        node: (
          <IncentiveComposer
            quote={QUOTE}
            payer={PAYER}
            state="succeeded"
            transactionHash={TX}
            effect={EFFECT_CONFIRMED}
            effectExpired
            nativeAsset="C2FLR"
            now={M4_NOW}
          />
        ),
      },
      {
        name: 'effect could not be attributed — an unknown, not a failure',
        node: (
          <IncentiveComposer
            quote={QUOTE}
            payer={PAYER}
            state="succeeded"
            transactionHash={TX}
            effect={EFFECT_UNATTRIBUTED}
            nativeAsset="C2FLR"
            now={M4_NOW}
          />
        ),
      },
    ],
  },
  {
    id: 'ftso-06',
    title: 'FTSO-06 CustomFeedReview',
    cases: [
      { name: 'loading', node: <CustomFeedReview loading now={M4_NOW} /> },
      {
        name: 'empty set on this network — dated, and not an error',
        node: <CustomFeedReview feeds={CUSTOM_EMPTY} now={M4_NOW} />,
      },
      {
        name: 'BASE — three registered feeds, read through FtsoV2',
        node: (
          <CustomFeedReview feeds={CUSTOM_MAINNET} readings={CUSTOM_READINGS} now={M4_NOW} />
        ),
      },
      {
        name: 'AVAIL — listed, and their updater returned nothing',
        node: <CustomFeedReview feeds={CUSTOM_MAINNET} now={M4_NOW} />,
      },
      {
        name: 'invalid metadata, activation pending, reverts on read',
        node: (
          <CustomFeedReview
            feeds={CUSTOM_MAINNET}
            readings={CUSTOM_READINGS}
            excluded={EXCLUDED}
            now={M4_NOW}
          />
        ),
      },
      {
        name: 'typed error — the set could not be read',
        node: <CustomFeedReview feeds={CUSTOM_UNAVAILABLE} now={M4_NOW} />,
      },
    ],
  },
]
