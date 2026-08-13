import { describe, expect, it } from 'vitest'
import { encodeFunctionData, getAbiItem } from 'viem'
import {
  FIRELIGHT_VAULT_ABI,
  UPSHIFT_VAULT_ABI,
  vaultByKey,
  vaultsFor,
  vaultsForChain,
} from '../src/index.js'

// M7-R1: the vault registry is the one source of truth for addresses and shapes,
// and the two vaults are materially different contracts. These tests pin the
// probed addresses and prove the ABIs encode — a hand-curated ABI is only worth
// having if it actually encodes, and the whole point of M7 is that the two vaults
// do NOT share a deposit selector.

describe('vault registry', () => {
  it('carries both probed Coston2 vaults with exact addresses', () => {
    const vaults = vaultsFor('coston2')
    expect(vaults).toHaveLength(2)
    const firelight = vaultByKey('coston2', 'firelight-fxrp')
    const upshift = vaultByKey('coston2', 'upshift-fxrp')
    expect(firelight?.address).toBe('0x91Bfe6A68aB035DFebb6A770FFfB748C03C0E40B')
    expect(upshift?.address).toBe('0x24c1a47cD5e8473b64EAB2a94515a196E10C7C81')
    // both hold the same FAsset the DEX config carries
    expect(firelight?.asset.address).toBe('0x0b6A3645c240605887a5532109323A3E12273dc7')
    expect(upshift?.asset.address).toBe('0x0b6A3645c240605887a5532109323A3E12273dc7')
  })

  it('records the two share models honestly', () => {
    const firelight = vaultByKey('coston2', 'firelight-fxrp')
    const upshift = vaultByKey('coston2', 'upshift-fxrp')
    // Firelight: the vault IS the share token (self-share stFXRP)
    expect(firelight?.share).toEqual({ kind: 'self', symbol: 'stFXRP', decimals: 6 })
    // Upshift: a SEPARATE LP token vFXRP
    expect(upshift?.share).toEqual({
      kind: 'lp',
      symbol: 'vFXRP',
      address: '0xe084F7328DDaB082a139b880782dCC424d20a1DB',
      decimals: 6,
    })
    expect(firelight?.exitModes).toEqual(['delayed'])
    expect(upshift?.exitModes).toEqual(['instant', 'delayed'])
  })

  it('vaultsForChain resolves Coston2 (114) to the same list', () => {
    expect(vaultsForChain(114)).toBe(vaultsFor('coston2'))
  })

  it('configures Flare mainnet Upshift for reads only, with its real share symbol', () => {
    const flare = vaultsFor('flare')
    const upshift = vaultByKey('flare', 'upshift-fxrp')
    // probed live: mainnet share is `earnXRP`, NOT testnet's `vFXRP`
    expect(upshift?.share).toMatchObject({ kind: 'lp', symbol: 'earnXRP' })
    // Firelight mainnet is intentionally absent (no verified address)
    expect(flare.some((v) => v.protocol === 'firelight')).toBe(false)
  })

  it('gates withdraw on live verification per vault', () => {
    // Upshift Coston2: full withdraw path verified live (instant + delayed request→claim,
    // received == expected exact, 2026-08-12) → true. Firelight Coston2: request verified
    // but the delayed claim is deferred to its unlock period (2026-08-13) → stays false,
    // declared-unbuilt until its claim lands. Flare (mainnet): reads only, always false.
    expect(vaultByKey('coston2', 'upshift-fxrp')?.withdrawVerified).toBe(true)
    expect(vaultByKey('coston2', 'firelight-fxrp')?.withdrawVerified).toBe(false)
    expect(vaultByKey('flare', 'upshift-fxrp')?.withdrawVerified).toBe(false)
  })

  it('has no duplicate keys within a network', () => {
    for (const network of ['coston2', 'flare'] as const) {
      const keys = vaultsFor(network).map((v) => v.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})

describe('vault ABIs', () => {
  it('Firelight deposit is standard ERC-4626 (assets, receiver)', () => {
    const item = getAbiItem({ abi: FIRELIGHT_VAULT_ABI, name: 'deposit' })
    expect(item?.inputs.map((i) => i.type)).toEqual(['uint256', 'address'])
  })

  it('Upshift deposit is NON-standard (asset, amount, receiver)', () => {
    const item = getAbiItem({ abi: UPSHIFT_VAULT_ABI, name: 'deposit' })
    expect(item?.inputs.map((i) => i.type)).toEqual(['address', 'uint256', 'address'])
  })

  it('the two deposit selectors DIFFER — copying one onto the other reverts', () => {
    const firelightData = encodeFunctionData({
      abi: FIRELIGHT_VAULT_ABI,
      functionName: 'deposit',
      args: [1_000_000n, '0x0000000000000000000000000000000000000001'],
    })
    const upshiftData = encodeFunctionData({
      abi: UPSHIFT_VAULT_ABI,
      functionName: 'deposit',
      args: [
        '0x0b6A3645c240605887a5532109323A3E12273dc7',
        1_000_000n,
        '0x0000000000000000000000000000000000000001',
      ],
    })
    // selector = first 4 bytes (10 hex chars incl 0x)
    expect(firelightData.slice(0, 10)).not.toBe(upshiftData.slice(0, 10))
  })

  it('each vault withdraw path encodes against its own ABI', () => {
    const acct = '0x0000000000000000000000000000000000000001'
    // Firelight: period-based request + claim
    expect(() =>
      encodeFunctionData({ abi: FIRELIGHT_VAULT_ABI, functionName: 'redeem', args: [1n, acct, acct] }),
    ).not.toThrow()
    expect(() =>
      encodeFunctionData({ abi: FIRELIGHT_VAULT_ABI, functionName: 'claimWithdraw', args: [333n] }),
    ).not.toThrow()
    // Upshift: instant + requestRedeem + calendar claim
    expect(() =>
      encodeFunctionData({ abi: UPSHIFT_VAULT_ABI, functionName: 'instantRedeem', args: [1n, acct] }),
    ).not.toThrow()
    expect(() =>
      encodeFunctionData({ abi: UPSHIFT_VAULT_ABI, functionName: 'requestRedeem', args: [1n, acct] }),
    ).not.toThrow()
    expect(() =>
      encodeFunctionData({ abi: UPSHIFT_VAULT_ABI, functionName: 'claim', args: [2026n, 8n, 12n, acct] }),
    ).not.toThrow()
  })
})
