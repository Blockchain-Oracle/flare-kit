/**
 * The direct-minting surface, transcribed from the FAssets repository's own
 * interfaces. This is the operation the whole kit is built around: pay XRP to
 * the core vault's underlying address, prove it through the FDC, and execute.
 *
 * Sources, under `sources/flare-foundation/`:
 *   fassets/contracts/userInterfaces/IDirectMinting.sol
 *   fassets/contracts/userInterfaces/IDirectMintingSettings.sol
 *   flare-foundry-periphery-package/src/coston2/IXRPPayment.sol
 */

/**
 * `IXRPPayment.Proof`, flattened for an ABI.
 *
 * Note `requestBody.proofOwner`: the EVM address that receives the FAsset is
 * bound into the attestation request itself, not into the XRPL memo. That is
 * why a mint can be proved and executed by anyone without the recipient being
 * able to change under it.
 */
export const XRP_PAYMENT_PROOF = {
  name: '_payment',
  type: 'tuple',
  components: [
    { name: 'merkleProof', type: 'bytes32[]' },
    {
      name: 'data',
      type: 'tuple',
      components: [
        { name: 'attestationType', type: 'bytes32' },
        { name: 'sourceId', type: 'bytes32' },
        { name: 'votingRound', type: 'uint64' },
        { name: 'lowestUsedTimestamp', type: 'uint64' },
        {
          name: 'requestBody',
          type: 'tuple',
          components: [
            { name: 'transactionId', type: 'bytes32' },
            { name: 'proofOwner', type: 'address' },
          ],
        },
        {
          name: 'responseBody',
          type: 'tuple',
          components: [
            { name: 'blockNumber', type: 'uint64' },
            { name: 'blockTimestamp', type: 'uint64' },
            { name: 'sourceAddress', type: 'string' },
            { name: 'sourceAddressHash', type: 'bytes32' },
            { name: 'receivingAddressHash', type: 'bytes32' },
            { name: 'intendedReceivingAddressHash', type: 'bytes32' },
            { name: 'spentAmount', type: 'int256' },
            { name: 'intendedSpentAmount', type: 'int256' },
            { name: 'receivedAmount', type: 'int256' },
            { name: 'intendedReceivedAmount', type: 'int256' },
            { name: 'hasMemoData', type: 'bool' },
            { name: 'firstMemoData', type: 'bytes' },
            { name: 'hasDestinationTag', type: 'bool' },
            { name: 'destinationTag', type: 'uint256' },
            { name: 'status', type: 'uint8' },
          ],
        },
      ],
    },
  ],
} as const

/** `IDirectMinting.DirectMintingDelayState`, in declaration order. */
export const DIRECT_MINTING_DELAY_STATES = ['NotDelayed', 'Delayed', 'Released'] as const
export type DirectMintingDelayState = (typeof DIRECT_MINTING_DELAY_STATES)[number]

export const directMintingAbi = [
  {
    type: 'function',
    name: 'directMintingPaymentAddress',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'directMintingDelayState',
    stateMutability: 'view',
    inputs: [{ name: '_transactionId', type: 'bytes32' }],
    outputs: [
      { name: '_delayState', type: 'uint8' },
      { name: '_allowedAt', type: 'uint256' },
      { name: '_startedAt', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'executeDirectMinting',
    stateMutability: 'payable',
    inputs: [XRP_PAYMENT_PROOF],
    outputs: [],
  },
  {
    type: 'function',
    name: 'markUnblockedDirectMintingAllowed',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_transactionId', type: 'bytes32' }],
    outputs: [],
  },
  // No parameter on these events is indexed, so an operation correlates them by
  // decoding the receipt of the transaction it submitted, never by a topic filter.
  {
    type: 'event',
    name: 'DirectMintingExecuted',
    inputs: [
      { name: 'transactionId', type: 'bytes32', indexed: false },
      { name: 'targetAddress', type: 'address', indexed: false },
      { name: 'executor', type: 'address', indexed: false },
      { name: 'mintedAmountUBA', type: 'uint256', indexed: false },
      { name: 'mintingFeeUBA', type: 'uint256', indexed: false },
      { name: 'executorFeeUBA', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DirectMintingPaymentTooSmallForFee',
    inputs: [
      { name: 'transactionId', type: 'bytes32', indexed: false },
      { name: 'receivedAmountUBA', type: 'uint256', indexed: false },
      { name: 'minimumMintingFeeUBA', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DirectMintingDelayed',
    inputs: [
      { name: 'transactionId', type: 'bytes32', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'executionAllowedAt', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LargeDirectMintingDelayed',
    inputs: [
      { name: 'transactionId', type: 'bytes32', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'executionAllowedAt', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DirectMintingsUnblocked',
    inputs: [{ name: 'startedUntilTimestamp', type: 'uint256', indexed: false }],
  },
] as const

/** Everything a quote must read before it can state an exact outcome. */
export const directMintingSettingsAbi = [
  {
    type: 'function',
    name: 'getDirectMintingFeeBIPS',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getDirectMintingMinimumFeeUBA',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getDirectMintingExecutorFeeUBA',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getDirectMintingOthersCanExecuteAfterSeconds',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getDirectMintingLargeMintingThresholdUBA',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getDirectMintingLargeMintingDelaySeconds',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getDirectMintingHourlyLimitUBA',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getDirectMintingDailyLimitUBA',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getDirectMintingHourlyLimiterState',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_windowStartTimestamp', type: 'uint64' },
      { name: '_mintedInCurrentWindow', type: 'uint64' },
    ],
  },
  {
    type: 'function',
    name: 'getDirectMintingDailyLimiterState',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_windowStartTimestamp', type: 'uint64' },
      { name: '_mintedInCurrentWindow', type: 'uint64' },
    ],
  },
] as const
