/**
 * The GaslessPaymentForwarder ABI the gasless kit drives (M9-R1), split from
 * `abis.ts` to stay under 300 lines. Hand-curated fragments of the deployed
 * `reference/contracts/contracts/GaslessPaymentForwarder.sol` — the kit reads
 * `fxrp`/`getNonce`, submits `executePayment` (from the relayer service), and
 * reconciles against the `PaymentExecuted` event; it does not need the whole surface.
 *
 * The FXRP ERC-20 fragments (`allowance`/`approve`/`balanceOf`/`decimals`) are NOT
 * re-declared here — the adapter reuses `ERC20_ABI` from `dex.ts` (M9-R13 reuse).
 */

export const FORWARDER_ABI = [
  // FXRP resolved from the Flare Contract Registry at runtime (network-agnostic).
  { name: 'fxrp', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  // Current replay nonce for off-chain signing.
  {
    name: 'getNonce',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  // The relayer allowlist (enforced in executePayment; see the .sol adaptation note).
  {
    name: 'authorizedRelayers',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'relayer', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  // The EIP-712 domain separator, for cross-checking the client/relayer/contract agree.
  { name: 'getDomainSeparator', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
  // The meta-transaction the relayer submits and pays gas for.
  {
    name: 'executePayment',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  // Owner-only relayer allowlist mutation (used by the deploy script, not the kit).
  {
    name: 'setRelayerAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'relayer', type: 'address' },
      { name: 'authorized', type: 'bool' },
    ],
    outputs: [],
  },
  // The transfer-confirmed signal `paymentSince` reads: succeeded is entered ONLY
  // from observing this on-chain, never from the relayer's HTTP response (M9-R3).
  {
    name: 'PaymentExecuted',
    type: 'event',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'nonce', type: 'uint256', indexed: false },
    ],
  },
] as const
