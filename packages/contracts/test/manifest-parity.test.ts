import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createPublicClient, getAddress, http } from 'viem'
import { describe, expect, it } from 'vitest'
import { registryFor } from '../src/addresses.js'
import { delegationFor } from '../src/delegation.js'
import { governanceFor } from '../src/governance.js'
import { rewardsFor } from '../src/rewards.js'
import { smartAccountsFor } from '../src/smart-accounts.js'
import { stakingFor } from '../src/staking.js'

/**
 * Every address this package exports must appear, under the same name, in the
 * FAssets repository's own deployment manifest. This test exists because during
 * this milestone four Flare mainnet addresses were once written from memory
 * rather than read from the manifest. Reviewing addresses by eye does not catch
 * that; comparing them to the source of truth does.
 *
 * The manifests live in the vendored protocol clone under `sources/`, which is
 * deliberately not committed. When it is absent the test says so out loud
 * rather than passing quietly.
 */

const MANIFEST_DIR = fileURLToPath(
  new URL('../../../sources/flare-foundation/fassets/deployment/deploys/', import.meta.url),
)

interface ManifestEntry {
  name: string
  address: string
}

function manifest(network: string): Map<string, string> | undefined {
  try {
    const entries = JSON.parse(
      readFileSync(`${MANIFEST_DIR}${network}.json`, 'utf8'),
    ) as ManifestEntry[]
    return new Map(entries.map((entry) => [entry.name, entry.address]))
  } catch {
    return undefined
  }
}

const NETWORKS = [
  { chainId: 114, file: 'coston2', assetManager: 'AssetManager_FTestXRP', token: 'FTestXRP' },
  { chainId: 14, file: 'flare', assetManager: 'AssetManager_FXRP', token: 'FXRP' },
] as const

describe.each(NETWORKS)('$file addresses match the deployment manifest', (network) => {
  const deployed = manifest(network.file)

  it.runIf(deployed)('matches every protocol contract', () => {
    const registry = registryFor(network.chainId)
    expect(registry.contractRegistry).toBe(deployed?.get('FlareContractRegistry'))
    expect(registry.assetManagerController).toBe(deployed?.get('AssetManagerController'))
    expect(registry.fdcHub).toBe(deployed?.get('FdcHub'))
    expect(registry.fdcVerification).toBe(deployed?.get('FdcVerification'))
    expect(registry.relay).toBe(deployed?.get('Relay'))
    expect(registry.wrappedNative).toBe(deployed?.get('WNat'))
  })

  it.runIf(deployed)('matches the FAsset deployment and its real symbol', () => {
    const asset = registryFor(network.chainId).fassets.XRP
    expect(asset?.assetManager).toBe(deployed?.get(network.assetManager))
    expect(asset?.token).toBe(deployed?.get(network.token))
    // The manifest names the token by its actual symbol, so this also proves
    // we are not renaming FTestXRP to FXRP anywhere.
    expect(asset?.symbol).toBe(network.token)
  })

  it.runIf(deployed)('claims direct minting only where the facet is deployed', () => {
    const asset = registryFor(network.chainId).fassets.XRP
    expect(asset?.supportsDirectMinting).toBe(deployed?.has('DirectMintingFacet'))
  })

  it.skipIf(deployed)('cannot verify: the vendored FAssets clone is not present', () => {
    expect(deployed).toBeUndefined()
  })
})

/**
 * M10 Task 2: the snapshot addresses this package pins for the delegation/rewards
 * substrate must equal what the live FlareContractRegistry resolves right now. The
 * static manifest-parity above proves we didn't mistype an FAssets address from
 * memory; this proves the M10 registry-resolved addresses (WNat / RewardManager /
 * RNat / DistributionToDelegators) still match the chain — the Task-1 probe read them
 * once, this keeps them honest as the registry is authoritative.
 *
 * It touches the network, so it is resilient like the `runIf/skipIf` guard above: an
 * RPC or network error SKIPS with a loud message (never a silent pass, and never a
 * hard failure on a transient hiccup). A genuine address MISMATCH still fails — that
 * is drift the milestone must see.
 */
const COSTON2_RPC = 'https://coston2-api.flare.network/ext/C/rpc'
const FLARE_RPC = 'https://flare-api.flare.network/ext/C/rpc'
// The FlareContractRegistry is deployed at the same address on both networks.
const CONTRACT_REGISTRY = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019'
const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'getAllContracts',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_names', type: 'string[]' },
      { name: '_addresses', type: 'address[]' },
    ],
  },
] as const

