import { chainFor } from '@flare-kit/contracts'
import type { EvidenceItem } from './evidence.js'
import { linkEvidence } from './links.js'
import type { ObservationSource } from './observation.js'
import type { OperationRecord } from './operation.js'
import type { OperationState } from './states.js'
import { assertNoSecrets } from './storage.js'

/**
 * Activity is a list of operations, not a list of transactions.
 *
 * R-DATA-003: a mint's XRPL payment, its FDC voting round and its Flare
 * execution are three identifiers on three different systems, and an entry
 * keeps all three reachable rather than picking one to call "the" hash. That is
 * the whole reason an operation has an id of its own (R-OP-002).
 */

export interface ActivityEntry {
  readonly operationId: string
  readonly capability: string
  readonly state: OperationState
  readonly network: number
  readonly intent: unknown
  readonly startedAt: number
  readonly updatedAt: number
  /** Every correlated identifier, each linked to its own explorer. */
  readonly evidence: readonly EvidenceItem[]
  readonly source: ObservationSource
}

/**
 * A record may name a chain this build does not support; that is not a reason
 * to throw while listing history. The id is then the most honest label there
 * is. Exported so the pending tray and the activity table label the same
 * network the same way.
 */
export function networkName(chainId: number): string {
  try {
    return chainFor(chainId).name
  } catch {
    return `Chain ${chainId}`
  }
}

export function toActivityEntry(record: OperationRecord): ActivityEntry {
  return Object.freeze({
    operationId: record.id,
    capability: record.capability,
    // Carried through exactly as recorded. `submitted` is never rendered as
    // `succeeded`, so it is never rewritten on the way to a surface either.
    state: record.state,
    network: record.network,
    intent: record.intent,
    startedAt: record.createdAt,
    updatedAt: record.updatedAt,
    evidence: linkEvidence(record.evidence, record.network),
    source: Object.freeze({
      class: 'local' as const,
      provider: 'Operation registry',
      // A proper noun, matching every portfolio observation. An id renders as
      // "114" in the source drawer beside "Flare Testnet Coston2" elsewhere,
      // and the two look like different systems.
      network: networkName(record.network),
      chainId: record.network,
    }),
  })
}

export interface ChainEvents {
  readonly xrpl: readonly EvidenceItem[]
  readonly flare: readonly EvidenceItem[]
  readonly attestation: readonly EvidenceItem[]
  readonly other: readonly EvidenceItem[]
}

/**
 * The events of one operation, grouped by the system they happened on. The
 * grouping is what keeps a journey legible without flattening it: three groups
 * of identifiers, never one identifier standing in for the operation.
 */
export function chainEventsOf(entry: ActivityEntry): ChainEvents {
  const group = (prefixes: readonly string[]) =>
    entry.evidence.filter((item) => prefixes.some((prefix) => item.kind.startsWith(prefix)))

  const xrpl = group(['xrpl_'])
  const flare = group(['flare_'])
  const attestation = group(['fdc_'])
  const claimed = new Set([...xrpl, ...flare, ...attestation])
  return Object.freeze({
    xrpl,
    flare,
    attestation,
    other: entry.evidence.filter((item) => !claimed.has(item)),
  })
}

/**
 * USER-02's `partial coverage`, stated rather than implied. No indexer is
 * built (see `.thoughts/decisions/2026-08-04-m2-open-questions.md`), so history
 * reaches exactly as far as this installation's own records — an operation
 * started in another browser was never in reach, which is a different claim
 * from it not existing.
 */
export const ACTIVITY_COVERAGE_REASON =
  'This history covers the operations started in this installation. No indexer is connected, so an operation started elsewhere will not appear here.'

export interface ActivityCoverage {
  readonly sourceClass: ObservationSource['class']
  readonly complete: boolean
  readonly reason: string
}

export interface ActivityFeed {
  readonly entries: readonly ActivityEntry[]
  readonly coverage: ActivityCoverage
  /** True while older operations are still being reconciled. */
  readonly backfilling: boolean
  readonly empty: boolean
  readonly builtAt: number
}

export interface BuildActivityInput {
  readonly records: readonly OperationRecord[]
  readonly at: number
  readonly backfilling?: boolean
}

export function buildActivity(input: BuildActivityInput): ActivityFeed {
  const entries = [...input.records]
    .map(toActivityEntry)
    .sort((left, right) => right.updatedAt - left.updatedAt)
  const backfilling = input.backfilling ?? false

  return Object.freeze({
    entries: Object.freeze(entries),
    coverage: Object.freeze({
      sourceClass: 'local' as const,
      complete: false,
      reason: ACTIVITY_COVERAGE_REASON,
    }),
    backfilling,
    // An empty list during a backfill is an unfinished read, not an answer.
    empty: entries.length === 0 && !backfilling,
    builtAt: input.at,
  })
}

export interface ActivityFilter {
  readonly capability?: string
  readonly state?: OperationState
  /** Matched against the operation id and every identifier it correlates. */
  readonly search?: string
}

export function filterActivity(
  feed: ActivityFeed,
  filter: ActivityFilter,
): readonly ActivityEntry[] {
  const needle = filter.search?.trim().toLowerCase()
  return feed.entries.filter((entry) => {
    if (filter.capability && entry.capability !== filter.capability) return false
    if (filter.state && entry.state !== filter.state) return false
    if (!needle) return true
    return (
      entry.operationId.toLowerCase().includes(needle) ||
      entry.evidence.some((item) => item.value.toLowerCase().includes(needle))
    )
  })
}

/** Bumped when the exported shape changes, so a reader knows what it holds. */
export const ACTIVITY_EXPORT_SCHEMA_VERSION = 1

/**
 * A copy of the history a person can keep. M2-R8: the same secret guard the
 * durable store uses runs here too — an export leaves the process, so it is the
 * last place a seed in an intent could slip out.
 */
export function exportActivity(feed: ActivityFeed): string {
  for (const entry of feed.entries) {
    assertNoSecrets(entry.intent, `${entry.operationId}.intent`)
  }
  return JSON.stringify(
    {
      schemaVersion: ACTIVITY_EXPORT_SCHEMA_VERSION,
      exportedAt: feed.builtAt,
      coverage: feed.coverage,
      backfilling: feed.backfilling,
      entries: feed.entries,
    },
    (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value),
    2,
  )
}
