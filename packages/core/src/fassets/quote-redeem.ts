import { QUOTE_TTL_MS } from './direct-mint-quote.js'
import { type Amount, amount, formatExact } from '../amounts.js'

/**
 * The redemption quote: pure over a protocol snapshot, like the mint's.
 *
 * Three protocol facts shape it, and each is stated to the user rather than
 * assumed:
 *
 * - It is **lot-based**. `lotSize()` is 10.000000 XRP on Coston2, so a holder
 *   redeems whole lots. Offering a free amount would misrepresent the protocol.
 * - **An agent pays you**, from their own underlying address, within
 *   `underlyingSecondsForPayment`. The counterparty is named on the timeline.
 * - If they do not pay, the recovery pays **collateral, not XRP**, at
 *   `redemptionDefaultFactorVaultCollateralBIPS`. A user must know that before
 *   committing, not after.
 */

const BIPS = 10_000n

export interface RedeemProtocolState {
  readonly fAssetSymbol: string
  readonly fAssetDecimals: number
  /** `lotSize()` — the indivisible unit of redemption. */
  readonly lotSizeUBA: bigint
  readonly redemptionFeeBIPS: bigint
  /** The agent's payment window. */
  readonly underlyingSecondsForPayment: bigint
  /** `redemptionDefaultFactorVaultCollateralBIPS` — 10500 means 105%. */
  readonly defaultPremiumBIPS: bigint
  readonly emergencyPaused: boolean
}

export interface RedeemIntent {
  readonly lots: number
  readonly redeemerUnderlyingAddress: string
}

export interface RedeemQuote {
  /** FAsset burned, immediately, on request. */
  readonly burned: Amount
  /** Kept by the protocol and the agent. */
  readonly fee: Amount
  /** XRP the agent must send. */
  readonly receives: Amount
  readonly lots: number
  readonly redeemerUnderlyingAddress: string
  /** Always true here: redemption is settled by a counterparty. */
  readonly paidByAgent: true
  /** The moment after which non-payment can be proved. */
  readonly agentDeadline: number
  readonly defaultPremiumBIPS: bigint
  /** Plain language, shown before the user commits. */
  readonly ifAgentDoesNotPay: string
  readonly canProceed: boolean
  readonly blockedReason?: string
  readonly quotedAt: number
  /**
   * When this quote stops being current — **M4-R13 C3**.
   *
   * The field did not exist, so FX-07's required `quote expired` was not
   * expressible in core, let alone on the surface: a redeem quote could sit on
   * screen indefinitely with its action enabled. Same `QUOTE_TTL_MS` as the mint
   * quote, because it goes stale for the same reason and at the same rate — the
   * protocol state it was computed from moves.
   */
  readonly expiresAt: number
}

export interface RedeemContext {
  /** The holder's FAsset balance, when the host knows it. */
  readonly fAssetBalance?: Amount
}

/** Whole lots a holding can redeem. Rounds down: a part lot is not redeemable. */
export function lotsForAmount(balance: Amount, lotSizeUBA: bigint): number {
  if (lotSizeUBA <= 0n) return 0
  return Number(balance.value / lotSizeUBA)
}

export function quoteRedeem(
  state: RedeemProtocolState,
  intent: RedeemIntent,
  now: number,
  context: RedeemContext = {},
): RedeemQuote {
  const wholeLots = Number.isInteger(intent.lots) && intent.lots > 0
  const lots = wholeLots ? BigInt(intent.lots) : 0n

  const burnedUBA = lots * state.lotSizeUBA
  const feeUBA = (burnedUBA * state.redemptionFeeBIPS) / BIPS
  const fAsset = (value: bigint) => amount(value, state.fAssetDecimals, state.fAssetSymbol)

  const premiumPercent = Number(state.defaultPremiumBIPS) / 100
  const blockedReason = refusal(state, intent, wholeLots, fAsset(burnedUBA), context)

  return Object.freeze({
    burned: fAsset(burnedUBA),
    fee: fAsset(feeUBA),
    // The agent sends XRP on the XRP Ledger, not FAsset on Flare.
    receives: amount(burnedUBA - feeUBA, 6, 'XRP'),
    lots: intent.lots,
    redeemerUnderlyingAddress: intent.redeemerUnderlyingAddress,
    paidByAgent: true as const,
    agentDeadline: now + Number(state.underlyingSecondsForPayment) * 1_000,
    defaultPremiumBIPS: state.defaultPremiumBIPS,
    ifAgentDoesNotPay: `If the agent does not pay within the window, you can claim ${premiumPercent}% of the value in collateral on Flare instead. You would receive collateral, not XRP.`,
    canProceed: blockedReason === undefined,
    ...(blockedReason ? { blockedReason } : {}),
    quotedAt: now,
    expiresAt: now + QUOTE_TTL_MS,
  })
}

function refusal(
  state: RedeemProtocolState,
  intent: RedeemIntent,
  wholeLots: boolean,
  burned: Amount,
  context: RedeemContext,
): string | undefined {
  if (state.emergencyPaused) {
    return 'The asset manager is emergency-paused. No redemption can be requested right now.'
  }
  if (!wholeLots) {
    const lotSize = formatExact(amount(state.lotSizeUBA, state.fAssetDecimals, state.fAssetSymbol))
    return `Redemption happens in whole lots of ${lotSize}. Enter a whole number of lots.`
  }
  if (!intent.redeemerUnderlyingAddress.trim()) {
    return 'Enter the XRP Ledger address that should receive the XRP.'
  }
  if (context.fAssetBalance && context.fAssetBalance.value < burned.value) {
    return `This redeems ${formatExact(burned)}, which is more than this account holds.`
  }
  return undefined
}
