import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FRESH_FOR,
  SOURCE_CLASSES,
  type Observation,
  isObserved,
  observationAge,
  observe,
  sourcesAgree,
  staleness,
  unavailable,
} from '../src/observation.js'

// M2-R1: "Observation<T> in core: value, source class, provider, network,
// observed-at, and staleness. Every portfolio and activity value is one.
// Source classes are distinct: chain (direct read), indexer, provider, cache,
// local (our own operation record)." — R-DATA-005.
// M2-AC4: "A stale or unavailable source renders as stale or unavailable,
// never as zero and never as a confident number."

const coston2 = {
  class: 'chain',
  provider: 'Coston2 RPC',
  network: 'Coston2',
  chainId: 114,
} as const

const indexed = {
  class: 'indexer',
  provider: 'Example indexer',
  network: 'Coston2',
  chainId: 114,
} as const

describe('source classes', () => {
  it('names exactly the five R-DATA-005 requires', () => {
    expect([...SOURCE_CLASSES]).toEqual(['chain', 'indexer', 'provider', 'cache', 'local'])
  })

  it('gives every class its own freshness budget', () => {
    for (const cls of SOURCE_CLASSES) {
      expect(DEFAULT_FRESH_FOR[cls]).toBeGreaterThan(0)
    }
  })

  it('never lets a cached value claim the freshness of a direct read', () => {
    expect(DEFAULT_FRESH_FOR.cache).toBeGreaterThan(DEFAULT_FRESH_FOR.chain)
  })

  it('treats our own operation record as never going stale', () => {
    // A local record is the canonical statement of our own operation. Nothing
    // upstream can make it out of date, so it has no expiry.
    expect(DEFAULT_FRESH_FOR.local).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('observe', () => {
  it('carries the value with its source, network and observation time', () => {
    const balance = observe(1_000n, coston2, 5_000)
    expect(balance.status).toBe('observed')
    expect(balance.value).toBe(1_000n)
    expect(balance.source.class).toBe('chain')
    expect(balance.source.provider).toBe('Coston2 RPC')
    expect(balance.source.network).toBe('Coston2')
    expect(balance.observedAt).toBe(5_000)
  })

  it('is frozen, so a consumer cannot revise what was observed', () => {
    const balance = observe(1_000n, coston2, 5_000)
    expect(Object.isFrozen(balance)).toBe(true)
    expect(Object.isFrozen(balance.source)).toBe(true)
  })

  it('accepts an explicit freshness budget that overrides the class default', () => {
    const balance = observe(1_000n, coston2, 5_000, 1)
    expect(staleness(balance, 5_002).stale).toBe(true)
  })
})

describe('unavailable', () => {
  it('records which source failed and why, and carries no value', () => {
    const missing = unavailable(coston2, 5_000, 'The Coston2 RPC did not respond.')
    expect(missing.status).toBe('unavailable')
    expect(missing.reason).toBe('The Coston2 RPC did not respond.')
    expect(missing.source.provider).toBe('Coston2 RPC')
    expect('value' in missing).toBe(false)
  })

  it('cannot be read as a value without narrowing first', () => {
    // The guard is the type, not a convention: `isObserved` is the only way to
    // reach `.value`, so a renderer cannot fall back to zero by accident.
    const missing: Observation<bigint> = unavailable(coston2, 5_000, 'No response.')
    expect(isObserved(missing)).toBe(false)
    if (isObserved(missing)) expect.unreachable('an unavailable observation has no value')
  })
})

describe('staleness', () => {
  const balance = observe(1_000n, coston2, 5_000)

  it('measures age from when it was observed, not when it happened', () => {
    expect(observationAge(balance, 7_500)).toBe(2_500)
  })

  it('is fresh inside its budget', () => {
    const result = staleness(balance, 5_000 + DEFAULT_FRESH_FOR.chain - 1)
    expect(result.stale).toBe(false)
    expect(result.freshFor).toBe(DEFAULT_FRESH_FOR.chain)
  })

  it('is stale past its budget', () => {
    expect(staleness(balance, 5_000 + DEFAULT_FRESH_FOR.chain + 1).stale).toBe(true)
  })

  it('reports a clock that ran backwards as age zero rather than negative', () => {
    // Wall clocks jump. An observation from the future is not fresher than now.
    expect(observationAge(balance, 4_000)).toBe(0)
    expect(staleness(balance, 4_000).stale).toBe(false)
  })

  it('applies to an unavailable observation too', () => {
    const missing = unavailable(coston2, 5_000, 'No response.')
    expect(staleness(missing, 5_000 + DEFAULT_FRESH_FOR.chain + 1).stale).toBe(true)
  })

  it('never marks a local record stale, however old', () => {
    const local = observe('op_1', { class: 'local', provider: 'Operation registry', network: 'Coston2' }, 0)
    expect(staleness(local, Number.MAX_SAFE_INTEGER).stale).toBe(false)
  })
})

describe('sourcesAgree', () => {
  // USER-03 requires a canonical/indexed conflict state. A conflict is two
  // source classes claiming different values for the same thing — which is
  // information, not an error, and is never resolved by picking one silently.
  it('agrees when two classes report the same value', () => {
    expect(sourcesAgree(observe(7n, coston2, 1_000), observe(7n, indexed, 1_200))).toBe(true)
  })

  it('conflicts when two classes report different values', () => {
    expect(sourcesAgree(observe(7n, coston2, 1_000), observe(8n, indexed, 1_200))).toBe(false)
  })

  it('does not call an unavailable source a conflict', () => {
    // Not knowing is not disagreeing. SourceDrawer renders those differently.
    expect(sourcesAgree(observe(7n, coston2, 1_000), unavailable(indexed, 1_200, 'Down.'))).toBe(
      true,
    )
  })
})
