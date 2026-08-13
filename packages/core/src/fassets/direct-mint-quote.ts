import { type Amount, amount, formatExact } from '../amounts.js'
import type { DurationRange } from '../states.js'
import { XRP_DECIMALS, encodeDirectMintMemo, xrpToDrops } from '../xrpl.js'
import {
  type DirectMintFeeSettings,
  computeDirectMintFees,
  minimumUsefulPaymentUBA,
} from './fees.js'

/**
 * The quote: an immutable snapshot of exactly what a payment will produce,
 * computed before a single drop moves.
 *
 * Deliberately pure. Every value it needs is fetched once into a
 * `DirectMintProtocolState`, so the arithmetic that decides whether a payment
 * is safe to send is testable with no network and no mocking. Given AC7 — where
 * being wrong costs the user their whole payment — that matters more than
 * convenience.
 */

export interface DirectMintProtocolState {
  /** What the chain calls it: `FTestXRP` on Coston2, `FXRP` on Flare. */
  readonly fAssetSymbol: string
  readonly fAssetDecimals: number
  /** `directMintingPaymentAddress()` — the core vault's XRPL address. */
  readonly xrplDestination: string
  readonly feeSettings: DirectMintFeeSettings
  readonly largeMintingThresholdUBA: bigint
  readonly largeMintingDelaySeconds: bigint
  readonly othersCanExecuteAfterSeconds: bigint
  readonly mintingPaused: boolean
  readonly emergencyPaused: boolean
}

export interface DirectMintIntent {
  /** An exact decimal string. Never a float. */
  readonly amountXrp: string
  readonly recipient: string
  readonly xrplAccount: string
  readonly executor?: string
}

export interface DirectMintQuote {
  readonly input: Amount
  readonly mintedEstimate: Amount
  readonly mintingFee: Amount
  readonly executorFee: Amount
  /** The smallest payment that mints anything at all. */
  readonly minimumPayment: Amount
  readonly belowMinimum: boolean
  readonly fAssetSymbol: string
  readonly xrplDestination: string
  readonly recipient: string
  readonly executor?: string
  /** The memo that binds the recipient. Without it the mint routes elsewhere. */
  readonly memo: string
  readonly expectedDuration: DurationRange
  /** True when the amount will trip the large-minting delay before executing. */
  readonly willBeDelayed: boolean
  readonly canProceed: boolean
  readonly blockedReason?: string
  readonly quotedAt: number
  readonly expiresAt: number
}

/** A quote goes stale; signing against stale terms is how a payer is surprised. */
export const QUOTE_TTL_MS = 60_000

/**
 * XRPL finality plus one FDC voting round plus execution. The floor is roughly
 * three ledgers and a 90-second round; the ceiling allows for a late executor.
 */
const BASE_DURATION: DurationRange = { minMs: 60_000, maxMs: 900_000 }

export function quoteDirectMint(
  state: DirectMintProtocolState,
  intent: DirectMintIntent,
  now: number,
): DirectMintQuote {
  // Throws on precision XRP cannot hold, and on a malformed recipient, before
  // anything else is computed.
  const drops = xrpToDrops(intent.amountXrp)
  const memo = encodeDirectMintMemo({
    recipient: intent.recipient,
    ...(intent.executor ? { executor: intent.executor } : {}),
  })

  const fees = computeDirectMintFees(drops, state.feeSettings)
  const fAsset = (value: bigint): Amount =>
    amount(value, state.fAssetDecimals, state.fAssetSymbol)

  const willBeDelayed = drops >= state.largeMintingThresholdUBA
  const expectedDuration = willBeDelayed
    ? {
        minMs: BASE_DURATION.minMs + Number(state.largeMintingDelaySeconds) * 1_000,
        maxMs: BASE_DURATION.maxMs + Number(state.largeMintingDelaySeconds) * 1_000,
      }
    : BASE_DURATION

  const minimumPayment = amount(minimumUsefulPaymentUBA(state.feeSettings), XRP_DECIMALS, 'XRP')
  const blockedReason = blockingReason(state, drops, minimumPayment)

  return Object.freeze({
    input: amount(drops, XRP_DECIMALS, 'XRP'),
    mintedEstimate: fAsset(fees.mintedAmountUBA),
    mintingFee: fAsset(fees.mintingFeeUBA),
    executorFee: fAsset(fees.executorFeeUBA),
    minimumPayment,
    belowMinimum: fees.belowMinimum,
    fAssetSymbol: state.fAssetSymbol,
    xrplDestination: state.xrplDestination,
    recipient: intent.recipient,
    ...(intent.executor ? { executor: intent.executor } : {}),
    memo,
    expectedDuration,
    willBeDelayed,
    canProceed: blockedReason === undefined,
    ...(blockedReason ? { blockedReason } : {}),
    quotedAt: now,
    expiresAt: now + QUOTE_TTL_MS,
  })
}

function blockingReason(
  state: DirectMintProtocolState,
  drops: bigint,
  minimumPayment: Amount,
): string | undefined {
  if (state.emergencyPaused) {
    return 'The asset manager is emergency-paused. No mint can execute right now.'
  }
  if (state.mintingPaused) {
    return 'Minting is paused on this asset manager. No mint can execute right now.'
  }
  if (drops < minimumPayment.value) {
    // AC7. Not a warning and not a disabled button with a shrug: below this
    // threshold the protocol takes the entire payment as fee and mints nothing,
    // with no refund and no recovery.
    return `A payment below ${formatExact(minimumPayment)} mints nothing. The protocol would take the entire amount as its fee and you would receive nothing back, with no way to recover it.`
  }
  return undefined
}
