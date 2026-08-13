import {
  ATTESTATION_FAMILIES,
  type AttestationFamilyRow,
  type FamilyStatus,
  type FdcServices,
  type FlareNetworkKey,
  apiDocJsonUrl,
  chainFor,
  claimedStatus,
} from '@flare-kit/contracts'
import { type Observation, observe, unavailable } from '../observation.js'

/**
 * The contracts-level types a consumer of the catalogue needs. Re-exported so a
 * UI package can render a row without also depending on `@flare-kit/contracts`.
 */
export type {
  AttestationFamilyRow,
  FamilySource,
  FamilyStatus,
} from '@flare-kit/contracts'
/** The bytes32 → name decoder a surface needs to render an attested source. */
export { decodeAttestationName } from '@flare-kit/contracts'

/**
 * What this deployment actually serves, versus what the table claims.
 *
 * M3-R3: the constant table is never presented alone as permanent protocol
 * truth. It is compared, per family, against the verifier's own OpenAPI — and
 * the three possible answers stay three answers. "We asked and it disagreed"
 * and "we could not ask" are different claims, and neither of them is
 * "supported".
 */

/** How the table and the live verifier relate for one family. */
export type CatalogueAgreement =
  /** Both say the deployment serves it, or both say it does not. */
  | 'agrees'
  /** The table claims a route the verifier does not serve. */
  | 'table_claims_more'
  /** The verifier serves a route the table does not claim. */
  | 'verifier_serves_more'
  /** The verifier group could not be reached, so nothing was compared. */
  | 'unreachable'

export interface FamilyRow {
  readonly family: AttestationFamilyRow
  /**
   * The status after comparison. A family the verifier does not serve reads
   * `unavailable` however the table describes it — the live deployment wins.
   */
  readonly status: FamilyStatus
  readonly claimed: FamilyStatus
  readonly agreement: CatalogueAgreement
  /** The verifier groups that were reachable and served this family. */
  readonly servedBy: readonly string[]
  /** Said in words when the answer is anything but plain agreement. */
  readonly note?: string
}

export interface LoadCatalogueInput {
  services: FdcServices
  chainId: number
  fetch?: typeof globalThis.fetch
  apiKey?: string
  verifierBaseUrl?: string
  now?: number
}

/** The `{Type}/prepareRequest` route names one verifier group serves. */
const PREPARE_ROUTE = /\/([A-Za-z0-9]+)\/prepareRequest$/

async function servedTypes(
  url: string,
  headers: Record<string, string>,
  doFetch: typeof globalThis.fetch,
): Promise<ReadonlySet<string> | undefined> {
  try {
    const response = await doFetch(url, { headers })
    if (!response.ok) return undefined
    const document = (await response.json()) as { paths?: Record<string, unknown> }
    if (!document?.paths) return undefined
    const types = new Set<string>()
    for (const path of Object.keys(document.paths)) {
      const match = PREPARE_ROUTE.exec(path)
      if (match?.[1]) types.add(match[1])
    }
    return types
  } catch {
    // Unreachable is a distinct outcome, not an empty result set. Returning an
    // empty set here would render every family as unavailable on a flaky
    // network — a negative fact invented out of an outage.
    return undefined
  }
}

export async function loadFamilyCatalogue(
  input: LoadCatalogueInput,
): Promise<Observation<readonly FamilyRow[]>> {
  const doFetch = input.fetch ?? globalThis.fetch
  const chain = chainFor(input.chainId)
  const network: FlareNetworkKey = chain.key
  const base = input.verifierBaseUrl ?? input.services.verifierBaseUrl
  const observedAt = input.now ?? Date.now()
  const source = {
    class: 'provider' as const,
    provider: base,
    network: chain.name,
    chainId: chain.id,
  }
  const headers = { [input.services.apiKeyHeader]: input.apiKey ?? input.services.publicApiKey }

  // Every group any family names on this network, asked once each.
  const groups = [
    ...new Set(
      ATTESTATION_FAMILIES.flatMap((family) => family.sources[network].map((s) => s.group)),
    ),
  ]
  const answers = new Map<string, ReadonlySet<string> | undefined>(
    await Promise.all(
      groups.map(
        async (group) =>
          [group, await servedTypes(apiDocJsonUrl(base, group), headers, doFetch)] as const,
      ),
    ),
  )

  if (groups.length > 0 && groups.every((group) => answers.get(group) === undefined)) {
    return unavailable(
      source,
      observedAt,
      `No verifier group on ${base} answered. The catalogue below would be the built-in table alone, which is a claim about 2026-08-04 rather than about this deployment.`,
    )
  }

  return observe(
    ATTESTATION_FAMILIES.map((family) => compare(family, network, answers)),
    source,
    observedAt,
  )
}

function compare(
  family: AttestationFamilyRow,
  network: FlareNetworkKey,
  answers: ReadonlyMap<string, ReadonlySet<string> | undefined>,
): FamilyRow {
  const claimed = claimedStatus(family, network)
  const claimedGroups = family.sources[network].map((s) => s.group)

  const reachable = claimedGroups.filter((group) => answers.get(group) !== undefined)
  const servedBy = reachable.filter((group) => answers.get(group)?.has(family.name))

  // A group the verifier serves this family under that the table does not name.
  const extra = [...answers.entries()]
    .filter(([group, types]) => types?.has(family.name) && !claimedGroups.includes(group))
    .map(([group]) => group)

  if (claimedGroups.length > 0 && reachable.length === 0) {
    return {
      family,
      claimed,
      status: claimed,
      agreement: 'unreachable',
      servedBy: [],
      note: `Could not reach ${claimedGroups.join(', ')}, so this row is the built-in table's claim and has not been checked against the deployment.`,
    }
  }

  if (extra.length > 0) {
    return {
      family,
      claimed,
      // The verifier serves it and we do not claim it: it exists, and we have
      // no builder for it here.
      status: family.deprecationNote ? 'deprecated' : 'planned',
      agreement: 'verifier_serves_more',
      servedBy: [...servedBy, ...extra],
      note: `The verifier serves ${family.name} under ${extra.join(', ')}, which the built-in table does not list. The table is out of date.`,
    }
  }

  if (claimedGroups.length > 0 && servedBy.length === 0) {
    return {
      family,
      claimed,
      // The deployment wins. Claiming support for a route that 404s would be
      // exactly the invented protocol reality M3-R3 exists to prevent.
      status: family.deprecationNote ? 'deprecated' : 'unavailable',
      agreement: 'table_claims_more',
      servedBy: [],
      note: `The built-in table lists ${family.name} under ${claimedGroups.join(', ')}, but this verifier serves it under none of them.`,
    }
  }

  return { family, claimed, status: claimed, agreement: 'agrees', servedBy }
}
