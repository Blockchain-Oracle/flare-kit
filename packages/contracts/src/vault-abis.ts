/**
 * The two ERC-4626-family vault ABIs the kit drives, split from `abis.ts` because
 * the two are materially different contracts and together they are a third of a
 * file. M7-R1.
 *
 * The point of this file is that **these two vaults do not share a call shape** —
 * exactly the "venue-specific" reality M6 met with BlazeSwap's non-standard
 * `addLiquidity`. Only the ERC-20 pieces (`balanceOf`/`approve`/`allowance` on the
 * share token) are shared, and those come from `ERC20_ABI` in `dex.ts`; everything
 * vault-specific lives here and is dispatched behind the core `VaultAdapter`.
 *
 * Signatures verified against the vendored interfaces and live Coston2 scripts:
 *   sources/flare-foundation/flare-hardhat-starter/contracts/firelight/IFirelightVault.sol
 *   sources/flare-foundation/flare-hardhat-starter/contracts/upshift/ITokenizedVault.sol
 *   sources/flare-foundation/flare-hardhat-starter/scripts/{firelight,upshift}/*.ts
 * and the read-only probe `.thoughts/verification/2026-08-11-m7-vault-probe.json`.
 */

/**
 * Firelight — a **self-share** ERC-4626: the vault token itself is the share
 * (`stFXRP`), so `balanceOf`/`approve` (from `ERC20_ABI`) act on the vault address.
 * Deposit is standard ERC-4626. **Withdrawal is period-based and delayed**:
 * `withdraw`/`redeem` create a request bound to `currentPeriod` and transfer
 * nothing; assets arrive only via `claimWithdraw(period)` after the period ends.
 */
export const FIRELIGHT_VAULT_ABI = [
  // deposit (standard ERC-4626, immediate)
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },
  // withdraw / redeem — CREATE A REQUEST (no immediate transfer), bound to currentPeriod
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },
  {
    name: 'redeem',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' },
    ],
    outputs: [{ name: 'assets', type: 'uint256' }],
  },
  // claim, after the period ends
  {
    name: 'claimWithdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'period', type: 'uint256' }],
    outputs: [{ name: 'assets', type: 'uint256' }],
  },
  // request reconciliation
  {
    name: 'withdrawalsOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'period', type: 'uint256' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'isWithdrawClaimed',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'period', type: 'uint256' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  // period helpers (currentPeriodEnd / nextPeriodEnd are uint48)
  { name: 'currentPeriod', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'currentPeriodEnd', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint48' }] },
  { name: 'nextPeriodEnd', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint48' }] },
  // quote + rate (standard ERC-4626 single-arg)
  { name: 'previewDeposit', type: 'function', stateMutability: 'view', inputs: [{ name: 'assets', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'previewRedeem', type: 'function', stateMutability: 'view', inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'convertToShares', type: 'function', stateMutability: 'view', inputs: [{ name: 'assets', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'convertToAssets', type: 'function', stateMutability: 'view', inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'asset', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'totalAssets', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  // deposit availability. NOTE: the standard ERC-4626 `maxDeposit` returns uint256
  // max here and DOES NOT reflect Firelight's custom GLOBAL `depositLimit` — a
  // deposit within `maxDeposit` still reverts `DepositLimitExceeded()` once
  // `totalAssets` reaches `depositLimit`. The adapter reads both and caps the real
  // headroom at `depositLimit − totalAssets` (verified live 2026-08-11: limit
  // 15.000000, totalAssets 14.994061 → 0.005939 FXRP of room, yet maxDeposit = max).
  { name: 'maxDeposit', type: 'function', stateMutability: 'view', inputs: [{ name: 'receiver', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'depositLimit', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'error', name: 'DepositLimitExceeded', inputs: [] },
] as const

/**
 * Upshift — a **separate-share** vault (`ITokenizedVault`): the share/LP token
 * `vFXRP` is a distinct ERC-20 at `lpTokenAddress()`, so `balanceOf`/`approve`
 * (from `ERC20_ABI`) act on THAT address, not the vault. The call shape is
 * NON-STANDARD:
 *   - `deposit(assetIn, amountIn, receiver)` — the deposit asset address is the
 *     FIRST parameter (not standard ERC-4626 `deposit(assets, receiver)`).
 *   - `previewDeposit(assetIn, amountIn)` returns TWO values (shares, refTokens).
 *   - `previewRedemption(shares, isInstant)` returns `(assets, assetsAfterFee)` —
 *     the contract computes the fee, so the kit renders `assetsAfterFee` as the
 *     honest received amount rather than applying a fee scale itself.
 * Two exit routes: `instantRedeem` (immediate, `instantRedemptionFee`) or
 * `requestRedeem → lagDuration → claim(y,m,d,receiver)` (`withdrawalFee`), keyed to
 * a calendar epoch. Both routes PULL the LP token, so an LP `approve` is required.
 */
export const UPSHIFT_VAULT_ABI = [
  // deposit — NON-STANDARD: asset address first
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetIn', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'receiverAddr', type: 'address' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },
  {
    name: 'previewDeposit',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'assetIn', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'amountInReferenceTokens', type: 'uint256' },
    ],
  },
  // withdraw routes
  {
    name: 'instantRedeem',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'receiverAddr', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'requestRedeem',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'receiverAddr', type: 'address' },
    ],
    outputs: [
      { name: 'claimableEpoch', type: 'uint256' },
      { name: 'year', type: 'uint256' },
      { name: 'month', type: 'uint256' },
      { name: 'day', type: 'uint256' },
    ],
  },
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'year', type: 'uint256' },
      { name: 'month', type: 'uint256' },
      { name: 'day', type: 'uint256' },
      { name: 'receiverAddr', type: 'address' },
    ],
    outputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'assetsAfterFee', type: 'uint256' },
    ],
  },
  {
    name: 'previewRedemption',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'isInstant', type: 'bool' },
    ],
    outputs: [
      { name: 'assetsAmount', type: 'uint256' },
      { name: 'assetsAfterFee', type: 'uint256' },
    ],
  },
  // reconciliation of a pending request
  {
    name: 'getBurnableAmountByReceiver',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'year', type: 'uint256' },
      { name: 'month', type: 'uint256' },
      { name: 'day', type: 'uint256' },
      { name: 'receiverAddr', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'getWithdrawalEpoch',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'year', type: 'uint256' },
      { name: 'month', type: 'uint256' },
      { name: 'day', type: 'uint256' },
      { name: 'claimableEpoch', type: 'uint256' },
    ],
  },
  // views
  { name: 'asset', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'lpTokenAddress', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'withdrawalsPaused', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { name: 'maxWithdrawalAmount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'instantRedemptionFee', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'lagDuration', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'withdrawalFee', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const
