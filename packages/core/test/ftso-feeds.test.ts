import { describe, expect, it } from 'vitest'
import { FEED_CATEGORY, encodeFeedId, ftsoRegistryFor } from '@flare-kit/contracts'
import { listSupportedFeedIds, quoteAssetOf, readFeeds, readFeedRenames } from '../src/ftso/feeds.js'
import { assertFeeWithinCeiling, quoteFeedFee } from '../src/ftso/fee.js'
import { formatExact } from '../src/amounts.js'
import { isObserved } from '../src/observation.js'

/**
 * M4-AC1, M4-AC2, M4-AC3.
 *
 * The fixtures are the values the live networks actually returned on
 * 2026-08-04, so these assert against the chain's behaviour rather than against
 * the implementation's.
 */

const CHAIN_ID = 114
const FLR_USD = encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD')
const BTC_USD = encodeFeedId(FEED_CATEGORY.crypto, 'BTC/USD')
const PAYER = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as const

/** The unused slot at FastUpdatesConfiguration index 52. Reverts when read. */
const UNUSED_INDEX_52 = `0x${'00'.repeat(21)}`
/** The category-0x00 entry mainnet getCustomFeeds() returns. Also reverts. */
const MALFORMED_CUSTOM = '0x000000000000000000000000d1002f3820ad32145b'

interface FakeOptions {
  supported?: readonly string[]
  /** [values, decimals, timestamp] exactly as getFeedsById returns them. */
  feeds?: readonly [readonly bigint[], readonly number[], bigint]
  ftsoV2Fee?: bigint
  feeCalculatorFee?: bigint | 'revert'
  renames?: readonly { oldFeedId: string; newFeedId: string }[]
}

function fakeReader(options: FakeOptions = {}) {
  const registry = ftsoRegistryFor(CHAIN_ID)
  const paidValues: bigint[] = []

  return {
    paidValues,
    readContract(args: { address: string; functionName: string }) {
      if (args.functionName === 'getSupportedFeedIds') {
        return Promise.resolve(options.supported ?? [FLR_USD, BTC_USD])
      }
      if (args.functionName === 'getFeedIdChanges') return Promise.resolve(options.renames ?? [])
      if (args.functionName === 'calculateFeeByIds') {
        if (args.address === registry.feeCalculator) {
          if (options.feeCalculatorFee === 'revert') return Promise.reject(new Error('reverted'))
          return Promise.resolve(options.feeCalculatorFee ?? options.ftsoV2Fee ?? 0n)
        }
        return Promise.resolve(options.ftsoV2Fee ?? 0n)
      }
      return Promise.reject(new Error(`unexpected read ${args.functionName}`))
    },
    simulateContract(args: { functionName: string; value?: bigint }) {
      if (args.functionName !== 'getFeedsById') {
        return Promise.reject(new Error(`unexpected simulate ${args.functionName}`))
      }
      paidValues.push(args.value ?? 0n)
      return Promise.resolve({
        result: options.feeds ?? [[606301n, 11_012_345n], [8, 2], 1_785_865_205n],
      })
    },
  }
}

describe('M4-AC1 — enumeration comes from getSupportedFeedIds', () => {
  it('never admits the unused index as a row', async () => {
    const reader = fakeReader({ supported: [FLR_USD, UNUSED_INDEX_52, BTC_USD] })
    expect(await listSupportedFeedIds(reader, CHAIN_ID)).toEqual([FLR_USD, BTC_USD])
  })

  it('never admits the malformed category-0x00 custom entry', async () => {
    const reader = fakeReader({ supported: [FLR_USD, MALFORMED_CUSTOM] })
    expect(await listSupportedFeedIds(reader, CHAIN_ID)).toEqual([FLR_USD])
  })

  it('presents a renamed feed as one feed with a former name', async () => {
    const reader = fakeReader({
      renames: [
        {
          oldFeedId: encodeFeedId(FEED_CATEGORY.crypto, 'MATIC/USD'),
          newFeedId: encodeFeedId(FEED_CATEGORY.crypto, 'POL/USD'),
        },
      ],
    })
    const renames = await readFeedRenames(reader, CHAIN_ID)
    expect(renames).toHaveLength(1)
    expect(renames[0]).toMatchObject({ from: 'MATIC/USD', to: 'POL/USD' })
  })
})

