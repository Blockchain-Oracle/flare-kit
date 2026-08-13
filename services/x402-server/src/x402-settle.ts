import type { Address, Hex, PublicClient, TypedDataDomain, WalletClient } from 'viem'
import { recoverAuthorizationSigner } from '@flare-kit/core'
import { FACILITATOR_ABI } from '@flare-kit/contracts'

/**
 * The x402 fixture's challenge + settle core (M9-R6/R7), split from the express wiring.
 * It imports `recoverAuthorizationSigner` from `@flare-kit/core` — the SAME EIP-3009
 * vocabulary the client signs with (no re-declaration). The demo token is labelled at
 * every turn; the settlement is real (a facilitator transaction). The served resource
 * is obviously synthetic with NO fabricated data.
 */

export interface X402ChallengeConfig {
  readonly resourcePath: string
  readonly network: string
  readonly payee: Address
  readonly token: Address
  readonly tokenSymbol: string
  readonly facilitator: Address
  readonly chainId: number
  readonly maxTimeoutSeconds: number
  readonly price: bigint
}

/** The `402` body — `accepts[0]` is exactly what core's `parseChallenge` reads. */
export function buildChallenge(cfg: X402ChallengeConfig) {
  return {
    error: 'Payment Required',
    x402Version: '1',
    accepts: [
      {
        scheme: 'exact',
        network: cfg.network,
        maxAmountRequired: cfg.price.toString(),
        resource: cfg.resourcePath,
        description: `Payment required to access ${cfg.resourcePath}`,
        mimeType: 'application/json',
        payTo: cfg.payee,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
        // DEMO-LABELLED asset — never dressed as USD₮0 or FXRP.
        asset: `${cfg.tokenSymbol} (demo)`,
        extra: { tokenAddress: cfg.token, facilitatorAddress: cfg.facilitator, chainId: cfg.chainId },
      },
    ],
  }
}

/**
 * The paid resource — obviously synthetic, NO fabricated data. The tutorial returned a
 * made-up `flarePrice`; deliberately not copied. The flow and the settlement are real;
 * only this payload is a placeholder.
 */
export function syntheticResource(servedAt: number, settlement: { paymentId: Hex; txHash: Hex }) {
  return {
    demo: true,
    note: 'Synthetic x402 demo resource — no real data. The payment flow and the on-chain settlement are real; this body is a placeholder.',
    servedAt,
    settlement,
  }
}

export interface PaymentPayload {
  from: Address
  to: Address
  token: Address
  value: string
  validAfter: string
  validBefore: string
  nonce: Hex
  v: number
  r: Hex
  s: Hex
}

const fromBase64 = (b: string): string => (typeof atob !== 'undefined' ? atob(b) : Buffer.from(b, 'base64').toString('utf-8'))
const toBase64 = (s: string): string => (typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'utf-8').toString('base64'))

const isHex = (v: unknown): v is `0x${string}` => typeof v === 'string' && /^0x[0-9a-fA-F]*$/.test(v)
const isBigIntString = (v: unknown): boolean => {
  if (typeof v !== 'string') return false
  try {
    BigInt(v)
    return true
  } catch {
    return false
  }
}

/**
 * Decode + STRICTLY type-validate the X-Payment header. Every field is checked for its
 * type (not just truthiness) so a malformed body returns `null` (→ 400) instead of
 * throwing later in `tuple()`/`settlePayment` — an unauthenticated request must never
 * crash the handler.
 */
export function decodePaymentHeader(header: string): PaymentPayload | null {
  try {
    const p = JSON.parse(fromBase64(header)) as Record<string, unknown>
    if (!isHex(p.from) || !isHex(p.to) || !isHex(p.token) || !isHex(p.nonce) || !isHex(p.r) || !isHex(p.s)) return null
    if (typeof p.v !== 'number') return null
    if (!isBigIntString(p.value) || !isBigIntString(p.validAfter) || !isBigIntString(p.validBefore)) return null
    return p as unknown as PaymentPayload
  } catch {
    return null
  }
}

export type SettleResult =
  | { readonly ok: true; readonly paymentId: Hex; readonly txHash: Hex }
  | { readonly ok: false; readonly status: number; readonly error: string }

