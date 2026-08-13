import { describe, expect, it } from 'vitest'
import { addAmounts, amount, formatExact, parseAmount, subAmounts } from '../src/amounts.js'

// R-OP-001: amounts use exact typed representations. Floating-point token
// arithmetic is prohibited.
// DESIGN.md: "Amounts always carry asset and full stored precision:
// 250.000000 XRP, never 250."

describe('amount', () => {
  it('stores base units as bigint alongside asset and decimals', () => {
    const a = amount(250_000_000n, 6, 'XRP')
    expect(a.value).toBe(250_000_000n)
    expect(a.decimals).toBe(6)
    expect(a.asset).toBe('XRP')
  })

  it('is frozen, so a quote snapshot cannot be rewritten in place', () => {
    const a = amount(1n, 6, 'XRP')
    expect(Object.isFrozen(a)).toBe(true)
  })
})

describe('formatExact', () => {
  it('renders full stored precision, never a trimmed number', () => {
    expect(formatExact(amount(250_000_000n, 6, 'XRP'))).toBe('250.000000 XRP')
  })

  it('keeps every significant digit of an 18-decimal balance', () => {
    expect(formatExact(amount(1_234_567_890_123_456_789n, 18, 'FXRP'))).toBe(
      '1.234567890123456789 FXRP',
    )
  })

  it('renders zero with its full scale', () => {
    expect(formatExact(amount(0n, 6, 'XRP'))).toBe('0.000000 XRP')
  })

  it('renders a sub-unit value without losing the leading zeros', () => {
    expect(formatExact(amount(1n, 6, 'XRP'))).toBe('0.000001 XRP')
  })

  it('renders an integer-scaled asset without a decimal point', () => {
    expect(formatExact(amount(7n, 0, 'lots'))).toBe('7 lots')
  })

  it('carries the sign for a negative delta', () => {
    expect(formatExact(amount(-1_500_000n, 6, 'XRP'))).toBe('-1.500000 XRP')
  })

  it('can omit the asset for composed rendering, but never the precision', () => {
    expect(formatExact(amount(250_000_000n, 6, 'XRP'), { asset: false })).toBe('250.000000')
  })
})

describe('parseAmount', () => {
  it('parses a decimal string into exact base units', () => {
    expect(parseAmount('250', 6, 'XRP').value).toBe(250_000_000n)
    expect(parseAmount('250.5', 6, 'XRP').value).toBe(250_500_000n)
    expect(parseAmount('0.000001', 6, 'XRP').value).toBe(1n)
  })

  it('rejects more precision than the asset can hold rather than rounding it away', () => {
    expect(() => parseAmount('0.0000001', 6, 'XRP')).toThrow(/precision/i)
  })

  it('rejects a value that is not an exact decimal string', () => {
    expect(() => parseAmount('1e6', 6, 'XRP')).toThrow()
    expect(() => parseAmount('', 6, 'XRP')).toThrow()
    expect(() => parseAmount('abc', 6, 'XRP')).toThrow()
    expect(() => parseAmount('1.2.3', 6, 'XRP')).toThrow()
  })

  it('round-trips through formatExact', () => {
    const a = parseAmount('1234.567891', 6, 'XRP')
    expect(formatExact(a)).toBe('1234.567891 XRP')
  })
})

describe('arithmetic', () => {
  it('adds and subtracts within one asset', () => {
    const a = parseAmount('10', 6, 'XRP')
    const b = parseAmount('2.5', 6, 'XRP')
    expect(formatExact(addAmounts(a, b))).toBe('12.500000 XRP')
    expect(formatExact(subAmounts(a, b))).toBe('7.500000 XRP')
  })

  it('refuses to mix assets, so a fee is never silently added to a principal', () => {
    const xrp = parseAmount('10', 6, 'XRP')
    const fxrp = parseAmount('10', 18, 'FXRP')
    expect(() => addAmounts(xrp, fxrp)).toThrow(/asset/i)
  })

  it('refuses to mix scales of the same asset symbol', () => {
    expect(() => addAmounts(amount(1n, 6, 'XRP'), amount(1n, 18, 'XRP'))).toThrow(
      /decimals/i,
    )
  })
})
