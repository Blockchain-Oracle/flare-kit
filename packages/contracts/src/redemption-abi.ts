/**
 * The redemption surface: FAsset back to XRP.
 *
 * Three things make this shape different from minting, and each shows up here:
 * it is **lot-based**, the **agent pays you** (so the awaited actor is a named
 * agent), and **success deletes the request** — `RedemptionRequestInfo.sol`
 * states plainly that "on payment confirmation the request is deleted, so there
 * is no success status". A missing request means completed, never failed.
 *
 * Transcribed from `IAssetManager.sol`, `IAssetManagerEvents.sol`,
 * `data/RedemptionRequestInfo.sol`, and the periphery `IPayment.sol` /
 * `IReferencedPaymentNonexistence.sol`.
 */

/** `RedemptionRequestInfo.Status`, in declaration order. */
export const REDEMPTION_STATUSES = [
  /** waiting for confirmation or default */
  'ACTIVE',
  /** default called; a failed or late payment can still be confirmed */
  'DEFAULTED_UNCONFIRMED',
  'SUCCESSFUL',
  'DEFAULTED_FAILED',
  'BLOCKED',
  /** rejected because the redeemer's address was invalid */
  'REJECTED',
] as const

export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number]

/** Final statuses: no valid payment can follow. */
export const REDEMPTION_FINAL_STATUSES: readonly RedemptionStatus[] = [
  'SUCCESSFUL',
  'DEFAULTED_FAILED',
  'BLOCKED',
  'REJECTED',
]

/** `RedemptionRequestInfo.Data` — 17 fields, in order. */
const REDEMPTION_REQUEST_INFO = {
  name: '',
  type: 'tuple',
  components: [
    { name: 'redemptionRequestId', type: 'uint64' },
    { name: 'status', type: 'uint8' },
    { name: 'agentVault', type: 'address' },
    { name: 'redeemer', type: 'address' },
    { name: 'paymentAddress', type: 'string' },
    { name: 'paymentReference', type: 'bytes32' },
    { name: 'valueUBA', type: 'uint128' },
    { name: 'feeUBA', type: 'uint128' },
    { name: 'poolFeeShareBIPS', type: 'uint16' },
    { name: 'firstUnderlyingBlock', type: 'uint64' },
    { name: 'lastUnderlyingBlock', type: 'uint64' },
    { name: 'lastUnderlyingTimestamp', type: 'uint64' },
    { name: 'timestamp', type: 'uint64' },
    { name: 'poolSelfClose', type: 'bool' },
    { name: 'transferToCoreVault', type: 'bool' },
    { name: 'executor', type: 'address' },
    { name: 'executorFeeNatWei', type: 'uint256' },
  ],
} as const

/** `IPayment.Proof` — the chain-agnostic type the agent confirms with. */
const PAYMENT_PROOF = {
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
            { name: 'inUtxo', type: 'uint256' },
            { name: 'utxo', type: 'uint256' },
          ],
        },
        {
          name: 'responseBody',
          type: 'tuple',
          components: [
            { name: 'blockNumber', type: 'uint64' },
            { name: 'blockTimestamp', type: 'uint64' },
            { name: 'sourceAddressHash', type: 'bytes32' },
            { name: 'sourceAddressesRoot', type: 'bytes32' },
            { name: 'receivingAddressHash', type: 'bytes32' },
            { name: 'intendedReceivingAddressHash', type: 'bytes32' },
            { name: 'spentAmount', type: 'int256' },
            { name: 'intendedSpentAmount', type: 'int256' },
            { name: 'receivedAmount', type: 'int256' },
            { name: 'intendedReceivedAmount', type: 'int256' },
            { name: 'standardPaymentReference', type: 'bytes32' },
            { name: 'oneToOne', type: 'bool' },
            { name: 'status', type: 'uint8' },
          ],
        },
      ],
    },
  ],
} as const

/**
 * `IReferencedPaymentNonexistence.Proof`. Proving a payment did *not* happen is
 * a different attestation type from proving one did, with a different request
 * body — it is not a reuse of the XRPPayment flow.
 */
