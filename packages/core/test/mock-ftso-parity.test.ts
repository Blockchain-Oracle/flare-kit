import { describe, expect, it } from 'vitest'
import { FEED_CATEGORY, encodeFeedId } from '@flare-kit/contracts'
import { MOCK_INSECURE_ROUNDS, createMockFtsoReader } from '../src/mock-ftso.js'
import { readFeeds, listSupportedFeedIds } from '../src/ftso/feeds.js'
import { readFeedCatalogue } from '../src/ftso/catalogue.js'
import { readCustomFeeds } from '../src/ftso/custom-feeds.js'
import { isRefusal, readSecureRandom } from '../src/ftso/random.js'
import { formatExact } from '../src/amounts.js'
import { isObserved } from '../src/observation.js'

/**
 * The mock exists to be driven by the **real** functions.
 *
 * M3's `mock-fdc.ts` re-implemented `claimedStatus` and `familyFor`, which meant
 * two copies of the status rules and one that nothing would have updated. So
 * every assertion below runs production code against the mock reader; if the
 * mock and the live path ever diverge in shape, these fail rather than a second
 * implementation quietly agreeing with itself.
 */

const CHAIN_ID = 114
const FLARE = 14
const FLR = encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD')
const SGB = encodeFeedId(FEED_CATEGORY.crypto, 'SGB/USD')
const BTC = encodeFeedId(FEED_CATEGORY.crypto, 'BTC/USD')

describe('the mock is driven by production code', () => {
  it('reproduces three different exponents from one response', async () => {
    const reader = createMockFtsoReader()
    const result = await readFeeds({ reader, chainId: CHAIN_ID, feedIds: [FLR, SGB, BTC] })
    if (!isObserved(result)) throw new Error('expected an observation')

    // Exactly the live values: 8, 9 and 2 decimals in one batch. Anything that
    // assumes a shared exponent breaks here as it would on chain.
    expect(result.value.readings.map((r) => r.decimals)).toEqual([8, 9, 2])
    expect(formatExact(result.value.readings[0]!.price)).toBe('0.00606301 USD')
    expect(formatExact(result.value.readings[1]!.price)).toBe('0.001010984 USD')
    expect(formatExact(result.value.readings[2]!.price)).toBe('64103.72 USD')
  })

  it('carries the four real renames through the catalogue', async () => {
    const catalogue = await readFeedCatalogue({ reader: createMockFtsoReader(), chainId: CHAIN_ID })
    if (!isObserved(catalogue)) throw new Error('expected an observation')

    const pol = catalogue.value.entries.find((e) => e.name === 'POL/USD')
    expect(pol?.formerName).toBe('MATIC/USD')
    expect(catalogue.value.renames).toHaveLength(4)
    expect(catalogue.value.unusedIndices).toEqual([52n])
  })

  it('exercises the paid-read path a Coston2 run can never reach', async () => {
    // The fee is zero on Coston2 today, so the only way to test that a non-zero
    // quote is actually attached — and that it needs a payer — is here.
    const reader = createMockFtsoReader({ feeWei: 3n })
    await expect(readFeeds({ reader, chainId: CHAIN_ID, feedIds: [FLR] })).rejects.toMatchObject({
      code: 'FTSO_FEE_NEEDS_PAYER',
    })

    const paid = await readFeeds({
      reader,
      chainId: CHAIN_ID,
      feedIds: [FLR],
      account: '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9',
    })
    if (!isObserved(paid)) throw new Error('expected an observation')
    expect(paid.value.fee.wei).toBe(3n)
  })

  it('reproduces both custom-feed sets: empty and populated', async () => {
    const coston2 = await readCustomFeeds({ reader: createMockFtsoReader(), chainId: CHAIN_ID })
    if (!isObserved(coston2)) throw new Error('expected an observation')
    expect(coston2.value.entries).toEqual([])

    const mainnet = await readCustomFeeds({
      reader: createMockFtsoReader({ customFeedNames: ['sFLR/USD', 'stXRP/USD', 'stFLR/USD'] }),
      chainId: FLARE,
    })
    if (!isObserved(mainnet)) throw new Error('expected an observation')
    expect(mainnet.value.entries.map((e) => e.name)).toEqual(['sFLR/USD', 'stXRP/USD', 'stFLR/USD'])
    for (const entry of mainnet.value.entries) expect(entry.trust).toBe('custom')
  })

  it('reproduces the four genuinely-insecure rounds', async () => {
    for (const round of MOCK_INSECURE_ROUNDS) {
      const result = await readSecureRandom({
        reader: createMockFtsoReader(),
        chainId: CHAIN_ID,
        votingRoundId: round,
        requireSecure: true,
      })
      if (!isObserved(result)) throw new Error('expected an observation')
      expect(isRefusal(result.value)).toBe(true)
    }
  })

  it('reports a secure round as secure', async () => {
    const result = await readSecureRandom({
      reader: createMockFtsoReader(),
      chainId: CHAIN_ID,
      votingRoundId: 1_400_000n,
      requireSecure: true,
    })
    if (!isObserved(result)) throw new Error('expected an observation')
    expect(isRefusal(result.value)).toBe(false)
  })

  it('labels itself, so a surface never has to infer that it is mocked', () => {
    const reader = createMockFtsoReader()
    expect(reader.isMock).toBe(true)
    expect(reader.observedAt).toBe('2026-08-04')
  })

  /**
   * The mock covers what was observed, not everything. An unmocked call is a
   * loud error rather than a plausible default — a silent zero here would be a
   * fabricated protocol value, which is the thing the mock exists not to do.
   */
  it('refuses to invent an answer it never observed', async () => {
    const reader = createMockFtsoReader()
    await expect(
      reader.readContract({ functionName: 'somethingNeverObserved' }),
    ).rejects.toThrow(/no answer for/)
  })

  it('drops the unused index through the same filter the live path uses', async () => {
    const ids = await listSupportedFeedIds(createMockFtsoReader(), CHAIN_ID)
    expect(ids.every((id) => id !== `0x${'00'.repeat(21)}`)).toBe(true)
  })
})
