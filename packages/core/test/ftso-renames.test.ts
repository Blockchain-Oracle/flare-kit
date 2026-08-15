import { describe, expect, it } from 'vitest'
import { FEED_CATEGORY, encodeFeedId } from '@flarekit-dev/contracts'
import { readFeeds } from '../src/ftso/feeds.js'
import { readFeedCatalogue } from '../src/ftso/catalogue.js'
import { isObserved } from '../src/observation.js'

/**
 * M4-R10 and M4-AC1's third clause, both of which correctness review found
 * uncovered.
 *
 * The defect this file exists for was confirmed live on Coston2:
 * `getFeedsById([MATIC/USD, POL/USD])` returns **74335 for both**, because
 * `FtsoV2` silently resolves a retired id to its current feed. Labelling a
 * reading with the id the caller supplied therefore renders POL/USD's price
 * under the name `MATIC/USD` — a real price under a name it does not belong to,
 * and invisible in testing precisely because the number is correct.
 */

const CHAIN_ID = 114
const MATIC = encodeFeedId(FEED_CATEGORY.crypto, 'MATIC/USD')
const POL = encodeFeedId(FEED_CATEGORY.crypto, 'POL/USD')
const FLR = encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD')

/** The four renames the deployment actually reports. */
const LIVE_RENAMES = [
  ['MATIC/USD', 'POL/USD'],
  ['FTM/USD', 'S/USD'],
  ['DAI/USD', 'USDS/USD'],
  ['TON/USD', 'GRAM/USD'],
].map(([from, to]) => ({
  oldFeedId: encodeFeedId(FEED_CATEGORY.crypto, from!),
  newFeedId: encodeFeedId(FEED_CATEGORY.crypto, to!),
}))

function fakeReader(options: {
  supported?: readonly string[]
  renames?: readonly { oldFeedId: string; newFeedId: string }[]
  feeds?: readonly [readonly bigint[], readonly number[], bigint]
  unusedIndices?: readonly bigint[]
} = {}) {
  return {
    readContract(args: { functionName: string }) {
      switch (args.functionName) {
        case 'getSupportedFeedIds':
          return Promise.resolve(options.supported ?? [FLR, POL])
        case 'getFeedIdChanges':
          return Promise.resolve(options.renames ?? LIVE_RENAMES)
        case 'getUnusedIndices':
          return Promise.resolve(options.unusedIndices ?? [52n])
        case 'calculateFeeByIds':
          return Promise.resolve(0n)
        default:
          return Promise.reject(new Error(`unexpected ${args.functionName}`))
      }
    },
    simulateContract() {
      return Promise.resolve({
        result: options.feeds ?? [[74_335n], [6], 1_785_865_205n],
      })
    },
  }
}

describe('M4-R10 — a retired id reads as the feed it became', () => {
  it('labels the reading with the current feed, not the id asked for', async () => {
    const reader = fakeReader()
    const result = await readFeeds({ reader, chainId: CHAIN_ID, feedIds: [MATIC] })
    if (!isObserved(result)) throw new Error('expected an observation')

    const [reading] = result.value.readings
    // The value really is POL/USD's — the contract resolved it — so the name
    // must be POL/USD too.
    expect(reading?.name).toBe('POL/USD')
    expect(reading?.feedId).toBe(POL)
    expect(reading?.rawValue).toBe(74_335n)
  })

  it('carries the requested id as a former name rather than discarding it', async () => {
    const reader = fakeReader()
    const result = await readFeeds({ reader, chainId: CHAIN_ID, feedIds: [MATIC] })
    if (!isObserved(result)) throw new Error('expected an observation')

    const [reading] = result.value.readings
    expect(reading?.formerName).toBe('MATIC/USD')
    expect(reading?.requestedFeedId).toBe(MATIC)
  })

  it('leaves a feed that was never renamed unmarked', async () => {
    const reader = fakeReader({ feeds: [[606_301n], [8], 1_785_865_205n] })
    const result = await readFeeds({ reader, chainId: CHAIN_ID, feedIds: [FLR] })
    if (!isObserved(result)) throw new Error('expected an observation')

    const [reading] = result.value.readings
    expect(reading?.name).toBe('FLR/USD')
    expect(reading?.formerName).toBeUndefined()
    expect(reading?.requestedFeedId).toBeUndefined()
  })

  it('accepts renames from the caller instead of re-reading them', async () => {
    const reader = fakeReader({
      renames: [{ oldFeedId: '0xdead', newFeedId: '0xbeef' }], // would be wrong if used
    })
    const result = await readFeeds({
      reader,
      chainId: CHAIN_ID,
      feedIds: [MATIC],
      renames: [{ from: 'MATIC/USD', to: 'POL/USD', oldFeedId: MATIC, newFeedId: POL }],
    })
    if (!isObserved(result)) throw new Error('expected an observation')
    expect(result.value.readings[0]?.name).toBe('POL/USD')
  })
})

