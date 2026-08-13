/**
 * The staking ABIs the M11 `StakeCard` drives — hand-curated viem fragments for the
 * three EVM contracts the stake lifecycle touches on Coston2. Each fragment carries
 * only the functions the operation needs, not the whole surface.
 *
 * Provenance differs per contract and is load-bearing:
 *  - `PChainStakeMirror` is NOT a vendored Flare periphery interface. Its ABI was
 *    NOT published in the interface package we clone, so the fragment below was
 *    PROBED LIVE against Coston2 (M11 Task-1 probe,
 *    `.thoughts/verification/2026-08-12-m11-probe.json`, block 33976187). The probe
 *    tried both candidate mirrored-stake reads: `balanceOf(address)->uint256` decodes
 *    cleanly (read 0 for the blank-slate account), while `votePowerOf(address)`
 *    REVERTS ("Execution reverted for an unknown reason."). So the working read path
 *    is `balanceOf` and `votePowerOf` is deliberately absent from this fragment.
 *  - `PChainStakeMirrorVerifier` limit getters and `ValidatorRewardManager`
 *    (a `GenericRewardManager`) shapes were confirmed on-chain by the same probe.
 *
 * The write call (`claim`) is curated here and CONFIRMED LIVE in the M11 live run —
 * a wrong write signature surfaces at the live run, not a unit test.
 */

/**
 * `PChainStakeMirror` — the on-chain mirror of P-chain stake vote power. MINIMAL,
 * PROVENANCE-FLAGGED (see file header): the ABI is not vendored, so this fragment is
 * limited to the single read the probe proved decodes on Coston2.
 *
 * `balanceOf(address)->uint256` is the working mirrored-stake read. `votePowerOf`
 * REVERTS on Coston2 and is intentionally NOT included — the adapter must read
 * `balanceOf`, never `votePowerOf`.
 */
export const PCHAIN_STAKE_MIRROR_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

/**
 * `PChainStakeMirrorVerifier` — the LIVE stake limits the composer enforces before a
 * stake is signed. All four are public immutable `uint256` getters (probe-confirmed:
 * min 50,000 FLR / max 200,000,000 FLR as Gwei; min 14-day / max 365-day as seconds).
 * The surface reads these live; the docs literals are never hardcoded as the bound.
 */
export const PCHAIN_STAKE_MIRROR_VERIFIER_ABI = [
  {
    name: 'minStakeAmountGwei',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'maxStakeAmountGwei',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'minStakeDurationSeconds',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'maxStakeDurationSeconds',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const

/**
 * `ValidatorRewardManager` — a `GenericRewardManager`, the staking-reward claim + read
 * surface. `getStateOfRewards(address)->(uint256 _totalReward, uint256 _claimedReward)`
 * is the probe-confirmed read (claimable = total − claimed; both 0 for the blank-slate
 * account). `claim` transfers `_rewardAmount` from `_rewardOwner` to `_recipient`,
 * wrapping to WNat when `_wrap`.
 */
export const VALIDATOR_REWARD_MANAGER_ABI = [
  {
    name: 'getStateOfRewards',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_rewardOwner', type: 'address' }],
    outputs: [
      { name: '_totalReward', type: 'uint256' },
      { name: '_claimedReward', type: 'uint256' },
    ],
  },
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_rewardOwner', type: 'address' },
      { name: '_recipient', type: 'address' },
      { name: '_rewardAmount', type: 'uint256' },
      { name: '_wrap', type: 'bool' },
    ],
    outputs: [],
  },
] as const
