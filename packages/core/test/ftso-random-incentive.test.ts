import { describe, expect, it } from 'vitest'
import { FEED_CATEGORY, encodeFeedId } from '@flarekit-dev/contracts'
import { isRefusal, readSecureRandom } from '../src/ftso/random.js'
import { assertOfferWithinLimit, priceFor, quoteIncentive } from '../src/ftso/incentive.js'
import { confirmIncentiveEffect, isEffectExpired } from '../src/ftso/incentive-effect.js'
import { CUSTOM_FEED_CREATION, readCustomFeeds } from '../src/ftso/custom-feeds.js'
import { isObserved } from '../src/observation.js'

const CHAIN_ID = 114
const FLARE = 14

describe('M4-AC6 — requireSecure refuses instead of returning a value', () => {
  /** Four rounds on Coston2 genuinely report isSecureRandom = false. */
  const INSECURE_ROUNDS = [872_874n, 882_520n, 951_420n, 1_167_766n]

  function reader(isSecure: boolean) {
    return { readContract: () => Promise.resolve([123_456n, isSecure, 1_785_000_000n]) }
  }

  it('returns a typed refusal naming the reason, and no value', async () => {
    for (const round of INSECURE_ROUNDS) {
      const result = await readSecureRandom({
        reader: reader(false),
        chainId: CHAIN_ID,
        votingRoundId: round,
        requireSecure: true,
      })
      if (!isObserved(result)) throw new Error('expected an observation')

      expect(isRefusal(result.value)).toBe(true)
      if (!isRefusal(result.value)) return
      expect(result.value.reason).toContain('not secure')
      expect(result.value.votingRoundId).toBe(round)
      // The whole point: there is no value to reach for.
      expect('value' in result.value).toBe(false)
    }
  })

  it('returns the value when the random is secure', async () => {
    const result = await readSecureRandom({
      reader: reader(true),
      chainId: CHAIN_ID,
      requireSecure: true,
    })
    if (!isObserved(result)) throw new Error('expected an observation')
    expect(isRefusal(result.value)).toBe(false)
    if (isRefusal(result.value)) return
    expect(result.value.value).toBe(123_456n)
    expect(result.value.isSecure).toBe(true)
  })

  /**
   * Without the option, an insecure value is still returned — but never without
   * its flag. A surface that hardcoded "secure" would eventually lie.
   */
  it('surfaces isSecure=false rather than hiding it when not required', async () => {
    const result = await readSecureRandom({ reader: reader(false), chainId: CHAIN_ID })
    if (!isObserved(result)) throw new Error('expected an observation')
    expect(isRefusal(result.value)).toBe(false)
    if (isRefusal(result.value)) return
    expect(result.value.isSecure).toBe(false)
  })

  it('reads the Relay, which is where RandomNumberV2 lives', async () => {
    const calls: string[] = []
    const recording = {
      readContract(args: { functionName: string }) {
        calls.push(args.functionName)
        return Promise.resolve([1n, true, 1n])
      },
    }
    await readSecureRandom({ reader: recording, chainId: CHAIN_ID })
    await readSecureRandom({ reader: recording, chainId: CHAIN_ID, votingRoundId: 900_000n })
    expect(calls).toEqual(['getRandomNumber', 'getRandomNumberHistorical'])
  })
})

