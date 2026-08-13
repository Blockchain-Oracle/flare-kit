/**
 * A number without a source is not evidence.
 *
 * R-DATA-005 requires that a balance read directly from a contract, a balance
 * from an indexer, and a balance from a cache stay three distinct claims. So
 * the unit of portfolio and activity data is not a value — it is an
 * observation: what was seen, by whom, on which network, and when.
 *
 * The type is a union rather than a struct with an optional value on purpose.
 * M2-AC4 forbids rendering an unavailable source as zero, and a `value?: T`
 * would let any consumer write `?? 0n` with the compiler's blessing. Here the
 * only route to a value is through `isObserved`.
 */

/**
 * R-DATA-005. `chain` is a direct read of contract or ledger state; `indexer`
 * is a derived index of it; `provider` is a third-party service's own claim;
 * `cache` is a value we stored earlier; `local` is our own operation record.
 */
export const SOURCE_CLASSES = ['chain', 'indexer', 'provider', 'cache', 'local'] as const

export type SourceClass = (typeof SOURCE_CLASSES)[number]

export interface ObservationSource {
  readonly class: SourceClass
  /** Who was asked, named so a person can tell two indexers apart. */
  readonly provider: string
  /** The network as a proper noun, e.g. "Coston2" or "XRPL Testnet". */
  readonly network: string
  /** Present for EVM networks; the XRP Ledger has no chain id. */
  readonly chainId?: number
}

/**
 * How long a class's claim may be treated as current, in milliseconds. Public
 * values are exported constants, never environment variables (CLAUDE.md).
 *
 * A direct read is good for roughly a Coston2 block or two. An index lags the
 * chain it derives from, and a stored value lags whatever wrote it, so both
 * are given wider budgets than the read they descend from — a cached number
 * may never present itself as fresh as the chain it came from. A local
 * operation record is our own canonical statement of our own operation, so
 * nothing upstream can make it out of date.
 */
export const DEFAULT_FRESH_FOR: Record<SourceClass, number> = {
  chain: 30_000,
  indexer: 60_000,
  provider: 60_000,
  cache: 300_000,
  local: Number.POSITIVE_INFINITY,
}

interface ObservationBase {
  readonly source: ObservationSource
  /** When we saw it, not when it happened. */
  readonly observedAt: number
  /** Overrides the source class's default budget when the producer knows better. */
  readonly freshFor?: number
}

export interface ObservedValue<T> extends ObservationBase {
  readonly status: 'observed'
  readonly value: T
}

export interface UnavailableObservation extends ObservationBase {
  readonly status: 'unavailable'
  /** Said in words, because "unavailable" alone is not an explanation. */
  readonly reason: string
}

export type Observation<T> = ObservedValue<T> | UnavailableObservation

function freezeSource(source: ObservationSource): ObservationSource {
  return Object.freeze({ ...source })
}

export function observe<T>(
  value: T,
  source: ObservationSource,
  observedAt: number,
  freshFor?: number,
): ObservedValue<T> {
  return Object.freeze({
    status: 'observed' as const,
    value,
    source: freezeSource(source),
    observedAt,
    ...(freshFor === undefined ? {} : { freshFor }),
  })
}

/**
 * A source we asked and could not read. It keeps its source and its time
 * because "the Coston2 RPC did not answer at 14:02" is a different claim from
 * "we never looked", and both are different from zero.
 */
export function unavailable(
  source: ObservationSource,
  observedAt: number,
  reason: string,
  freshFor?: number,
): UnavailableObservation {
  return Object.freeze({
    status: 'unavailable' as const,
    reason,
    source: freezeSource(source),
    observedAt,
    ...(freshFor === undefined ? {} : { freshFor }),
  })
}

export function isObserved<T>(observation: Observation<T>): observation is ObservedValue<T> {
  return observation.status === 'observed'
}

/**
 * Age in milliseconds, floored at zero. Wall clocks jump backwards across
 * daylight saving, NTP correction and a laptop waking up; an observation
 * timestamped after `now` is not fresher than now, it is a clock artefact.
 */
export function observationAge(observation: Observation<unknown>, now: number): number {
  return Math.max(0, now - observation.observedAt)
}

export interface Staleness {
  readonly ageMs: number
  readonly freshFor: number
  readonly stale: boolean
}

export function staleness(observation: Observation<unknown>, now: number): Staleness {
  const budget = observation.freshFor ?? DEFAULT_FRESH_FOR[observation.source.class]
  const ageMs = observationAge(observation, now)
  return { ageMs, freshFor: budget, stale: ageMs > budget }
}

/**
 * Whether two source classes tell the same story about the same thing.
 *
 * USER-03 requires a canonical/indexed conflict state. A conflict is surfaced,
 * never resolved by silently preferring one class — but a source that could
 * not be read is not disagreeing with anything, so it does not count as one.
 */
export function sourcesAgree<T>(
  a: Observation<T>,
  b: Observation<T>,
  equals: (left: T, right: T) => boolean = Object.is,
): boolean {
  if (!isObserved(a) || !isObserved(b)) return true
  return equals(a.value, b.value)
}
