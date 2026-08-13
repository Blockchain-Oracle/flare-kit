import { describe, expect, it } from 'vitest'
import { getAbiItem } from 'viem'
import {
  STAKING,
  stakingFor,
  PCHAIN_STAKE_MIRROR_ABI,
  PCHAIN_STAKE_MIRROR_VERIFIER_ABI,
  VALIDATOR_REWARD_MANAGER_ABI,
} from '../src/index.js'

// M11-R1: the staking registry is the single source of truth for the three EVM
// contracts the StakeCard drives — PChainStakeMirror (mirrored P-chain stake vote
// power), PChainStakeMirrorVerifier (the live stake limits), ValidatorRewardManager
// (validator/staking rewards) — plus the Coston2 P-chain RPC base and bech32 hrp.
// Every value pinned here was read on-chain by the M11 Task-1 probe
// (`.thoughts/verification/2026-08-12-m11-probe.json`, Coston2 block 33976187):
// the three addresses resolved from FlareContractRegistry.getAllContracts() (zero
// drift), the verifier limits read as public immutables, and a blank-slate account
// reading mirror balanceOf 0 and getStateOfRewards (0,0). `stakeVerified` stays FALSE
// until a live stake round trip confirms an on-chain stake-position read back.

const MIRROR = '0xd2a1Bb23eB350814a30Dd6f9de78Bb2C8fdD9F1D'
const VERIFIER = '0xd61d6bEfB3B5C3e1D13b43C46CC1cebA3505a7aF'
const VRM = '0x33913AcE907F682E305f36d7538D3cCd37E2cA5B'

describe('staking registry (M11-R1)', () => {
  it('returns the three snapshotted Coston2 addresses', () => {
    const s = stakingFor('coston2')
    expect(s).toBeDefined()
    expect(s?.network).toBe('coston2')
    expect(s?.pChainStakeMirror).toBe(MIRROR)
    expect(s?.pChainStakeMirrorVerifier).toBe(VERIFIER)
    expect(s?.validatorRewardManager).toBe(VRM)
  })

  it('carries the Coston2 P-chain RPC base and the costwo hrp', () => {
    const s = stakingFor('coston2')
    expect(s?.pChainRpcBase).toBe('https://coston2-api.flare.network/ext/bc/P')
    expect(s?.hrp).toBe('costwo')
  })

  it('stakeVerified starts FALSE — the write/portfolio gate', () => {
    // Flipped to true ONLY after a real stake round trip confirms the on-chain
    // stake-position read back (the delayed P→C leg reaching `succeeded`). Never
    // before. The blank-slate probe read 0 mirrored / 0 staked, so it is false now.
    expect(stakingFor('coston2')?.stakeVerified).toBe(false)
  })

  it('has no staking deployment on flare mainnet (testnet-first)', () => {
    // Mainnet is a separately-verified milestone; addresses are never invented.
    expect(stakingFor('flare')).toBeUndefined()
    expect(STAKING.flare).toBeUndefined()
  })

  it('PCHAIN_STAKE_MIRROR_ABI exposes balanceOf as the mirrored-read path', () => {
    // The probe confirmed balanceOf(address)->uint256 decodes on Coston2 and
    // votePowerOf REVERTS — so the working read is balanceOf, and votePowerOf is
    // deliberately NOT the read path.
    const balanceOf = getAbiItem({ abi: PCHAIN_STAKE_MIRROR_ABI, name: 'balanceOf' })
    expect(balanceOf?.inputs.map((i) => i.type)).toEqual(['address'])
    expect(balanceOf?.outputs.map((o) => o.type)).toEqual(['uint256'])
    // votePowerOf must NOT be a callable read path (it reverts on Coston2). The
    // fragment is minimal — balanceOf is the ONLY entry, no votePowerOf.
    const names = PCHAIN_STAKE_MIRROR_ABI.map((e) => e.name)
    expect(names).toEqual(['balanceOf'])
    expect(names).not.toContain('votePowerOf')
  })

  it('PCHAIN_STAKE_MIRROR_VERIFIER_ABI exposes the four live stake-limit getters', () => {
    for (const name of [
      'minStakeAmountGwei',
      'maxStakeAmountGwei',
      'minStakeDurationSeconds',
      'maxStakeDurationSeconds',
    ] as const) {
      const item = getAbiItem({ abi: PCHAIN_STAKE_MIRROR_VERIFIER_ABI, name })
      expect(item, name).toBeTruthy()
      expect(item?.inputs).toEqual([])
      expect(item?.outputs.map((o) => o.type)).toEqual(['uint256'])
    }
  })

  it('VALIDATOR_REWARD_MANAGER_ABI exposes getStateOfRewards + claim', () => {
    // GenericRewardManager: getStateOfRewards(address)->(uint256,uint256).
    const state = getAbiItem({ abi: VALIDATOR_REWARD_MANAGER_ABI, name: 'getStateOfRewards' })
    expect(state?.inputs.map((i) => i.type)).toEqual(['address'])
    expect(state?.outputs.map((o) => o.type)).toEqual(['uint256', 'uint256'])
    // claim(address,address,uint256,bool).
    const claim = getAbiItem({ abi: VALIDATOR_REWARD_MANAGER_ABI, name: 'claim' })
    expect(claim?.inputs.map((i) => i.type)).toEqual(['address', 'address', 'uint256', 'bool'])
    expect(claim?.stateMutability).toBe('nonpayable')
  })
})