describe('M4-R7 — an incentive is priced for the offer being made', () => {
  function reader(values: Record<string, bigint>) {
    return {
      readContract: (args: { functionName: string }) =>
        Promise.resolve(values[args.functionName] ?? 0n),
    }
  }

  it('prices this offer, not a generic one', async () => {
    const state = {
      getRange: 1_000n,
      getExpectedSampleSize: 16n,
      getIncentiveDuration: 3_600n,
      rangeIncreasePrice: 1_425n,
      rangeIncreaseLimit: 5_000n,
      getPrecision: 1_000n,
    }
    const small = await quoteIncentive({ reader: reader(state), chainId: CHAIN_ID, rangeIncrease: 10n })
    const large = await quoteIncentive({ reader: reader(state), chainId: CHAIN_ID, rangeIncrease: 100n })

    // A constant price would make these equal. The offer is the input.
    expect(small.offerAmountWei).not.toBe(large.offerAmountWei)
    expect(large.offerAmountWei).toBeGreaterThan(small.offerAmountWei)
    expect(small.rangeIncrease).toBe(10n)
    expect(small.durationSeconds).toBe(3_600n)
  })

  /**
   * The strongest test in this file: the four minimum-accepted amounts bisected
   * against the live Coston2 contract on 2026-08-04. The formula must reproduce
   * every one exactly.
   *
   * A formula priced against `getRange()` instead of `getPrecision()` passes any
   * test written against itself and overstates these by ~5,500x — on mainnet it
   * would ask somebody to sign away 2000 FLR for a 0.37 FLR purchase. Only
   * driving the real contract caught it, which is why the fixtures are real.
   */
  it('reproduces every live-bisected minimum exactly', () => {
    const RANGE_INCREASE_PRICE = 200_000_000_000_000_000_000_000n
    const PRECISION = 20_769_187_434_139_310_514_121_985_316_880_384n

    const MEASURED: ReadonlyArray<readonly [bigint, bigint]> = [
      [608_472_288_109_550_112_718_417_538_580n, 91_552_734_374_999_999n],
      [1_216_944_576_219_100_225_436_835_077_160n, 183_105_468_749_999_999n],
      [2_433_889_152_438_200_450_873_670_154_321n, 366_210_937_499_999_999n],
      [4_867_778_304_876_400_901_747_340_308_643n, 732_421_874_999_999_999n],
    ]
    for (const [rangeIncrease, minimumAccepted] of MEASURED) {
      expect(priceFor(rangeIncrease, RANGE_INCREASE_PRICE, PRECISION)).toBe(minimumAccepted)
    }
  })

  it('refuses to price against a zero precision rather than dividing by it', () => {
    expect(() => priceFor(1n, 1n, 0n)).toThrow(
      expect.objectContaining({ code: 'FTSO_INCENTIVE_PRECISION_ZERO' }),
    )
  })

  it('refuses an offer above the contract limit before anything is signed', async () => {
    const quote = await quoteIncentive({
      reader: reader({
        getRange: 1_000n,
        rangeIncreasePrice: 1n,
        rangeIncreaseLimit: 50n,
        getPrecision: 1_000n,
      }),
      chainId: CHAIN_ID,
      rangeIncrease: 100n,
    })
    expect(() => assertOfferWithinLimit(quote)).toThrow(
      expect.objectContaining({ code: 'FTSO_INCENTIVE_ABOVE_LIMIT', valueMoved: 'no' }),
    )
  })
})

describe('M4-AC7 — confirmation is pinned to the offer’s own block', () => {
  /** Ranges keyed by block, so a later read genuinely shows the decay. */
  function reader(rangeByBlock: Record<string, bigint>) {
    return {
      readContract: (args: { blockNumber?: bigint }) =>
        Promise.resolve(rangeByBlock[String(args.blockNumber)] ?? 0n),
    }
  }

  it('confirms when the measured delta equals the event’s rangeIncrease', async () => {
    const effect = await confirmIncentiveEffect({
      reader: reader({ '66637468': 1_000n, '66637469': 1_500n }),
      chainId: FLARE,
      transactionHash: `0x${'44'.repeat(32)}`,
      blockNumber: 66_637_469n,
      event: { rangeIncrease: 500n, sampleSizeIncrease: 0n, offerAmount: 1n },
    })
    expect(effect.measuredRangeDelta).toBe(500n)
    expect(effect.confirmed).toBe(true)
  })

  /**
   * The effect decays: mainnet's range was back to base hours after a real
   * offer. Reading a later block must not be able to call a real offer failed —
   * so the read is pinned, and this proves the pin by giving the later block a
   * decayed value that is never consulted.
   */
  it('reads the offer’s own block, so a decayed range cannot read as failure', async () => {
    const rangeByBlock = { '66637468': 1_000n, '66637469': 1_500n, '66700000': 1_000n }
    const effect = await confirmIncentiveEffect({
      reader: reader(rangeByBlock),
      chainId: FLARE,
      transactionHash: `0x${'44'.repeat(32)}`,
      blockNumber: 66_637_469n,
      event: { rangeIncrease: 500n, sampleSizeIncrease: 0n, offerAmount: 1n },
    })
    expect(effect.confirmed).toBe(true)
  })

  /** sampleSizeIncrease was 0 in the real mainnet offer. Report it as zero. */
  it('reports a zero sample-size increase as zero, not as absent', async () => {
    const effect = await confirmIncentiveEffect({
      reader: reader({ '99': 10n, '100': 20n }),
      chainId: FLARE,
      transactionHash: `0x${'44'.repeat(32)}`,
      blockNumber: 100n,
      event: { rangeIncrease: 10n, sampleSizeIncrease: 0n, offerAmount: 5n },
    })
    expect(effect.eventSampleSizeIncrease).toBe(0n)
  })

  it('treats an elapsed duration as expired, which is a normal end state', () => {
    expect(isEffectExpired(1_000n, 3_600n, 4_601n)).toBe(true)
    expect(isEffectExpired(1_000n, 3_600n, 4_600n)).toBe(false)
  })
})

