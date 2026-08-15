import { describe, expect, it } from 'vitest'
import {
  NETWORK_STORAGE_KEY,
  SELECTABLE_NETWORKS,
  readStoredNetwork,
  storeNetwork,
} from '../lib/network'

const storage = (value: string | null) => ({ getItem: () => value })

describe('network selection', () => {
  it('offers exactly the two real networks', () => {
    expect([...SELECTABLE_NETWORKS]).toEqual(['coston2', 'flare'])
  })

  it('offers no mock network, because the app is chain-only', () => {
    expect(SELECTABLE_NETWORKS).not.toContain('mock')
  })

  it('defaults to testnet when nothing is stored', () => {
    expect(readStoredNetwork(storage(null))).toBe('coston2')
  })

  it('defaults to testnet when the stored value is not a network', () => {
    expect(readStoredNetwork(storage('mock'))).toBe('coston2')
  })

  it('restores a stored network', () => {
    expect(readStoredNetwork(storage('flare'))).toBe('flare')
  })

  it('writes the selection under a namespaced key', () => {
    const written: Record<string, string> = {}
    storeNetwork({ setItem: (k, v) => { written[k] = v } }, 'flare')
    expect(written[NETWORK_STORAGE_KEY]).toBe('flare')
    expect(NETWORK_STORAGE_KEY).toMatch(/^flare-kit:/)
  })
})
