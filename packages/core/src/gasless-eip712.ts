// packages/core/src/gasless-eip712.ts
import { type Address, type Hex, type TypedDataDomain, type WalletClient, recoverTypedDataAddress } from 'viem'

/**
 * The canonical gasless PaymentRequest EIP-712 vocabulary (M9-R2) — THE single source
 * of truth `services/relayer` imports, so the crypto cannot drift from the client
 * (the same co-location principle that kept the mock in core). The domain/types are
 * byte-identical to the deployed `GaslessPaymentForwarder`: `gaslessDomain(114,
 * forwarder)` reproduces the on-chain `getDomainSeparator()` (asserted in the tests),
 * so a signature this produces is exactly what `executePayment` recovers and accepts.
 *
 * No key lives here. The browser signs via the host's wallet (`onSubmit`); scripts and
 * the relayer's own test fixtures pass a `privateKeyToAccount` wallet client.
 */
export const GASLESS_DOMAIN_NAME = 'GaslessPaymentForwarder'
export const GASLESS_DOMAIN_VERSION = '1'

/** PaymentRequest(address from,address to,uint256 amount,uint256 nonce,uint256 deadline). */
export const PAYMENT_REQUEST_TYPES = {
  PaymentRequest: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export interface PaymentRequestMessage {
  readonly from: Address
  readonly to: Address
  readonly amount: bigint
  readonly nonce: bigint
  readonly deadline: bigint
}

/** The EIP-712 domain: chainId + verifyingContract = the forwarder. */
export function gaslessDomain(chainId: number, forwarder: Address): TypedDataDomain {
  return { name: GASLESS_DOMAIN_NAME, version: GASLESS_DOMAIN_VERSION, chainId, verifyingContract: forwarder }
}

/**
 * Sign a PaymentRequest with a viem WalletClient (the browser passes its wallet via
 * the host's `onSubmit`; scripts pass a `privateKeyToAccount` client). Off-chain, no
 * gas — this is the free per-payment step (only the one-time approval costs gas).
 */
export function signPaymentRequest(
  wallet: WalletClient,
  chainId: number,
  forwarder: Address,
  message: PaymentRequestMessage,
): Promise<Hex> {
  const account = wallet.account
  if (!account) throw new Error('signPaymentRequest requires a WalletClient with an account')
  return wallet.signTypedData({
    account,
    domain: gaslessDomain(chainId, forwarder),
    types: PAYMENT_REQUEST_TYPES,
    primaryType: 'PaymentRequest',
    message,
  })
}

/**
 * Recover the signer of a PaymentRequest. The relayer asserts this equals `from`
 * before submitting — the forwarder re-checks it on-chain (defence in depth).
 */
export function recoverPaymentSigner(
  chainId: number,
  forwarder: Address,
  message: PaymentRequestMessage,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({
    domain: gaslessDomain(chainId, forwarder),
    types: PAYMENT_REQUEST_TYPES,
    primaryType: 'PaymentRequest',
    message,
    signature,
  })
}