const NONEXISTENCE_PROOF = {
  name: '_proof',
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
            { name: 'minimalBlockNumber', type: 'uint64' },
            { name: 'deadlineBlockNumber', type: 'uint64' },
            { name: 'deadlineTimestamp', type: 'uint64' },
            { name: 'destinationAddressHash', type: 'bytes32' },
            { name: 'amount', type: 'uint256' },
            { name: 'standardPaymentReference', type: 'bytes32' },
            { name: 'checkSourceAddresses', type: 'bool' },
            { name: 'sourceAddressesRoot', type: 'bytes32' },
          ],
        },
        {
          name: 'responseBody',
          type: 'tuple',
          components: [
            { name: 'minimalBlockTimestamp', type: 'uint64' },
            { name: 'firstOverflowBlockNumber', type: 'uint64' },
            { name: 'firstOverflowBlockTimestamp', type: 'uint64' },
          ],
        },
      ],
    },
  ],
} as const

export const redemptionAbi = [
  {
    type: 'function',
    name: 'redeem',
    stateMutability: 'payable',
    inputs: [
      { name: '_lots', type: 'uint256' },
      { name: '_redeemerUnderlyingAddressString', type: 'string' },
      { name: '_executor', type: 'address' },
    ],
    outputs: [{ name: '_redeemedAmountUBA', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'redemptionRequestInfo',
    stateMutability: 'view',
    inputs: [{ name: '_redemptionRequestId', type: 'uint256' }],
    outputs: [REDEMPTION_REQUEST_INFO],
  },
  {
    type: 'function',
    name: 'confirmRedemptionPayment',
    stateMutability: 'nonpayable',
    inputs: [PAYMENT_PROOF, { name: '_redemptionRequestId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'redemptionPaymentDefault',
    stateMutability: 'nonpayable',
    inputs: [NONEXISTENCE_PROOF, { name: '_redemptionRequestId', type: 'uint256' }],
    outputs: [],
  },
  // Unlike the minting events, these index the redeemer and the request id, so
  // a holder can find their own redemptions without scanning.
  {
    type: 'event',
    name: 'RedemptionRequested',
    inputs: [
      { name: 'agentVault', type: 'address', indexed: true },
      { name: 'redeemer', type: 'address', indexed: true },
      { name: 'requestId', type: 'uint256', indexed: true },
      { name: 'paymentAddress', type: 'string', indexed: false },
      { name: 'valueUBA', type: 'uint256', indexed: false },
      { name: 'feeUBA', type: 'uint256', indexed: false },
      { name: 'firstUnderlyingBlock', type: 'uint256', indexed: false },
      { name: 'lastUnderlyingBlock', type: 'uint256', indexed: false },
      { name: 'lastUnderlyingTimestamp', type: 'uint256', indexed: false },
      { name: 'paymentReference', type: 'bytes32', indexed: false },
      { name: 'executor', type: 'address', indexed: false },
      { name: 'executorFeeNatWei', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RedemptionPerformed',
    inputs: [
      { name: 'agentVault', type: 'address', indexed: true },
      { name: 'redeemer', type: 'address', indexed: true },
      { name: 'requestId', type: 'uint256', indexed: true },
      { name: 'transactionHash', type: 'bytes32', indexed: false },
      { name: 'redemptionAmountUBA', type: 'uint256', indexed: false },
      { name: 'spentUnderlyingUBA', type: 'int256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RedemptionDefault',
    inputs: [
      { name: 'agentVault', type: 'address', indexed: true },
      { name: 'redeemer', type: 'address', indexed: true },
      { name: 'requestId', type: 'uint256', indexed: true },
      { name: 'redemptionAmountUBA', type: 'uint256', indexed: false },
      { name: 'redeemedVaultCollateralWei', type: 'uint256', indexed: false },
      { name: 'redeemedPoolCollateralWei', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RedemptionRejected',
    inputs: [
      { name: 'agentVault', type: 'address', indexed: true },
      { name: 'redeemer', type: 'address', indexed: true },
      { name: 'requestId', type: 'uint256', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'RedemptionPaymentBlocked',
    inputs: [
      { name: 'agentVault', type: 'address', indexed: true },
      { name: 'redeemer', type: 'address', indexed: true },
      { name: 'requestId', type: 'uint256', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'RedemptionPaymentFailed',
    inputs: [
      { name: 'agentVault', type: 'address', indexed: true },
      { name: 'redeemer', type: 'address', indexed: true },
      { name: 'requestId', type: 'uint256', indexed: true },
    ],
  },
] as const