describe('M4-AC2 — decimals belong to the reading, not to the feed', () => {
  it('scales each feed by the exponent that came back with it', async () => {
    // FLR/USD at 8 decimals and BTC/USD at 2, in one response — the shape
    // getFeedsById actually returns.
    const reader = fakeReader({ feeds: [[606301n, 11_012_345n], [8, 2], 1_785_865_205n] })
    const result = await readFeeds({ reader, chainId: CHAIN_ID, feedIds: [FLR_USD, BTC_USD] })

    expect(isObserved(result)).toBe(true)
    if (!isObserved(result)) return
    const [flr, btc] = result.value.readings

    expect(flr?.decimals).toBe(8)
    expect(btc?.decimals).toBe(2)
    expect(formatExact(flr!.price)).toBe('0.00606301 USD')
    expect(formatExact(btc!.price)).toBe('110123.45 USD')
  })

  /**
   * The failure this guards is quiet: the anchor path reports FLR/USD at 6 and
   * the block-latency path at 8. Reusing one exponent for the other renders a
   * number that still looks like a price and is wrong by 100x.
   */
  it('marks which path a reading came from so the two cannot be merged', async () => {
    const reader = fakeReader()
    const result = await readFeeds({ reader, chainId: CHAIN_ID, feedIds: [FLR_USD, BTC_USD] })
    if (!isObserved(result)) throw new Error('expected an observation')
    for (const reading of result.value.readings) expect(reading.path).toBe('block-latency')
  })

  it('carries the raw integer alongside, so a proof body can be rebuilt exactly', async () => {
    const reader = fakeReader()
    const result = await readFeeds({ reader, chainId: CHAIN_ID, feedIds: [FLR_USD, BTC_USD] })
    if (!isObserved(result)) throw new Error('expected an observation')
    expect(result.value.readings[0]?.rawValue).toBe(606301n)
  })

  it('names the quote asset from the feed rather than assuming USD', () => {
    expect(quoteAssetOf('FLR/USD')).toBe('USD')
    expect(quoteAssetOf('BTC/EUR')).toBe('EUR')
    // No pair separator: keep the whole name rather than inventing a unit.
    expect(quoteAssetOf('SOMETHING')).toBe('SOMETHING')
  })
})

describe('M4-AC3 — the fee sent is the fee quoted', () => {
  it('pays exactly what FtsoV2 quoted for these exact ids', async () => {
    const reader = fakeReader({ ftsoV2Fee: 0n })
    await readFeeds({ reader, chainId: CHAIN_ID, feedIds: [FLR_USD, BTC_USD] })
    expect(reader.paidValues).toEqual([0n])
  })

  /**
   * The zero-today case must not be able to hide an assumption, so this asserts
   * a non-zero quote is actually attached to the call.
   */
  it('pays a non-zero fee when one is quoted', async () => {
    const reader = fakeReader({ ftsoV2Fee: 3n })
    // A paid read needs a payer: a call carrying value with no `from` runs as
    // 0x0, which has no balance, so the node rejects it for insufficient funds.
    await readFeeds({ reader, chainId: CHAIN_ID, feedIds: [FLR_USD, BTC_USD], account: PAYER })
    expect(reader.paidValues).toEqual([3n])
  })

  it('quotes from FtsoV2, which is what guards the read', async () => {
    // Mainnet's real disagreement: FtsoV2 says 0, FeeCalculator says 3.
    const reader = fakeReader({ ftsoV2Fee: 0n, feeCalculatorFee: 3n })
    const quote = await quoteFeedFee(reader, CHAIN_ID, [FLR_USD])
    expect(quote.wei).toBe(0n)
    expect(quote.quotedFrom).toBe('ftsoV2')
    // The disagreement is reported, not resolved by picking a winner.
    expect(quote.secondOpinionWei).toBe(3n)
  })

  it('survives FeeCalculator reverting, which is the normal custom-category case', async () => {
    const reader = fakeReader({ ftsoV2Fee: 0n, feeCalculatorFee: 'revert' })
    const quote = await quoteFeedFee(reader, CHAIN_ID, [FLR_USD])
    expect(quote.wei).toBe(0n)
    expect(quote.secondOpinionWei).toBeUndefined()
  })

  it('omits the second opinion when the two oracles agree', async () => {
    const reader = fakeReader({ ftsoV2Fee: 5n, feeCalculatorFee: 5n })
    const quote = await quoteFeedFee(reader, CHAIN_ID, [FLR_USD])
    expect(quote.secondOpinionWei).toBeUndefined()
  })
})

describe('a ceiling refuses rather than spends', () => {
  it('throws before anything is sent, reporting that nothing moved', async () => {
    const reader = fakeReader({ ftsoV2Fee: 100n })
    await expect(
      readFeeds({ reader, chainId: CHAIN_ID, feedIds: [FLR_USD], maxFeeWei: 99n }),
    ).rejects.toMatchObject({ code: 'FTSO_FEE_ABOVE_CEILING', valueMoved: 'no' })
    expect(reader.paidValues).toEqual([])
  })

  it('permits a fee exactly at the ceiling', () => {
    const quote = { feedIds: [FLR_USD], wei: 100n, quotedFrom: 'ftsoV2' as const }
    expect(() => assertFeeWithinCeiling(quote, 100n)).not.toThrow()
  })

  it('accepts whatever it costs when no ceiling is given', async () => {
    const reader = fakeReader({ ftsoV2Fee: 10_000n })
    await readFeeds({ reader, chainId: CHAIN_ID, feedIds: [FLR_USD], account: PAYER })
    expect(reader.paidValues).toEqual([10_000n])
  })
})
