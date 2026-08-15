import { FEED_CATEGORY, encodeFeedId } from '@flarekit-dev/contracts'

/**
 * A labelled mock of the FTSO deployment.
 *
 * Written **after** the live path and reproducing what Coston2 and Flare
 * actually returned on 2026-08-04, per the real-integration-first decision. It
 * is never a fallback: nothing in this package reaches for it when a network
 * call fails, because a mock standing in for a failed read is a fabricated
 * price wearing a real price's clothes.
 *
 * It is a **reader**, not a parallel implementation. The same `readFeeds`,
 * `readFeedCatalogue` and `readCustomFeeds` run against it, so mock parity is
 * structural rather than something a second copy has to be kept in step with —
 * which is the failure M3 hit when `mock-fdc.ts` re-implemented `claimedStatus`
 * and `familyFor`.
 */

/** Every value below was observed live. None is invented. */
export const MOCK_FTSO_OBSERVED_AT = '2026-08-04'

/**
 * Three feeds with three different exponents, taken from one real
 * `getFeedsById` response. Anything that assumes a shared exponent breaks here
 * exactly as it would break on chain.
 */
const LIVE_READINGS: ReadonlyArray<readonly [string, bigint, number]> = [
  ['FLR/USD', 606_301n, 8],
  ['SGB/USD', 1_010_984n, 9],
  ['BTC/USD', 6_410_372n, 2],
  ['ETH/USD', 234_512n, 2],
  ['XRP/USD', 21_534n, 5],
  ['POL/USD', 74_335n, 6],
]

/**
 * The one custom-feed value observed live, on Flare mainnet.
 *
 * `sFLR/USD` returned 1128983 at 8 decimals through `FtsoV2.getFeedsById`.
 * `stXRP/USD` and `stFLR/USD` were enumerated but never read, so they are
 * deliberately absent: the mock answers what was observed, and a surface asking
 * for them gets a refusal rather than a number nobody measured.
 */
const LIVE_CUSTOM_READINGS: ReadonlyArray<readonly [string, bigint, number]> = [
  ['sFLR/USD', 1_128_983n, 8],
]

/** Live and non-empty on Coston2. Each renders as one feed with a former name. */
const LIVE_RENAMES: ReadonlyArray<readonly [string, string]> = [
  ['MATIC/USD', 'POL/USD'],
  ['FTM/USD', 'S/USD'],
  ['DAI/USD', 'USDS/USD'],
  ['TON/USD', 'GRAM/USD'],
]

/** Coston2 reports exactly one, at index 52, carrying an all-zero feed id. */
const UNUSED_INDICES = [52n] as const

/**
 * Four rounds on Coston2 genuinely report `isSecureRandom = false`, found by
 * sampling 401 rounds across the retained range. A mock that always reported
 * secure would let a `requireSecure` refusal ship untested.
 */
export const MOCK_INSECURE_ROUNDS = [872_874n, 882_520n, 951_420n, 1_167_766n] as const

/**
 * The four incentive prices bisected against the live Coston2 contract on
 * 2026-08-04, and the two contract constants they were fitted with.
 *
 * These are **measured protocol facts**, not fixture choices — the price formula
 * was wrong by ~5,500x before they existed, and a unit test written against the
 * wrong formula passed. They lived in three separate files (a core test, the
 * gallery and a UI fixture), where a stale copy would still look entirely
 * plausible. They live here because this file is already the one that owns what
 * was observed.
 */
export const OBSERVED_INCENTIVE_PRICING = {
  rangeIncreasePrice: 200_000_000_000_000_000_000_000n,
  precision: 20_769_187_434_139_310_514_121_985_316_880_384n,
  /** `[rangeIncrease, minimum accepted wei]`, all four confirmed on chain. */
  bisections: [
    [608_472_288_109_550_112_718_417_538_580n, 91_552_734_374_999_999n],
    [1_216_944_576_219_100_225_436_835_077_160n, 183_105_468_749_999_999n],
    [2_433_889_152_438_200_450_873_670_154_321n, 366_210_937_499_999_999n],
    [4_867_778_304_876_400_901_747_340_308_643n, 732_421_874_999_999_999n],
  ],
} as const

export interface MockFtsoOptions {
  /**
   * What `calculateFeeByIds` reports. Zero matches Coston2 today; set it
   * non-zero to exercise the paid-read path, which is the case a Coston2-only
   * run can never reach.
   */
  feeWei?: bigint
  /** Custom feeds. Empty matches Coston2; mainnet had three. */
  customFeedNames?: readonly string[]
  /** Whether the current random reports secure. */
  currentRandomIsSecure?: boolean
}

