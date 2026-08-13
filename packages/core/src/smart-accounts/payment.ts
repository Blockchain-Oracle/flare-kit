import { FlareKitError } from '../errors.js'
import type { UnsignedXrplPayment } from '../xrpl.js'

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
  readonly feeDrops: bigint
}

export function buildInstructionPayment(
  input: BuildInstructionPaymentInput,
): UnsignedXrplPayment {
  if (input.amountDrops <= 0n) {
    throw new FlareKitError('INVALID_AMOUNT', {
      domain: 'input',
      message: `A payment must be for a positive number of drops, received ${input.amountDrops}.`,
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.reference)) {
    throw new FlareKitError('INVALID_PAYMENT_REFERENCE', {
      domain: 'input',
      message: 'An instruction payment must carry a 32-byte payment reference.',
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }

  return {
    TransactionType: 'Payment',
    Account: input.account,
    Destination: input.destination,
    Amount: input.amountDrops.toString(),
    Fee: input.feeDrops.toString(),
    Sequence: input.sequence,
    // Bounds the payment: past this ledger it can never be applied, so a payment not found
    // by then is definitively not going to land.
    LastLedgerSequence: input.lastLedgerSequence,
    Memos: [{ Memo: { MemoData: input.reference.slice(2).toUpperCase() } }],
    // No DestinationTag. See the file comment — this is a safety property, not a default.
  }
}
