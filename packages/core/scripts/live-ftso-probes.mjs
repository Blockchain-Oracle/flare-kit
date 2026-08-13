/**
 * The read-only probes M4-R11 requires, one per requirement.
 *
 * Split from `live-ftso-run.mjs` at the seam between *what is measured* and
 * *how a run is sequenced and recorded*. Every function here is an `eth_call` or
 * an HTTP request: nothing in this file can spend, and nothing needs a key.
 *
 * Each takes its context explicitly rather than reaching for module scope, so a
 * probe can be run on its own against a different network without the script
 * around it.
 */
import { FEED_CATEGORY, encodeFeedId, ftsoRegistryFor } from '@flare-kit/contracts'
import {
  fetchAnchorFeeds,
  isObserved,
  isRefusal,
  listSupportedFeedIds,
  quoteFeedFee,
  quoteIncentive,
  readCustomFeeds,
  readFeedCatalogue,
  readFeeds,
  readSecureRandom,
  verifyAnchorFeed,
  verifyOfferAmount,
} from '../dist/index.js'

/** M4-R1: enumeration through `getSupportedFeedIds`, never `getFeedIds`. */
export async function probeCatalogue({ reader, chainId, say }) {
  const catalogue = await readFeedCatalogue({ reader, chainId: chainId })
  const ids = await listSupportedFeedIds(reader, chainId)
  if (!isObserved(catalogue)) throw new Error('catalogue unavailable')
  const { entries, renames, unusedIndices, customFeedCount } = catalogue.value
  say(`  ${entries.length} feeds, ${customFeedCount} custom, ${renames.length} renamed`)
  return {
    total: ids.length,
    entries: entries.length,
    customFeedCount,
    renames: renames.map((r) => `${r.from} → ${r.to}`),
    unusedIndices: unusedIndices.map(String),
  }
}

/** M4-R2 and M4-AC3: the fee is quoted for the exact batch, then paid as value. */
export async function probeReads({ reader, chainId, payer, say }) {
  const feedIds = ['FLR/USD', 'SGB/USD', 'BTC/USD'].map((n) =>
    encodeFeedId(FEED_CATEGORY.crypto, n),
  )
  const quote = await quoteFeedFee(reader, chainId, feedIds)
  const observed = await readFeeds({
    reader,
    chainId,
    feedIds,
    ...(quote.wei > 0n ? { account: payer } : {}),
  })
  if (!isObserved(observed)) throw new Error('feed read unavailable')
  const readings = observed.value.readings.map((r) => ({
    name: r.name,
    value: r.price.value.toString(),
    decimals: r.decimals,
    path: r.path,
    ...(r.formerName ? { formerName: r.formerName } : {}),
  }))
  say(`  fee ${quote.wei} wei; exponents ${readings.map((r) => r.decimals).join(', ')}`)
  return {
    feeWei: quote.wei.toString(),
    secondOpinionWei: quote.secondOpinionWei?.toString() ?? null,
    readings,
  }
}

/**
 * M4-R3 and M4-AC4. A valid proof, then four tampered ones. `verifyFeedData`
 * reverts rather than returning false, so every tamper must land on
 * `could_not_check` carrying its reason — never on `not_proven`.
 */
