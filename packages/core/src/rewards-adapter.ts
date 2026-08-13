// packages/core/src/rewards-adapter.ts
import { type Abi, type Address, type PublicClient, BaseError, ContractFunctionRevertedError } from 'viem'
import {
  type ProofSource,
  type RewardsDeployment,
  DISTRIBUTION_ABI,
  REWARD_MANAGER_ABI,
  RNAT_ABI,
  FLARE_SYSTEMS_MANAGER_ABI,
  VALIDATOR_REWARD_MANAGER_ABI,
  stakingFor,
} from '@flare-kit/contracts'
import { type StakingRewardState, readStakingRewardState } from './stake-adapter.js'

/**
 * The `RewardsAdapter` — reads + call builders for the `ClaimCard`, mirroring
 * `delegation-adapter.ts`. FOUR DISTINCT claim kinds, never a generic claim (R-REWARD-002): FTSO
 * delegation (RewardManager v2, `rewardsHash` signed-epoch gate, UNOFFICIAL-mirror proof), RNat,
 * the concluded FlareDrop airdrop, and the NON-EXPIRING staking reward (M11 —
 * `ValidatorRewardManager`, address from the staking registry). Reads are keyless; `build*` return
 * UNSIGNED `RewardsCall`s the edge encodes via `rewardsAbiFor`; the honesty rules (declared-empty
 * reverts vs rethrown transport, genuine staking `(0,0)`, `fetchFtsoProof` `null`) are per-member.
 */

/** A structured, unsigned call; the edge encodes it via `rewardsAbiFor(call.abiKind)`. */
export interface RewardsCall {
  readonly abiKind: 'reward-manager' | 'rnat' | 'distribution' | 'validator-reward-manager'
  readonly address: Address
  readonly functionName: string
  readonly args: readonly unknown[]
  readonly value?: bigint
  readonly label: string
}

/** One claimable FTSO delegation reward. `proof` is `[]` from the read; `fetchFtsoProof` fills it from the mirror before a claim. */
export interface FtsoReward {
  readonly kind: 'ftso-delegation'
  readonly epoch: number
  readonly amount: bigint
  /** ClaimType {0 DIRECT, 1 FEE (provider), 2 WNAT (delegator), …} — a number, never narrowed. */
  readonly claimType: number
  readonly proof: `0x${string}`[]
  readonly expiresAtEpoch: number
  readonly source: ProofSource
}

/** The RNat project-reward position. `hasProject` false = the "no RNat account" revert; true once a project has assigned one. */
export interface RnatState {
  readonly kind: 'rnat'
  readonly month: number
  readonly wNat: bigint
  readonly rnat: bigint
  readonly locked: bigint
  readonly hasProject: boolean
}

/** The FlareDrop airdrop position. Concluded on Coston2 (2026-01-30); `claimableMonths` `[]` when the read revert declares it. */
export interface FlareDropState {
  readonly kind: 'flaredrop'
  readonly claimableMonths: number[]
  readonly amount: bigint
  readonly concluded: true
}

// The NON-EXPIRING staking reward (4th kind) is read + shaped by `stake-adapter.ts`
// (`StakingRewardState` / `readStakingRewardState`, exported there); this adapter surfaces + claims it.

export interface RewardsReads {
  readonly currentRewardEpoch: number
  /** Expanded from the (start,end) range, KEPT only where `rewardsHash(epoch) != 0`. */
  readonly claimableEpochs: number[]
  readonly expireNextEpoch: number
  readonly ftso: FtsoReward[]
  readonly rnat: RnatState
  readonly flaredrop: FlareDropState
  /** The NON-EXPIRING staking reward (see `StakingRewardState`); honest-empty when `total === claimed`. */
  readonly staking: StakingRewardState
}

