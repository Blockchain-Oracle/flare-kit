/**
 * The rewards ABIs the M10 `ClaimCard` drives, hand-curated viem fragments of the
 * vendored Flare periphery interfaces
 * (`sources/flare-foundation/flare-foundry-periphery-package/src/coston2/`:
 * `RewardsV2Interface`, `IRewardManager`, `IRNat`, `IDistributionToDelegators`,
 * `IIFlareSystemsManager`). Three distinct claim kinds, four contracts — the kit
 * drives only the functions the operation lifecycle needs.
 *
 * The read shapes were confirmed on-chain by the M10 probe; the write calls
 * (`claim`, `claimRewards`, `withdraw`/`withdrawAll`) are curated here and CONFIRMED
 * LIVE in Task 5/8 — a wrong write signature surfaces at the live run, not a unit test.
 *
 * TWO DISTINCT reward structs — do NOT conflate them:
 *  - `RewardState` (getStateOfRewards) has 5 fields, ending in `bool initialised`.
 *  - `RewardClaim` (claim's proof body) has 4 fields, NO bool.
 */

/**
 * `RewardClaim` — the Merkle-tree leaf inside a claim proof. 4 fields, NO bool.
 * `claimType` is the `ClaimType` enum {DIRECT,FEE,WNAT,MIRROR,CCHAIN} → uint8.
 */
const REWARD_CLAIM_BODY = {
  name: 'body',
  type: 'tuple',
  components: [
    { name: 'rewardEpochId', type: 'uint24' },
    { name: 'beneficiary', type: 'bytes20' },
    { name: 'amount', type: 'uint120' },
    { name: 'claimType', type: 'uint8' },
  ],
} as const

/** `RewardClaimWithProof` = { bytes32[] merkleProof; RewardClaim body }. */
const REWARD_CLAIM_WITH_PROOF = {
  name: '_proofs',
  type: 'tuple[]',
  components: [{ name: 'merkleProof', type: 'bytes32[]' }, REWARD_CLAIM_BODY],
} as const

/**
 * `RewardState` — the getStateOfRewards leaf. 5 fields, the LAST is `bool initialised`.
 * DISTINCT from `RewardClaim` above; the probe confirmed this exact shape on-chain.
 */
const REWARD_STATE_COMPONENTS = [
  { name: 'rewardEpochId', type: 'uint24' },
  { name: 'beneficiary', type: 'bytes20' },
  { name: 'amount', type: 'uint120' },
  { name: 'claimType', type: 'uint8' },
  { name: 'initialised', type: 'bool' },
] as const

export const REWARD_MANAGER_ABI = [
  // Claim FTSO delegation rewards up to `_rewardEpochId`, transferring to `_recipient`
  // (wrapped if `_wrap`). Proofs are the Merkle claims. Confirmed against
  // RewardsV2Interface.claim — param order (owner, recipient, epochId, wrap, proofs).
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_rewardOwner', type: 'address' },
      { name: '_recipient', type: 'address' },
      { name: '_rewardEpochId', type: 'uint24' },
      { name: '_wrap', type: 'bool' },
      REWARD_CLAIM_WITH_PROOF,
    ],
    outputs: [{ name: '_rewardAmountWei', type: 'uint256' }],
  },
  // Probe-confirmed: one inner array per claimable epoch, each a list of RewardState.
  // All inner arrays were EMPTY for the blank-slate account.
  {
    name: 'getStateOfRewards',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_rewardOwner', type: 'address' }],
    outputs: [{ name: '_rewardStates', type: 'tuple[][]', components: REWARD_STATE_COMPONENTS }],
  },
  // Probe-confirmed: a (start, end) RANGE tuple, NOT a list. On Coston2 it read
  // (5902, 5929) at block 33963269.
  {
    name: 'getRewardEpochIdsWithClaimableRewards',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_startEpochId', type: 'uint24' },
      { name: '_endEpochId', type: 'uint24' },
    ],
  },
  {
    name: 'getNextClaimableRewardEpochId',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_rewardOwner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  // The actual expiry boundary — the surface reads this, never assumes it from the
  // documented 25-epoch window.
  {
    name: 'getRewardEpochIdToExpireNext',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'getCurrentRewardEpochId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint24' }],
  },
] as const

export const RNAT_ABI = [
  // Probe NOTE: reverts "no RNat account" for an account with no rNat — Task 7 maps
  // that to the honest-empty RnatState (hasProject:false), never (0,0,0).
  {
    name: 'getBalancesOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_owner', type: 'address' }],
    outputs: [
      { name: '_wNatBalance', type: 'uint256' },
      { name: '_rNatBalance', type: 'uint256' },
      { name: '_lockedBalance', type: 'uint256' },
    ],
  },
  {
    name: 'getCurrentMonth',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // Claim project rewards up to `_month`. Returns uint128 claimed wei (IRNat).
  {
    name: 'claimRewards',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_projectIds', type: 'uint256[]' },
      { name: '_month', type: 'uint256' },
    ],
    outputs: [{ name: '_claimedRewardsWei', type: 'uint128' }],
  },
  // Withdraw a specific amount from the RNat account (`_amount` is uint128 in IRNat).
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_amount', type: 'uint128' },
      { name: '_wrap', type: 'bool' },
    ],
    outputs: [],
  },
  // The 50%-locked-burn path: withdraw everything; if tokens are still locked only 50%
  // is withdrawn and the rest is burned as a penalty. Task 8 confirms this live.
  {
    name: 'withdrawAll',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_wrap', type: 'bool' }],
    outputs: [],
  },
] as const

export const DISTRIBUTION_ABI = [
  // Probe NOTE: reverts "already finished" on Coston2 — FlareDrop concluded 2026-01-30.
  // Task 7 maps that revert to the concluded state, never an error. Shape is a
  // (start, end) month tuple (IDistributionToDelegators).
  {
    name: 'getClaimableMonths',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_startMonth', type: 'uint256' },
      { name: '_endMonth', type: 'uint256' },
    ],
  },
  {
    name: 'getClaimableAmountOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_account', type: 'address' },
      { name: '_month', type: 'uint256' },
    ],
    outputs: [{ name: '_amountWei', type: 'uint256' }],
  },
  // Claim/wrap FlareDrop rewards for `_rewardOwner` up to `_month`, to `_recipient`.
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_rewardOwner', type: 'address' },
      { name: '_recipient', type: 'address' },
      { name: '_month', type: 'uint256' },
      { name: '_wrap', type: 'bool' },
    ],
    outputs: [{ name: '_rewardAmount', type: 'uint256' }],
  },
] as const

export const FLARE_SYSTEMS_MANAGER_ABI = [
  // The signed-epoch gate: a non-zero rewardsHash means the epoch's rewards were
  // signed and are claimable. RewardManager reads this before honoring a proof.
  {
    name: 'rewardsHash',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_rewardEpochId', type: 'uint256' }],
    outputs: [{ type: 'bytes32' }],
  },
] as const