export async function probeProof({ reader, chainId, say }) {
  const feedId = encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD')
  const retrieved = await fetchAnchorFeeds({ chainId, feedIds: [feedId] })
  if (!isObserved(retrieved)) throw new Error('anchor retrieval unavailable')
  const feed = retrieved.value.found[0]
  if (!feed) throw new Error('the host served no anchor feed for FLR/USD')

  const valid = await verifyAnchorFeed(reader, chainId, feed)
  const tampers = {
    'value off by one': { ...feed, body: { ...feed.body, value: feed.body.value + 1 } },
    'shifted round': {
      ...feed,
      body: { ...feed.body, votingRoundId: feed.body.votingRoundId - 1 },
    },
    'truncated proof': { ...feed, proof: feed.proof.slice(1) },
    'empty proof': { ...feed, proof: [] },
  }
  const tampered = {}
  for (const [label, mutated] of Object.entries(tampers)) {
    const result = await verifyAnchorFeed(reader, chainId, mutated)
    tampered[label] = { outcome: result.outcome, reason: result.reason ?? null }
  }
  say(`  round ${feed.body.votingRoundId}: ${valid.outcome}; 4 tampers checked`)
  return {
    source: retrieved.source.provider,
    votingRoundId: feed.body.votingRoundId,
    decimals: feed.body.decimals,
    value: feed.body.value,
    proofNodes: feed.proof.length,
    valid: { outcome: valid.outcome, observedAt: valid.observedAt ?? null },
    tampered,
  }
}

/**
 * M4-R5 and M4-AC5. The floor moves, so it is bisected per run and never
 * compiled in. Bounded at 20 steps — that is more than enough to separate two
 * rounds across the ~285,000-round window.
 */
async function bisectBoundary({ chainId }, latestRound) {
  const feedIds = [encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD')]
  /**
   * Three paced attempts before believing an absence. The host intermittently
   * serves an empty 200 for a round it holds — an earlier version of this
   * function believed the first answer and "found" a floor at 812987/812988
   * that does not exist. A bisection over an unreliable predicate returns an
   * adjacent pair, not a boundary, and it looks exactly like a measurement.
   */
  const retrievable = async (round) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await fetchAnchorFeeds({ chainId, feedIds, votingRoundId: round })
        if (isObserved(result) && result.value.found.length > 0) return true
      } catch {
        /* a 400 is the host's answer; retried the same as an empty 200 */
      }
      await new Promise((resolve) => setTimeout(resolve, 700))
    }
    return false
  }

  // Bounded by the range itself rather than by a guess at the window. An
  // earlier version started 400,000 rounds back and found that retrievable, so
  // it never bisected at all — the recorded floor of 1130919 was stale by more
  // than the search window. Round 1 is always gone; a round moments old is
  // always held; everything interesting is between them.
  let gone = 1n
  let held = latestRound - 1_000n

  for (let step = 0; step < 18 && held - gone > 1n; step += 1) {
    const mid = gone + (held - gone) / 2n
    if (await retrievable(mid)) held = mid
    else gone = mid
  }

  return { gone, held }
}

/**
 * The floor is only reported if two independent bisections agree.
 *
 * They do not. Two passes minutes apart returned boundaries 71,000 rounds
 * apart, after each had already confirmed every absence three times. So the
 * honest answer is that a single floor cannot be established this way at all,
 * and reporting either number would be publishing an unstable value as a
 * measurement — which is precisely how the spec's stale 1130919 was produced.
 *
 * This is not a gap in the probe. It is the finding: **query per round.**
 * `readFeedHistory` classifies each round independently and never extrapolates
 * from a boundary, which is the design this vindicates.
 */
export async function probeRetentionFloor(ctx, latestRound) {
  const first = await bisectBoundary(ctx, latestRound)
  const second = await bisectBoundary(ctx, latestRound)
  const agree = first.held === second.held && first.gone === second.gone
  ctx.say(`  pass 1: ${first.gone}/${first.held}; pass 2: ${second.gone}/${second.held}; agree=${agree}`)

  return agree
    ? {
        oldestRetrievable: first.held.toString(),
        newestGone: first.gone.toString(),
        note: null,
      }
    : {
        oldestRetrievable: null,
        newestGone: null,
        note: `NOT ESTABLISHED, and that is the result rather than a failure. Two bisections run minutes apart, each confirming every absence three times, returned boundaries ${first.gone}/${first.held} and ${second.gone}/${second.held} — ${(first.held > second.held ? first.held - second.held : second.held - first.held).toString()} rounds apart. A single retention floor is not measurable this way, so none is reported. Query per round instead.`,
      }
}

