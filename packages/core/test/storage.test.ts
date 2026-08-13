import { describe, expect, it } from 'vitest'
import { amount } from '../src/amounts.js'
import { applyTransition } from '../src/operation.js'
import { OPERATION_SCHEMA_VERSION, createMemoryStore, decodeRecord, encodeRecord } from '../src/storage.js'
import { advanceTo, op } from './helpers.js'

// R5: operation records persist and resume by ID across reload and process
// restart, through a storage adapter with an in-memory default.
// R-REC-001: durable storage is pluggable and versioned.
// R-REC-002: persisted records exclude wallet secrets and plaintext confidential inputs.
// R-REC-008: an unrecognized schema version must not be silently coerced.

describe('createMemoryStore', () => {
  it('round-trips a record by id', async () => {
    const store = createMemoryStore()
    const record = op()
    await store.put(record)
    expect((await store.get(record.id))?.id).toBe(record.id)
  })

  it('returns undefined for an unknown id rather than throwing', async () => {
    expect(await createMemoryStore().get('op_nope')).toBeUndefined()
  })

  it('overwrites by id, keeping the latest state', async () => {
    const store = createMemoryStore()
    const record = op()
    await store.put(record)
    await store.put(applyTransition(record, { to: 'quoting', at: 2_000 }).record)
    expect((await store.get(record.id))?.state).toBe('quoting')
  })

  it('lists newest first, so resume shows current work at the top', async () => {
    const store = createMemoryStore()
    const older = op()
    const newer = applyTransition(op(), { to: 'quoting', at: 5_000 }).record
    await store.put(older)
    await store.put(newer)
    expect((await store.list()).map((r) => r.id)).toEqual([newer.id, older.id])
  })

  it('filters a list to unfinished work', async () => {
    const store = createMemoryStore()
    await store.put(op())
    await store.put(advanceTo('succeeded'))
    const open = await store.list({ open: true })
    expect(open).toHaveLength(1)
    expect(open[0]?.state).toBe('draft')
  })

  it('deletes by id', async () => {
    const store = createMemoryStore()
    const record = op()
    await store.put(record)
    await store.delete(record.id)
    expect(await store.get(record.id)).toBeUndefined()
  })

  it('hands back a detached copy, so a caller cannot mutate stored state', async () => {
    const store = createMemoryStore()
    const record = op()
    await store.put(record)
    const first = await store.get(record.id)
    expect(first).toBeDefined()
    ;(first as { state: string }).state = 'succeeded'
    expect((await store.get(record.id))?.state).toBe('draft')
  })
})

describe('encodeRecord / decodeRecord', () => {
  it('survives a process restart with bigint amounts exact', async () => {
    // R-OP-001: no floating-point token arithmetic — and JSON.stringify throws
    // on bigint, so the codec has to carry base units losslessly.
    const record = applyTransition(op(), {
      to: 'quoting',
      at: 2_000,
      patch: { quote: { input: amount(250_000_000n, 6, 'XRP') } },
    }).record
    const revived = decodeRecord(encodeRecord(record))
    const quote = revived.quote as { input: { value: bigint; decimals: number; asset: string } }
    expect(quote.input.value).toBe(250_000_000n)
    expect(typeof quote.input.value).toBe('bigint')
    expect(quote.input.decimals).toBe(6)
    expect(quote.input.asset).toBe('XRP')
  })

  it('preserves every piece of evidence across the restart', async () => {
    const record = advanceTo('confirming')
    const revived = decodeRecord(encodeRecord(record))
    expect(revived.evidence).toEqual(record.evidence)
    expect(revived.state).toBe('confirming')
    expect(revived.id).toBe(record.id)
  })

  it('stamps the schema version it was written with', () => {
    expect(JSON.parse(encodeRecord(op())).schemaVersion).toBe(OPERATION_SCHEMA_VERSION)
  })

  it('refuses an unrecognized schema version instead of coercing it', () => {
    // R-REC-008
    const wire = JSON.parse(encodeRecord(op()))
    wire.schemaVersion = OPERATION_SCHEMA_VERSION + 1
    expect(() => decodeRecord(JSON.stringify(wire))).toThrow(/schema version/i)
  })

  it('refuses malformed persisted data rather than resuming from a guess', () => {
    expect(() => decodeRecord('not json')).toThrow()
    expect(() => decodeRecord('{}')).toThrow()
  })
})

describe('secret exclusion (R-REC-002)', () => {
  it('refuses to persist a record carrying a wallet secret', async () => {
    const store = createMemoryStore()
    const record = { ...op(), intent: { amount: '250', seed: 'sEdV...' } }
    await expect(store.put(record as never)).rejects.toThrow(/secret|seed/i)
  })

  it('names the offending field so the caller can fix the shape', async () => {
    const store = createMemoryStore()
    const record = { ...op(), intent: { amount: '250', privateKey: '0xdead' } }
    await expect(store.put(record as never)).rejects.toThrow(/privateKey/)
  })

  it('allows an ordinary record through untouched', async () => {
    const store = createMemoryStore()
    await expect(store.put(op())).resolves.toBeUndefined()
  })
})
