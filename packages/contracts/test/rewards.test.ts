import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getAbiItem } from 'viem'
import {
  REWARDS,
  rewardsFor,
  FTSO_PROOF_LAYOUT,
  REWARD_MANAGER_ABI,
  RNAT_ABI,
  DISTRIBUTION_ABI,
  FLARE_SYSTEMS_MANAGER_ABI,
} from '../src/index.js'

// M10-R1: the rewards registry is the single source of truth for the four reward
// contracts the ClaimCard drives (three distinct claim kinds). Every address pinned
// here was resolved on-chain by the M10 Task-1 probe
// (`.thoughts/verification/2026-08-12-m10-probe.json`, Coston2 block 33963269) from
// FlareContractRegistry.getAllContracts(), zero drift. `rewardsVerified` stays FALSE
// until a real claim is settled — carried past M10, exactly as M7 carried Firelight.

const REWARD_MANAGER = '0xB4f43E342c5c77e6fe060c0481Fe313Ff2503454'
const FTSO_REWARD_MANAGER = '0x7A0bFB85387314d7F8C0FcCD9D9B74A76115c322'
const FLARE_SYSTEMS_MANAGER = '0xA90Db6D10F856799b10ef2A77EBCbF460aC71e52'
const RNAT = '0x221D27529e7788B929E13533edc3b00ec1ac5e8A'
const DISTRIBUTION = '0xbd33bDFf04C357F7FC019E72D0504C24CF4Aa010'

describe('rewards registry (M10-R1)', () => {
  it('carries the four Task-1 reward addresses with exact values', () => {
    const r = rewardsFor('coston2')
    expect(r).toBeDefined()
    expect(r?.network).toBe('coston2')
    expect(r?.rewardManager).toBe(REWARD_MANAGER)
    expect(r?.ftsoRewardManager).toBe(FTSO_REWARD_MANAGER)
    expect(r?.flareSystemsManager).toBe(FLARE_SYSTEMS_MANAGER)
    expect(r?.rnat).toBe(RNAT)
    expect(r?.distribution).toBe(DISTRIBUTION)
  })

  it('declares the FTSO proof source as the unofficial community mirror', () => {
    const r = rewardsFor('coston2')
    // No official Coston2 reward API exists — the mirror is not authoritative, so
    // official is FALSE. A caller must never render its tuples as protocol truth.
    expect(r?.ftsoProofSource.official).toBe(false)
    expect(r?.ftsoProofSource.url).toBe('https://gitlab.com/timivesel/ftsov2-testnet-rewards')
  })

  it('carries the FlareDrop conclusion date and the docs reward-expiry window', () => {
    const r = rewardsFor('coston2')
    expect(r?.flareDropEndedAt).toBe('2026-01-30')
    // 25 is the documented window; the actual boundary is read on-chain
    // (getRewardEpochIdToExpireNext), never assumed from this constant.
    expect(r?.delegationRewardExpiryEpochs).toBe(25)
  })

  it('rewardsVerified is FALSE — carried past M10 until a real claim settles', () => {
    expect(rewardsFor('coston2')?.rewardsVerified).toBe(false)
  })

  it('has no rewards deployment on flare mainnet (testnet-first)', () => {
    expect(rewardsFor('flare')).toBeUndefined()
    expect(REWARDS.flare).toBeUndefined()
  })

  it('exposes the per-epoch proof file layout for Task-7 URL building', () => {
    // rewards-data/coston2/<rewardEpochId>/reward-distribution-data.json on branch main
    expect(FTSO_PROOF_LAYOUT).toContain('<rewardEpochId>')
    expect(FTSO_PROOF_LAYOUT).toContain('reward-distribution-data.json')
  })
})

