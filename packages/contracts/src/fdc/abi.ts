import { XRP_PAYMENT_PROOF } from '../direct-minting-abi.js'

/**
 * The contract fragments the FDC flow calls: request the attestation, price it,
 * learn when its round finalized, and verify the proof that comes back.
 *
 * Transcribed from `flare-foundry-periphery-package/src/coston2/`.
 */

/**
 * The voting epoch parameters. These are declared on `IRelay` in the periphery
 * package, but the deployed Relay does not implement them — a live probe on
 * Coston2 reverted on both. They are on FlareSystemsManager.
 */
export const flareSystemsManagerAbi = [
  {
    type: 'function',
    name: 'firstVotingRoundStartTs',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'votingEpochDurationSeconds',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
] as const

/** Only finalization lives on Relay. */
export const relayAbi = [
  {
    type: 'function',
    name: 'isFinalized',
    stateMutability: 'view',
    inputs: [
      { name: '_protocolId', type: 'uint256' },
      { name: '_votingRoundId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export const fdcHubAbi = [
  {
    type: 'function',
    name: 'requestAttestation',
    stateMutability: 'payable',
    inputs: [{ name: '_data', type: 'bytes' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'fdcRequestFeeConfigurations',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  // On IFdcRequestFeeConfigurations, included here so one ABI covers the
  // request path: read the fee for these exact bytes, then send exactly it.
  // The fee is not a constant — it is 1000 wei on Coston2 and 20 FLR on
  // mainnet, measured 2026-08-04.
  {
    type: 'function',
    name: 'getRequestFee',
    stateMutability: 'view',
    inputs: [{ name: '_data', type: 'bytes' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'AttestationRequest',
    inputs: [
      { name: 'data', type: 'bytes', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
] as const

interface AbiComponent {
  readonly name: string
  readonly type: string
  readonly components?: readonly AbiComponent[]
}

/**
 * A family's `Proof` struct.
 *
 * Every family wraps its own request and response bodies in the identical
 * `{ merkleProof, data: { attestationType, sourceId, votingRound,
 * lowestUsedTimestamp, requestBody, responseBody } }` envelope. Writing that
 * envelope out four times would be four chances for the four copies to drift,
 * so it is written once and the bodies are the arguments.
 */
function proofTuple(
  requestBody: readonly AbiComponent[],
  responseBody: readonly AbiComponent[],
): AbiComponent {
  return {
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
          { name: 'requestBody', type: 'tuple', components: requestBody },
          { name: 'responseBody', type: 'tuple', components: responseBody },
        ],
      },
    ],
  }
}

/** `IEVMTransaction`. `events` is capped at fifty entries by the protocol. */
const EVM_TRANSACTION_PROOF = proofTuple(
  [
    { name: 'transactionHash', type: 'bytes32' },
    { name: 'requiredConfirmations', type: 'uint16' },
    { name: 'provideInput', type: 'bool' },
    { name: 'listEvents', type: 'bool' },
    { name: 'logIndices', type: 'uint32[]' },
  ],
  [
    { name: 'blockNumber', type: 'uint64' },
    { name: 'timestamp', type: 'uint64' },
    { name: 'sourceAddress', type: 'address' },
    { name: 'isDeployment', type: 'bool' },
    { name: 'receivingAddress', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'input', type: 'bytes' },
    { name: 'status', type: 'uint8' },
    {
      name: 'events',
      type: 'tuple[]',
      components: [
        { name: 'logIndex', type: 'uint32' },
        { name: 'emitterAddress', type: 'address' },
        { name: 'topics', type: 'bytes32[]' },
        { name: 'data', type: 'bytes' },
        { name: 'removed', type: 'bool' },
      ],
    },
  ],
)

/** `IWeb2Json`. The response is opaque bytes: the caller's own ABI signature. */
const WEB2_JSON_PROOF = proofTuple(
  [
    { name: 'url', type: 'string' },
    { name: 'httpMethod', type: 'string' },
    { name: 'headers', type: 'string' },
    { name: 'queryParams', type: 'string' },
    { name: 'body', type: 'string' },
    { name: 'postProcessJq', type: 'string' },
    { name: 'abiSignature', type: 'string' },
  ],
  [{ name: 'abiEncodedData', type: 'bytes' }],
)

/** `IXRPPaymentNonexistence`. The documented producer of uint64-max sentinels. */
const XRP_PAYMENT_NONEXISTENCE_PROOF = proofTuple(
  [
    { name: 'minimalBlockNumber', type: 'uint64' },
    { name: 'deadlineBlockNumber', type: 'uint64' },
    { name: 'deadlineTimestamp', type: 'uint64' },
    { name: 'destinationAddressHash', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'checkFirstMemoData', type: 'bool' },
    { name: 'firstMemoDataHash', type: 'bytes32' },
    { name: 'checkDestinationTag', type: 'bool' },
    { name: 'destinationTag', type: 'uint256' },
    { name: 'proofOwner', type: 'address' },
  ],
  [
    { name: 'minimalBlockTimestamp', type: 'uint64' },
    { name: 'firstOverflowBlockNumber', type: 'uint64' },
    { name: 'firstOverflowBlockTimestamp', type: 'uint64' },
  ],
)

const verifyFunction = (name: string, proof: AbiComponent) => ({
  type: 'function' as const,
  name,
  stateMutability: 'view' as const,
  inputs: [proof],
  outputs: [{ name: '_proved', type: 'bool' }],
})

/**
 * `IFdcVerification`, for the four families this milestone builds requests for.
 *
 * `verifyXRPPayment` reuses `XRP_PAYMENT_PROOF` rather than restating it: it
 * takes the same struct `executeDirectMinting` does, and two transcriptions of
 * a fifteen-field struct are two chances for them to drift apart.
 *
 * These are the only on-chain verification available to three of the four
 * families. Nothing this project deploys consumes their proofs, and the
 * surfaces say so rather than implying a consumption step exists.
 */
export const fdcVerificationAbi = [
  verifyFunction('verifyXRPPayment', { ...XRP_PAYMENT_PROOF, name: '_proof' }),
  verifyFunction('verifyXRPPaymentNonexistence', XRP_PAYMENT_NONEXISTENCE_PROOF),
  verifyFunction('verifyEVMTransaction', EVM_TRANSACTION_PROOF),
  verifyFunction('verifyWeb2Json', WEB2_JSON_PROOF),
] as const

/** The `verify*` function on `FdcVerification` for a family, by family name. */
export const VERIFY_FUNCTIONS: Readonly<Record<string, string>> = Object.freeze({
  XRPPayment: 'verifyXRPPayment',
  XRPPaymentNonexistence: 'verifyXRPPaymentNonexistence',
  EVMTransaction: 'verifyEVMTransaction',
  Web2Json: 'verifyWeb2Json',
})