export interface X402ServerContext {
  readonly publicClient: PublicClient
  readonly walletClient: WalletClient
  readonly facilitator: Address
  readonly token: Address
  /** The configured payee — the authorization's `to` MUST equal this, or a payer could
   *  sign a self-transfer and get the resource for free (the settlePayment path is
   *  unbound, unlike settlePaymentAsPayee). */
  readonly payee: Address
  readonly minAmount: bigint
  /** The token's EIP-712 domain, for the off-chain signature pre-check. */
  readonly domain: TypedDataDomain
}

function tuple(p: PaymentPayload) {
  return {
    from: p.from,
    to: p.to,
    token: p.token,
    value: BigInt(p.value),
    validAfter: BigInt(p.validAfter),
    validBefore: BigInt(p.validBefore),
    nonce: p.nonce,
    v: p.v,
    r: p.r,
    s: p.s,
  }
}

/** Verify (off-chain pre-check + facilitator view) then settle (facilitator write). */
export async function settlePayment(ctx: X402ServerContext, header: string): Promise<SettleResult> {
  const p = decodePaymentHeader(header)
  if (!p) return { ok: false, status: 400, error: 'malformed X-Payment header' }
  if (p.token.toLowerCase() !== ctx.token.toLowerCase()) return { ok: false, status: 402, error: 'unsupported token' }
  // The authorization MUST pay the configured payee — otherwise a payer could sign a
  // self-transfer and get the resource for free (settlePayment is unbound).
  if (p.to.toLowerCase() !== ctx.payee.toLowerCase()) return { ok: false, status: 402, error: 'authorization payee mismatch' }
  if (BigInt(p.value) < ctx.minAmount) return { ok: false, status: 402, error: `insufficient payment (need ${ctx.minAmount})` }

  // Off-chain signature pre-check via core (no crypto re-declaration).
  const auth = {
    from: p.from,
    to: p.to,
    value: BigInt(p.value),
    validAfter: BigInt(p.validAfter),
    validBefore: BigInt(p.validBefore),
    nonce: p.nonce,
  }
  const signer = await recoverAuthorizationSigner(ctx.domain, auth, { v: p.v, r: p.r, s: p.s })
  if (signer.toLowerCase() !== p.from.toLowerCase()) return { ok: false, status: 402, error: 'authorization signer != from' }

  // On-chain verify (view) then settle (write) via the facilitator.
  const [paymentId, valid] = (await ctx.publicClient.readContract({
    address: ctx.facilitator,
    abi: FACILITATOR_ABI,
    functionName: 'verifyPayment',
    args: [tuple(p)],
  })) as [Hex, boolean]
  if (!valid) return { ok: false, status: 402, error: 'facilitator: authorization invalid (used nonce, out of window, or unsupported)' }

  try {
    const sim = await ctx.publicClient.simulateContract({
      address: ctx.facilitator,
      abi: FACILITATOR_ABI,
      functionName: 'settlePayment',
      args: [tuple(p)],
      account: ctx.walletClient.account,
    })
    const txHash = await ctx.walletClient.writeContract(sim.request)
    // waitForTransactionReceipt RESOLVES for a mined-but-REVERTED tx — it only rejects on
    // timeout/replacement. A settlement that passes the pre-send simulate can still revert
    // when mined (the classic double-settle race: two requests with the same authorization
    // both pass verify+simulate; the first consumes the nonce, the second reverts). Gate
    // success on the receipt status, or a reverted settlement is dressed as `settled` →
    // `succeeded`. (This is the same check live-x402.mjs makes.)
    const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash: txHash })
    if (receipt.status !== 'success') return { ok: false, status: 502, error: 'settlement reverted on-chain' }
    return { ok: true, paymentId, txHash }
  } catch (e) {
    return { ok: false, status: 502, error: (e instanceof Error ? e.message : String(e)).slice(0, 160) }
  }
}

/** The base64 `X-Payment-Response` header — the settlement fact core reads back. */
export function encodePaymentResponse(paymentId: Hex, txHash: Hex): string {
  return toBase64(JSON.stringify({ paymentId, transactionHash: txHash, settled: true }))
}
