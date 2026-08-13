/**
 * The LayerZero V2 OFT ABIs the cross-chain kit drives, split from `abis.ts` to
 * stay under 300 lines (M8-R1). These are hand-curated fragments of the vendored
 * `FXRPOFT.ts` / `IFAssetRedeemComposer.sol` — the kit drives six functions and
 * reads three events, not the whole surface. Every fragment was validated against
 * the M8 probe (`quoteSend`/`quoteOFT` returned a real fee and delivered amount;
 * the events decode the live logs).
 *
 * `OFT_ADAPTER_ABI` is the source-side IOFT surface (the Coston2 adapter that locks
 * FTestXRP, or the Sepolia native OFT). `OFT_DEST_ABI` is what the delivery
 * reconciler reads on the destination chain. `COMPOSER_ABI` carries the
 * FAssetRedeemComposer events the redeem leg reconciles against — both the success
 * and the honest failure shape.
 */

/** The SendParam struct components, shared by quoteSend / quoteOFT / send. */
const SEND_PARAM = {
  name: 'sendParam',
  type: 'tuple',
  components: [
    { name: 'dstEid', type: 'uint32' },
    { name: 'to', type: 'bytes32' },
    { name: 'amountLD', type: 'uint256' },
    { name: 'minAmountLD', type: 'uint256' },
    { name: 'extraOptions', type: 'bytes' },
    { name: 'composeMsg', type: 'bytes' },
    { name: 'oftCmd', type: 'bytes' },
  ],
} as const

const MESSAGING_FEE = {
  type: 'tuple',
  components: [
    { name: 'nativeFee', type: 'uint256' },
    { name: 'lzTokenFee', type: 'uint256' },
  ],
} as const

export const OFT_ADAPTER_ABI = [
  { name: 'token', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    name: 'peers',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'eid', type: 'uint32' }],
    outputs: [{ type: 'bytes32' }],
  },
  { name: 'sharedDecimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  {
    name: 'quoteSend',
    type: 'function',
    stateMutability: 'view',
    inputs: [SEND_PARAM, { name: 'payInLzToken', type: 'bool' }],
    outputs: [{ ...MESSAGING_FEE, name: 'msgFee' }],
  },
  {
    name: 'quoteOFT',
    type: 'function',
    stateMutability: 'view',
    inputs: [SEND_PARAM],
    outputs: [
      {
        name: 'oftLimit',
        type: 'tuple',
        components: [
          { name: 'minAmountLD', type: 'uint256' },
          { name: 'maxAmountLD', type: 'uint256' },
        ],
      },
      {
        name: 'oftFeeDetails',
        type: 'tuple[]',
        components: [
          { name: 'feeAmountLD', type: 'int256' },
          { name: 'description', type: 'string' },
        ],
      },
      {
        name: 'oftReceipt',
        type: 'tuple',
        components: [
          { name: 'amountSentLD', type: 'uint256' },
          { name: 'amountReceivedLD', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'send',
    type: 'function',
    stateMutability: 'payable',
    inputs: [SEND_PARAM, { ...MESSAGING_FEE, name: 'fee' }, { name: 'refundAddress', type: 'address' }],
    outputs: [
      {
        name: 'msgReceipt',
        type: 'tuple',
        components: [
          { name: 'guid', type: 'bytes32' },
          { name: 'nonce', type: 'uint64' },
          { ...MESSAGING_FEE, name: 'fee' },
        ],
      },
      {
        name: 'oftReceipt',
        type: 'tuple',
        components: [
          { name: 'amountSentLD', type: 'uint256' },
          { name: 'amountReceivedLD', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'OFTSent',
    type: 'event',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'guid', type: 'bytes32' },
      { indexed: false, name: 'dstEid', type: 'uint32' },
      { indexed: true, name: 'fromAddress', type: 'address' },
      { indexed: false, name: 'amountSentLD', type: 'uint256' },
      { indexed: false, name: 'amountReceivedLD', type: 'uint256' },
    ],
  },
] as const

/** The destination-side reads: the delivery reconciler correlates OFTReceived by guid. */
export const OFT_DEST_ABI = [
  { name: 'token', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  {
    name: 'OFTReceived',
    type: 'event',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'guid', type: 'bytes32' },
      { indexed: false, name: 'srcEid', type: 'uint32' },
      { indexed: true, name: 'toAddress', type: 'address' },
      { indexed: false, name: 'amountReceivedLD', type: 'uint256' },
    ],
  },
] as const

/**
 * The FAssetRedeemComposer events the redeem leg reconciles against on Coston2.
 * `FAssetRedeemed` is the success terminal (the FAssets redemption was filed);
 * `FAssetRedeemFailed` is the honest failure shape — the token arrived at the
 * redeemer account but the redeem call failed. Reading both means an unknown
 * outcome is never rendered as failed and a real failure is not rendered as XRP-sent.
 */
export const COMPOSER_ABI = [
  {
    name: 'FAssetRedeemed',
    type: 'event',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'guid', type: 'bytes32' },
      { indexed: true, name: 'srcEid', type: 'uint32' },
      { indexed: true, name: 'redeemer', type: 'address' },
      { indexed: false, name: 'redeemerAccount', type: 'address' },
      { indexed: false, name: 'amountToRedeemUBA', type: 'uint256' },
      { indexed: false, name: 'redeemerUnderlyingAddress', type: 'string' },
      { indexed: false, name: 'redeemWithTag', type: 'bool' },
      { indexed: false, name: 'destinationTag', type: 'uint256' },
      { indexed: false, name: 'executor', type: 'address' },
      { indexed: false, name: 'executorFee', type: 'uint256' },
      { indexed: false, name: 'redeemedAmountUBA', type: 'uint256' },
      { indexed: false, name: 'wrappedAmount', type: 'uint256' },
    ],
  },
  {
    name: 'FAssetRedeemFailed',
    type: 'event',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'guid', type: 'bytes32' },
      { indexed: true, name: 'srcEid', type: 'uint32' },
      { indexed: true, name: 'redeemer', type: 'address' },
      { indexed: false, name: 'redeemerAccount', type: 'address' },
      { indexed: false, name: 'amountToRedeemUBA', type: 'uint256' },
      { indexed: false, name: 'wrappedAmount', type: 'uint256' },
    ],
  },
] as const

/**
 * The compose message the redeem leg carries — mirrors
 * `IFAssetRedeemComposer.RedeemComposeMessage`. Built and ABI-encoded by the kit
 * (no LayerZero runtime dep); the composer decodes it on delivery and files the
 * FAssets redeem to `redeemerUnderlyingAddress` (the XRPL destination).
 */
export const REDEEM_COMPOSE_MESSAGE = [
  {
    type: 'tuple',
    components: [
      { name: 'redeemer', type: 'address' },
      { name: 'redeemerUnderlyingAddress', type: 'string' },
      { name: 'redeemWithTag', type: 'bool' },
      { name: 'destinationTag', type: 'uint256' },
      { name: 'executor', type: 'address' },
      { name: 'executorFee', type: 'uint256' },
    ],
  },
] as const
