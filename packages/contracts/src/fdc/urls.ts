/**
 * Every URL the FDC flow calls, built from a base a caller may override.
 *
 * M3-R9 makes the verifier and data-availability hosts configuration: a caller
 * running their own verifier passes a different base and nothing else in the
 * operation model changes. That is why these are functions of a base rather
 * than constants — and why the group and type are arguments rather than the
 * hardcoded `/verifier/xrp/XRPPayment/` this replaces.
 */

/**
 * Where a request is canonicalised and validated before submission.
 *
 * The group is not derivable from the attestation type: `EVMTransaction` is
 * served by `flr`, `eth` and `sgb`, and `Payment` by `xrp`, `btc_testnet4` and
 * `doge`. It comes from the family table's source entry for the selected
 * network, which is what keeps Coston2 off the `eth` route.
 */
export function prepareRequestUrl(
  verifierBaseUrl: string,
  group: string,
  attestationType: string,
): string {
  return `${trimSlash(verifierBaseUrl)}/verifier/${group}/${attestationType}/prepareRequest`
}

/** The data-availability path for retrieving a finalized proof. */
export function proofByRequestRoundUrl(dataAvailabilityBaseUrl: string): string {
  return `${trimSlash(dataAvailabilityBaseUrl)}/api/v1/fdc/proof-by-request-round`
}

/**
 * A verifier group's OpenAPI document. This is the live half of M3-R3: its
 * `paths` name every `{Type}/prepareRequest` route the deployment actually
 * serves, which is what the constant family table is compared against.
 */
export function apiDocJsonUrl(verifierBaseUrl: string, group: string): string {
  return `${trimSlash(verifierBaseUrl)}/verifier/${group}/api-doc-json`
}

/**
 * A caller-supplied base may or may not end in a slash. Both must produce the
 * same URL, because a doubled slash is a 404 that looks like an outage.
 */
function trimSlash(base: string): string {
  return base.endsWith('/') ? base.slice(0, -1) : base
}
