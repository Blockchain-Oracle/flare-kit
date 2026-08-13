// packages/core/src/mock-rewards.ts
import type { Address, Hex, PublicClient } from 'viem'
import { type FlareNetworkKey, type RewardsDeployment, rewardsFor, stakingFor } from '@flare-kit/contracts'
import { type RewardsAdapter, makeRewardsAdapter } from './rewards-adapter.js'

/**
 * The rewards mock (M10-R8), written AFTER the live Coston2 keyless read pass (Task 8)
 * and copying only what that run observed. It is a labelled fake `PublicClient` PLUS a
 * `fetch` stub for the unofficial FTSO-proof mirror — the REAL `makeRewardsAdapter`,
 * `buildRewardsClaimPlan`, `reconcileClaim` and, CRITICALLY, `fetchFtsoProof` itself all
 * run against it UNCHANGED, so a test or demo drives the true code path with no network.
 * Mock mode is explicit — a caller constructs this adapter; nothing ever falls back to it.
 *
 * It REFUSES the unobserved (the M4/M6/M8/M10-delegation mock discipline):
 *  - a network the live run never drove throws, rather than inventing one;
 *  - a read for any account other than the one driven live throws — the observed
 *    honest-empty state belongs to THAT account, not a fabricated stand-in;
 *  - the two OBSERVED contract reverts are reproduced as real thrown `Error`s (never
 *    bypassed with a hand-rolled zero), so the REAL adapter's revert-catch runs: RNat
 *    `getBalancesOf` -> "no RNat account", Distribution `getClaimableMonths` -> "already
 *    finished". No config knob turns either revert off — no alternate entitled state was
 *    ever observed for this account this milestone;
 *  - `fetchFtsoProof` for OUR account is `null` on every epoch (proof-absent, exactly as
 *    probed); the one proof-present branch it can exercise is the REAL observed mirror
 *    tuple at epoch 5929 for a DIFFERENT beneficiary — real mirror data, never fabricated,
 *    and never claimed as our account's entitlement;
 *  - a `Claimed`/`succeeded` outcome is never conjured here — that guarantee falls out of
 *    driving the REAL `reconcileClaim`, which reaches `succeeded` ONLY from an explicit
 *    `confirmed: true` the caller asserts (an observed on-chain confirmation). An un-run
 *    claim stays `awaiting_external`.
 *
 * OBSERVED (live keyless read pass 2026-08-12, evidence
 * `.thoughts/verification/2026-08-12-m10-rewards.md` +
 * `.thoughts/verification/2026-08-12-m10-live-delegation.json`, account
 * `0xA4b05cdB…31Bd9`): currentRewardEpoch 5930, expireNextEpoch 5902, 28 signed epochs
 * `[5902..5929]`, `ftso: []` (no entitlement — empty, never a faked 0), RNat "no RNat
 * account" (honest-empty, RNat `getCurrentMonth` 26), FlareDrop "already finished"
 * (concluded, ended 2026-01-30), and `ValidatorRewardManager.getStateOfRewards` (0,0) → the
 * NON-EXPIRING staking reward honest-empty (a genuine on-chain zero, never a faked amount).
 * `rewardsVerified` STAYS FALSE — the claim is CARRIED
 * past M10, unlike `mock-delegation.ts` (which flips `delegationVerified: true` because
 * THAT round trip settled live). No reward ever settled here, so this mock keeps the
 * real carried flag rather than fabricating verification.
 */

export const MOCK_REWARDS_OBSERVED = {
  account: '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as Address,
  currentRewardEpoch: 5930,
  expireNextEpoch: 5902,
  claimableEpochStart: 5902,
  claimableEpochEnd: 5929, // 28 epochs [5902..5929], ALL signed — 28/28 rewardsHash != 0
  rnatCurrentMonth: 26,
  // OBSERVED: ValidatorRewardManager.getStateOfRewards for the blank-slate account — a genuine
  // on-chain (0,0) → claimable 0 → honest-empty, NON-EXPIRING staking reward (M11). Never a revert.
  stakingReward: { total: 0n, claimed: 0n },
  // The REAL observed epoch-5929 mirror tuple — for a DIFFERENT beneficiary than our
  // account (ours earned nothing, hence proof-absent below). Never claimed as our
  // entitlement; exercises the REAL fetchFtsoProof parse (trailing-`n` amount, the
  // 5-element merkleProof) honestly, without fabricating a proof for our account.
  proofPresentEpoch: 5929,
  proofPresentBeneficiary: '0x858517d68bf814d3719770998473c58791eb8ead' as Address,
  proofPresentClaimType: 1,
  proofPresentAmount: 50_815_468_086_706_127_518_231n,
  proofPresentMerkleProof: [
    '0xba77b55380c4de52b56a0460f5b05be0843d0a5a95ce398784c8ae0322c1776f',
    '0xbf4761460710e1efb5692119ccbe9136e07de0a02895cea45b9ffe990f5deb39',
    '0x245ed86903eba016903354503b3614bfb3204ece5c3f5de539c6f4fde2433b74',
    '0xa815295550cf5fb09dd1c7e3a36bdd6fe6880c779856764c025dfc8eb82e86bd',
    '0x7fbdb7f5c0b5c8b4d53a6c4a845efb5b5f6d710514b05bbeb22cbe8e4dfd9399',
  ] as Hex[],
} as const

