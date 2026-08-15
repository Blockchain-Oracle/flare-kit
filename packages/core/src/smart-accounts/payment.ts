import { FlareKitError } from '../errors.js'
import { type UnsignedXrplPayment, assembleXrplPayment } from '../xrpl.js'

/**
 * The unsigned XRPL `Payment` that carries an instruction to the operator.
 *
 * Built on M1's `xrpl.ts` primitives — the same `UnsignedXrplPayment` shape and the same
 * memo-as-`MemoData` encoding the direct-mint path already uses. Core produces an UNSIGNED
 * payment and never touches key material; signing belongs to the wallet.
 *
 * The reference travels as the FIRST memo's `MemoData`, which is what the FDC surfaces as
 * `standardPaymentReference` and the controller decodes the instruction from.
 *
 * NO `DestinationTag`, ever. A registered tag makes FAssets minting credit the tag-holder,
 * which would let an unrelated party front-run the user operation — the Smart Accounts docs
 * warn about it, and `xrpl.ts` already refuses tags on the direct-mint path for its own
 * reason. There is no option to add one, because there is no legitimate use for one here.
 *
 * DELIBERATELY NOT MERGED with `xrpl.ts`'s `buildDirectMintPayment` (decided 2026-08-14, after
 * the M13 review raised it). The two share a twelve-line object literal and differ in exactly
 * the parts that carry safety:
 *
 * - the mint builder ENCODES its own memo from a `DirectMintTarget`; this one receives 32
 *   already-encoded bytes and VALIDATES their length, because a short reference here is an
 *   instruction the controller cannot parse after the XRP is gone;
 * - the fee field is named `ledgerFeeDrops` rather than `feeDrops` on purpose (see below).
 *   A merged signature would have to pick one name, and picking `feeDrops` reintroduces the
 *   exact confusion this file exists to prevent.
 *
 * Deduplicating twelve lines of literal by refactoring a live-verified minting path is a bad
 * trade. The duplication is visible and inert; the hazard would not be.
 */

export interface BuildInstructionPaymentInput {
  /** The XRPL address that controls the personal account, and signs this payment. */
  readonly account: string
  /** A registered operator XRPL wallet, read live from `getXrplProviderWallets()`. */
  readonly destination: string
  /** Must be at least the instruction's fee; the controller checks `receivedAmount`. */
  readonly amountDrops: bigint
  /** The 32-byte reference from `encodePaymentReference`. */
  readonly reference: `0x${string}`
  readonly sequence: number
  readonly lastLedgerSequence: number
  /**
   * The XRPL NETWORK fee, in drops — what the ledger charges to include the transaction.
   *
   * Named distinctly from `InstructionPlan.feeDrops`, which is the CONTROLLER's instruction
   * fee and is part of `amountDrops`. They are both "drops" and both `bigint`, so a caller
   * wiring the plan into this builder by field name would silently burn the instruction fee
   * as a network fee and underpay the operator.
   */
  readonly ledgerFeeDrops: bigint
}

export function buildInstructionPayment(
  input: BuildInstructionPaymentInput,
): UnsignedXrplPayment {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.reference)) {
    throw new FlareKitError('INVALID_PAYMENT_REFERENCE', {
      domain: 'input',
      message: 'An instruction payment must carry a 32-byte payment reference.',
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }

  // The envelope is shared with the direct-mint builder; only the memo differs.
  // The positive-amount check and the no-DestinationTag rule live there, so
  // they cannot hold on one payment path and not the other.
  return assembleXrplPayment({
    account: input.account,
    destination: input.destination,
    amountDrops: input.amountDrops,
    ledgerFeeDrops: input.ledgerFeeDrops,
    sequence: input.sequence,
    lastLedgerSequence: input.lastLedgerSequence,
    memoData: input.reference.slice(2).toUpperCase(),
  })
}