export interface RewardsAdapter {
  /** The deployment this adapter was built for — carries `rewardsVerified` (the plan gate). */
  readonly deployment: RewardsDeployment
  read(account: `0x${string}`): Promise<RewardsReads>
  /** A single epoch's Merkle proof from the unofficial mirror; `null` when unavailable. */
  fetchFtsoProof(
    epoch: number,
    account: `0x${string}`,
  ): Promise<{ amount: bigint; claimType: number; proof: `0x${string}`[] } | null>
  /** `RewardManager.claim(owner, recipient, maxEpoch, wrap, RewardClaimWithProof[])`. */
  buildFtsoClaim(account: `0x${string}`, recipient: `0x${string}`, rewards: FtsoReward[], wrap: boolean): RewardsCall
  /** `RNat.claimRewards(projectIds, month)`. */
  buildRnatClaim(projectIds: bigint[], month: number): RewardsCall
  /** `RNat.withdrawAll(wrap)` — burns 50% of the still-locked balance. */
  buildRnatWithdrawAll(wrap: boolean): RewardsCall
  /** `DistributionToDelegators.claim(owner, recipient, month, wrap)`. */
  buildFlareDropClaim(account: `0x${string}`, recipient: `0x${string}`, month: number, wrap: boolean): RewardsCall
  /** `ValidatorRewardManager.claim(owner, recipient, amount, wrap)` — the NON-EXPIRING staking reward. */
  buildStakingClaim(account: `0x${string}`, recipient: `0x${string}`, amount: bigint, wrap: boolean): RewardsCall
}

/** Resolve the ABI that encodes a `RewardsCall` for `writeContract`. */
export function rewardsAbiFor(abiKind: RewardsCall['abiKind']): Abi {
  switch (abiKind) {
    case 'reward-manager':
      return REWARD_MANAGER_ABI as unknown as Abi
    case 'rnat':
      return RNAT_ABI as unknown as Abi
    case 'distribution':
      return DISTRIBUTION_ABI as unknown as Abi
    case 'validator-reward-manager':
      return VALIDATOR_REWARD_MANAGER_ABI as unknown as Abi
  }
}

const ZERO_HASH = `0x${'00'.repeat(32)}`

/** CONTRACT-REVERT vs TRANSPORT: map ONLY the known revert reason to declared-empty; let a
 *  different reason or a transport error propagate — an unknown outcome is never rendered empty. */
function isRevertWithReason(error: unknown, reason: string): boolean {
  const needle = reason.toLowerCase()
  // Structured viem revert (production): walk to the ContractFunctionRevertedError.
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      const text = `${revert.reason ?? ''} ${revert.shortMessage ?? ''}`.toLowerCase()
      if (text.includes(needle)) return true
    }
    if (error.shortMessage?.toLowerCase().includes(needle)) return true
  }
  // Plain Error (a non-viem client / test stub): the reason lives in the message. A
  // transport error's message never contains the on-chain reason, so it returns false.
  if (error instanceof Error) return error.message.toLowerCase().includes(needle)
  return false
}

/** Decode `getStateOfRewards`' 2D array into distinct FtsoRewards — viem leaf as OBJECT, positional
 *  tuple (0 epoch, 2 amount, 3 claimType) fallback. `proof` `[]`; `fetchFtsoProof` fills it later. */
function decodeFtso(raw: unknown, expiresAtEpoch: number, source: ProofSource): FtsoReward[] {
  const groups = (raw ?? []) as readonly (readonly unknown[])[]
  const out: FtsoReward[] = []
  for (const group of groups) {
    for (const leaf of group ?? []) {
      const tuple = Array.isArray(leaf) ? (leaf as readonly unknown[]) : null
      const named = leaf as { rewardEpochId?: unknown; amount?: unknown; claimType?: unknown }
      const epoch = Number(tuple ? tuple[0] : named.rewardEpochId)
      const amount = BigInt((tuple ? tuple[2] : named.amount) as bigint | number | string)
      const claimType = Number(tuple ? tuple[3] : named.claimType)
      out.push({ kind: 'ftso-delegation', epoch, amount, claimType, proof: [], expiresAtEpoch, source })
    }
  }
  return out
}