/** Four rounds Coston2 genuinely reports as not secure. */
const KNOWN_INSECURE_ROUND = 872_874n

/** M4-R6 and M4-AC6: a known-insecure round must refuse, carrying no value. */
export async function probeRandom({ reader, chainId, say }) {
  const current = await readSecureRandom({ reader, chainId })
  const refused = await readSecureRandom({
    reader,
    chainId,
    votingRoundId: KNOWN_INSECURE_ROUND,
    requireSecure: true,
  })
  if (!isObserved(current) || !isObserved(refused)) throw new Error('random unavailable')
  const wasRefused = isRefusal(refused.value)
  say(`  current secure=${current.value.isSecure}; round ${KNOWN_INSECURE_ROUND} refused=${wasRefused}`)
  return {
    current: {
      isSecure: current.value.isSecure,
      timestampSeconds: current.value.timestampSeconds.toString(),
    },
    knownInsecureRound: KNOWN_INSECURE_ROUND.toString(),
    refused: wasRefused,
    refusalReason: wasRefused ? refused.value.reason : null,
    // The whole point of a refusal: there is nothing on it to reach past.
    valueWithheld: wasRefused && !('value' in refused.value),
  }
}

/**
 * M4-R7. The price is quoted for this exact offer and dry-run against the
 * contract. Submission is a separate, flagged step in its own module: it moves
 * real value.
 */
export async function probeIncentive({ reader, chainId, payer, say }) {
  const address = ftsoRegistryFor(chainId).fastUpdateIncentiveManager
  const range = await reader.readContract({
    address,
    abi: [
      {
        name: 'getRange',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'uint256' }],
      },
    ],
    functionName: 'getRange',
  })
  const rangeIncrease = BigInt(range) / 100n
  const quote = await quoteIncentive({ reader, chainId, rangeIncrease })
  const simulator = { ...reader, simulateContract: reader.simulateContract.bind(reader) }

  let accepted
  let refusedBelow = null
  try {
    await verifyOfferAmount(simulator, chainId, quote, payer)
    accepted = quote.offerAmountWei.toString()
    // One wei below must be refused, or the quote is approximate rather than
    // exact and the surface would be asserting a precision it does not have.
    try {
      await verifyOfferAmount(
        simulator,
        chainId,
        { ...quote, offerAmountWei: quote.offerAmountWei - 1n },
        payer,
      )
    } catch {
      refusedBelow = (quote.offerAmountWei - 1n).toString()
    }
  } catch (error) {
    accepted = `dry run refused: ${error.shortMessage ?? error.message}`
  }
  say(`  offer ${quote.offerAmountWei} wei accepted=${accepted !== null}`)
  return {
    quote,
    rangeIncrease: rangeIncrease.toString(),
    currentRange: quote.currentRange.toString(),
    offerAmountWei: quote.offerAmountWei.toString(),
    durationSeconds: quote.durationSeconds.toString(),
    dryRunAccepted: accepted,
    dryRunRefusedOneWeiBelow: refusedBelow,
    submitted: false,
    submissionNote:
      'NOT SUBMITTED. A real offerIncentive moves ~0.37 C2FLR and is irreversible, so it requires --submit-incentive and explicit human authorisation. The dry run above establishes the price without spending.',
  }
}

/** M4-R8: read-only, network named, and Coston2's empty set is not an error. */
export async function probeCustomFeeds({ reader, chainId, say }) {
  const set = await readCustomFeeds({ reader, chainId })
  if (!isObserved(set)) throw new Error('custom feed set unavailable')
  say(`  ${set.value.entries.length} custom feeds on ${set.value.network}`)
  return {
    network: set.value.network,
    entries: set.value.entries.map((e) => e.name),
    previouslyObserved: set.value.previouslyObserved,
  }
}
