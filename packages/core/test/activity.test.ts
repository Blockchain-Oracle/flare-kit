import { describe, expect, it } from 'vitest'
import { evidence } from '../src/evidence.js'
import type { OperationRecord } from '../src/operation.js'
import {
  ACTIVITY_COVERAGE_REASON,
  buildActivity,
  chainEventsOf,
  exportActivity,
  filterActivity,
  toActivityEntry,
} from '../src/activity.js'

// M2-R5: "ActivityFeed is operation-centric: every entry is a durable operation
// with its state, its evidence, and its underlying events reachable. A mint's
// XRPL payment, FDC round and Flare execution stay three identifiers, never
// one." — R-DATA-003.

const CHAIN_ID = 114

const XRPL_TX = 'E3FE6EA3D48F0C2B639448020EA4F03D4F4F8FFDB243A852A0F59177921B4879'
const FLARE_TX = '0x9f2c1d5e4b8a37c06d1e2f3a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e'

function record(overrides: Partial<OperationRecord> = {}): OperationRecord {
  return {
    schemaVersion: 1,
    id: 'op_mint_1',
    capability: 'fassets.direct-mint',
    network: CHAIN_ID,
    intent: {},
    quoteHistory: [],
    state: 'succeeded',
    steps: [],
    evidence: [
      evidence({ kind: 'xrpl_tx', label: 'XRPL payment', value: XRPL_TX, observedAt: 1_100 }),
      evidence({ kind: 'fdc_round', label: 'FDC round', value: '923114', observedAt: 1_200 }),
      evidence({ kind: 'flare_tx', label: 'Flare execution', value: FLARE_TX, observedAt: 1_300 }),
    ],
    attempts: [],
    createdAt: 1_000,
    updatedAt: 1_300,
    ...overrides,
  }
}

describe('an activity entry is an operation', () => {
  it('is identified by the operation, never by a transaction hash', () => {
    const entry = toActivityEntry(record())
    expect(entry.operationId).toBe('op_mint_1')
    expect(entry.capability).toBe('fassets.direct-mint')
    expect(entry.state).toBe('succeeded')
    expect(entry.startedAt).toBe(1_000)
    expect(entry.updatedAt).toBe(1_300)
  })

  it('keeps the XRPL payment, the FDC round and the Flare execution as three', () => {
    // R-DATA-003. Collapsing a multi-chain journey to one hash is the specific
    // flattening this requirement forbids.
    const entry = toActivityEntry(record())
    expect(entry.evidence).toHaveLength(3)
    expect(entry.evidence.map((item) => item.value)).toEqual([XRPL_TX, '923114', FLARE_TX])
  })

  it('makes each underlying event reachable on its own explorer', () => {
    const entry = toActivityEntry(record())
    const byKind = Object.fromEntries(entry.evidence.map((item) => [item.kind, item.href]))
    expect(byKind['xrpl_tx']).toContain('testnet.xrpl.org')
    expect(byKind['flare_tx']).toContain('coston2-explorer.flare.network')
    // The round is real and copyable, but no explorer indexes it.
    expect(byKind['fdc_round']).toBeUndefined()
  })

  it('groups the events by the chain they happened on', () => {
    const events = chainEventsOf(toActivityEntry(record()))
    expect(events.xrpl.map((item) => item.value)).toEqual([XRPL_TX])
    expect(events.flare.map((item) => item.value)).toEqual([FLARE_TX])
    expect(events.attestation.map((item) => item.value)).toEqual(['923114'])
  })

  it('is a local observation, because our own record is what produced it', () => {
    const entry = toActivityEntry(record())
    expect(entry.source.class).toBe('local')
    expect(entry.source.chainId).toBe(CHAIN_ID)
  })

  it('never renders submitted as succeeded', () => {
    expect(toActivityEntry(record({ state: 'submitted' })).state).toBe('submitted')
  })
})