describe('a paid read needs somebody to pay it', () => {
  it('refuses a non-zero fee with no account rather than calling as 0x0', async () => {
    const reader = {
      ...fakeReader(),
      readContract(args: { functionName: string }) {
        if (args.functionName === 'calculateFeeByIds') return Promise.resolve(3n)
        return fakeReader().readContract(args)
      },
    }
    await expect(
      readFeeds({ reader, chainId: CHAIN_ID, feedIds: [FLR] }),
    ).rejects.toMatchObject({ code: 'FTSO_FEE_NEEDS_PAYER', valueMoved: 'no' })
  })

  it('proceeds when an account is supplied', async () => {
    const reader = {
      ...fakeReader({ feeds: [[606_301n], [8], 1n] }),
      readContract(args: { functionName: string }) {
        if (args.functionName === 'calculateFeeByIds') return Promise.resolve(3n)
        return fakeReader().readContract(args)
      },
    }
    const result = await readFeeds({
      reader,
      chainId: CHAIN_ID,
      feedIds: [FLR],
      account: '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9',
    })
    expect(isObserved(result)).toBe(true)
  })

  it('does not require an account when the read is free', async () => {
    const result = await readFeeds({ reader: fakeReader(), chainId: CHAIN_ID, feedIds: [FLR] })
    expect(isObserved(result)).toBe(true)
  })
})

describe('M4-AC1 — the catalogue joins renames onto entries', () => {
  it('shows each renamed feed once, carrying its former name', async () => {
    const reader = fakeReader({ supported: [FLR, POL] })
    const catalogue = await readFeedCatalogue({ reader, chainId: CHAIN_ID })
    if (!isObserved(catalogue)) throw new Error('expected an observation')

    const pol = catalogue.value.entries.find((entry) => entry.name === 'POL/USD')
    expect(pol?.formerName).toBe('MATIC/USD')

    // And never as two rows: the retired id is not in getSupportedFeedIds.
    expect(catalogue.value.entries.filter((e) => e.name === 'MATIC/USD')).toHaveLength(0)
    expect(catalogue.value.entries).toHaveLength(2)
  })

  it('leaves a feed that was never renamed without a former name', async () => {
    const reader = fakeReader({ supported: [FLR, POL] })
    const catalogue = await readFeedCatalogue({ reader, chainId: CHAIN_ID })
    if (!isObserved(catalogue)) throw new Error('expected an observation')
    expect(catalogue.value.entries.find((e) => e.name === 'FLR/USD')?.formerName).toBeUndefined()
  })

  it('states the unused index rather than silently dropping it', async () => {
    const reader = fakeReader({ supported: [FLR, POL] })
    const catalogue = await readFeedCatalogue({ reader, chainId: CHAIN_ID })
    if (!isObserved(catalogue)) throw new Error('expected an observation')
    // 63 feeds against a 64-entry configuration array is otherwise unexplained.
    expect(catalogue.value.unusedIndices).toEqual([52n])
  })

  it('classifies a custom feed as custom and never as protocol-equivalent', async () => {
    const sflr = encodeFeedId(FEED_CATEGORY.custom, 'sFLR/USD')
    const reader = fakeReader({ supported: [FLR, sflr] })
    const catalogue = await readFeedCatalogue({ reader, chainId: CHAIN_ID })
    if (!isObserved(catalogue)) throw new Error('expected an observation')

    expect(catalogue.value.entries.find((e) => e.name === 'sFLR/USD')?.trust).toBe('custom')
    expect(catalogue.value.entries.find((e) => e.name === 'FLR/USD')?.trust).toBe('protocol')
    expect(catalogue.value.customFeedCount).toBe(1)
  })
})
