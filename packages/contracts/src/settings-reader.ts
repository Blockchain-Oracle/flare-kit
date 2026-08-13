/**
 * Reading individual values out of `getSettings()`.
 *
 * `AssetManagerSettings.Data` has 60 fields and no per-field getters, and the
 * few values a redemption quote needs live inside it. Hand-transcribing 60
 * fields is exactly where a silent error hides, so instead this reads by
 * position: an ABI head has one word per field, including dynamic ones, which
 * hold an offset rather than a value.
 *
 * The indices below were confirmed against Coston2 on 2026-08-04 by checking
 * that each field's value matched its declared meaning — 500 blocks, a 900
 * second window, a 50 BIPS fee, a 10500 BIPS (105%) default factor. Four
 * corroborations, not one plausible-looking number.
 *
 * `decodeSettingsWord` validates the result against an expected range, so a
 * struct reordering surfaces as a thrown error rather than a wrong fee.
 */

/** 0-based field positions in `AssetManagerSettings.Data`. */
export const SETTINGS_FIELD_INDEX = {
  underlyingBlocksForPayment: 23,
  underlyingSecondsForPayment: 24,
  redemptionFeeBIPS: 25,
  redemptionDefaultFactorVaultCollateralBIPS: 26,
} as const

export type SettingsField = keyof typeof SETTINGS_FIELD_INDEX

/** Plausible ranges. A value outside one means the struct moved under us. */
const EXPECTED: Record<SettingsField, { min: bigint; max: bigint }> = {
  underlyingBlocksForPayment: { min: 1n, max: 1_000_000n },
  underlyingSecondsForPayment: { min: 1n, max: 2_592_000n },
  // A fee is a fraction of the whole.
  redemptionFeeBIPS: { min: 0n, max: 10_000n },
  // A default factor is at least whole, and premiums are not unbounded.
  redemptionDefaultFactorVaultCollateralBIPS: { min: 10_000n, max: 30_000n },
}

/**
 * Extracts one field from the raw return data of `getSettings()`.
 *
 * @param returnData hex of the eth_call result, including the leading tuple offset
 */
export function decodeSettingsWord(returnData: string, field: SettingsField): bigint {
  const hex = returnData.startsWith('0x') ? returnData.slice(2) : returnData
  if (hex.length < 64) {
    throw new Error(`getSettings() returned ${hex.length / 2} bytes, too short to decode.`)
  }
  // The result is a dynamically sized tuple, so it opens with an offset to it.
  const tupleOffsetBytes = Number(BigInt(`0x${hex.slice(0, 64)}`))
  const head = tupleOffsetBytes * 2
  const index = SETTINGS_FIELD_INDEX[field]
  const start = head + index * 64
  const word = hex.slice(start, start + 64)
  if (word.length !== 64) {
    throw new Error(`getSettings() has no word at index ${index} for ${field}.`)
  }

  const value = BigInt(`0x${word}`)
  const range = EXPECTED[field]
  if (value < range.min || value > range.max) {
    throw new Error(
      `${field} read as ${value}, outside its plausible range ${range.min}..${range.max}. The AssetManagerSettings layout has probably changed; re-verify SETTINGS_FIELD_INDEX against the deployed contract.`,
    )
  }
  return value
}

/**
 * `keccak256("getSettings()")[0:4]`. Pinned rather than computed so core stays
 * free of a runtime ABI dependency, and proved by a test — an earlier draft of
 * this had it wrong, which would have failed only against a live chain.
 */
export const GET_SETTINGS_SELECTOR = '0x85b4bb53' as const

export const settingsReaderAbi = [
  {
    type: 'function',
    name: 'getSettings',
    stateMutability: 'view',
    inputs: [],
    // Deliberately untyped: the caller reads raw bytes and decodes by position.
    outputs: [],
  },
] as const
