// packages/core/src/x402-eip3009.ts
import {
  type Address,
  type Hex,
  type TypedDataDomain,
  type WalletClient,
  parseSignature,
  recoverTypedDataAddress,
  serializeSignature,
} from 'viem'

/**
 * The canonical EIP-3009 authorization vocabulary (M9-R6) — THE single source of truth
 * `services/x402-server` imports, so the client and the facilitator cannot drift. The
 * types + domain are byte-identical to the deployed MockUSDT0: `eip3009Domain("Mock
 * USDT0","1",114,token)` reproduces the on-chain `DOMAIN_SEPARATOR()` (asserted in the
 * tests), so a signature this produces is exactly what `transferWithAuthorization`
 * verifies. No key lives here — the browser/agent signs via its own wallet.
 */
export const EIP3009_TRANSFER_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

export interface Authorization {
  readonly from: Address
  readonly to: Address
  readonly value: bigint
  readonly validAfter: bigint
  readonly validBefore: bigint
  /** A unique 32-byte nonce chosen by the authorizer (the idempotency key). */
  readonly nonce: Hex
}

/** The facilitator's `transferWithAuthorization` takes the split signature. */
export interface SplitSignature {
  readonly v: number
  readonly r: Hex
  readonly s: Hex
}

/** The EIP-712 domain — name/version are MockUSDT0's own; verifyingContract = the token. */
export function eip3009Domain(name: string, version: string, chainId: number, token: Address): TypedDataDomain {
  return { name, version, chainId, verifyingContract: token }
}

/**
 * Sign an EIP-3009 authorization with a viem WalletClient (the browser/agent passes its
 * wallet). Off-chain, no gas. Returns the split `{ v, r, s }` the facilitator's tuple
 * expects.
 */
export async function signAuthorization(
  wallet: WalletClient,
  domain: TypedDataDomain,
  auth: Authorization,
): Promise<SplitSignature> {
  const account = wallet.account
  if (!account) throw new Error('signAuthorization requires a WalletClient with an account')
  const signature = await wallet.signTypedData({
    account,
    domain,
    types: EIP3009_TRANSFER_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: auth,
  })
  const { r, s, v, yParity } = parseSignature(signature)
  return { v: v !== undefined ? Number(v) : yParity + 27, r, s }
}

/** Recover the signer of an authorization — the facilitator/token re-check it on-chain. */
export function recoverAuthorizationSigner(
  domain: TypedDataDomain,
  auth: Authorization,
  sig: SplitSignature,
): Promise<Address> {
  const signature = serializeSignature({ r: sig.r, s: sig.s, v: BigInt(sig.v) })
  return recoverTypedDataAddress({
    domain,
    types: EIP3009_TRANSFER_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: auth,
    signature,
  })
}
