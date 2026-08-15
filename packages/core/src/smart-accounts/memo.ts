import { FlareKitError } from '../errors.js'

/**
 * The direct-minting MEMO codec — the seven opcodes `MemoInstructionsFacet` dispatches
 * (M14-R2).
 *
 * This is the other half of the smart-accounts family. M13's `payment-reference.ts` encodes a
 * 32-byte reference naming one of eleven built-in instructions; this encodes a memo carrying
 * an arbitrary user operation, or one of five recovery commands, into the XRPL payment that
 * mints the FAsset.
 *
 * TWO PROPERTIES GOVERN EVERY LINE HERE, and both are the contract's, not ours:
 *
 * 1. **Lengths are EXACT.** Each opcode is `require(_memoData.length == N,
 *    InvalidMemoData())` — `library/MemoInstructions.sol:87, 101, 120, 135, 148`. Not a
 *    minimum, not a maximum. A memo one byte off is refused by the controller *after* the
 *    XRPL payment has settled, and the payment is not recoverable. So this module emits
 *    exact lengths and refuses anything else on the way back in.
 * 2. **Raw widths, never ABI padding.** `0xD0` carries a BARE 20-byte address —
 *    `address(bytes20(_memoData[10:30]))` at `:121`. ABI-encoding it to 32 bytes makes a
 *    42-byte memo that reverts. The vendored reference encoder builds every memo with
 *    `concatHex` of raw-width pieces for exactly this reason.
 *
 * The 10-byte header is shared by all seven: `[opcode:u8][walletId:u8][executorFeeUBA:u64]`,
 * big-endian. `walletId` is a Flare Foundation–assigned identifier that **no contract reads**
 * — `_memoData[1]` appears in no vendored source — so it is a client convention carried at 0.
 * The fee is real: it is paid to whoever relays, out of the minted FAsset.
 */

/** `[opcode][walletId][executorFeeUBA]` — the prefix on every memo instruction. */
export const MEMO_HEADER_BYTES = 10

/**
 * The XRP Ledger's memo ceiling in bytes. A plan refuses before this rather than letting the
 * ledger truncate — nothing in the Solidity checks a size, so an over-long memo is a client
 * problem that becomes a spent payment.
 */
export const MEMO_MAX_BYTES = 1024

export const MEMO_OPCODE = {
  /** The user operation, encoded inline. */
  userOperation: 0xff,
  /** The user operation, committed to by hash; an executor supplies the bytes. */
  userOperationWithData: 0xfe,
  /** Skip a stuck memo so its payment can mint without dispatching the instruction. */
  ignoreMemo: 0xe0,
  /** Fast-forward the account nonce past an abandoned slot. */
  setNonce: 0xe1,
  /** Re-price a stuck payment nobody will relay. */
  replacementFee: 0xe2,
  /** Pin an executor. */
  setExecutor: 0xd0,
  /** Unpin it. */
  removeExecutor: 0xd1,
} as const

export type MemoOpcode = (typeof MEMO_OPCODE)[keyof typeof MEMO_OPCODE]

/** Exact byte length per opcode. `0xFF` alone is variable — it carries an encoded struct. */
const EXACT_LENGTH: Partial<Record<number, number>> = {
  [MEMO_OPCODE.userOperationWithData]: 42,
  [MEMO_OPCODE.ignoreMemo]: 42,
  [MEMO_OPCODE.setNonce]: 42,
  [MEMO_OPCODE.replacementFee]: 50,
  [MEMO_OPCODE.setExecutor]: 30,
  [MEMO_OPCODE.removeExecutor]: MEMO_HEADER_BYTES,
}

const invalid = (message: string): never => {
  throw new FlareKitError('INVALID_MEMO', {
    domain: 'input',
    message,
    recovery: 'terminal',
    valueMoved: 'no',
  })
}

const strip = (hex: string): string => (hex.startsWith('0x') ? hex.slice(2) : hex)
const byteLength = (hex: string): number => strip(hex).length / 2

/** Left-padded hex of a bigint at an exact byte width — the reference encoder's `toHex`. */
function fixedHex(value: bigint, bytes: number, what: string): string {
  if (value < 0n) invalid(`${what} cannot be negative.`)
  const digits = value.toString(16)
  if (digits.length > bytes * 2) {
    invalid(`${what} does not fit in ${bytes} bytes; the field would silently truncate.`)
  }
  return digits.padStart(bytes * 2, '0')
}

export interface MemoHeader {
  /** Flare Foundation–assigned. Read by no contract; sent as 0 unless a caller has one. */
  readonly walletId?: number
  /**
   * Paid to whoever relays the mint, out of the minted FAsset, in UBA.
   *
   * The controller's only check is `_amount >= _executorFee`, so a memo may legally assign
   * the ENTIRE mint to the relayer. The plan clamps it; the codec only refuses what cannot
   * fit the field.
   */
  readonly executorFeeUBA?: bigint
}

function header(opcode: MemoOpcode, input: MemoHeader): string {
  const walletId = input.walletId ?? 0
  if (!Number.isInteger(walletId) || walletId < 0 || walletId > 0xff) {
    invalid('The wallet id is a single byte.')
  }
  return (
    fixedHex(BigInt(opcode), 1, 'opcode') +
    fixedHex(BigInt(walletId), 1, 'wallet id') +
    fixedHex(input.executorFeeUBA ?? 0n, 8, 'The executor fee')
  )
}

