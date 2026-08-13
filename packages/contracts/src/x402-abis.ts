/**
 * The x402 ABIs the kit drives (M9-R1), split from `abis.ts` to stay under 300
 * lines. Hand-curated fragments of the deployed
 * `reference/contracts/contracts/X402Facilitator.sol` and `MockUSDT0.sol`.
 *
 * `FACILITATOR_ABI` is what the x402 server calls to verify/settle an authorization
 * and what the reconcile read watches (`PaymentSettled`). `EIP3009_ABI` is the token
 * surface the authorization is signed against and reconciled by: `authorizationState`
 * is the idempotency key, `DOMAIN_SEPARATOR` cross-checks the signing domain. The
 * ERC-20 pieces (`balanceOf`/`decimals`/`name`) come from `ERC20_ABI` in `dex.ts`.
 */

// The PaymentPayload the facilitator's verify/settle take (and the client encodes).
const PAYMENT_PAYLOAD = {
  name: 'payload',
  type: 'tuple',
  components: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'v', type: 'uint8' },
    { name: 'r', type: 'bytes32' },
    { name: 's', type: 'bytes32' },
  ],
} as const

export const FACILITATOR_ABI = [
  // View: does this authorization pass (token supported, unused, in its time window)?
  {
    name: 'verifyPayment',
    type: 'function',
    stateMutability: 'view',
    inputs: [PAYMENT_PAYLOAD],
    outputs: [
      { name: 'paymentId', type: 'bytes32' },
      { name: 'valid', type: 'bool' },
    ],
  },
  // The real settlement: calls token.transferWithAuthorization, records the payment.
  {
    name: 'settlePayment',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [PAYMENT_PAYLOAD],
    outputs: [{ name: 'paymentId', type: 'bytes32' }],
  },
  {
    name: 'supportedTokens',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  // Idempotency record — a settled paymentId is a duplicate, not a second charge.
  {
    name: 'getPayment',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'paymentId', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'settled', type: 'bool' },
        ],
      },
    ],
  },
  // The settlement-confirmed signal the reconcile read watches (settlement ≠ resource).
  {
    name: 'PaymentSettled',
    type: 'event',
    inputs: [
      { name: 'paymentId', type: 'bytes32', indexed: true },
      { name: 'from', type: 'address', indexed: false },
      { name: 'to', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const

export const EIP3009_ABI = [
  // Idempotency key: has this authorizer/nonce already been used?
  {
    name: 'authorizationState',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'authorizer', type: 'address' },
      { name: 'nonce', type: 'bytes32' },
    ],
    outputs: [{ type: 'bool' }],
  },
  // The signing domain separator, to cross-check the client and facilitator agree.
  { name: 'DOMAIN_SEPARATOR', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
  // The EIP-3009 settlement entrypoint (called by the facilitator, v/r/s variant).
  {
    name: 'transferWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  // Settlement-used signal on the token itself.
  {
    name: 'AuthorizationUsed',
    type: 'event',
    inputs: [
      { name: 'authorizer', type: 'address', indexed: true },
      { name: 'nonce', type: 'bytes32', indexed: true },
    ],
  },
] as const