/** Overrides to drive the mock; every default is the OBSERVED blank-slate account. */
export interface MockRewardsConfig {
  /** The account the live pass observed; a read for any other account THROWS. */
  readonly account?: Address
}

function unexpectedRead(functionName: string, address: Address): Error {
  return new Error(`mock-rewards: unexpected (unobserved) read ${functionName} on ${address}`)
}

function checkObservedAccount(args: readonly unknown[], observed: string): void {
  const requested = String(args[0] ?? '').toLowerCase()
  if (requested !== observed) {
    throw new Error(`mock-rewards: read for an unobserved account ${String(args[0])} — only ${observed} was driven live`)
  }
}

/** The observed "already signed" hash: all 28 epochs in the claimable range are signed. */
const SIGNED_HASH = `0x${'11'.repeat(32)}`

function createMockRewardsClient(deployment: RewardsDeployment, config: MockRewardsConfig): PublicClient {
  const account = (config.account ?? MOCK_REWARDS_OBSERVED.account).toLowerCase()
  const rewardManagerLc = deployment.rewardManager.toLowerCase()
  const rnatLc = deployment.rnat.toLowerCase()
  const distributionLc = deployment.distribution.toLowerCase()
  const flareSystemsManagerLc = deployment.flareSystemsManager.toLowerCase()
  // The staking (4th) kind reads getStateOfRewards on the ValidatorRewardManager (staking registry).
  const validatorRewardManagerLc = stakingFor(deployment.network)?.validatorRewardManager?.toLowerCase()

  return {
    async readContract({ address, functionName, args = [] }: { address: Address; functionName: string; args?: readonly unknown[] }) {
      const addr = String(address).toLowerCase()
      switch (functionName) {
        case 'getCurrentRewardEpochId':
          if (addr !== rewardManagerLc) throw unexpectedRead(functionName, address)
          return MOCK_REWARDS_OBSERVED.currentRewardEpoch
        case 'getRewardEpochIdsWithClaimableRewards':
          if (addr !== rewardManagerLc) throw unexpectedRead(functionName, address)
          return [MOCK_REWARDS_OBSERVED.claimableEpochStart, MOCK_REWARDS_OBSERVED.claimableEpochEnd]
        case 'getRewardEpochIdToExpireNext':
          if (addr !== rewardManagerLc) throw unexpectedRead(functionName, address)
          return MOCK_REWARDS_OBSERVED.expireNextEpoch
        case 'getStateOfRewards':
          if (addr === validatorRewardManagerLc) {
            // The 4th (staking) kind — OBSERVED (0,0) tuple, a genuine zero (never a revert, never
            // bypassed with a faked amount), so the real readStakingRewardState maps honest-empty.
            checkObservedAccount(args, account)
            return [MOCK_REWARDS_OBSERVED.stakingReward.total, MOCK_REWARDS_OBSERVED.stakingReward.claimed]
          }
          if (addr !== rewardManagerLc) throw unexpectedRead(functionName, address)
          checkObservedAccount(args, account)
          return [] // observed: every inner array empty -> no-entitlement, never a faked 0.
        case 'rewardsHash':
          if (addr !== flareSystemsManagerLc) throw unexpectedRead(functionName, address)
          return SIGNED_HASH // observed: all 28 epochs in the claimable range are signed.
        case 'getCurrentMonth':
          // The real `rewards-adapter.read()` only calls RNat.getCurrentMonth (Distribution's
          // own getCurrentMonth is never read — getClaimableMonths reverts before it).
          if (addr !== rnatLc) throw unexpectedRead(functionName, address)
          return MOCK_REWARDS_OBSERVED.rnatCurrentMonth
        case 'getBalancesOf':
          // OBSERVED CONTRACT REVERT — thrown, never bypassed with a returned zero, so
          // the real adapter's isRevertWithReason -> honest-empty catch actually runs.
          if (addr !== rnatLc) throw unexpectedRead(functionName, address)
          checkObservedAccount(args, account)
          throw new Error('The contract function "getBalancesOf" reverted with the following reason:\nno RNat account')
        case 'getClaimableMonths':
          // OBSERVED CONTRACT REVERT — same discipline as getBalancesOf above.
          if (addr !== distributionLc) throw unexpectedRead(functionName, address)
          throw new Error('The contract function "getClaimableMonths" reverted with the following reason:\nalready finished')
        default:
          throw unexpectedRead(functionName, address)
      }
    },
  } as unknown as PublicClient
}

