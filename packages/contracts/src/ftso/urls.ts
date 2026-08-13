/**
 * The anchor-feed data-availability route.
 *
 * A separate file from `fdc/urls.ts` rather than a parameter on it: different
 * API version (`v0` against FDC's `v1`), a different route, and the voting round
 * travels in the **query string** here instead of in the body. Three differences
 * on one call is not one function with a flag.
 *
 * The host itself is shared — the same data-availability deployment serves both
 * protocols — so it comes from `registryFor(chainId).services
 * .dataAvailabilityBaseUrl` and is not restated here.
 */

/**
 * Anchor feeds with their merkle proofs.
 *
 * `POST`, with the feed ids in the body. Omitting the round returns the latest
 * available; supplying one asks for that specific round, which is what M4-R5's
 * history walks.
 *
 * **The status code is not enough to know whether this worked.** Measured live
 * on both networks 2026-08-04:
 *
 * - a feed id the deployment does not serve returns **HTTP 200 with `[]`**
 * - a round below the retention floor returns **HTTP 400**
 *   `{"error":"anchor feeds not found"}`
 *
 * So a client that checks only `res.ok` sails straight through the first case
 * and renders nothing, silently. `packages/core/src/fdc/client.ts` checks status
 * only, which is correct for FDC and would be a silent failure here — which is
 * exactly why this is its own client rather than a reuse.
 *
 * **The parameter name is load-bearing and unvalidated.** Measured on the same
 * day: `votingRoundId`, `round_id` and no parameter at all every return HTTP 200
 * carrying the *latest* round, not an error. Only `voting_round_id` actually
 * selects a round. A caller who misspells it therefore receives today's price
 * believing it is the historical one it asked for — which is why the name lives
 * here once and is never spelled at a call site. Callers must additionally check
 * the returned `votingRoundId` against the one they requested; M4-R5 does.
 */
export function anchorFeedsWithProofUrl(
  dataAvailabilityBaseUrl: string,
  votingRoundId?: bigint,
): string {
  const base = `${trimSlash(dataAvailabilityBaseUrl)}/api/v0/ftso/anchor-feeds-with-proof`
  return votingRoundId === undefined ? base : `${base}?voting_round_id=${votingRoundId}`
}

/**
 * A caller-supplied base may or may not end in a slash. Both must produce the
 * same URL, because a doubled slash is a 404 that looks like an outage.
 */
function trimSlash(base: string): string {
  return base.endsWith('/') ? base.slice(0, -1) : base
}
