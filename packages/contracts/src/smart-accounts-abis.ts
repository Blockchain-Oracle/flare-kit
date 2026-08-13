import { PAYMENT_PROOF } from './fdc/payment-abi.js'

/**
 * `IMasterAccountController` — the XRPL-controlled Smart Accounts surface M13 drives, and
 * the named revert reasons it can refuse with.
 *
 * The controller is an EIP-2535 diamond, so these fragments come from several facet
 * interfaces under
 * `sources/flare-foundation/flare-smart-accounts/contracts/userInterfaces/facets/`
 * (`IPersonalAccountsFacet`, `IInstructionsFacet`, `IInstructionFeesFacet`,
 * `IVaultsFacet`, `IAgentVaultsFacet`, `IExecutorsFacet`, `IXrplProviderWalletsFacet`,
 * `IPaymentProofsFacet`, `IMemoInstructionsFacet`) — but they are all dispatched from one
 * address, so they are one ABI here.
 *
 * `executeInstruction` reuses `PAYMENT_PROOF` rather than restating it. It takes
 * `IPayment.Proof` — the CHAIN-AGNOSTIC payment attestation carrying
 * `standardPaymentReference` — and NOT the `IXRPPayment.Proof` the FAssets AssetManager
 * takes. `payment-abi.ts` states why the two cannot be shared.
 */

