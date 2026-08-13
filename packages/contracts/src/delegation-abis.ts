/**
 * The delegation ABIs the M10 `DelegationCard` drives, hand-curated viem fragments
 * of the vendored Flare periphery interfaces
 * (`sources/flare-foundation/flare-foundry-periphery-package/src/coston2/`). WNat is a
 * `VPToken`, so the delegation/vote-power getters live on `IVPToken` and the
 * wrap/unwrap calls on `IWNat` — the kit drives the few functions the operation
 * lifecycle needs, not the whole surface.
 *
 * The read shapes (`delegatesOf`, `votePowerOf`, `delegationModeOf`,
 * `undelegatedVotePowerOf`, `balanceOf`) were confirmed on-chain by the M10 probe.
 * The write calls (`deposit`/`withdraw`, `delegate`/`batchDelegate`/`undelegateAll`)
 * are curated from the interfaces here and CONFIRMED LIVE in Task 5 — a wrong write
 * signature surfaces at the live run, not in a unit test.
 */

/**
 * `IWNat` — wrap and unwrap native C2FLR/FLR. `deposit()` is payable (wrap the msg
 * value); `withdraw(uint256)` burns WNat back to native. `balanceOf` is the inherited
 * ERC-20 getter the probe read to 0 for the blank-slate account.
 */
export const IWNAT_ABI = [
  { name: 'deposit', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

/**
 * `IVPToken` — the vote-power delegation surface WNat inherits. Percentage delegation
 * (`delegate`/`batchDelegate`, capped at two providers) is what the M10 card uses;
 * the explicit-amount path (`delegateExplicit`/`undelegateAllExplicit`) is carried for
 * completeness. `delegationModeOf` distinguishes them: 0 = NOTSET, 1 = PERCENTAGE,
 * 2 = AMOUNT (explicit).
 */
export const IVPTOKEN_ABI = [
  // Percentage delegation: bips of vote power to one provider. Not cumulative — each
  // call resets; a value of 0 undelegates `_to`.
  {
    name: 'delegate',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_bips', type: 'uint256' },
    ],
    outputs: [],
  },
  // Explicit-amount delegation (mode AMOUNT); mutually exclusive with percentage mode.
  {
    name: 'delegateExplicit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_amount', type: 'uint256' },
    ],
    outputs: [],
  },
  // Two providers in one call: parallel arrays, total bips <= 10000.
  {
    name: 'batchDelegate',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_delegatees', type: 'address[]' },
      { name: '_bips', type: 'uint256[]' },
    ],
    outputs: [],
  },
  // Undelegate all percentage delegations (mode PERCENTAGE only).
  { name: 'undelegateAll', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  // Undelegate all explicit-amount delegations (mode AMOUNT only). Explicit mode does
  // not store the delegatee list on-chain, so the caller must supply the addresses;
  // returns the amount still delegated if the list was incomplete.
  {
    name: 'undelegateAllExplicit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_delegateAddresses', type: 'address[]' }],
    outputs: [{ type: 'uint256' }],
  },
  // Probe-confirmed read: (addresses, bips, count, mode). The card renders the current
  // delegation from this exact tuple.
  {
    name: 'delegatesOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_who', type: 'address' }],
    outputs: [
      { name: '_delegateAddresses', type: 'address[]' },
      { name: '_bips', type: 'uint256[]' },
      { name: '_count', type: 'uint256' },
      { name: '_delegationMode', type: 'uint256' },
    ],
  },
  {
    name: 'votePowerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  // 0 = NOTSET, 1 = PERCENTAGE, 2 = AMOUNT. Once set it never changes back to NOTSET.
  {
    name: 'delegationModeOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_who', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  // Owner's balance minus everything already delegated — the vote power still free.
  {
    name: 'undelegatedVotePowerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const