describe('buildActivity', () => {
  const feed = () =>
    buildActivity({
      records: [record(), record({ id: 'op_redeem_1', capability: 'fassets.redeem', state: 'awaiting_external', updatedAt: 2_000 })],
      at: 3_000,
    })

  it('orders the most recently updated first', () => {
    expect(feed().entries.map((entry) => entry.operationId)).toEqual(['op_redeem_1', 'op_mint_1'])
  })

  it('is empty, not broken, when nothing has ever been started', () => {
    const empty = buildActivity({ records: [], at: 3_000 })
    expect(empty.entries).toHaveLength(0)
    expect(empty.empty).toBe(true)
  })

  it('is not empty when it holds entries', () => {
    expect(feed().empty).toBe(false)
  })

  it('declares that its coverage is only what this installation started', () => {
    // USER-02's `partial coverage`. With no indexer built, an operation started
    // in another browser is not missing from history — it was never in reach.
    const built = feed()
    expect(built.coverage.complete).toBe(false)
    expect(built.coverage.sourceClass).toBe('local')
    expect(built.coverage.reason).toBe(ACTIVITY_COVERAGE_REASON)
  })

  it('says when it is still backfilling rather than claiming to be complete', () => {
    const built = buildActivity({ records: [record()], at: 3_000, backfilling: true })
    expect(built.backfilling).toBe(true)
    expect(built.empty).toBe(false)
  })

  it('is not called empty while a backfill is still running', () => {
    // An empty list mid-backfill is an unfinished read, not an answer.
    const built = buildActivity({ records: [], at: 3_000, backfilling: true })
    expect(built.empty).toBe(false)
  })
})

describe('filterActivity', () => {
  const feed = buildActivity({
    records: [
      record(),
      record({ id: 'op_redeem_1', capability: 'fassets.redeem', state: 'action_required', updatedAt: 2_000 }),
    ],
    at: 3_000,
  })

  it('filters by capability', () => {
    const found = filterActivity(feed, { capability: 'fassets.redeem' })
    expect(found.map((entry) => entry.operationId)).toEqual(['op_redeem_1'])
  })

  it('filters by state', () => {
    expect(filterActivity(feed, { state: 'succeeded' })).toHaveLength(1)
  })

  it('finds an operation by a full identifier it correlates', () => {
    // R-OP-002: the operation is identified by none of its hashes and
    // correlates all of them, so search has to look through the evidence.
    expect(filterActivity(feed, { search: XRPL_TX })).toHaveLength(2)
    expect(filterActivity(feed, { search: FLARE_TX })).toHaveLength(2)
  })

  it('finds an operation by its own id', () => {
    expect(filterActivity(feed, { search: 'op_redeem_1' })).toHaveLength(1)
  })

  it('returns nothing rather than everything when a search matches nothing', () => {
    expect(filterActivity(feed, { search: 'not-an-identifier' })).toHaveLength(0)
  })

  it('applies filters together', () => {
    expect(filterActivity(feed, { capability: 'fassets.redeem', state: 'succeeded' })).toHaveLength(0)
  })
})

describe('exportActivity', () => {
  const feed = buildActivity({ records: [record()], at: 3_000 })

  it('exports every identifier at full precision', () => {
    const text = exportActivity(feed)
    expect(text).toContain(XRPL_TX)
    expect(text).toContain(FLARE_TX)
    expect(text).toContain('923114')
  })

  it('records the coverage limit inside the export, not only on screen', () => {
    // An exported file outlives the screen that explained it.
    expect(JSON.parse(exportActivity(feed)).coverage.complete).toBe(false)
  })

  it('carries the schema version so a reader knows what it is holding', () => {
    expect(JSON.parse(exportActivity(feed)).schemaVersion).toBeGreaterThan(0)
  })

  it('never exports a secret, whatever a caller put in the intent', () => {
    // M2-R8: no seed phrase or private key is logged, persisted or transported.
    const leaky = buildActivity({
      records: [record({ intent: { seed: 'sprout badge …', recipient: '0xA4b0' } })],
      at: 3_000,
    })
    expect(() => exportActivity(leaky)).toThrow(/secret|seed/i)
  })
})