describe('M4-AC8 — custom feeds are read-only and network-named', () => {
  const SFLR = encodeFeedId(FEED_CATEGORY.custom, 'sFLR/USD')
  const STXRP = encodeFeedId(FEED_CATEGORY.custom, 'stXRP/USD')
  const STFLR = encodeFeedId(FEED_CATEGORY.custom, 'stFLR/USD')
  const FLR = encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD')
  /** The malformed entry getCustomFeeds() returns on mainnet. */
  const MALFORMED = '0x000000000000000000000000d1002f3820ad32145b'

  const reader = (supported: readonly string[]) => ({
    readContract: () => Promise.resolve(supported),
  })

  it('derives the set from getSupportedFeedIds, not getCustomFeeds', async () => {
    // getCustomFeeds() would give [sFLR, MALFORMED, stXRP] — wrong twice over.
    const result = await readCustomFeeds({
      reader: reader([FLR, SFLR, STXRP, STFLR]),
      chainId: FLARE,
    })
    if (!isObserved(result)) throw new Error('expected an observation')
    expect(result.value.entries.map((e) => e.name)).toEqual([
      'sFLR/USD',
      'stXRP/USD',
      'stFLR/USD',
    ])
  })

  it('never admits the malformed category-0x00 entry', async () => {
    const result = await readCustomFeeds({ reader: reader([SFLR, MALFORMED]), chainId: FLARE })
    if (!isObserved(result)) throw new Error('expected an observation')
    expect(result.value.entries).toHaveLength(1)
  })

  it('renders an empty set as an honest dated observation, not an error', async () => {
    const result = await readCustomFeeds({ reader: reader([FLR]), chainId: CHAIN_ID })
    if (!isObserved(result)) throw new Error('expected an observation')

    expect(result.value.entries).toEqual([])
    expect(result.value.network).toBe('Flare Testnet Coston2')
    expect(result.value.previouslyObserved.at).toBe('2026-08-04')
    expect(result.value.previouslyObserved.names).toEqual([])
  })

  it('names the network on the surface, because the set is network-specific', async () => {
    const coston2 = await readCustomFeeds({ reader: reader([FLR]), chainId: CHAIN_ID })
    const flare = await readCustomFeeds({ reader: reader([SFLR]), chainId: FLARE })
    if (!isObserved(coston2) || !isObserved(flare)) throw new Error('expected observations')
    expect(coston2.value.network).not.toBe(flare.value.network)
    expect(flare.value.previouslyObserved.names).toContain('stFLR/USD')
  })

  it('marks every entry custom and none directly readable', async () => {
    const result = await readCustomFeeds({ reader: reader([SFLR, STXRP]), chainId: FLARE })
    if (!isObserved(result)) throw new Error('expected an observation')
    for (const entry of result.value.entries) {
      expect(entry.trust).toBe('custom')
      // No vendored interface maps a feed id back to a contract address.
      expect(entry.directContractReadable).toBe(false)
    }
  })

  it('declares creation blocked with the governance reason attached', () => {
    expect(CUSTOM_FEED_CREATION.status).toBe('blocked')
    expect(CUSTOM_FEED_CREATION.reason).toContain('governance-gated')
  })
})
