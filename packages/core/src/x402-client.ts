// packages/core/src/x402-client.ts
import type { Address, Hex } from 'viem'
import { type FlareNetworkKey, X402 } from '@flarekit-dev/contracts'
import type { Authorization, SplitSignature } from './x402-eip3009.js'

/**
 * The x402 client (M9-R6): parse a `402` challenge, encode the `X-Payment` header, read
 * `X-Payment-Response`, and track settlement and resource delivery SEPARATELY. The
 * settlement (the facilitator transaction) and the resource (HTTP 200 + body) are two
 * independent facts — one can succeed while the other fails, so they are two states, and
 * `succeeded` is never inferred from the `402` alone.
 */

export interface X402Challenge {
  readonly scheme: string
  readonly network: string
  readonly maxAmountRequired: bigint
  readonly resource: string
  readonly payTo: Address
  readonly token: Address
  readonly facilitator: Address
  readonly chainId: number
  /** The server's asset label (untrusted display text). */
  readonly asset: string
  /** Registry-derived (M9-R7): is this token a known demo token? NOT the server's word. */
  readonly demoToken: boolean
  readonly maxTimeoutSeconds: number
  /** receivedAt + maxTimeoutSeconds*1000 — an expired challenge renders `expired`, not valid. */
  readonly expiresAt: number
}

export type X402SettlementState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'settled'; readonly txHash: Hex; readonly paymentId: Hex }
  | { readonly kind: 'rejected'; readonly reason: string }

export type X402ResourceState =
  | { readonly kind: 'undelivered' }
  | { readonly kind: 'delivered'; readonly body: unknown }
  | { readonly kind: 'failed'; readonly status: number }

export interface X402Outcome {
  readonly settlement: X402SettlementState
  readonly resource: X402ResourceState
}

// Browser-safe base64 (the kit's core runs in the browser; Buffer is Node-only).
const toBase64 = (s: string): string =>
  typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'utf-8').toString('base64')
const fromBase64 = (b: string): string =>
  typeof atob !== 'undefined' ? atob(b) : Buffer.from(b, 'base64').toString('utf-8')

/** The label is DATA, never the server's word: a token is "demo" iff the kit's registry says so. */
function isDemoToken(token: Address): boolean {
  return Object.values(X402).some((d) => d && d.token.address.toLowerCase() === token.toLowerCase() && d.token.demoToken)
}

const NETWORK_ALIAS: Record<string, FlareNetworkKey> = { 'flare-coston2': 'coston2', coston2: 'coston2', flare: 'flare' }
export function x402NetworkKey(network: string): FlareNetworkKey | undefined {
  return NETWORK_ALIAS[network]
}

interface RawRequirement {
  scheme?: string
  network?: string
  maxAmountRequired?: string
  resource?: string
  payTo?: string
  asset?: string
  maxTimeoutSeconds?: number
  extra?: { tokenAddress?: string; facilitatorAddress?: string; chainId?: number }
}

/** Parse a `402` body's `accepts[0]` requirement, computing the expiry and the demo label. */
export function parseChallenge(body: unknown, receivedAt: number): X402Challenge {
  const req = (body as { accepts?: RawRequirement[] } | null)?.accepts?.[0]
  if (!req || !req.extra?.tokenAddress || !req.extra?.facilitatorAddress || !req.payTo || req.maxAmountRequired == null) {
    // Reject a malformed challenge rather than defaulting the facilitator to 0x0 — a
    // downstream settlement would target the zero address.
    throw new Error('parseChallenge: malformed 402 body (missing accepts[0] requirement)')
  }
  const token = req.extra.tokenAddress as Address
  const maxTimeoutSeconds = req.maxTimeoutSeconds ?? 300
  return {
    scheme: req.scheme ?? 'exact',
    network: req.network ?? 'flare-coston2',
    maxAmountRequired: BigInt(req.maxAmountRequired),
    resource: req.resource ?? '',
    payTo: req.payTo as Address,
    token,
    facilitator: req.extra.facilitatorAddress as Address,
    chainId: req.extra.chainId ?? 114,
    asset: req.asset ?? 'unknown',
    demoToken: isDemoToken(token),
    maxTimeoutSeconds,
    expiresAt: receivedAt + maxTimeoutSeconds * 1000,
  }
}

/** Encode the base64 `X-Payment` header the facilitator's payload expects. */
export function encodeXPayment(auth: Authorization, sig: SplitSignature, token: Address): string {
  const payload = {
    from: auth.from,
    to: auth.to,
    token,
    value: auth.value.toString(),
    validAfter: auth.validAfter.toString(),
    validBefore: auth.validBefore.toString(),
    nonce: auth.nonce,
    v: sig.v,
    r: sig.r,
    s: sig.s,
  }
  return toBase64(JSON.stringify(payload))
}

/** Read the base64 `X-Payment-Response` header — the settlement fact, or null if absent/bad. */
export function readXPaymentResponse(headerB64: string): { paymentId: Hex; txHash: Hex } | null {
  try {
    const parsed = JSON.parse(fromBase64(headerB64)) as { paymentId?: string; transactionHash?: string }
    if (!parsed.paymentId || !parsed.transactionHash) return null
    return { paymentId: parsed.paymentId as Hex, txHash: parsed.transactionHash as Hex }
  } catch {
    return null
  }
}
