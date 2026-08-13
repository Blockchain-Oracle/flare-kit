import { FlareKitError } from '../errors.js'

/**
 * The exact fee arithmetic of `DirectMintingFacet._computeFees`, mirrored so a
 * quote can state the outcome before a single drop of XRP moves.
 *
 * Verified against the contract in
 * `.thoughts/research/2026-08-04-direct-minting-execution.md`.
 */

const BIPS = 10_000n

export interface DirectMintFeeSettings {
  /** `getDirectMintingFeeBIPS()` */
  readonly mintingFeeBIPS: bigint
  /** `getDirectMintingMinimumFeeUBA()` */
  readonly minimumMintingFeeUBA: bigint
  /** `getDirectMintingExecutorFeeUBA()` */
  readonly executorFeeUBA: bigint
}

export interface DirectMintFees {
  /** What the payer receives as FAsset. */
  readonly mintedAmountUBA: bigint
  /** The protocol's cut, paid to the minting fee receiver. */
  readonly mintingFeeUBA: bigint
  /** Paid in FAsset to whoever executes, not in native currency. */
  readonly executorFeeUBA: bigint
  /**
   * True when the payment is under the minimum fee. The contract then clamps
   * the fee to the entire payment and mints nothing to the payer. There is no
   * refund. AC7 forbids ever reaching this on chain.
   */
  readonly belowMinimum: boolean
  /** Echoed so a widget can state the exact threshold it is enforcing. */
  readonly minimumUBA: bigint
}

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}

function max(a: bigint, b: bigint): bigint {
  return a > b ? a : b
}

/** `receivedAmount < minimumMintingFeeUBA`, strictly, as the contract tests it. */
export function isBelowMinimum(
  receivedAmountUBA: bigint,
  settings: DirectMintFeeSettings,
): boolean {
  return receivedAmountUBA < settings.minimumMintingFeeUBA
}

export function computeDirectMintFees(
  receivedAmountUBA: bigint,
  settings: DirectMintFeeSettings,
): DirectMintFees {
  if (receivedAmountUBA < 0n) {
    throw new FlareKitError('INVALID_AMOUNT', {
      domain: 'input',
      message: 'A received amount cannot be negative.',
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }

  const relativeFeeUBA = (receivedAmountUBA * settings.mintingFeeBIPS) / BIPS
  // The clamp to `receivedAmountUBA` is what makes a below-minimum payment
  // consume itself entirely: max(relative, minimum) exceeds the payment, so the
  // fee becomes the whole of it.
  const mintingFeeUBA = min(
    max(relativeFeeUBA, settings.minimumMintingFeeUBA),
    receivedAmountUBA,
  )
  const executorFeeUBA = min(settings.executorFeeUBA, receivedAmountUBA - mintingFeeUBA)

  return {
    mintedAmountUBA: receivedAmountUBA - mintingFeeUBA - executorFeeUBA,
    mintingFeeUBA,
    executorFeeUBA,
    belowMinimum: isBelowMinimum(receivedAmountUBA, settings),
    minimumUBA: settings.minimumMintingFeeUBA,
  }
}

/**
 * The smallest payment that mints anything at all. Below this the payer gets
 * nothing back, so a widget states this number rather than the bare minimum
 * fee.
 */
export function minimumUsefulPaymentUBA(settings: DirectMintFeeSettings): bigint {
  return settings.minimumMintingFeeUBA + settings.executorFeeUBA
}
