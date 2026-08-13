import { describe, expect, it } from 'vitest'
import { UnsupportedNetworkError } from '../src/chains.js'
import { dexFor, dexTokens } from '../src/dex.js'

// M5-R2: the swap venue is one source of truth, per network, and the addresses
// were grounded on-chain by the R1 probe — not inferred.

describe('dexFor', () => {
  it('serves Coston2 with the BlazeSwap deployment that holds the FXRP pool', () => {
    const dex = dexFor(114)
    expect(dex.router).toBe('0x440602f459d7dd500a74528003e6a20a46d6e2a6')
    expect(dex.factory).toBe('0x02d03957Cf02d153141bf23C60099E9aa48bf872')
    // The chain deploys FTestXRP, not FXRP — the symbol never lies about that.
    expect(dex.tokens.FXRP?.symbol).toBe('FTestXRP')
    expect(dex.tokens.FXRP?.decimals).toBe(6)
    expect(dex.tokens.USDT0?.decimals).toBe(6)
  })

  it('serves Flare with the SparkDEX V2 router — the same V2 interface, one address away', () => {
    const dex = dexFor(14)
    expect(dex.router).toBe('0x4a1E5A90e9943467FAd1acea1E7F0e5e88472a1e')
    expect(dex.factory).toBe('0x16b619B04c961E8f4F06C10B42FDAbb328980A89')
    expect(dex.tokens.FXRP?.symbol).toBe('FXRP')
  })

  it('offers USD₮0 ↔ FXRP as the R1-verified canonical pair on both networks', () => {
    expect(dexFor(114).canonicalPair).toEqual(['USDT0', 'FXRP'])
    expect(dexFor(14).canonicalPair).toEqual(['USDT0', 'FXRP'])
  })

  it('refuses a network the kit does not serve, rather than guessing a venue', () => {
    expect(() => dexFor(1)).toThrow(UnsupportedNetworkError)
  })
})

describe('dexTokens', () => {
  it('lists the swappable tokens for a selector', () => {
    const symbols = dexTokens(114).map((t) => t.symbol)
    expect(symbols).toContain('FTestXRP')
    expect(symbols).toContain('USD₮0')
    expect(symbols).toContain('WC2FLR')
  })
})