describe('rewards ABIs — the two DISTINCT reward structs (M10 probe-confirmed)', () => {
  it('REWARD_MANAGER_ABI.getStateOfRewards returns RewardState[][] with the 5-field struct incl. bool', () => {
    const item = getAbiItem({ abi: REWARD_MANAGER_ABI, name: 'getStateOfRewards' })
    const out = item?.outputs[0]
    expect(out?.type).toBe('tuple[][]')
    // RewardState = (uint24 rewardEpochId, bytes20 beneficiary, uint120 amount,
    // uint8 claimType, bool initialised) — 5 fields, the LAST is the bool.
    const components = (out as { components?: readonly { type: string }[] }).components
    expect(components?.map((c) => c.type)).toEqual(['uint24', 'bytes20', 'uint120', 'uint8', 'bool'])
  })

  it("REWARD_MANAGER_ABI.claim's RewardClaimWithProof body is the 4-field struct with NO bool", () => {
    const claim = getAbiItem({ abi: REWARD_MANAGER_ABI, name: 'claim' })
    expect(claim?.inputs.map((i) => i.type)).toEqual(['address', 'address', 'uint24', 'bool', 'tuple[]'])
    // RewardClaimWithProof = { bytes32[] merkleProof; RewardClaim body }
    const proofs = claim?.inputs[4] as {
      components?: readonly { name: string; type: string; components?: readonly { type: string }[] }[]
    }
    const merkle = proofs.components?.find((c) => c.name === 'merkleProof')
    expect(merkle?.type).toBe('bytes32[]')
    const body = proofs.components?.find((c) => c.name === 'body')
    // RewardClaim = (uint24, bytes20, uint120, uint8) — 4 fields, NO bool.
    expect(body?.components?.map((c) => c.type)).toEqual(['uint24', 'bytes20', 'uint120', 'uint8'])
  })

  it('REWARD_MANAGER_ABI carries the probe-confirmed read getters', () => {
    const range = getAbiItem({ abi: REWARD_MANAGER_ABI, name: 'getRewardEpochIdsWithClaimableRewards' })
    // a (start, end) RANGE tuple, NOT a list
    expect(range?.outputs.map((o) => o.type)).toEqual(['uint24', 'uint24'])
    expect(getAbiItem({ abi: REWARD_MANAGER_ABI, name: 'getCurrentRewardEpochId' })?.outputs[0].type).toBe(
      'uint24',
    )
    expect(getAbiItem({ abi: REWARD_MANAGER_ABI, name: 'getNextClaimableRewardEpochId' })).toBeTruthy()
    expect(getAbiItem({ abi: REWARD_MANAGER_ABI, name: 'getRewardEpochIdToExpireNext' })).toBeTruthy()
  })

  it('RNAT_ABI carries getBalancesOf (3-tuple) + the confirmed write signatures', () => {
    expect(getAbiItem({ abi: RNAT_ABI, name: 'getBalancesOf' })?.outputs.map((o) => o.type)).toEqual([
      'uint256',
      'uint256',
      'uint256',
    ])
    // withdrawAll(bool wrap) — the 50%-locked-burn path Task 8 confirms live.
    expect(getAbiItem({ abi: RNAT_ABI, name: 'withdrawAll' })?.inputs.map((i) => i.type)).toEqual(['bool'])
    // claimRewards(uint256[] projectIds, uint256 month)
    expect(getAbiItem({ abi: RNAT_ABI, name: 'claimRewards' })?.inputs.map((i) => i.type)).toEqual([
      'uint256[]',
      'uint256',
    ])
  })

  it('DISTRIBUTION_ABI carries getClaimableMonths + claim; FLARE_SYSTEMS_MANAGER_ABI carries rewardsHash', () => {
    // getClaimableMonths reverts "already finished" on Coston2 (FlareDrop concluded)
    // but its shape is a (start, end) tuple.
    expect(getAbiItem({ abi: DISTRIBUTION_ABI, name: 'getClaimableMonths' })?.outputs.map((o) => o.type)).toEqual(
      ['uint256', 'uint256'],
    )
    expect(getAbiItem({ abi: DISTRIBUTION_ABI, name: 'claim' })?.inputs.map((i) => i.type)).toEqual([
      'address',
      'address',
      'uint256',
      'bool',
    ])
    const rewardsHash = getAbiItem({ abi: FLARE_SYSTEMS_MANAGER_ABI, name: 'rewardsHash' })
    expect(rewardsHash?.inputs.map((i) => i.type)).toEqual(['uint256'])
    expect(rewardsHash?.outputs.map((o) => o.type)).toEqual(['bytes32'])
  })
})

// R2 reuse guard: the four NEW M10 reward-contract literals live ONLY in rewards.ts,
// and delegation.ts holds NO WNat literal (it REUSES registryFor(114).wrappedNative).
describe('M10 address literals are not duplicated (R2)', () => {
  const src = (name: string) =>
    readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8')

  it('the WNat address does not appear as a literal in delegation.ts (reuse enforced)', () => {
    const wnat = '0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273'
    expect(src('delegation.ts').includes(wnat)).toBe(false)
  })

  it('each new reward address appears in src only in rewards.ts', () => {
    const files = [
      'delegation.ts',
      'delegation-abis.ts',
      'rewards-abis.ts',
      'addresses.ts',
      'bridge.ts',
    ]
    for (const addr of [REWARD_MANAGER, FTSO_REWARD_MANAGER, RNAT, DISTRIBUTION]) {
      for (const f of files) {
        expect(src(f).includes(addr)).toBe(false)
      }
      expect(src('rewards.ts').includes(addr)).toBe(true)
    }
  })
})