describe('M10 registry parity — snapshot vs a live getAllContracts read', () => {
  it('the four snapshot addresses equal the live registry-resolved ones', async (ctx) => {
    let names: readonly string[]
    let addresses: readonly `0x${string}`[]
    try {
      const client = createPublicClient({
        transport: http(COSTON2_RPC, { timeout: 15_000, retryCount: 1 }),
      })
      ;[names, addresses] = await client.readContract({
        address: CONTRACT_REGISTRY,
        abi: REGISTRY_ABI,
        functionName: 'getAllContracts',
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message.split('\n')[0] : String(err)
      console.warn(
        `[M10 parity] SKIPPED — Coston2 RPC unreachable (${reason}). This is NOT a pass: ` +
          're-run with network access to verify the snapshot against the live registry.',
      )
      ctx.skip()
      return
    }

    // Parallel arrays of equal length per the getAllContracts contract.
    const resolved = new Map(names.map((name, i) => [name, getAddress(addresses[i]!)]))
    const delegation = delegationFor('coston2')
    const rewards = rewardsFor('coston2')

    // WNat is REUSED from the address registry into delegation.ts; the other three are
    // pinned in rewards.ts. All four must equal what the chain returns today.
    expect(resolved.get('WNat')).toBe(getAddress(delegation!.wnat))
    expect(resolved.get('RewardManager')).toBe(getAddress(rewards!.rewardManager))
    expect(resolved.get('RNat')).toBe(getAddress(rewards!.rnat))
    expect(resolved.get('DistributionToDelegators')).toBe(getAddress(rewards!.distribution))
  }, 30_000)
})

/**
 * M11 Task 2: the three staking addresses pinned in `staking.ts`
 * (PChainStakeMirror / PChainStakeMirrorVerifier / ValidatorRewardManager) must equal
 * what the live FlareContractRegistry resolves right now. Same intent as the M10 block
 * above — the Task-1 probe read them once by name; this keeps them honest against the
 * authoritative registry, skipping loudly (never a silent pass) on an RPC hiccup while
 * still failing on a genuine address MISMATCH.
 */
describe('M11 staking parity — snapshot vs a live getAllContracts read', () => {
  it('the three staking addresses equal the live registry-resolved ones', async (ctx) => {
    let names: readonly string[]
    let addresses: readonly `0x${string}`[]
    try {
      const client = createPublicClient({
        transport: http(COSTON2_RPC, { timeout: 15_000, retryCount: 1 }),
      })
      ;[names, addresses] = await client.readContract({
        address: CONTRACT_REGISTRY,
        abi: REGISTRY_ABI,
        functionName: 'getAllContracts',
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message.split('\n')[0] : String(err)
      console.warn(
        `[M11 parity] SKIPPED — Coston2 RPC unreachable (${reason}). This is NOT a pass: ` +
          're-run with network access to verify the snapshot against the live registry.',
      )
      ctx.skip()
      return
    }

    const resolved = new Map(names.map((name, i) => [name, getAddress(addresses[i]!)]))
    const staking = stakingFor('coston2')

    expect(resolved.get('PChainStakeMirror')).toBe(getAddress(staking!.pChainStakeMirror))
    expect(resolved.get('PChainStakeMirrorVerifier')).toBe(
      getAddress(staking!.pChainStakeMirrorVerifier),
    )
    expect(resolved.get('ValidatorRewardManager')).toBe(
      getAddress(staking!.validatorRewardManager),
    )
  }, 30_000)
})

/**
 * M12 Task 2: the four governance snapshot addresses pinned in `governance.ts` must equal
 * what the live FlareContractRegistry resolves right now — on BOTH networks. Governance
 * spans Coston2 (114, write/verify) AND Flare mainnet (14, the proposal read lens), so —
 * unlike the Coston2-only M10/M11 blocks above — this reads `getAllContracts()` on EACH
 * network and checks the snapshot for that network. It also asserts `GovernorReject` is
 * NOT a registered name (the probe confirmed it absent on both networks; it must never be
 * treated as a real deployed contract). Same resilience as the blocks above: an RPC
 * hiccup SKIPS loudly (never a silent pass), a genuine address MISMATCH still fails.
 */
const GOVERNANCE_NETWORKS = [
  { key: 'coston2', rpc: COSTON2_RPC },
  { key: 'flare', rpc: FLARE_RPC },
] as const

describe.each(GOVERNANCE_NETWORKS)(
  'M12 governance parity ($key) — snapshot vs a live getAllContracts read',
  (network) => {
    it('the four governance addresses match and GovernorReject is absent', async (ctx) => {
      let names: readonly string[]
      let addresses: readonly `0x${string}`[]
      try {
        const client = createPublicClient({
          transport: http(network.rpc, { timeout: 15_000, retryCount: 1 }),
        })
        ;[names, addresses] = await client.readContract({
          address: CONTRACT_REGISTRY,
          abi: REGISTRY_ABI,
          functionName: 'getAllContracts',
        })
      } catch (err) {
        const reason = err instanceof Error ? err.message.split('\n')[0] : String(err)
        console.warn(
          `[M12 parity ${network.key}] SKIPPED — ${network.key} RPC unreachable (${reason}). ` +
            'This is NOT a pass: re-run with network access to verify the snapshot against ' +
            'the live registry.',
        )
        ctx.skip()
        return
      }

      const resolved = new Map(names.map((name, i) => [name, getAddress(addresses[i]!)]))
      const governance = governanceFor(network.key)

      expect(resolved.get('GovernanceVotePower')).toBe(getAddress(governance.governanceVotePower))
      expect(resolved.get('PollingFoundation')).toBe(getAddress(governance.pollingFoundation))
      expect(resolved.get('PollingFtso')).toBe(getAddress(governance.pollingFtso))
      expect(resolved.get('PollingManagementGroup')).toBe(
        getAddress(governance.pollingManagementGroup),
      )
      // GovernorReject must never be a registered name — the probe confirmed its absence.
      expect(resolved.has('GovernorReject')).toBe(false)
    }, 30_000)
  },
)

/**
 * M13 Task 1: `MasterAccountController` must resolve, by name, from the live
 * FlareContractRegistry on BOTH networks — and to the SAME address on both.
 *
 * That second assertion is not decoration. A personal account is a CREATE2 address derived
 * from the controller and an XRPL address, so one XRPL address maps to one Flare account
 * everywhere ONLY while the controller address is identical across networks. If a future
 * deployment breaks that, `SmartAccountCard` would show two different accounts for one
 * XRPL controller and the surface's headline claim would be false — so it fails here
 * rather than being discovered in a screenshot.
 *
 * Same resilience as the blocks above: an RPC hiccup SKIPS loudly, a MISMATCH fails.
 */
describe('M13 smart-accounts parity — snapshot vs a live getAllContracts read', () => {
  it('MasterAccountController resolves by name, and is the same address on both networks', async (ctx) => {
    const resolvedPerNetwork = new Map<string, `0x${string}` | undefined>()
    for (const network of GOVERNANCE_NETWORKS) {
      try {
        const client = createPublicClient({
          transport: http(network.rpc, { timeout: 15_000, retryCount: 1 }),
        })
        const [names, addresses] = await client.readContract({
          address: CONTRACT_REGISTRY,
          abi: REGISTRY_ABI,
          functionName: 'getAllContracts',
        })
        const index = names.indexOf('MasterAccountController')
        resolvedPerNetwork.set(
          network.key,
          index >= 0 ? getAddress(addresses[index]!) : undefined,
        )
      } catch (err) {
        const reason = err instanceof Error ? err.message.split('\n')[0] : String(err)
        console.warn(
          `[M13 parity ${network.key}] SKIPPED — ${network.key} RPC unreachable (${reason}). ` +
            'This is NOT a pass: re-run with network access to verify the snapshot against ' +
            'the live registry.',
        )
        ctx.skip()
        return
      }
    }

    for (const network of GOVERNANCE_NETWORKS) {
      const snapshot = smartAccountsFor(network.key).masterAccountController
      expect(resolvedPerNetwork.get(network.key), network.key).toBe(getAddress(snapshot))
    }
    // The cross-network identity itself, read from the chain rather than from our constant.
    expect(resolvedPerNetwork.get('coston2')).toBe(resolvedPerNetwork.get('flare'))
  }, 45_000)
})