function mirrorBody(epoch: number): { rewardEpochId: number; rewardClaims: unknown[] } {
  if (epoch !== MOCK_REWARDS_OBSERVED.proofPresentEpoch) {
    // Observed: no tuples for our account on any OTHER probed epoch either.
    return { rewardEpochId: epoch, rewardClaims: [] }
  }
  return {
    rewardEpochId: epoch,
    rewardClaims: [
      {
        merkleProof: MOCK_REWARDS_OBSERVED.proofPresentMerkleProof,
        body: {
          rewardEpochId: epoch,
          beneficiary: MOCK_REWARDS_OBSERVED.proofPresentBeneficiary,
          claimType: MOCK_REWARDS_OBSERVED.proofPresentClaimType,
          // The mirror serialises amount as a bigint LITERAL string with a trailing "n" —
          // fetchFtsoProof (Task 7, unchanged) strips it before BigInt(); reproduced here.
          amount: `${MOCK_REWARDS_OBSERVED.proofPresentAmount}n`,
        },
      },
    ],
  }
}

/**
 * `fetchFtsoProof` (Task 7, unchanged) calls whatever `fetch` the adapter is handed — so the
 * mock BUILDS a `fetch` stub scoped to the FTSO mirror URL prefix (mirroring
 * `deployment.ftsoProofSource.url`) and passes it into `makeRewardsAdapter` instance-scoped.
 * It NEVER assigns `globalThis.fetch`: `createMockRewardsAdapter` is a shipped export, and a
 * process-wide throwing fetch would leak across a consumer's/other test file's real requests.
 * Any OTHER url throws rather than silently falling through to a real network call — a hermetic
 * mock, never a fallback. Every epoch serves the observed proof-absent shape (`rewardClaims: []`)
 * EXCEPT 5929, which carries the ONE real observed tuple for a beneficiary that is NOT our
 * account — so `fetchFtsoProof` still returns `null` for our account on every epoch, while
 * exercising the REAL parse (trailing-`n` amount, the 5-element merkleProof) for that beneficiary.
 */
function createMockFtsoFetch(deployment: RewardsDeployment): typeof fetch {
  const prefix = `${deployment.ftsoProofSource.url}/-/raw/main/rewards-data/coston2/`
  return (async (input: unknown) => {
    const href = String(input)
    if (!href.startsWith(prefix) || !href.endsWith('/reward-distribution-data.json')) {
      throw new Error(`mock-rewards: fetch for an unobserved source ${href}`)
    }
    const epoch = Number(href.slice(prefix.length).split('/')[0])
    return new Response(JSON.stringify(mirrorBody(epoch)), { status: 200 })
  }) as typeof fetch
}

/**
 * The mock adapter: the REAL `makeRewardsAdapter` over a fake client, plus the FTSO-
 * mirror `fetch` stub above, injected instance-scoped (never mutating the global). The
 * deployment carries `rewardsVerified: false` UNCHANGED — unlike delegation's mock, no reward
 * ever settled live this milestone, so the mock never fabricates verification; a caller
 * exercising a `plan` branch must pass an explicit verified OVERRIDE deployment to
 * `buildRewardsClaimPlan`, exactly as Task 8's `claim()` script does. Only Coston2 was
 * observed; any other network refuses rather than invent one.
 */
export function createMockRewardsAdapter(config: MockRewardsConfig = {}, network: FlareNetworkKey = 'coston2'): RewardsAdapter {
  const deployment = rewardsFor(network)
  if (!deployment) throw new Error(`mock-rewards: no rewards deployment was observed live for '${network}' — the mock refuses to invent one.`)
  return makeRewardsAdapter(createMockRewardsClient(deployment, config), deployment, createMockFtsoFetch(deployment))
}