const READS = [
  {
    type: 'function',
    name: 'getPersonalAccount',
    stateMutability: 'view',
    // The deterministic CREATE2 address for an XRPL owner. It answers before the account
    // is deployed — a returned address is NOT evidence the account exists on chain, which
    // is why the adapter checks code size separately.
    inputs: [{ name: '_xrplOwner', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'getNonce',
    stateMutability: 'view',
    inputs: [{ name: '_personalAccount', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getExecutor',
    stateMutability: 'view',
    // The executor PINNED to a personal account, or the zero address when none is. Only a
    // pinned executor constrains who may deliver; unpinned means anyone may.
    inputs: [{ name: '_personalAccount', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'getXrplProviderWallets',
    stateMutability: 'view',
    // The operator XRPL addresses a payment must reach. Operator-mutable, so this is read
    // at plan time and never snapshotted into the registry.
    inputs: [],
    outputs: [{ name: '', type: 'string[]' }],
  },
  {
    type: 'function',
    name: 'getSourceId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'getPaymentProofValidityDurationSeconds',
    stateMutability: 'view',
    // The proof window, measured from the XRPL block timestamp. Past it the instruction
    // can never execute while the XRP has already left the payer.
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getDefaultInstructionFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getInstructionFee',
    stateMutability: 'view',
    inputs: [{ name: '_instructionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getVaults',
    stateMutability: 'view',
    // The controller's OWN vault namespace — ids here are not the vault ids of
    // `vaults.ts`, and on Coston2 they resolve to different deployments entirely.
    inputs: [],
    outputs: [
      { name: '_vaultIds', type: 'uint256[]' },
      { name: '_vaultAddresses', type: 'address[]' },
      { name: '_vaultTypes', type: 'uint8[]' },
    ],
  },
  {
    type: 'function',
    name: 'getAgentVaults',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_agentVaultIds', type: 'uint256[]' },
      { name: '_agentVaultAddresses', type: 'address[]' },
    ],
  },
  {
    type: 'function',
    name: 'getExecutorInfo',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_executor', type: 'address' },
      { name: '_executorFee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'isTransactionIdUsed',
    stateMutability: 'view',
    // Replay protection. A used id means this exact XRPL payment has already dispatched;
    // re-submitting its proof reverts, and re-paying is a NEW payment, not a retry.
    inputs: [{ name: '_transactionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isPaused',
    stateMutability: 'view',
    // Every dispatch entry point carries a `notPaused` modifier. A paused controller
    // reverts `executeInstruction` — after the XRPL payment has already left.
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getTransactionIdForCollateralReservation',
    stateMutability: 'view',
    inputs: [{ name: '_collateralReservationId', type: 'uint256' }],
    outputs: [{ name: '_transactionId', type: 'bytes32' }],
  },
] as const

const WRITES = [
  {
    type: 'function',
    name: 'executeInstruction',
    stateMutability: 'payable',
    // Permissionless: the deployed facet carries only a `notPaused` modifier. Anyone
    // holding a valid proof may dispatch, which is what lets this kit be its own operator.
    inputs: [PAYMENT_PROOF, { name: '_xrplAddress', type: 'string' }],
    outputs: [],
  },
] as const

const EVENTS = [
  {
    type: 'event',
    name: 'InstructionExecuted',
    // Three indexed parameters, unlike M1's direct-minting events, which index none. That
    // is what makes the bounded backfill scan possible rather than forcing every
    // correlation through a receipt decode.
    inputs: [
      { name: 'personalAccount', type: 'address', indexed: true },
      { name: 'transactionId', type: 'bytes32', indexed: true },
      { name: 'paymentReference', type: 'bytes32', indexed: true },
      { name: 'xrplOwner', type: 'string', indexed: false },
      { name: 'instructionId', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'FXrpTransferred',
    inputs: [
      { name: 'personalAccount', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'personalAccount', type: 'address', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'shares', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Approved',
    inputs: [
      { name: 'personalAccount', type: 'address', indexed: true },
      { name: 'fxrp', type: 'address', indexed: false },
      { name: 'vault', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'FXrpRedeemed',
    inputs: [
      { name: 'personalAccount', type: 'address', indexed: true },
      { name: 'lots', type: 'uint256', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'executor', type: 'address', indexed: false },
      { name: 'executorFee', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Redeemed',
    inputs: [
      { name: 'personalAccount', type: 'address', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'shares', type: 'uint256', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'WithdrawalClaimed',
    inputs: [
      { name: 'personalAccount', type: 'address', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'period', type: 'uint256', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const

export const masterAccountControllerAbi = [...READS, ...WRITES, ...EVENTS] as const

/**
 * The controller's named refusals, so a revert has a name instead of being an opaque blob
 * — the `direct-minting-errors.ts` precedent. Every one of these is reachable from a
 * well-formed-looking instruction, and the plan exists to make each unreachable in
 * practice by refusing before the XRPL payment is signed.
 */
export const smartAccountErrorsAbi = [
  // The controller is paused; every dispatch entry point carries `notPaused`.
  { type: 'error', name: 'Paused', inputs: [] },
  // `PersonalAccount.redeemFXrp` requires `msg.value >= executorFee`.
  {
    type: 'error',
    name: 'InsufficientFundsForRedeem',
    inputs: [{ name: 'executorFee', type: 'uint256' }],
  },
  // The proof did not satisfy `PaymentProofs.verifyPayment`.
  { type: 'error', name: 'InvalidSourceId', inputs: [] },
  { type: 'error', name: 'InvalidTransactionStatus', inputs: [] },
  { type: 'error', name: 'InvalidReceivingAddressHash', inputs: [] },
  { type: 'error', name: 'MismatchingSourceAndXrplAddr', inputs: [] },
  { type: 'error', name: 'InvalidTransactionProof', inputs: [] },
  // The 24h (Coston2) / 2h (mainnet) window from the XRPL block timestamp has passed.
  { type: 'error', name: 'PaymentProofExpired', inputs: [] },
  // The payment did not carry the instruction's fee.
  {
    type: 'error',
    name: 'InvalidPaymentAmount',
    inputs: [{ name: 'requiredAmount', type: 'uint256' }],
  },
  // This XRPL payment has already dispatched an instruction.
  { type: 'error', name: 'TransactionAlreadyExecuted', inputs: [] },
  // The reference decoded to an instruction the controller does not dispatch.
  {
    type: 'error',
    name: 'InvalidInstruction',
    inputs: [
      { name: 'instructionType', type: 'uint256' },
      { name: 'instructionCommand', type: 'uint256' },
    ],
  },
  // The chain's own name for a Firelight instruction aimed at an Upshift vault id.
  {
    type: 'error',
    name: 'InvalidInstructionType',
    inputs: [
      { name: 'instructionType', type: 'uint256' },
      { name: 'expectedVaultType', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'InvalidVaultId', inputs: [{ name: 'vaultId', type: 'uint256' }] },
  {
    type: 'error',
    name: 'InvalidAgentVault',
    inputs: [{ name: 'agentVaultId', type: 'uint256' }],
  },
  // `PaymentReferenceParser` rejects a zero value or a zero recipient outright.
  { type: 'error', name: 'ValueZero', inputs: [] },
  { type: 'error', name: 'AddressZero', inputs: [] },
  // A downstream call inside the personal account reverted, rolling the whole
  // transaction back — no FAsset moved, and the XRP is still with the operator.
  { type: 'error', name: 'CallFailed', inputs: [{ name: 'returnData', type: 'bytes' }] },
] as const
