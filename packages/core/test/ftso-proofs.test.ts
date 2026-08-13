import { describe, expect, it } from 'vitest'
import { FEED_CATEGORY, encodeFeedId } from '@flare-kit/contracts'
import { fetchAnchorFeeds } from '../src/ftso/anchor.js'
import { isProven, verifyAnchorFeed } from '../src/ftso/verify.js'
import { readFeedHistory } from '../src/ftso/history.js'
import { isObserved } from '../src/observation.js'

/**
 * M4-AC4 and M4-AC5, as regression cover for what the live run proved on
 * 2026-08-04 against Coston2. The fixtures are that run's real responses.
 */

const CHAIN_ID = 114
const FLR = encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD')
const BTC = encodeFeedId(FEED_CATEGORY.crypto, 'BTC/USD')
const ROUND = 1_415_900

const FLR_BODY = { votingRoundId: ROUND, id: FLR, value: 6062, turnoutBIPS: 9999, decimals: 6 }
const BTC_BODY = { votingRoundId: ROUND, id: BTC, value: 6_396_131, turnoutBIPS: 9999, decimals: 2 }
const PROOF: readonly `0x${string}`[] = [`0x${'70'.repeat(32)}`, `0x${'8b'.repeat(32)}`]

function jsonResponse(payload: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response)
}

