// packages/core/src/mock-stake.ts
import type { Address, PublicClient } from 'viem'
import { type FlareNetworkKey, type StakingDeployment, stakingFor } from '@flare-kit/contracts'
import {
  readMirrorVotePower,
  readStakeLimits,
  readStakingRewardState,
  type StakeLimits,
  type StakingRewardState,
} from './stake-adapter.js'
import { readMinStake, readStakesOf, readValidators, type StakePosition, type ValidatorInfo } from './pchain-rpc.js'

/**
 * The stake mock (M11-R7), written AFTER the Task-6 keyless read pass and copying only
 * what that run OBSERVED. Like `mock-delegation`, it is a labelled pair of fakes (a
 * P-chain `fetch` + an EVM `PublicClient`) the REAL read functions run against unchanged —
 * so a test or the gallery drives the true code path with no network. Mock mode is
 * explicit: a caller constructs these reads; nothing ever falls back to them.
 *
 * The honesty inversion from M10 is the whole point. `mock-delegation` presents
 * `delegationVerified: true` because the round trip WAS driven live. Here **no broadcast
 * landed** (the signer holds ≪ the 50,000-FLR minimum), so this mock keeps the shipped
 * `stakeVerified: false` — and the REAL `planStake` therefore REFUSES to emit a signable
 * plan (`unverified`). The mock does not *simulate* the refusal; it exposes no verified
 * stake for the real gate to pass. It REFUSES the unobserved (the M4/M6/M8/M10 discipline):
 *  - there is NO active stake position — `readStakesOf` observed `[]`, and no config can
 *    inject one, so a `succeeded` stake is never conjured (that guarantee falls out of
 *    driving the REAL `reconcileStake` against the empty position: it stays
 *    `awaiting_external`, never `succeeded`);
 *  - a network the live run never drove throws, rather than inventing one;
 *  - a reverting mirror read surfaces as `undefined` (unavailable), NEVER a confident `0n`.
 *
 * OBSERVED (keyless read pass 2026-08-12, evidence
 * `.thoughts/verification/2026-08-12-m11-coston2-live-stake.json` +
 * `…-m11-probe.json`, Coston2 block 33976187): live limits (50,000–200,000,000 FLR,
 * 14–365 days), the live validator set (a faithful 3-validator sample of the 8 the probe
 * recorded in full wire shape — the others' fields were not captured, so they are not
 * invented here), a blank-slate account (`readStakesOf` `[]`, mirror `balanceOf` `0`,
 * `getStateOfRewards` `(0,0)`), and `verifier.minStakeAmount === getMinStake.minDelegator`.
 */

/** The observed Task-6 evidence, carried as wire values (nFLR / unix-second strings) + wei convenience. */
export const MOCK_STAKE_OBSERVED = {
  account: '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as Address,
  pAddress: 'P-costwo1mxmg9atg27q2zav0kam8qswq32kkpvchnmnacj',
  /** The P-chain `getCurrentValidators` wire sample (nFLR weight, unix-second windows) — exactly as returned. */
  validatorsWire: [
    { nodeID: 'NodeID-BR9YCsrXGVsc8sUoraVrBkWemnPGRSqYZ', startTime: '1778834610', endTime: '1786611061', weight: '5000000000000000' },
    { nodeID: 'NodeID-NKqPQeBNRT82BSHjFT9hCygtYQQBSBST7', startTime: '1786025564', endTime: '1791367200', weight: '1000000000000000' },
    { nodeID: 'NodeID-87skCc745aTkJEtozqTJ2SBnZ8Vb8Ncbd', startTime: '1777385020', endTime: '1806569305', weight: '40000000000000000' },
  ],
  /** `platform.getMinStake` wire (nFLR strings). */
  minStakeWire: { minValidatorStake: '1000000000000000', minDelegatorStake: '50000000000000' },
  /** `PChainStakeMirrorVerifier` immutable getters (Gwei = nFLR = 1e-9 FLR; durations seconds). */
  verifierGwei: {
    minStakeAmountGwei: 50_000_000_000_000n,
    maxStakeAmountGwei: 200_000_000_000_000_000n,
    minStakeDurationSeconds: 1_209_600n,
    maxStakeDurationSeconds: 31_536_000n,
  },
  /** Blank-slate EVM reads: a genuine on-chain zero mirror balance and an empty reward state. */
  mirrorBalanceOf: 0n,
  reward: { total: 0n, claimed: 0n },
  // Wei convenience the gallery/tests assert against.
  minAmountWei: 50_000n * 10n ** 18n,
  maxAmountWei: 200_000_000n * 10n ** 18n,
  minDurationSeconds: 1_209_600n,
  maxDurationSeconds: 31_536_000n,
  /** The validator the Task-6 plan chose (window ends 2026-10-07T10:00:00Z). */
  chosenValidator: 'NodeID-NKqPQeBNRT82BSHjFT9hCygtYQQBSBST7',
  chosenValidatorEnd: 1_791_367_200n,
} as const

/** Config to reproduce the observed shapes. It can NEVER inject an active position — none was observed. */
export interface MockStakeReadsConfig {
  /** Model the mirror `balanceOf` itself reverting (a transport/contract fault) → `undefined`, never `0n`.
   *  A hypothetical the OBSERVED read did not hit — it returned `0n` cleanly (`votePowerOf` is the one that
   *  reverts on Coston2, which is exactly why the adapter reads `balanceOf`). */
  readonly mirrorUnavailable?: boolean
}