/** Inclusive [start..end]; `[]` when the range is empty/inverted. */
function expandRange(start: number, end: number): number[] {
  const out: number[] = []
  for (let epoch = start; epoch <= end; epoch++) out.push(epoch)
  return out
}

interface FtsoRewardClaim {
  merkleProof?: `0x${string}`[]
  body?: { beneficiary?: string; claimType?: number | string; amount?: string | number }
}

// `fetchImpl` (default: global `fetch`) lets a mock inject an instance-scoped fetch stub for `fetchFtsoProof` instead of clobbering `globalThis.fetch`; functionName is dynamic so the ABIs read as the general `Abi`, cast per site.
export function makeRewardsAdapter(client: PublicClient, deployment: RewardsDeployment, fetchImpl?: typeof fetch): RewardsAdapter {
  const readRaw = (address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<unknown> =>
    client.readContract({ address, abi, functionName, args })
  const rm = (functionName: string, args: readonly unknown[] = []) =>
    readRaw(deployment.rewardManager, REWARD_MANAGER_ABI as unknown as Abi, functionName, args)
  const rnatRead = (functionName: string, args: readonly unknown[] = []) =>
    readRaw(deployment.rnat, RNAT_ABI as unknown as Abi, functionName, args)

  const readRnat = async (account: `0x${string}`, month: number): Promise<RnatState> => {
    try {
      const [wNat, rnat, locked] = (await rnatRead('getBalancesOf', [account])) as readonly [bigint, bigint, bigint]
      // A returned balance means an RNat account exists — a project assigned rewards.
      return { kind: 'rnat', month, wNat, rnat, locked, hasProject: true }
    } catch (error) {
      if (isRevertWithReason(error, 'no RNat account')) {
        return { kind: 'rnat', month, wNat: 0n, rnat: 0n, locked: 0n, hasProject: false }
      }
      throw error // transport/unknown → surface unavailable, never a faked empty
    }
  }

  const readFlareDrop = async (): Promise<FlareDropState> => {
    try {
      const [start, end] = (await readRaw(deployment.distribution, DISTRIBUTION_ABI as unknown as Abi, 'getClaimableMonths')) as readonly [bigint, bigint]
      return { kind: 'flaredrop', claimableMonths: expandRange(Number(start), Number(end)), amount: 0n, concluded: true }
    } catch (error) {
      if (isRevertWithReason(error, 'already finished')) {
        return { kind: 'flaredrop', claimableMonths: [], amount: 0n, concluded: true }
      }
      throw error // transport/unknown → surface unavailable, never a faked concluded
    }
  }

  // The staking (4th) kind's ValidatorRewardManager address lives in the STAKING registry (R2:
  // single literal), resolved by network. A rewards deployment must have its staking sibling —
  // fail fast at construction rather than fabricate, and narrow the address for the reads/claim.
  const stakingMgr = stakingFor(deployment.network)?.validatorRewardManager
  if (!stakingMgr) throw new Error(`rewards-adapter: no ValidatorRewardManager configured for '${deployment.network}'`)

  const read = async (account: `0x${string}`): Promise<RewardsReads> => {
    const [currentRaw, rangeRaw, expireRaw, statesRaw, monthRaw] = (await Promise.all([
      rm('getCurrentRewardEpochId'),
      rm('getRewardEpochIdsWithClaimableRewards'),
      rm('getRewardEpochIdToExpireNext'),
      rm('getStateOfRewards', [account]),
      rnatRead('getCurrentMonth'),
    ])) as [number | bigint, readonly [number | bigint, number | bigint], number | bigint, unknown, number | bigint]

    const expireNextEpoch = Number(expireRaw)
    const epochs = expandRange(Number(rangeRaw[0]), Number(rangeRaw[1]))
    // The signed-epoch gate: keep only epochs whose rewardsHash is non-zero (signed).
    const hashes = (await Promise.all(
      epochs.map((epoch) =>
        readRaw(deployment.flareSystemsManager, FLARE_SYSTEMS_MANAGER_ABI as unknown as Abi, 'rewardsHash', [BigInt(epoch)]),
      ),
    )) as string[]
    const claimableEpochs = epochs.filter((_, index) => hashes[index] !== ZERO_HASH)

    // The staking `(0,0)` read is a genuine on-chain zero (honest-empty); a read failure propagates.
    const [rnat, flaredrop, staking] = await Promise.all([
      readRnat(account, Number(monthRaw)),
      readFlareDrop(),
      readStakingRewardState(client, stakingMgr, account),
    ])

    return {
      currentRewardEpoch: Number(currentRaw),
      claimableEpochs,
      expireNextEpoch,
      ftso: decodeFtso(statesRaw, expireNextEpoch, deployment.ftsoProofSource),
      rnat,
      flaredrop,
      staking,
    }
  }

  const fetchFtsoProof = async (epoch: number, account: `0x${string}`) => {
    try {
      const url = `${deployment.ftsoProofSource.url}/-/raw/main/rewards-data/coston2/${epoch}/reward-distribution-data.json`
      const res = await (fetchImpl ?? fetch)(url)
      if (!res.ok) return null
      const data = (await res.json()) as { rewardClaims?: FtsoRewardClaim[] }
      const target = account.toLowerCase()
      const match = data?.rewardClaims?.find((claim) => claim?.body?.beneficiary?.toLowerCase() === target)
      if (!match?.body || match.body.amount == null || !Array.isArray(match.merkleProof)) return null
      // The mirror serialises amount as a bigint literal string with a trailing "n".
      const amount = BigInt(String(match.body.amount).replace(/n$/, ''))
      return { amount, claimType: Number(match.body.claimType), proof: match.merkleProof }
    } catch {
      // Absence/parse/network → declared "proof-unavailable"; never throw, never fabricate.
      return null
    }
  }

  const call = (
    abiKind: RewardsCall['abiKind'],
    address: Address,
    functionName: string,
    args: readonly unknown[],
    label: string,
    value?: bigint,
  ): RewardsCall => ({ abiKind, address, functionName, args, label, ...(value !== undefined ? { value } : {}) })

  return {
    deployment,
    read,
    fetchFtsoProof,
    buildFtsoClaim: (account, recipient, rewards, wrap) => {
      const maxEpoch = rewards.reduce((max, reward) => Math.max(max, reward.epoch), 0)
      const proofs = rewards.map((reward) => ({
        merkleProof: reward.proof,
        body: { rewardEpochId: reward.epoch, beneficiary: account, amount: reward.amount, claimType: reward.claimType },
      }))
      return call(
        'reward-manager',
        deployment.rewardManager,
        'claim',
        [account, recipient, maxEpoch, wrap, proofs],
        'Claim FTSO delegation rewards',
      )
    },
    buildRnatClaim: (projectIds, month) =>
      call('rnat', deployment.rnat, 'claimRewards', [projectIds, BigInt(month)], 'Claim RNat project rewards'),
    buildRnatWithdrawAll: (wrap) =>
      call('rnat', deployment.rnat, 'withdrawAll', [wrap], 'Withdraw all RNat (burns 50% of the still-locked balance)'),
    buildFlareDropClaim: (account, recipient, month, wrap) =>
      call('distribution', deployment.distribution, 'claim', [account, recipient, BigInt(month), wrap], 'Claim FlareDrop'),
    buildStakingClaim: (account, recipient, amount, wrap) =>
      call('validator-reward-manager', stakingMgr, 'claim', [account, recipient, amount, wrap], 'Claim staking rewards'),
  }
}
