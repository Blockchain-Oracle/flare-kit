import type { DirectMintProtocolState } from './fassets/direct-mint-quote.js'
import type { RedeemProtocolState } from './fassets/quote-redeem.js'

/**
 * What the mock simulates: scenarios, stage timings, and the fake protocol
 * settings both capabilities quote from.
 *
 * Split out of `mock.ts` so the kit itself has room for more than one
 * capability. Nothing here decides anything — it is the shape of the world the
 * simulated clock moves through.
 */

export const MOCK_SCENARIOS = [
  'happy',
  'large-delayed',
  'executor-late',
  'proof-slow',
  'protocol-unavailable',
] as const

export type MockScenario = (typeof MOCK_SCENARIOS)[number]

export interface MockTimings {
  xrplFinalityMs: number
  fdcProofMs: number
  executorExclusiveMs: number
  delayWindowMs: number
  settlementMs: number
  /** How long a simulated agent takes to pay a redemption. */
  agentPaymentMs: number
  /** The agent's deadline. Past it, the collateral claim becomes available. */
  agentDeadlineMs: number
}

export const DEFAULT_TIMINGS: MockTimings = {
  xrplFinalityMs: 12_000,
  fdcProofMs: 90_000,
  executorExclusiveMs: 0,
  delayWindowMs: 0,
  settlementMs: 6_000,
  agentPaymentMs: 120_000,
  agentDeadlineMs: 900_000,
}

export const SCENARIO_TIMINGS: Record<MockScenario, Partial<MockTimings>> = {
  happy: {},
  'large-delayed': { delayWindowMs: 3_600_000 },
  'executor-late': { executorExclusiveMs: 600_000 },
  'proof-slow': { fdcProofMs: 600_000 },
  // Also the scenario where a redemption agent never pays: nothing settles, and
  // the surface has to stay honest about that rather than inventing an outcome.
  'protocol-unavailable': { agentPaymentMs: Number.POSITIVE_INFINITY },
}

/** Deliberately not a real network's symbol: a screenshot must not pass as live. */
export const MOCK_PROTOCOL_STATE: DirectMintProtocolState = {
  fAssetSymbol: 'FMockXRP',
  fAssetDecimals: 6,
  xrplDestination: 'rMOCKCoreVau1tAddressNotARea1Ledger',
  feeSettings: {
    mintingFeeBIPS: 20n,
    minimumMintingFeeUBA: 1_000_000n,
    executorFeeUBA: 500_000n,
  },
  largeMintingThresholdUBA: 1_000_000_000n,
  largeMintingDelaySeconds: 3_600n,
  othersCanExecuteAfterSeconds: 600n,
  mintingPaused: false,
  emergencyPaused: false,
}

/** Mirrors the live Coston2 shape: 10 XRP lots, 0.5% fee, 105% default premium. */
export const MOCK_REDEEM_STATE: RedeemProtocolState = {
  fAssetSymbol: 'FMockXRP',
  fAssetDecimals: 6,
  lotSizeUBA: 10_000_000n,
  redemptionFeeBIPS: 50n,
  underlyingSecondsForPayment: 900n,
  defaultPremiumBIPS: 10_500n,
  emergencyPaused: false,
}

export const MOCK_EPOCH = 1_780_000_000_000

/** Deterministic, seeded. No `Math.random`, so docs and tests never flake. */
export function hashSeed(seed: string): number {
  let h = 2_166_136_261
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16_777_619) >>> 0
  }
  return h
}
