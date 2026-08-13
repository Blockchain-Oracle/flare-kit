// packages/core/src/stake-adapter.ts
import { type PublicClient } from 'viem'
import {
  PCHAIN_STAKE_MIRROR_ABI,
  PCHAIN_STAKE_MIRROR_VERIFIER_ABI,
  VALIDATOR_REWARD_MANAGER_ABI,
} from '@flare-kit/contracts'

/**
 * The stake adapter — the EVM read seam for the M11 staking op plus the P-chain
 * executor SEAM the signing edge fulfils. It mirrors `delegation-adapter.ts`: pure,
 * keyless viem reads live here; nothing signs and nothing writes.
 *
 * The three reads are the C-chain half of the round trip:
 *  - `readStakeLimits` — the LIVE stake bounds from `PChainStakeMirrorVerifier`. The
 *    amounts are Gwei getters (`min/maxStakeAmountGwei`) converted to wei by
 *    `× WEI_PER_NFLR` (Gwei = nFLR = 1e-9 FLR, the same scale `pchain-rpc.ts` converts);
 *    the durations (`min/maxStakeDurationSeconds`) are already seconds, carried through
 *    as `bigint`. Minimums are read live, never a docs literal.
 *  - `readMirrorVotePower` — the mirrored P-chain stake vote power via
 *    `PChainStakeMirror.balanceOf` (NOT `votePowerOf`, which reverts on Coston2).
 *  - `readStakingReward` — `ValidatorRewardManager.getStateOfRewards` → `{ total, claimed }`.
 *
 * Honesty (M11): `readMirrorVotePower` returns `undefined` when the read THROWS — an
 * unavailable/reverting mirror is `unavailable`, NEVER a fabricated confident `0n`. A
 * genuine on-chain zero (a real `balanceOf` returning `0n`) is returned as `0n`; the two
 * are distinct. `readStakeLimits` and `readStakingReward` PROPAGATE a read failure (the
 * caller maps it to `unavailable`) — they never swallow it into a zero either.
 *
 * The `PChainStakeExecutor` below is a TYPE ONLY — the four signed P-chain legs + the
 * reward claim are the SDK-bound seam a consumer / the M11 live script injects. No
 * implementation and no `@flarenetwork/flare-tx-sdk` / `flarejs` import lives in this
 * file (or anywhere under a `packages/<pkg>/src`): the shipped runtime stays viem-only.
 */

/** 1 Gwei (= 1 nFLR = 1e-9 FLR) = 1e9 wei. Mirrors `pchain-rpc.ts`'s `WEI_PER_NFLR`. */
const WEI_PER_NFLR = 1_000_000_000n

/** The LIVE stake bounds: amounts in wei, durations in seconds — all `bigint`. */
export interface StakeLimits {
  /** Minimum stake, in wei (from `minStakeAmountGwei × 1e9`). */
  minAmount: bigint
  /** Maximum stake, in wei (from `maxStakeAmountGwei × 1e9`). */
  maxAmount: bigint
  /** Minimum stake duration, in seconds. */
  minDuration: bigint
  /** Maximum stake duration, in seconds. */
  maxDuration: bigint
}

/**
 * A structured, UNSIGNED stake intent — the delegate leg's parameters the executor
 * signs. `amount` is wei; `startTime`/`endTime` are unix seconds; `rewardAddress` is the
 * C-chain address staking rewards accrue to.
 */
export interface StakeIntent {
  nodeId: string
  amount: bigint
  startTime: bigint
  endTime: bigint
  rewardAddress: `0x${string}`
}

/**
 * The P-chain executor SEAM — an INTERFACE only. Flare staking is a cross-chain round
 * trip (C→P export/import → delegate → P→C export/import) plus a C-chain reward claim,
 * legs the viem-only runtime cannot sign. A consumer / the M11 live script fulfils this
 * seam with an SDK-backed implementation (in `scripts/` or `test/`, never in `src/`);
 * the shipped packages depend only on the shape.
 */
export interface PChainStakeExecutor {
  /** The bech32 P-chain address the signer controls (`P-costwo…`/`P-flare…`). */
  getPAddress(): Promise<string>
  /** C→P: export from the C-chain and import onto the P-chain. */
  transferToP(amount: bigint): Promise<{ txId: string }>
  /** `AddPermissionlessDelegator` — delegate the imported stake to a validator. */
  delegate(intent: StakeIntent): Promise<{ txId: string }>
  /** P→C: export from the P-chain and import back onto the C-chain (the delayed return). */
  transferToC(amount: bigint): Promise<{ txId: string }>
  /** `ValidatorRewardManager.claim` — claim staking rewards to `recipient`, wrapping when `wrap`. */
  claimStakingReward(
    recipient: `0x${string}`,
    amount: bigint,
    wrap: boolean,
  ): Promise<{ txHash: `0x${string}` }>
}

