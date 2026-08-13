import {
  type FeedId,
  anchorFeedsWithProofUrl,
  chainFor,
  decodeFeedId,
  registryFor,
} from '@flare-kit/contracts'
import { FlareKitError } from '../errors.js'
import { type Observation, observe } from '../observation.js'

/**
 * The data-availability client for anchor feeds — M4-R3.
 *
 * This is its own client rather than a reuse of `fdc/client.ts`, and the reason
 * is not tidiness: that client checks the HTTP status and nothing else, which is
 * correct for FDC and a **silent failure** here. This route has three ways to
 * hand back a wrong-but-plausible answer with a 200.
 */

/** The leaf the Relay committed to, exactly as it is hashed. */
export interface AnchorFeedBody {
  readonly votingRoundId: number
  readonly id: FeedId
  /** Signed: `int32` on chain, and a feed value legitimately can be negative. */
  readonly value: number
  readonly turnoutBIPS: number
  /** This reading's exponent. FLR/USD is 6 here and 8 at block latency. */
  readonly decimals: number
}

export interface AnchorFeedWithProof {
  readonly body: AnchorFeedBody
  readonly proof: readonly `0x${string}`[]
  /** Decoded from `body.id` for display; never a substitute for the id itself. */
  readonly name: string
}

export interface FetchAnchorFeedsInput {
  chainId: number
  feedIds: readonly FeedId[]
  /** Omit for the latest available round. */
  votingRoundId?: bigint
  apiKey?: string
  fetchImpl?: typeof fetch
  now?: () => number
}

export interface AnchorFeedsResult {
  readonly votingRoundId: bigint
  readonly found: readonly AnchorFeedWithProof[]
  /**
   * Ids the host served nothing for. A first-class outcome, not an error: the
   * caller asked about feeds this deployment does not anchor, and saying so is
   * different from failing.
   */
  readonly missing: readonly FeedId[]
}

/**
 * Retrieve anchor feeds with their merkle proofs.
 *
 * Three silent-failure modes are checked here, all measured live 2026-08-04:
 *
 * 1. **An unknown feed id returns HTTP 200 with `[]`.** Only a non-retained
 *    round returns 400. A status-only check renders nothing and says nothing.
 * 2. **The response does not preserve request order.** Asking for
 *    `[FLR/USD, BTC/USD]` returned BTC/USD first. Zipping positionally against
 *    the request would swap every feed's price with another feed's — the worst
 *    class of bug this kit can ship, because both numbers are real prices.
 *    Entries are matched by `body.id`.
 * 3. **The round parameter is unvalidated.** Only `voting_round_id` selects a
 *    round; a misspelling returns 200 carrying the *latest* round. So the round
 *    that came back is compared against the round that was asked for.
 */
export async function fetchAnchorFeeds(
  input: FetchAnchorFeedsInput,
): Promise<Observation<AnchorFeedsResult>> {
  const { chainId, feedIds } = input
  const now = input.now ?? Date.now
  const services = registryFor(chainId).services
  const doFetch = input.fetchImpl ?? fetch
  const url = anchorFeedsWithProofUrl(services.dataAvailabilityBaseUrl, input.votingRoundId)

  const response = await doFetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [services.apiKeyHeader]: input.apiKey ?? services.publicApiKey,
    },
    body: JSON.stringify({ feed_ids: feedIds }),
  })

  if (!response.ok) {
    // A round below the retention floor lands here. The caller distinguishes
    // "gone" from "never existed" by asking the Relay for the root; this layer
    // only reports what the host said.
    throw new FlareKitError('FTSO_ANCHOR_UNAVAILABLE', {
      domain: 'provider',
      message: `The data-availability host answered ${response.status} for voting round ${input.votingRoundId ?? 'latest'}. This says nothing about whether the round was finalized on chain.`,
      recovery: 'wait',
      valueMoved: 'no',
      evidence: {
        status: String(response.status),
        votingRoundId: String(input.votingRoundId ?? 'latest'),
        chainId: String(chainId),
      },
    })
  }

  const payload = (await response.json()) as readonly {
    body: AnchorFeedBody
    proof: readonly `0x${string}`[]
  }[]

  const entries = Array.isArray(payload) ? payload : []
  const byId = new Map(entries.map((entry) => [entry.body.id.toLowerCase(), entry]))

  const found: AnchorFeedWithProof[] = []
  const missing: FeedId[] = []
  for (const feedId of feedIds) {
    const entry = byId.get(feedId.toLowerCase())
    if (!entry) {
      missing.push(feedId)
      continue
    }
    found.push(
      Object.freeze({
        body: Object.freeze(entry.body),
        proof: Object.freeze([...entry.proof]),
        name: decodeFeedId(entry.body.id).name,
      }),
    )
  }

  const servedRound = found[0]?.body.votingRoundId
  assertRoundIsTheOneAsked(input.votingRoundId, servedRound, chainId)

  // `provider`, not `chain`. The host serves the leaves; the Relay publishes the
  // root they hash to. Those are two sources and only the second is on chain, so
  // a proof retrieved here is a provider's claim until `verifyFeedData` accepts
  // it — and M4-R9 requires that distinction to survive onto the surface rather
  // than being written out as prose beside the value.
  return observe(
    Object.freeze({
      votingRoundId: BigInt(servedRound ?? input.votingRoundId ?? 0n),
      found: Object.freeze(found),
      missing: Object.freeze(missing),
    }),
    {
      class: 'provider',
      provider: 'Data availability host',
      network: chainFor(chainId).name,
      chainId,
    },
    now(),
  )
}

/**
 * The host ignores a misspelled round parameter and serves the latest instead,
 * with a 200. That would hand a caller today's price believing it is the
 * historical one it asked for — so the round that came back is checked.
 */
function assertRoundIsTheOneAsked(
  requested: bigint | undefined,
  served: number | undefined,
  chainId: number,
): void {
  if (requested === undefined || served === undefined) return
  if (BigInt(served) === requested) return

  throw new FlareKitError('FTSO_ANCHOR_ROUND_MISMATCH', {
    domain: 'provider',
    message: `Asked the data-availability host for voting round ${requested} and it served round ${served}. The value is real but it is not the round requested, so it has not been used.`,
    recovery: 'safe_to_retry',
    valueMoved: 'no',
    evidence: {
      requestedRound: requested.toString(),
      servedRound: String(served),
      network: chainFor(chainId).name,
    },
  })
}
