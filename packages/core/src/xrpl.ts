import { amount, formatExact, parseAmount } from './amounts.js'
import { FlareKitError } from './errors.js'

/**
 * XRPL payment construction. Core produces an *unsigned* payment and never
 * touches key material: signing belongs to the wallet, and that boundary is
 * structural here rather than a convention.
 *
 * There is deliberately no `xrpl.js` dependency. Building a Payment is
 * assembling a plain object, and reading finality is one JSON-RPC call, so the
 * package stays dependency-free and light enough to embed.
 */

/** One XRP is 1,000,000 drops. */
export const XRP_DECIMALS = 6

/**
 * `PaymentReference.DIRECT_MINTING`, `0x4642505266410018 << 192`: an 8-byte
 * type tag occupying the high bits of a 32-byte reference.
 */
export const DIRECT_MINTING_REFERENCE_PREFIX = '0x4642505266410018'

/**
 * `PaymentReference.DIRECT_MINTING_EX`, an 8-byte prefix on a 48-byte memo that
 * carries a recipient and an allowed executor.
 */
export const DIRECT_MINTING_EX_PREFIX = '0x4642505266410021'

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function xrpToDrops(xrp: string): bigint {
  return parseAmount(xrp, XRP_DECIMALS, 'XRP').value
}

export function dropsToXrp(drops: bigint): string {
  return formatExact(amount(drops, XRP_DECIMALS, 'XRP'))
}

export interface DirectMintTarget {
  /** The EVM address that receives the FAsset. */
  recipient: string
  /** Optional executor granted exclusivity for a window after the payment. */
  executor?: string
}

function assertAddress(value: string, label: string): string {
  if (!ADDRESS.test(value)) {
    throw new FlareKitError('INVALID_ADDRESS', {
      domain: 'input',
      message: `${label} must be a 20-byte EVM address, received "${value}".`,
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }
  return value.toLowerCase()
}

/**
 * Encodes the memo that tells the AssetManager where the FAsset goes.
 *
 * This is not optional. `DirectMintingFacet._decodeTarget` falls through to
 * mint-to-smart-account when it recognises neither a destination tag nor a
 * memo — it does not fail — so a payment without this memo would silently route
 * to a surface this milestone has not built.
 */
export function encodeDirectMintMemo(target: DirectMintTarget): string {
  const recipient = assertAddress(target.recipient, 'recipient')
  if (recipient === ZERO_ADDRESS) {
    throw new FlareKitError('INVALID_ADDRESS', {
      domain: 'input',
      message: 'The recipient cannot be the zero address; the contract reads that as no target.',
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }

  if (target.executor === undefined) {
    // 32 bytes: 8-byte type tag, 4 zero bytes, then the address in the low 160 bits.
    return `${DIRECT_MINTING_REFERENCE_PREFIX}00000000${recipient.slice(2)}`
  }
  const executor = assertAddress(target.executor, 'executor')
  // 48 bytes: 8-byte prefix, 20-byte recipient, 20-byte executor.
  return `${DIRECT_MINTING_EX_PREFIX}${recipient.slice(2)}${executor.slice(2)}`
}

/** The inverse, so a test or a receipt can read back what was actually sent. */
export function decodeDirectMintMemo(memo: string): DirectMintTarget {
  // XRPL memo data comes back from the ledger as uppercase hex. Normalising
  // first means the prefix comparison does not depend on the two type tags
  // happening to contain no letters.
  const body = (memo.startsWith('0x') ? memo.slice(2) : memo).toLowerCase()
  if (body.length === 64 && `0x${body.slice(0, 16)}` === DIRECT_MINTING_REFERENCE_PREFIX) {
    return { recipient: `0x${body.slice(24)}`.toLowerCase() }
  }
  if (body.length === 96 && `0x${body.slice(0, 16)}` === DIRECT_MINTING_EX_PREFIX) {
    return {
      recipient: `0x${body.slice(16, 56)}`.toLowerCase(),
      executor: `0x${body.slice(56, 96)}`.toLowerCase(),
    }
  }
  throw new FlareKitError('INVALID_MEMO', {
    domain: 'protocol',
    message: 'This memo is not a direct-minting reference the AssetManager would recognise.',
    recovery: 'terminal',
    valueMoved: 'no',
  })
}

/** An unsigned XRPL Payment, exactly as the protocol expects it. */
export interface UnsignedXrplPayment {
  readonly TransactionType: 'Payment'
  readonly Account: string
  readonly Destination: string
  /** Drops, as a string. The XRPL rejects a JSON number here. */
  readonly Amount: string
  readonly Fee: string
  readonly Sequence: number
  readonly LastLedgerSequence: number
  readonly Memos: readonly { readonly Memo: { readonly MemoData: string } }[]
  readonly DestinationTag?: number
}

/**
 * The XRPL `Payment` envelope both builders share.
 *
 * Exported for `smart-accounts/payment.ts` only — the two public builders stay
 * separate because they are different operations (one COMPUTES a mint memo from
 * a target; the other carries an opaque 32-byte reference it merely validates)
 * and because their fee arguments mean different things. Merging them into one
 * signature would need a discriminated union and an `if (kind === 'mint')`
 * body: a switch wearing reuse as a costume, and one parameter list serving two
 * meanings is how a silent underpayment gets written.
 *
 * The ENVELOPE is genuinely one thing, so it is written once.
 *
 * `ledgerFeeDrops` is named for what it is — what the ledger charges to include
 * the transaction — never for the controller's instruction fee, which travels
 * inside `amountDrops`.
 */
export function assembleXrplPayment(input: {
  account: string
  destination: string
  amountDrops: bigint
  ledgerFeeDrops: bigint
  sequence: number
  lastLedgerSequence: number
  /** Already hex, unprefixed and uppercase — the ledger's own memo encoding. */
  memoData: string
}): UnsignedXrplPayment {
  if (input.amountDrops <= 0n) {
    throw new FlareKitError('INVALID_AMOUNT', {
      domain: 'input',
      message: `A payment must be for a positive number of drops, received ${input.amountDrops}.`,
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
    // Bounds the payment: past this ledger it can never be applied, so a
    // payment that is not found by then is definitively not going to land.
    LastLedgerSequence: input.lastLedgerSequence,
    Memos: [{ Memo: { MemoData: input.memoData } }],
    // No DestinationTag, in either builder. A registered tag makes FAssets
    // credit the tag-holder, which would let an unrelated party be paid.
  }
}

export interface BuildDirectMintPaymentInput extends DirectMintTarget {
  account: string
  /** The core vault's underlying address, from `directMintingPaymentAddress()`. */
  destination: string
  amountDrops: bigint
  sequence: number
  lastLedgerSequence: number
  feeDrops: bigint
}

export function buildDirectMintPayment(
  input: BuildDirectMintPaymentInput,
): UnsignedXrplPayment {
  return assembleXrplPayment({
    account: input.account,
    destination: input.destination,
    amountDrops: input.amountDrops,
    // This builder's caller names the ledger fee `feeDrops`: it predates the
    // instruction path, where a second drops-denominated fee made the longer
    // name necessary.
    ledgerFeeDrops: input.feeDrops,
    sequence: input.sequence,
    lastLedgerSequence: input.lastLedgerSequence,
    memoData: encodeDirectMintMemo(input).slice(2).toUpperCase(),
  })
}
