import type { RedeemChainState } from './fassets/redeem-recovery.js'
import type { MockTimings } from './mock-config.js'
import { hashSeed } from './mock-config.js'

/**
 * The simulated redemption world: where an agent is, relative to its deadline.
 *
 * Kept apart from the kit so `mock.ts` stays under the line cap with two
 * capabilities in it, and so this file can be read as "what a redemption looks
 * like over time" without the surrounding plumbing.
 */

export interface MockRedeemWorld {
  readonly requestId: string
  readonly startedAt: number
  readonly timings: MockTimings
}

export function mockRedeemChainAt(world: MockRedeemWorld, now: number): RedeemChainState {
  const elapsed = now - world.startedAt
  const paid = elapsed >= world.timings.agentPaymentMs
  const deadline = world.startedAt + world.timings.agentDeadlineMs

  return {
    requestId: world.requestId,
    // A paid redemption deletes its request, which reads as MISSING — the same
    // success-by-absence the live chain produces.
    status: paid ? 'MISSING' : 'ACTIVE',
    agentVault: '0xMockAgentNotAReal1AgentVault0000000001',
    paymentAddress: 'rMOCKAgentPaysFromHereNotARea1Ledger',
    agentDeadline: deadline,
    // Proving non-payment needs its own FDC round after the deadline passes.
    defaultProofAvailable:
      !paid &&
      now > deadline &&
      elapsed >= world.timings.agentDeadlineMs + world.timings.fdcProofMs,
  }
}

/** Elapsed offsets that land on each distinct stage of a redemption. */
export function redeemTraceMarks(timings: MockTimings): number[] {
  return [
    0,
    Math.min(timings.agentPaymentMs, timings.agentDeadlineMs) - 1,
    timings.agentPaymentMs,
    timings.agentDeadlineMs + 1,
    timings.agentDeadlineMs + timings.fdcProofMs + 1,
  ].filter((n) => Number.isFinite(n) && n >= 0)
}

export function mockRequestId(operationId: string): string {
  return hashSeed(operationId).toString()
}