/**
 * Read the LIVE stake bounds from `PChainStakeMirrorVerifier`. The four immutable
 * getters are read together; any that throws REJECTS the whole snapshot (propagates to
 * the caller — never a per-field fabricated zero). Amounts Gwei→wei; durations seconds.
 */
export async function readStakeLimits(
  client: PublicClient,
  verifier: `0x${string}`,
): Promise<StakeLimits> {
  type VerifierGetter =
    | 'minStakeAmountGwei'
    | 'maxStakeAmountGwei'
    | 'minStakeDurationSeconds'
    | 'maxStakeDurationSeconds'
  const read = (functionName: VerifierGetter) =>
    client.readContract({
      address: verifier,
      abi: PCHAIN_STAKE_MIRROR_VERIFIER_ABI,
      functionName,
    }) as Promise<bigint>

  const [minAmountGwei, maxAmountGwei, minDuration, maxDuration] = await Promise.all([
    read('minStakeAmountGwei'),
    read('maxStakeAmountGwei'),
    read('minStakeDurationSeconds'),
    read('maxStakeDurationSeconds'),
  ])

  return {
    minAmount: minAmountGwei * WEI_PER_NFLR,
    maxAmount: maxAmountGwei * WEI_PER_NFLR,
    minDuration,
    maxDuration,
  }
}

/**
 * Read the mirrored P-chain stake vote power via `PChainStakeMirror.balanceOf`.
 *
 * Returns the read value — a genuine on-chain `0n` is returned as `0n` (an observed zero
 * is a real read). Returns `undefined` when the read THROWS: an unavailable / reverting
 * mirror is `unavailable`, NEVER a fabricated confident zero. (`votePowerOf` reverts on
 * Coston2 and is not in the ABI; a reverting `balanceOf` is treated the same way.)
 */
export async function readMirrorVotePower(
  client: PublicClient,
  mirror: `0x${string}`,
  account: `0x${string}`,
): Promise<bigint | undefined> {
  try {
    return (await client.readContract({
      address: mirror,
      abi: PCHAIN_STAKE_MIRROR_ABI,
      functionName: 'balanceOf',
      args: [account],
    })) as bigint
  } catch {
    // An absent read is `unavailable`, never `0n`.
    return undefined
  }
}

/**
 * Read the staking-reward state from `ValidatorRewardManager.getStateOfRewards` →
 * `{ total, claimed }` (claimable = total − claimed; the caller derives it). A read
 * failure PROPAGATES — it is never swallowed into a confident zero.
 */
export async function readStakingReward(
  client: PublicClient,
  mgr: `0x${string}`,
  account: `0x${string}`,
): Promise<{ total: bigint; claimed: bigint }> {
  const [total, claimed] = (await client.readContract({
    address: mgr,
    abi: VALIDATOR_REWARD_MANAGER_ABI,
    functionName: 'getStateOfRewards',
    args: [account],
  })) as readonly [bigint, bigint]

  return { total, claimed }
}

/**
 * The staking (validator) reward as the rewards machinery's 4th `ClaimKind` carries it:
 * `claimable = total − claimed`, NON-EXPIRING (`expires: false` — `ValidatorRewardManager` is a
 * legacy `GenericRewardManager` with NO expiry field, so this kind never carries an epoch
 * boundary and must never emit M10's "rewards expire in N epochs" / 25-epoch FTSO-delegation
 * line). Honest-empty (`claimable 0n`) when `total === claimed` — a delayed leg (earned only
 * after staking across epochs), never a fabricated amount.
 */
export interface StakingRewardState {
  readonly kind: 'staking'
  readonly total: bigint
  readonly claimed: bigint
  readonly claimable: bigint
  readonly expires: false
}

/**
 * `readStakingReward` shaped as the `StakingRewardState` the rewards adapter surfaces as the 4th
 * kind. A read failure PROPAGATES (never a swallowed zero); a genuine `(0,0)` is honest-empty.
 */
export async function readStakingRewardState(
  client: PublicClient,
  mgr: `0x${string}`,
  account: `0x${string}`,
): Promise<StakingRewardState> {
  const { total, claimed } = await readStakingReward(client, mgr, account)
  return { kind: 'staking', total, claimed, claimable: total - claimed, expires: false }
}
