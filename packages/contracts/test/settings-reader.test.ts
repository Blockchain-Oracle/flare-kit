import { describe, expect, it } from 'vitest'
import { toFunctionSelector } from 'viem'
import {
  GET_SETTINGS_SELECTOR,
  SETTINGS_FIELD_INDEX,
  decodeSettingsWord,
} from '../src/settings-reader.js'

/**
 * Positional decoding of `getSettings()`. The indices were corroborated against
 * Coston2 on 2026-08-04; these tests pin the mechanism and, more importantly,
 * prove that a moved field fails loudly instead of returning a wrong fee.
 */

const word = (n: bigint) => n.toString(16).padStart(64, '0')

/** Builds return data with `values` placed at head positions 0..n. */
function settingsData(values: Record<number, bigint>): string {
  const head = Array.from({ length: 60 }, (_, i) => word(values[i] ?? 0n)).join('')
  // Leading offset to the tuple, as a dynamically sized tuple return.
  return `0x${word(32n)}${head}`
}

const LIVE = settingsData({
  23: 500n, // underlyingBlocksForPayment
  24: 900n, // underlyingSecondsForPayment
  25: 50n, // redemptionFeeBIPS
  26: 10_500n, // redemptionDefaultFactorVaultCollateralBIPS
})

describe('decodeSettingsWord', () => {
  it('reads each field at its verified position', () => {
    expect(decodeSettingsWord(LIVE, 'underlyingBlocksForPayment')).toBe(500n)
    expect(decodeSettingsWord(LIVE, 'underlyingSecondsForPayment')).toBe(900n)
    expect(decodeSettingsWord(LIVE, 'redemptionFeeBIPS')).toBe(50n)
    expect(decodeSettingsWord(LIVE, 'redemptionDefaultFactorVaultCollateralBIPS')).toBe(10_500n)
  })

  it('reproduces the values actually read from Coston2', () => {
    // 15-minute agent window, 0.5% fee, 105% default premium.
    expect(Number(decodeSettingsWord(LIVE, 'underlyingSecondsForPayment')) / 60).toBe(15)
    expect(Number(decodeSettingsWord(LIVE, 'redemptionFeeBIPS')) / 100).toBe(0.5)
    expect(Number(decodeSettingsWord(LIVE, 'redemptionDefaultFactorVaultCollateralBIPS')) / 100).toBe(105)
  })
})

describe('it fails loudly rather than returning a wrong number', () => {
  it('rejects a fee outside the plausible range', () => {
    // What a shifted struct would look like: a huge value where BIPS belongs.
    const shifted = settingsData({ 25: 999_999_999n })
    expect(() => decodeSettingsWord(shifted, 'redemptionFeeBIPS')).toThrow(
      /outside its plausible range/,
    )
  })

  it('names the field and tells the reader what to re-verify', () => {
    const shifted = settingsData({ 26: 5n })
    expect(() =>
      decodeSettingsWord(shifted, 'redemptionDefaultFactorVaultCollateralBIPS'),
    ).toThrow(/SETTINGS_FIELD_INDEX/)
  })

  it('rejects a default factor below 100%, which would be a discount not a premium', () => {
    expect(() => decodeSettingsWord(settingsData({ 26: 9_000n }), 'redemptionDefaultFactorVaultCollateralBIPS')).toThrow()
  })

  it('rejects truncated return data', () => {
    expect(() => decodeSettingsWord('0x1234', 'redemptionFeeBIPS')).toThrow(/too short/)
  })

  it('rejects data that has no word at the requested index', () => {
    const short = `0x${word(32n)}${word(0n).repeat(5)}`
    expect(() => decodeSettingsWord(short, 'redemptionFeeBIPS')).toThrow(/no word at index/)
  })
})

describe('the indices themselves', () => {
  it('keeps the redemption fields adjacent, as the struct declares them', () => {
    expect(SETTINGS_FIELD_INDEX.underlyingSecondsForPayment).toBe(
      SETTINGS_FIELD_INDEX.underlyingBlocksForPayment + 1,
    )
    expect(SETTINGS_FIELD_INDEX.redemptionFeeBIPS).toBe(
      SETTINGS_FIELD_INDEX.underlyingSecondsForPayment + 1,
    )
    expect(SETTINGS_FIELD_INDEX.redemptionDefaultFactorVaultCollateralBIPS).toBe(
      SETTINGS_FIELD_INDEX.redemptionFeeBIPS + 1,
    )
  })
})

describe('the pinned selector', () => {
  it('really is keccak256("getSettings()")[0:4]', () => {
    // Pinned by hand once and wrong; now proved, because a bad selector only
    // shows up as an inscrutable failure against a live chain.
    expect(GET_SETTINGS_SELECTOR).toBe(toFunctionSelector('getSettings()'))
  })
})
