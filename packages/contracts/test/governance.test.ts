import type { Abi } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  GOVERNANCE_VOTE_POWER_ABI,
  GOVERNOR_ABI,
  POLLING_FTSO_ABI,
} from '../src/governance-abis.js'
import { governanceFor } from '../src/governance.js'

/**
 * M12 Task 2 (RED first): the governance registry must expose the four snapshot
 * addresses the M12 probe resolved on BOTH networks — Coston2 (114, the write/verify
 * target) and Flare mainnet (14, the proposal read lens) — with `governanceVerified`
 * starting `false` on each (only a live Coston2 round trip in Task 6 ever flips it).
 *
 * These probe-sourced literals (`.thoughts/verification/2026-08-13-m12-probe.json`) are
 * the ground truth this unit test pins the snapshot against. The live drift guard —
 * comparing the snapshot to a real `getAllContracts()` read on both networks — lives in
 * `manifest-parity.test.ts`.
 */

// Ground truth from the M12 probe `networks.coston2.resolved`.
const COSTON2 = {
  governanceVotePower: '0x8e4A2c063E1C82C9f5cb96489c0d2b6d78dF0538',
  pollingFoundation: '0x6D7ca85Cb3451b772B87EBB32A9E5cFc500BfA94',
  pollingFtso: '0x0f86aD3D5a910Bd0D6A73f7c256bDae1A8Ff7563',
  pollingManagementGroup: '0x056A8AcdCd2B5D3bF7a4F1d218B8A1660BB4D912',
} as const

// Ground truth from the M12 probe `networks.flare.resolved`.
const FLARE = {
  governanceVotePower: '0x95eD14840d3A1C75b8629Ae5599fe55270C51e04',
  pollingFoundation: '0xc8294a2335C6c45de827121090ce4Ba9977907D2',
  pollingFtso: '0x84e6790c97B48195161f899d3C509711e267B391',
  pollingManagementGroup: '0x1e91A59aaC440D7ecA5EBf58d85903CdB0021812',
} as const

function functionNames(abi: Abi): string[] {
  return abi.filter((entry) => entry.type === 'function').map((entry) => entry.name)
}

describe('governanceFor — the two-network snapshot', () => {
  it('coston2 returns the four probe-resolved addresses, chainId 114, verified (live round trip)', () => {
    const g = governanceFor('coston2')
    expect(g.governanceVotePower).toBe(COSTON2.governanceVotePower)
    expect(g.pollingFoundation).toBe(COSTON2.pollingFoundation)
    expect(g.pollingFtso).toBe(COSTON2.pollingFtso)
    expect(g.pollingManagementGroup).toBe(COSTON2.pollingManagementGroup)
    expect(g.chainId).toBe(114)
    // Flipped true by the live Coston2 delegate/undelegate round trip (Task 6, 2026-08-13).
    expect(g.governanceVerified).toBe(true)
  })

  it('flare returns the mainnet read-lens addresses, chainId 14, unverified', () => {
    const g = governanceFor('flare')
    expect(g.governanceVotePower).toBe(FLARE.governanceVotePower)
    expect(g.pollingFoundation).toBe(FLARE.pollingFoundation)
    expect(g.pollingFtso).toBe(FLARE.pollingFtso)
    expect(g.pollingManagementGroup).toBe(FLARE.pollingManagementGroup)
    expect(g.chainId).toBe(14)
    // Mainnet is a read lens only; it never flips this milestone.
    expect(g.governanceVerified).toBe(false)
  })
})

describe('the three governance ABIs expose the functions the surface drives', () => {
  it('GOVERNANCE_VOTE_POWER_ABI has the delegation + vote-power getters', () => {
    const names = functionNames(GOVERNANCE_VOTE_POWER_ABI)
    for (const fn of [
      'delegate',
      'undelegate',
      'getVotes',
      'votePowerOfAt',
      'getDelegateOfAt',
      'getDelegateOfAtNow',
    ]) {
      expect(names).toContain(fn)
    }
  })

  it('GOVERNOR_ABI (PollingFoundation) has the proposal read + vote surface', () => {
    const names = functionNames(GOVERNOR_ABI)
    for (const fn of [
      'state',
      'getProposalInfo',
      'getProposalVotes',
      'hasVoted',
      'getVotes',
      'isProposer',
      'castVote',
    ]) {
      expect(names).toContain(fn)
    }
  })

  it('POLLING_FTSO_ABI has the management-group proposal + eligibility surface', () => {
    const names = functionNames(POLLING_FTSO_ABI)
    for (const fn of [
      'getLastProposal',
      'state',
      'getProposalInfo',
      'getProposalVotes',
      'canPropose',
      'canVote',
      'isMember',
      'getManagementGroupMembers',
    ]) {
      expect(names).toContain(fn)
    }
  })
})
