import { FlareKitError } from '../errors.js'
import { type UnsignedXrplPayment, assembleXrplPayment } from '../xrpl.js'
import { MEMO_MAX_BYTES, decodeMemo } from './memo.js'

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

/**
 * The M14 memo-flow payment: to the CORE VAULT, carrying a memo instruction (M14-R11).
 *
 * A third builder rather than a parameter on either of the other two, on the reasoning this
 * file already records: what differs between these builders is precisely what carries the
 * safety. Three destinations, three memo formats, three validations.
 *
 * - the destination is `directMintingPaymentAddress()` — the Core Vault's underlying
 *   address — NOT an operator wallet. Paying an operator wallet with a memo instruction
 *   sends it somewhere that will never mint;
 * - the memo is variable-length and self-describing, so it is DECODED rather than
 *   length-checked. `decodeMemo` enforces the controller's exact lengths per opcode, which
 *   are equalities and not minimums: a memo one byte off is refused after the payment has
 *   settled and there is no recovery for it;
 * - and the amount is the whole payment, from which the protocol takes its minting fee. It
 *   is NOT an instruction fee, which is why the field is named for what it is.
 *
 * The destination-tag rule is the same and is again absolute: a registered tag redirects the
 * entire mint to the tag holder and the protocol discards the memo. There is no parameter for
 * one because there is no legitimate use for one here.
 */
export interface BuildMemoPaymentInput {
  /** The XRPL address that controls the personal account, and signs this payment. */
  readonly account: string
  /** The Core Vault's underlying address, from `directMintingPaymentAddress()`. */
  readonly destination: string
  /** The whole payment, in drops. The protocol's minting fee comes out of this. */
  readonly amountDrops: bigint
  /** The encoded memo instruction, from `planMemoInstruction` or `planMemoRecovery`. */
  readonly memo: `0x${string}`
  readonly sequence: number
  readonly lastLedgerSequence: number
  /** The XRPL NETWORK fee — what the ledger charges to include the transaction. */
  readonly ledgerFeeDrops: bigint
}

export function buildMemoPayment(input: BuildMemoPaymentInput): UnsignedXrplPayment {
  if (input.amountDrops <= 0n) {
    throw new FlareKitError('INVALID_AMOUNT', {
      domain: 'input',
      message: `A payment must be for a positive number of drops, received ${input.amountDrops}.`,
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }
  // Throws on an unknown opcode or a wrong length for a known one — before signing, which is
  // the only side of the payment where either is fixable.
  decodeMemo(input.memo)
  if ((input.memo.length - 2) / 2 > MEMO_MAX_BYTES) {
    throw new FlareKitError('INVALID_MEMO', {
      domain: 'input',
      message: `A memo may not exceed ${MEMO_MAX_BYTES} bytes; the ledger would truncate it and the controller would refuse what arrived.`,
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }

  return {
    TransactionType: 'Payment',
    Account: input.account,
    Destination: input.destination,
    Amount: input.amountDrops.toString(),
    Fee: input.ledgerFeeDrops.toString(),
    Sequence: input.sequence,
    LastLedgerSequence: input.lastLedgerSequence,
    Memos: [{ Memo: { MemoData: input.memo.slice(2).toUpperCase() } }],
    // No DestinationTag. Absolute on this path — see the doc comment above.
  }
}