/**
 * The observed keyless read snapshot: every field is produced by running a REAL read
 * function against the fakes below — validators/minStake/positions over the fake P-chain
 * `fetch`, and limits/mirror/reward over the fake EVM `PublicClient`. The `deployment`
 * carried is the honest shipped one (`stakeVerified: false`).
 */
export interface MockStakeReads {
  readonly deployment: StakingDeployment
  readonly validators: ValidatorInfo[]
  readonly limits: StakeLimits
  readonly minStake: { minDelegatorStake: bigint; minValidatorStake: bigint }
  readonly positions: StakePosition[]
  readonly mirrorVotePower: bigint | undefined
  readonly stakingReward: StakingRewardState
}

/** A fake P-chain JSON-RPC `fetch`: serves only the methods the read pass observed; refuses the rest. */
function createMockPChainFetch(): typeof fetch {
  return (async (_input: unknown, init?: { body?: string }) => {
    const method = init?.body ? (JSON.parse(init.body) as { method?: string }).method : undefined
    let result: unknown
    if (method === 'platform.getCurrentValidators') {
      // `delegators` omitted → `readStakesOf` yields [] (the account is nobody's delegator).
      result = { validators: MOCK_STAKE_OBSERVED.validatorsWire.map((v) => ({ ...v })) }
    } else if (method === 'platform.getMinStake') {
      result = { ...MOCK_STAKE_OBSERVED.minStakeWire }
    } else {
      throw new Error(`mock-stake: unobserved P-chain method '${String(method)}' — the mock refuses to invent one.`)
    }
    return { text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result }) }
  }) as unknown as typeof fetch
}

/** A fake EVM `PublicClient`: the verifier getters, the mirror `balanceOf`, and the VRM reward state. */
function createMockStakeClient(deployment: StakingDeployment, config: MockStakeReadsConfig): PublicClient {
  const verifier = deployment.pChainStakeMirrorVerifier.toLowerCase()
  const mirror = deployment.pChainStakeMirror.toLowerCase()
  const vrm = deployment.validatorRewardManager.toLowerCase()
  const g = MOCK_STAKE_OBSERVED.verifierGwei
  return {
    async readContract({ address, functionName }: { address: Address; functionName: string }) {
      const at = String(address).toLowerCase()
      switch (functionName) {
        case 'minStakeAmountGwei':
        case 'maxStakeAmountGwei':
        case 'minStakeDurationSeconds':
        case 'maxStakeDurationSeconds':
          if (at !== verifier) throw new Error(`mock-stake: ${functionName} read on an unobserved contract ${address}`)
          return g[functionName]
        case 'balanceOf':
          if (at !== mirror) throw new Error(`mock-stake: balanceOf read on an unobserved contract ${address}`)
          // Model `balanceOf` itself reverting (a transport/contract fault) → the caller maps it to
          // `unavailable`, never a confident `0n`. Hypothetical: the observed `balanceOf` returned `0n`
          // cleanly; `votePowerOf` is the read that reverts on Coston2, which is why the adapter uses `balanceOf`.
          if (config.mirrorUnavailable) throw new Error('Execution reverted for an unknown reason.')
          return MOCK_STAKE_OBSERVED.mirrorBalanceOf
        case 'getStateOfRewards':
          if (at !== vrm) throw new Error(`mock-stake: getStateOfRewards read on an unobserved contract ${address}`)
          return [MOCK_STAKE_OBSERVED.reward.total, MOCK_STAKE_OBSERVED.reward.claimed]
        default:
          throw new Error(`mock-stake: unexpected (unobserved) read ${functionName}`)
      }
    },
  } as unknown as PublicClient
}

/**
 * The honest staking deployment for the mock: `stakingFor(network)` UNCHANGED — the shipped
 * `stakeVerified: false`. Unlike `mock-delegation` (which flips `true` because the round
 * trip was verified), this deliberately does NOT flip: no broadcast landed, so the real
 * `planStake` must refuse `unverified`. Only Coston2 was observed; any other network refuses.
 */
export function mockStakingDeployment(network: FlareNetworkKey = 'coston2'): StakingDeployment {
  const base = stakingFor(network)
  if (!base) throw new Error(`mock-stake: no staking deployment was observed live for '${network}' — the mock refuses to invent one.`)
  return base
}

/**
 * Run every M11 read against the fakes and return the observed snapshot. Drives the REAL
 * `readValidators`/`readMinStake`/`readStakesOf`/`readStakeLimits`/`readMirrorVotePower`/
 * `readStakingRewardState` — no network, no re-implementation.
 */
export async function createMockStakeReads(config: MockStakeReadsConfig = {}): Promise<MockStakeReads> {
  const deployment = mockStakingDeployment('coston2')
  const fetchImpl = createMockPChainFetch()
  const client = createMockStakeClient(deployment, config)

  const [validators, minStake, positions] = await Promise.all([
    readValidators(deployment.pChainRpcBase, fetchImpl),
    readMinStake(deployment.pChainRpcBase, fetchImpl),
    readStakesOf(deployment.pChainRpcBase, MOCK_STAKE_OBSERVED.pAddress, fetchImpl),
  ])
  const limits = await readStakeLimits(client, deployment.pChainStakeMirrorVerifier)
  const mirrorVotePower = await readMirrorVotePower(client, deployment.pChainStakeMirror, MOCK_STAKE_OBSERVED.account)
  const stakingReward = await readStakingRewardState(client, deployment.validatorRewardManager, MOCK_STAKE_OBSERVED.account)

  return { deployment, validators, limits, minStake, positions, mirrorVotePower, stakingReward }
}