function bytes32(value: string, what: string): string {
  const body = strip(value).toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(body)) invalid(`${what} must be 32 bytes.`)
  return body
}

function address20(value: string): string {
  const body = strip(value).toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(body)) invalid('The executor must be a 20-byte address.')
  if (/^0{40}$/.test(body)) {
    // The contract refuses it (`AddressZero` at MemoInstructions.sol:122) and it would cost
    // a whole XRPL payment to find that out.
    invalid('The executor cannot be the zero address; the controller refuses it.')
  }
  return body
}

/** `0xE0` — skip the memo on a stuck transaction so its payment can still mint. 42 bytes. */
export function encodeIgnoreMemo(
  input: MemoHeader & { readonly targetTransactionId: string },
): `0x${string}` {
  return `0x${header(MEMO_OPCODE.ignoreMemo, input)}${bytes32(input.targetTransactionId, 'The target transaction id')}`
}

/** `0xE1` — fast-forward the nonce past an abandoned slot. 42 bytes. */
export function encodeSetNonce(input: MemoHeader & { readonly newNonce: bigint }): `0x${string}` {
  return `0x${header(MEMO_OPCODE.setNonce, input)}${fixedHex(input.newNonce, 32, 'The nonce')}`
}

/** `0xE2` — re-price a stuck payment. 50 bytes: it carries an id AND a fee. */
export function encodeReplacementFee(
  input: MemoHeader & { readonly targetTransactionId: string; readonly newFee: bigint },
): `0x${string}` {
  // The controller stores `newFee + 1` so that 0 can mean "unset" (MemoInstructions.sol:152),
  // and that addition is checked, so the true ceiling is one below the type's.
  if (input.newFee > 2n ** 64n - 2n) {
    invalid('The replacement fee must be at most 2^64 - 2; the controller stores it plus one.')
  }
  return `0x${header(MEMO_OPCODE.replacementFee, input)}${bytes32(input.targetTransactionId, 'The target transaction id')}${fixedHex(input.newFee, 8, 'The replacement fee')}`
}

/** `0xD0` — pin an executor. 30 bytes, with the address UNPADDED. */
export function encodeSetExecutor(input: MemoHeader & { readonly executor: string }): `0x${string}` {
  return `0x${header(MEMO_OPCODE.setExecutor, input)}${address20(input.executor)}`
}

/** `0xD1` — unpin. 10 bytes: the header and nothing else. */
export function encodeRemoveExecutor(input: MemoHeader): `0x${string}` {
  return `0x${header(MEMO_OPCODE.removeExecutor, input)}`
}

export type DecodedMemo = {
  readonly opcode: MemoOpcode
  readonly walletId: number
  readonly executorFeeUBA: bigint
  readonly targetTransactionId?: `0x${string}`
  readonly newNonce?: bigint
  readonly newFee?: bigint
  readonly executor?: `0x${string}`
  /** For `0xFF`, the ABI-encoded `PackedUserOperation`; for `0xFE`, the 32-byte commitment. */
  readonly payload?: `0x${string}`
}

/**
 * Read a memo back. Refuses any length the controller would refuse, so a mistake surfaces
 * here rather than after a payment has settled.
 */
export function decodeMemo(memo: string): DecodedMemo {
  const body = strip(memo).toLowerCase()
  if (!/^[0-9a-f]*$/.test(body) || body.length % 2 !== 0) invalid('A memo must be whole hex bytes.')
  if (byteLength(memo) < MEMO_HEADER_BYTES) {
    invalid(`A memo instruction is at least ${MEMO_HEADER_BYTES} bytes.`)
  }

  const opcode = Number.parseInt(body.slice(0, 2), 16)
  const known = Object.values(MEMO_OPCODE).some((value) => value === opcode)
  if (!known) {
    // The controller reverts `InvalidInstructionId` here. Guessing a layout for an unknown
    // opcode would be inventing protocol.
    invalid(`0x${body.slice(0, 2)} is not a memo opcode this kit knows.`)
  }

  const exact = EXACT_LENGTH[opcode]
  if (exact !== undefined && byteLength(memo) !== exact) {
    invalid(
      `A 0x${body.slice(0, 2)} memo must be exactly ${exact} bytes; this one is ${byteLength(memo)}.`,
    )
  }

  const base = {
    opcode: opcode as MemoOpcode,
    walletId: Number.parseInt(body.slice(2, 4), 16),
    executorFeeUBA: BigInt(`0x${body.slice(4, 20)}`),
  }

  switch (opcode) {
    case MEMO_OPCODE.ignoreMemo:
      return { ...base, targetTransactionId: `0x${body.slice(20, 84)}` }
    case MEMO_OPCODE.setNonce:
      return { ...base, newNonce: BigInt(`0x${body.slice(20, 84)}`) }
    case MEMO_OPCODE.replacementFee:
      return {
        ...base,
        targetTransactionId: `0x${body.slice(20, 84)}`,
        newFee: BigInt(`0x${body.slice(84, 100)}`),
      }
    case MEMO_OPCODE.setExecutor:
      return { ...base, executor: `0x${body.slice(20, 60)}` }
    case MEMO_OPCODE.removeExecutor:
      return base
    default:
      // `0xFF` variable, `0xFE` a 32-byte commitment — both carried as the raw tail.
      return { ...base, payload: `0x${body.slice(20)}` }
  }
}
