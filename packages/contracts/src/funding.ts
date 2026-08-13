/**
 * Where the funder-held faucet service lives.
 *
 * `apps/funding-api` is not built — `SPEC.md` lists it as out of scope for M1
 * and it has not been picked up since. The address is fixed here anyway,
 * because a URL and a port are decisions, and making them now means the app,
 * the docs and the service cannot each invent their own later.
 *
 * **Nothing here resolves yet.** `deployed` is `false`, and it is the field a
 * caller must check before rendering `baseUrl` as a link or calling it. A
 * hostname that has never been pointed anywhere is not a service, and offering
 * it as one is the same class of lie as rendering an unread balance as zero.
 */

export interface FundingService {
  /** Production. `flare-kit.xyz` is the docs domain; funding is its own host. */
  readonly baseUrl: string
  /** Local development. */
  readonly localBaseUrl: string
  /**
   * The port `apps/funding-api` binds in development. Fixed now so the service,
   * the app's dev proxy and any script agree from the first commit.
   */
  readonly localPort: number
  /**
   * False until the service is actually deployed and answering. A caller that
   * does not check this is a bug — see the module comment.
   */
  readonly deployed: boolean
  /**
   * Funding is a testnet idea. There is no faucet for real FLR or real XRP, so
   * this service is never offered on mainnet.
   */
  readonly networks: readonly ['coston2']
}

export const FUNDING_SERVICE: FundingService = Object.freeze({
  baseUrl: 'https://funding.flare-kit.xyz',
  localBaseUrl: 'http://localhost:8787',
  localPort: 8787,
  deployed: false,
  networks: Object.freeze(['coston2'] as const),
})

/**
 * The base URL to use, or `undefined` when there is nothing to call.
 *
 * Returning `undefined` rather than a string is deliberate: it makes "the
 * service is not deployed" a case the caller has to handle, instead of a URL
 * that looks callable and 404s.
 */
export function fundingBaseUrl(options?: { local?: boolean }): string | undefined {
  if (options?.local) return FUNDING_SERVICE.localBaseUrl
  return FUNDING_SERVICE.deployed ? FUNDING_SERVICE.baseUrl : undefined
}
