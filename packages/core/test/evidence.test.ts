import { describe, expect, it } from 'vitest'
import {
  evidence,
  findEvidence,
  mergeEvidence,
  truncateAddress,
  truncateHash,
} from '../src/evidence.js'

// DESIGN.md: "Evidence chip. One anatomy everywhere: mono type label, truncated
// identifier, copy control revealing the full value. Identical in the widget,
// the timeline, the receipt, the operator console and the support workspace."
// R-LIFE-005: tolerate duplicate events, out-of-order delivery and historical
// backfill without duplicating effects.

describe('mergeEvidence', () => {
  const xrplTx = evidence({
    kind: 'xrpl_tx',
    label: 'XRPL payment',
    value: 'E3FE6EA3D48F0C2B639448020EA4F03D4F4F8FFDB243A852A0F59177921B4879',
    observedAt: 1_000,
  })

  it('appends an unseen item', () => {
    const merged = mergeEvidence([], [xrplTx])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.value).toBe(xrplTx.value)
  })

  it('is idempotent: a duplicate event adds nothing', () => {
    const once = mergeEvidence([], [xrplTx])
    const twice = mergeEvidence(once, [xrplTx])
    expect(twice).toHaveLength(1)
  })

  it('keeps the earliest sighting when a late duplicate arrives', () => {
    const late = evidence({ ...xrplTx, observedAt: 9_000 })
    const merged = mergeEvidence([xrplTx], [late])
    expect(merged[0]?.observedAt).toBe(1_000)
  })

  it('fills in a link that a later sighting supplies without losing the first', () => {
    const withLink = evidence({ ...xrplTx, href: 'https://testnet.xrpl.org/transactions/E3FE' })
    const merged = mergeEvidence([xrplTx], [withLink])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.href).toBe('https://testnet.xrpl.org/transactions/E3FE')
    expect(merged[0]?.observedAt).toBe(1_000)
  })

  it('keeps two different values of the same kind, because both are real', () => {
    const other = evidence({ ...xrplTx, value: 'AAAA1111' })
    const merged = mergeEvidence([xrplTx], [other])
    expect(merged).toHaveLength(2)
  })

  it('preserves insertion order, so the timeline reads chronologically', () => {
    const round = evidence({
      kind: 'fdc_round',
      label: 'FDC round',
      value: '1043912',
      observedAt: 2_000,
    })
    const merged = mergeEvidence([xrplTx], [round])
    expect(merged.map((e) => e.kind)).toEqual(['xrpl_tx', 'fdc_round'])
  })

  it('never mutates the list it was given', () => {
    const original = [xrplTx]
    mergeEvidence(original, [evidence({ ...xrplTx, value: 'BBBB' })])
    expect(original).toHaveLength(1)
  })
})

describe('findEvidence', () => {
  it('returns the first item of a kind, or undefined', () => {
    const list = [
      evidence({ kind: 'fdc_round', label: 'FDC round', value: '1043912', observedAt: 1 }),
    ]
    expect(findEvidence(list, 'fdc_round')?.value).toBe('1043912')
    expect(findEvidence(list, 'flare_tx')).toBeUndefined()
  })
})

describe('truncation', () => {
  // DESIGN.md: "Addresses truncate first-6/last-4, hashes first-10/last-6, and
  // the full value is always copyable."
  it('truncates an EVM address first-6 last-4', () => {
    expect(truncateAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(
      '0x1234…5678',
    )
  })

  it('truncates an XRPL classic address by the same rule', () => {
    expect(truncateAddress('rNBjmsJ8xLKvSbUZbGpFxk9Tt2cCPVKcRV')).toBe('rNBjms…KcRV')
  })

  it('truncates a hash first-10 last-6', () => {
    expect(
      truncateHash('0x9f2c8d1e4b7a5063c8f1d2e3a4b5c6d7e8f90123456789abcdef0123456789ab'),
    ).toBe('0x9f2c8d1e…6789ab')
  })

  it('returns short values untouched rather than adding a misleading ellipsis', () => {
    expect(truncateAddress('0x1234')).toBe('0x1234')
    expect(truncateHash('1043912')).toBe('1043912')
  })
})
