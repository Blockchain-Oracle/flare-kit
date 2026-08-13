import { FLARE_NETWORKS, type FlareNetworkKey } from './chains.js'
import { registryFor } from './addresses.js'

/**
 * The rewards registry: the one source of truth for the four contracts the M10
 * `ClaimCard` drives across three DISTINCT claim kinds — FTSO delegation rewards
 * (RewardManager v2, with the legacy FtsoRewardManager as a read fallback), RNat
 * project rewards (RNat), and the concluded FlareDrop airdrop
 * (DistributionToDelegators). `FlareSystemsManager` supplies the signed-epoch gate
 * (`rewardsHash`) and epoch timing.
 *
 * Every address was resolved on-chain by the M10 Task-1 probe
 * (`.thoughts/verification/2026-08-12-m10-probe.json`, Coston2 block 33963269) from
 * `FlareContractRegistry.getAllContracts()`, zero drift. The probe also recorded the
 * honest-empty state for the blank-slate account: RewardManager returns empty reward
 * states, RNat.getBalancesOf REVERTS "no RNat account", and Distribution
 * .getClaimableMonths REVERTS "already finished". Those are declared-empty states, not
 * errors — the adapter (Task 7) maps them, never a faked zero.
 *
 * `flareSystemsManager` is REUSED from the address registry
 * (`registryFor(114).flareSystemsManager`) — it already lives there, so R2 forbids a
 * second literal. The other four addresses are new to M10 and pinned here once.
 *
 * `rewardsVerified` starts `false` and — unlike `delegationVerified` — is CARRIED past
 * M10. The blank-slate account earned nothing across the epoch range, and there is no
 * official Coston2 reward API, so a real FTSO reward claim cannot be settled this
 * milestone. It flips only when a real claim settles on-chain, exactly as M7 carried
 * its Firelight claim.
 */

/**
 * The DISTINCT reward claim kinds (R-REWARD-002). The first three are M10's RewardManager /
 * RNat / DistributionToDelegators kinds carried by this deployment. The 4th, `staking` (M11),
 * is the NON-EXPIRING `ValidatorRewardManager` reward: its address + ABI live in the STAKING
 * registry (`staking.ts` `validatorRewardManager` / `staking-abis.ts`
 * `VALIDATOR_REWARD_MANAGER_ABI`), not here — so R2 keeps a single literal — and it carries no
 * epoch-expiry, never sharing M10's 25-epoch FTSO-delegation-reward window.
 */
export type ClaimKind = 'ftso-delegation' | 'rnat' | 'flaredrop' | 'staking'

export interface ProofSource {
  readonly url: string
  /**
   * Whether this proof source is an authoritative protocol API. FALSE on Coston2:
   * the only source of FTSO delegation-reward tuples is an unofficial community
   * mirror, so its data is never rendered as protocol truth.
   */
  readonly official: boolean
}

export interface RewardsDeployment {
  readonly network: FlareNetworkKey
  /** RewardManager v2 — the primary FTSO delegation-reward claim + read surface. */
  readonly rewardManager: `0x${string}`
  /** Legacy FtsoRewardManager — a read fallback for historical reward state. */
  readonly ftsoRewardManager: `0x${string}`
  /** FlareSystemsManager — `rewardsHash` (signed-epoch gate) + epoch timing. */
  readonly flareSystemsManager: `0x${string}`
  /** RNat — project rewards, wNat/rNat/locked balances, and the withdraw paths. */
  readonly rnat: `0x${string}`
  /** DistributionToDelegators — the FlareDrop airdrop (concluded on Coston2). */
  readonly distribution: `0x${string}`
  /** Where FTSO delegation-reward proofs come from; `official: false` on Coston2. */
  readonly ftsoProofSource: ProofSource
  /** The date the FlareDrop concluded; the surface renders this, not a live claim. */
  readonly flareDropEndedAt: '2026-01-30'
  /**
   * The documented delegation-reward expiry window (epochs). The ACTUAL claim
   * boundary is read on-chain from `getRewardEpochIdToExpireNext`; this constant is
   * for display/context only and is never used to decide claimability.
   */
  readonly delegationRewardExpiryEpochs: 25
  /** Carried FALSE past M10 — flips only when a real reward claim settles. */
  readonly rewardsVerified: boolean
}

/**
 * The per-epoch proof file layout observed by the probe on the community mirror
 * (branch `main`). Task 7's `fetchFtsoProof` substitutes `<rewardEpochId>` to build
 * the raw-file URL. Carried here so the layout is defined once, next to its source.
 */
export const FTSO_PROOF_LAYOUT = 'rewards-data/coston2/<rewardEpochId>/reward-distribution-data.json'

const COSTON2_CHAIN_ID = FLARE_NETWORKS.coston2.id

const REWARDS_INTERNAL: Readonly<Record<FlareNetworkKey, RewardsDeployment | undefined>> = {
  coston2: {
    network: 'coston2',
    rewardManager: '0xB4f43E342c5c77e6fe060c0481Fe313Ff2503454',
    ftsoRewardManager: '0x7A0bFB85387314d7F8C0FcCD9D9B74A76115c322',
    // REUSE — FlareSystemsManager already lives in the address registry (M2). No
    // second literal here; R2.
    flareSystemsManager: registryFor(COSTON2_CHAIN_ID).flareSystemsManager,
    rnat: '0x221D27529e7788B929E13533edc3b00ec1ac5e8A',
    distribution: '0xbd33bDFf04C357F7FC019E72D0504C24CF4Aa010',
    ftsoProofSource: {
      // Unofficial community mirror — no official Coston2 reward API exists. Absence
      // of tuples is the honest "declared unavailable" state, not a blocker.
      url: 'https://gitlab.com/timivesel/ftsov2-testnet-rewards',
      official: false,
    },
    flareDropEndedAt: '2026-01-30',
    delegationRewardExpiryEpochs: 25,
    // Carried false — the blank-slate account earned nothing and no official proof
    // exists this milestone. Flips only when a real claim settles on-chain.
    rewardsVerified: false,
  },
  // Flare mainnet rewards are a later, separately-verified milestone — mirrors
  // bridge.ts's empty `flare` handling.
  flare: undefined,
}

export const REWARDS = REWARDS_INTERNAL

/** The rewards deployment for a network key, or `undefined` if not configured. */
export function rewardsFor(network: FlareNetworkKey): RewardsDeployment | undefined {
  return REWARDS[network]
}
