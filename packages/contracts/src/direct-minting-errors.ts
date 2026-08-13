/**
 * The protocol's named failure modes for direct minting.
 *
 * These matter more than they look. Without the error fragments a revert is an
 * opaque blob, and a surface that cannot name why a mint did not proceed ends
 * up either inventing a reason or rendering "failed" — both of which this
 * project forbids. With them, every refusal has a name, and the recovery matrix
 * maps that name to a safe action or to none.
 *
 * Sources: `contracts/assetManager/facets/DirectMintingFacet.sol` (declared
 * errors) and `contracts/assetManager/library/data/PaymentConfirmations.sol`.
 */

export const directMintingErrorsAbi = [
  /**
   * The payment was already confirmed: this mint has completed. A repeat
   * `executeDirectMinting` reverts with this rather than being a no-op, so core
   * reads it as proof of success, never as a failure.
   */
  { type: 'error', name: 'PaymentAlreadyConfirmed', inputs: [] },
  /** Still inside the delay window. Carries the timestamp it opens at. */
  {
    type: 'error',
    name: 'DirectMintingStillDelayed',
    inputs: [{ name: 'allowedAt', type: 'uint256' }],
  },
  /** Caller is not the allowed executor, and exclusivity has not yet lapsed. */
  { type: 'error', name: 'InvalidExecutor', inputs: [] },
  /** The payment did not go to the core vault's underlying address. */
  { type: 'error', name: 'InvalidReceivingAddress', inputs: [] },
  { type: 'error', name: 'AmountNotPositive', inputs: [] },
  /** The destination tag marks this a core-vault donation, not a mint. */
  { type: 'error', name: 'PaymentIsCoreVaultDonation', inputs: [] },
  /** The memo carries a redemption reference, which may not be minted against. */
  { type: 'error', name: 'ForbiddenPaymentReference', inputs: [] },
  /** Governance has not unblocked delayed mintings. */
  { type: 'error', name: 'DirectMintingNotUnblocked', inputs: [] },
  { type: 'error', name: 'DirectMintingNotDelayed', inputs: [] },
  /**
   * Protocol configuration is incomplete on this network. Nothing the caller
   * can do fixes it, so it is an availability state, never a user error.
   */
  { type: 'error', name: 'MissingMintingTagManager', inputs: [] },
  { type: 'error', name: 'MissingSmartAccountManager', inputs: [] },
  /** An ordinary direct mint must carry no native value. */
  { type: 'error', name: 'NoValueExpected', inputs: [] },
  { type: 'error', name: 'NoDataExpectedForDirectMinting', inputs: [] },
] as const

export type DirectMintingErrorName = (typeof directMintingErrorsAbi)[number]['name']

/**
 * Reaching one of these means the mint is already done: the value moved and
 * the FAsset was credited. A success signal wearing a revert's clothes.
 */
export const ALREADY_SETTLED_ERRORS: readonly DirectMintingErrorName[] = [
  'PaymentAlreadyConfirmed',
]

/**
 * "Not yet, and no action is safe." The operation waits, and is never rendered
 * as failed.
 */
export const WAIT_ERRORS: readonly DirectMintingErrorName[] = [
  'DirectMintingStillDelayed',
  'InvalidExecutor',
  'DirectMintingNotUnblocked',
]

/**
 * The protocol is not configured to serve this mint on this network. Reported
 * as protocol availability, never as something the payer did wrong.
 */
export const UNAVAILABLE_ERRORS: readonly DirectMintingErrorName[] = [
  'MissingMintingTagManager',
  'MissingSmartAccountManager',
]