describe('the anchor host has three ways to answer wrongly with a 200', () => {
  /**
   * The host does not preserve request order, and not deterministically —
   * two live requests for the same pair returned opposite orders. A positional
   * zip would swap one feed's price with another's, intermittently.
   */
  it('matches entries by feed id, never by position', async () => {
    const fetchImpl = () =>
      jsonResponse([
        { body: BTC_BODY, proof: PROOF },
        { body: FLR_BODY, proof: PROOF },
      ])

    const result = await fetchAnchorFeeds({
      chainId: CHAIN_ID,
      feedIds: [FLR, BTC],
      votingRoundId: BigInt(ROUND),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    // M4-R9: the retrieval travels as an Observation, so a surface can say who
    // served it and how old it is instead of writing that out as prose.
    expect(isObserved(result)).toBe(true)
    if (!isObserved(result)) throw new Error('unreachable')
    // `provider`, not `chain`: the host serves leaves, the Relay publishes the
    // root. A retrieved proof is a claim until verifyFeedData accepts it.
    expect(result.source.class).toBe('provider')
    expect(result.source.provider).toBe('Data availability host')

    expect(result.value.found.map((f) => f.name)).toEqual(['FLR/USD', 'BTC/USD'])
    expect(result.value.found[0]?.body.value).toBe(6062)
    expect(result.value.found[0]?.body.decimals).toBe(6)
    expect(result.value.found[1]?.body.value).toBe(6_396_131)
  })

  it('reports an unknown feed id as missing rather than rendering nothing', async () => {
    const fetchImpl = () => jsonResponse([{ body: FLR_BODY, proof: PROOF }])
    const result = await fetchAnchorFeeds({
      chainId: CHAIN_ID,
      feedIds: [FLR, BTC],
      votingRoundId: BigInt(ROUND),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    if (!isObserved(result)) throw new Error('unreachable')
    expect(result.value.found).toHaveLength(1)
    expect(result.value.missing).toEqual([BTC])
  })

  /**
   * Only `voting_round_id` selects a round; a misspelling returns 200 carrying
   * the latest. If that ever regresses, the caller receives today's price
   * believing it is the historical one, so the served round is checked.
   */
  it('refuses a response for a round other than the one requested', async () => {
    const fetchImpl = () =>
      jsonResponse([{ body: { ...FLR_BODY, votingRoundId: 1_415_999 }, proof: PROOF }])

    await expect(
      fetchAnchorFeeds({
        chainId: CHAIN_ID,
        feedIds: [FLR],
        votingRoundId: BigInt(ROUND),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'FTSO_ANCHOR_ROUND_MISMATCH', valueMoved: 'no' })
  })

  it('reports a 400 as a provider condition that says nothing about the chain', async () => {
    const fetchImpl = () => jsonResponse({ error: 'anchor feeds not found' }, 400)
    await expect(
      fetchAnchorFeeds({
        chainId: CHAIN_ID,
        feedIds: [FLR],
        votingRoundId: 1n,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'FTSO_ANCHOR_UNAVAILABLE', recovery: 'wait' })
  })
})

describe('M4-AC4 — a revert is could-not-check, never not-proven', () => {
  const feed = { body: FLR_BODY, proof: PROOF, name: 'FLR/USD' }

  it('reads true as proven', async () => {
    const reader = { readContract: () => Promise.resolve(true) }
    const result = await verifyAnchorFeed(reader, CHAIN_ID, feed)
    expect(result.outcome).toBe('proven')
    expect(isProven(result)).toBe(true)
  })

  /**
   * Live, all four tamper cases revert with `merkle proof invalid`. Mapping any
   * of them to not_proven would render "we could not check this" as "this is
   * not proven" — an unknown shown as a negative fact.
   */
  it('maps every revert to could_not_check and keeps the reason', async () => {
    const reader = {
      readContract: () =>
        Promise.reject(Object.assign(new Error('x'), { shortMessage: 'merkle proof invalid' })),
    }
    const result = await verifyAnchorFeed(reader, CHAIN_ID, feed)
    expect(result.outcome).toBe('could_not_check')
    expect(result.reason).toBe('merkle proof invalid')
    expect(isProven(result)).toBe(false)
  })

  it('keeps a transport failure distinct from a bad proof', async () => {
    const reader = { readContract: () => Promise.reject(new Error('HTTP 502')) }
    const result = await verifyAnchorFeed(reader, CHAIN_ID, feed)
    expect(result.outcome).toBe('could_not_check')
    expect(result.reason).toBe('HTTP 502')
  })

  it('still has a not_proven state for a definite false', async () => {
    const reader = { readContract: () => Promise.resolve(false) }
    expect((await verifyAnchorFeed(reader, CHAIN_ID, feed)).outcome).toBe('not_proven')
  })

  it('never throws for a verification outcome', async () => {
    const reader = { readContract: () => Promise.reject(new Error('boom')) }
    await expect(verifyAnchorFeed(reader, CHAIN_ID, feed)).resolves.toBeDefined()
  })
})

describe('M4-AC5 — committed on chain but no longer retrievable', () => {
  const ZERO_ROOT = `0x${'00'.repeat(32)}`
  const SET_ROOT = `0x${'ab'.repeat(32)}`

  /**
   * `readFeedHistory` returns an `Observation` (M4-R9) and always observes: it
   * classifies every round rather than failing, so an unavailable result here
   * would be a bug in the reader, not a condition under test.
   */
  const historyOf = (observation: Awaited<ReturnType<typeof readFeedHistory>>) => {
    if (!isObserved(observation)) throw new Error('readFeedHistory must always observe')
    expect(observation.source.provider).toBe('Data availability host')
    return observation.value
  }

  function readerWithRoot(root: string) {
    return { readContract: () => Promise.resolve(root) }
  }

  it('calls a set root with a missing leaf committed_not_retrievable', async () => {
    const fetchImpl = () => jsonResponse({ error: 'anchor feeds not found' }, 400)
    const history = await readFeedHistory({
      reader: readerWithRoot(SET_ROOT),
      chainId: CHAIN_ID,
      feedId: FLR,
      fromRound: 1_127_919n,
      toRound: 1_127_919n,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(historyOf(history).points[0]?.status).toBe('committed_not_retrievable')
    expect(historyOf(history).retentionBoundary).toBe(1_127_919n)
  })

  it('calls a zero root with a missing leaf not_finalized', async () => {
    const fetchImpl = () => jsonResponse({ error: 'anchor feeds not found' }, 400)
    const history = await readFeedHistory({
      reader: readerWithRoot(ZERO_ROOT),
      chainId: CHAIN_ID,
      feedId: FLR,
      fromRound: 9_999_999n,
      toRound: 9_999_999n,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(historyOf(history).points[0]?.status).toBe('not_finalized')
    expect(historyOf(history).retentionBoundary).toBeUndefined()
  })

  /** A gap is an explicit point in the series, never smoothed away. */
  it('keeps every round in the range as its own point', async () => {
    const fetchImpl = (_url: string) => {
      const round = Number(String(_url).split('voting_round_id=')[1])
      if (round === 1_127_919) return jsonResponse({ error: 'not found' }, 400)
      return jsonResponse([{ body: { ...FLR_BODY, votingRoundId: round }, proof: PROOF }])
    }
    const history = await readFeedHistory({
      reader: readerWithRoot(SET_ROOT),
      chainId: CHAIN_ID,
      feedId: FLR,
      fromRound: 1_127_919n,
      toRound: 1_127_921n,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(historyOf(history).points.map((p) => p.status)).toEqual([
      'retrieved',
      'retrieved',
      'committed_not_retrievable',
    ])
    expect(historyOf(history).oldestRetrievedRound).toBe(1_127_920n)
  })
})
