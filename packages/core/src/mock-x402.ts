// packages/core/src/mock-x402.ts
import type { Hex } from 'viem'
import { type FlareNetworkKey, x402For } from '@flarekit-dev/contracts'
import type { X402Challenge, X402Outcome } from './x402-client.js'

/**
 * The x402 mock (M9-R9), written AFTER the real Coston2 loop and copying only what that
 * run observed. Mock mode is explicit — a caller constructs these readers; nothing ever
 * falls back to them. It REFUSES the unobserved: a network never driven live throws, and
 * a `settled` outcome is NEVER fabricated by default — the default is `pending`
 * (undelivered), and settlement appears only when the caller asserts it (the M4/M6/M8
 * discipline). The demo-token label is preserved on every challenge. Settlement and
 * resource stay two independent facts, including the settled-but-resource-failed split.
 *
 * OBSERVED (live run 2026-08-12, evidence
 * `.thoughts/verification/2026-08-12-coston2-live-x402.json`): a 402 for 0.1 mUSDT0
 * (demo) → EIP-3009 authorization → facilitator settlement (tx 0x2923aa74…, payer −0.1 /
 * payee +0.1) → HTTP 200 synthetic resource. `succeeded` came only from settled+delivered.
 */

export const MOCK_X402_OBSERVED = {
  maxAmountRequired: 100_000n, // 0.1 mUSDT0 (6 dp)
  settlementTx: '0x2923aa74b5478b3cf6b5aa6e279acfdf120ece201afd8de8f0701d076e698158' as Hex,
  paymentId: '0x3ef50c3d33ff5bd92b288c8427164b1e59abdf1df77e6206e0111903927843cc' as Hex,
  // A fixed synthetic body (deterministic servedAt — the gallery-clock rule).
  resourceBody: {
    demo: true,
    note: 'Synthetic x402 demo resource — no real data. The payment flow and the on-chain settlement are real; this body is a placeholder.',
    servedAt: 1_786_500_000,
  },
} as const

const MOCK_TIMEOUT_MS = 300 * 1000

export type MockX402Outcome = 'pending' | 'settled-delivered' | 'settled-resource-failed' | 'rejected'

export interface MockX402Config {
  /** How the challenge expires relative to `receivedAt` (default: the observed 300s). */
  readonly expiresInMs?: number
  readonly resourceFailStatus?: number
}

/** The observed challenge, demo-labelled. A network never observed live refuses. */
export function mockX402Challenge(receivedAt = 0, config: MockX402Config = {}, network: FlareNetworkKey = 'coston2'): X402Challenge {
  const base = x402For(network)
  if (!base) throw new Error(`mock-x402: no x402 deployment was observed live for '${network}' — the mock refuses to invent one.`)
  return {
    scheme: 'exact',
    network: network === 'coston2' ? 'flare-coston2' : 'flare',
    maxAmountRequired: MOCK_X402_OBSERVED.maxAmountRequired,
    resource: base.resourcePath,
    payTo: base.payee,
    token: base.token.address,
    facilitator: base.facilitator,
    chainId: 114,
    asset: `${base.token.symbol} (demo)`,
    demoToken: base.token.demoToken,
    maxTimeoutSeconds: 300,
    expiresAt: receivedAt + (config.expiresInMs ?? MOCK_TIMEOUT_MS),
  }
}

/**
 * The outcome states. `pending` is the honest default (nothing observed yet); a `settled`
 * settlement is produced ONLY when the caller explicitly selects an observed outcome —
 * the mock never fabricates a settlement, and never dresses a rejection as a settlement.
 */
export function mockX402Outcome(outcome: MockX402Outcome = 'pending', config: MockX402Config = {}): X402Outcome {
  const settled = { kind: 'settled', txHash: MOCK_X402_OBSERVED.settlementTx, paymentId: MOCK_X402_OBSERVED.paymentId } as const
  switch (outcome) {
    case 'settled-delivered':
      return { settlement: settled, resource: { kind: 'delivered', body: MOCK_X402_OBSERVED.resourceBody } }
    case 'settled-resource-failed':
      // The honest split: the payment took, the resource did not.
      return { settlement: settled, resource: { kind: 'failed', status: config.resourceFailStatus ?? 502 } }
    case 'rejected':
      return { settlement: { kind: 'rejected', reason: 'facilitator: authorization invalid' }, resource: { kind: 'undelivered' } }
    case 'pending':
    default:
      return { settlement: { kind: 'pending' }, resource: { kind: 'undelivered' } }
  }
}