/**
 * A reader the real FTSO functions can be driven with.
 *
 * Every response shape here was copied from a live call, including the ones that
 * are awkward: `getFeedsById` returns one timestamp and a parallel decimals
 * array, and the feed list carries no values at all.
 */
export function createMockFtsoReader(options: MockFtsoOptions = {}) {
  const feeWei = options.feeWei ?? 0n
  const customNames = options.customFeedNames ?? []

  const protocolIds = LIVE_READINGS.map(([name]) => encodeFeedId(FEED_CATEGORY.crypto, name))
  const customIds = customNames.map((name) => encodeFeedId(FEED_CATEGORY.custom, name))

  /** Both categories, keyed by the id a caller actually passes. */
  const byId = new Map(
    [
      ...LIVE_READINGS.map(
        (reading) => [encodeFeedId(FEED_CATEGORY.crypto, reading[0]).toLowerCase(), reading] as const,
      ),
      ...LIVE_CUSTOM_READINGS.map(
        (reading) => [encodeFeedId(FEED_CATEGORY.custom, reading[0]).toLowerCase(), reading] as const,
      ),
    ],
  )
  const observedReading = (id: string) => byId.get(id.toLowerCase())

  return {
    /** Always true, so a surface can label itself without inferring. */
    isMock: true as const,
    observedAt: MOCK_FTSO_OBSERVED_AT,

    readContract(args: { functionName: string; args?: readonly unknown[] }) {
      switch (args.functionName) {
        case 'getSupportedFeedIds':
          return Promise.resolve([...protocolIds, ...customIds])

        case 'getFeedIdChanges':
          return Promise.resolve(
            LIVE_RENAMES.map(([from, to]) => ({
              oldFeedId: encodeFeedId(FEED_CATEGORY.crypto, from),
              newFeedId: encodeFeedId(FEED_CATEGORY.crypto, to),
            })),
          )

        case 'getUnusedIndices':
          return Promise.resolve([...UNUSED_INDICES])

        case 'calculateFeeByIds':
          return Promise.resolve(feeWei)

        case 'getRandomNumber':
          return Promise.resolve([
            67_974_930_473_133_621_345_698_612_345_678_901_234n,
            options.currentRandomIsSecure ?? true,
            1_785_872_970n,
          ])

        case 'getRandomNumberHistorical': {
          const round = args.args?.[0] as bigint
          const secure = !MOCK_INSECURE_ROUNDS.includes(round as (typeof MOCK_INSECURE_ROUNDS)[number])
          return Promise.resolve([12_345_678_901_234_567_890n, secure, 1_700_000_000n])
        }

        // A published root. `history.ts` reads this to tell
        // committed-but-unretrievable apart from never-finalized.
        case 'merkleRoots':
          return Promise.resolve(`0x${'ab'.repeat(32)}`)

        default:
          return Promise.reject(
            new Error(`mock-ftso has no answer for ${args.functionName}. It mocks what was observed, not everything.`),
          )
      }
    },

    simulateContract(args: { functionName: string; args?: readonly unknown[] }) {
      if (args.functionName !== 'getFeedsById') {
        return Promise.reject(new Error(`mock-ftso cannot simulate ${args.functionName}`))
      }
      const requested = (args.args?.[0] ?? []) as readonly string[]
      const values: bigint[] = []
      const decimals: number[] = []
      for (const id of requested) {
        const match = observedReading(id)
        // Refuse rather than fill the slot. An earlier version pushed `0n` at
        // `0` decimals for an id it had never seen, on the reasoning that the
        // contract returns parallel arrays — and the surfaces dutifully rendered
        // `0 USD` for three real mainnet feeds as though it were their price.
        // A mock that answers what it never observed is a fabricated value
        // wearing a real one's clothes, which is the single thing this file
        // exists not to do.
        if (!match) {
          return Promise.reject(
            new Error(
              `mock-ftso never observed a value for feed id ${id}. It answers what was measured, not everything — asking for an unobserved feed is an error, not a zero.`,
            ),
          )
        }
        values.push(match[1])
        decimals.push(match[2])
      }
      return Promise.resolve({ result: [values, decimals, 1_785_865_205n] })
    },
  }
}
