import { describe, expect, it } from 'vitest'
import { getAbiItem } from 'viem'
import { flareSystemsManagerAbi, relayAbi } from '../src/fdc/abi.js'
import { registryFor } from '../src/addresses.js'

/**
 * A live probe on Coston2 showed that `firstVotingRoundStartTs()` and
 * `votingEpochDurationSeconds()` revert on the deployed Relay, even though
 * `IRelay.sol` in the periphery package declares them. They are implemented on
 * FlareSystemsManager.
 *
 * This cost a real, half-completed mint. These tests pin the split so the same
 * mistake cannot be made from the interface files again.
 */

describe('the voting epoch parameters are on FlareSystemsManager', () => {
  it('exposes both getters there', () => {
    expect(getAbiItem({ abi: flareSystemsManagerAbi, name: 'firstVotingRoundStartTs' })).toBeDefined()
    expect(getAbiItem({ abi: flareSystemsManagerAbi, name: 'votingEpochDurationSeconds' })).toBeDefined()
  })

  it('does not put them on Relay, where they revert', () => {
    // Checked structurally: `getAbiItem` would not even typecheck with a name
    // the ABI does not contain, which is itself part of the protection.
    const relayNames = relayAbi.map((entry) => entry.name)
    expect(relayNames).not.toContain('firstVotingRoundStartTs')
    expect(relayNames).not.toContain('votingEpochDurationSeconds')
  })

  it('keeps finalization on Relay, which does implement it', () => {
    expect(getAbiItem({ abi: relayAbi, name: 'isFinalized' })).toBeDefined()
  })
})

describe('registry', () => {
  it('carries a FlareSystemsManager address for every network', () => {
    for (const chainId of [114, 14]) {
      expect(registryFor(chainId).flareSystemsManager).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })

  it('keeps it distinct from Relay', () => {
    for (const chainId of [114, 14]) {
      const reg = registryFor(chainId)
      expect(reg.flareSystemsManager).not.toBe(reg.relay)
    }
  })
})
