import {
  type BuiltInInstruction,
  type ValueDenomination,
  builtInInstruction,
} from '@flarekit-dev/contracts'
import { FlareKitError } from '../errors.js'

/**
 * The 32-byte XRPL payment reference the Smart Accounts controller decodes an instruction
 * from — encoded and decoded exactly as `PaymentReferenceParser.sol` reads it.
 *
 * The layout looks like a flat struct and is not one. The tail windows OVERLAP:
 *
 * ```
 * byte  0        1        2 ────────── 11   12 ── 13   14 ── 15   16 ───────── 31
 *       id       walletId uint80 value      uint16     uint16
 *                                           agentVault vaultId
 *                         └──────────────── 20-byte recipient address ───────────┘
 * ```
 *
 * Bytes 12–13 are an agent vault id for `collateralReservation` and the first two bytes of
 * a recipient address for `transfer`. A decoder that reads every field unconditionally
 * therefore returns a plausible agent vault id for a transfer — a number that means nothing,
 * rendered next to a real one. Decoding dispatches on the command instead, and the parts an
 * instruction does not carry stay `undefined`.
 *
 * The 80-bit value field means five different things across the eleven instructions (lots,
 * drops, shares, a Firelight period, an Upshift `yyyymmdd` date), so it is carried with its
 * denomination and never as a bare amount.
 *
 * Source: `sources/flare-foundation/flare-smart-accounts/contracts/smartAccounts/library/
 * PaymentReferenceParser.sol` — the shifts, and the non-zero requirements it reverts on.
 */

const REFERENCE_BYTES = 32
const VALUE_BITS = 80n
const VALUE_SHIFT = 160n
const AGENT_VAULT_SHIFT = 144n
const VAULT_SHIFT = 128n
const UINT16_MASK = (1n << 16n) - 1n
const VALUE_MASK = (1n << VALUE_BITS) - 1n
const ADDRESS_MASK = (1n << 160n) - 1n

/** The parts of a reference, with only the fields its command actually carries. */
export interface PaymentReferenceParts {
  /** The full first byte: high nibble instruction type, low nibble command. */
  readonly instructionId: number
  /** `undefined` where the kit does not recognise the id — a real answer, not a failure. */
  readonly instruction: BuiltInInstruction | undefined
  /** Byte 1. `0` unless the Flare Foundation assigned the wallet provider an identifier. */
  readonly walletId: number
  readonly value: bigint
  /** What `value` counts. `undefined` only when the instruction itself is unrecognised. */
  readonly denomination: ValueDenomination | undefined
  /** Bytes 12–13, only for `agentVault` / `agentVaultAndVault` commands. */
  readonly agentVaultId?: number
  /** Bytes 14–15, only for `vault` / `agentVaultAndVault` commands. */
  readonly vaultId?: number
  /** Bytes 12–31, only for the `recipient` command (`transfer`). */
  readonly recipient?: `0x${string}`
}

export interface EncodePaymentReferenceInput {
  readonly instructionId: number
  readonly value: bigint
  readonly walletId?: number
  readonly agentVaultId?: number
  readonly vaultId?: number
  readonly recipient?: string
}

function reject(message: string, evidence?: Readonly<Record<string, string>>): never {
  throw new FlareKitError('INVALID_PAYMENT_REFERENCE', {
    domain: 'input',
    message,
    recovery: 'terminal',
    // Encoding happens before anything is signed or sent.
    valueMoved: 'no',
    evidence,
  })
}

function requireUint16(label: string, id: number | undefined): bigint {
  // The parser reverts on 0 for both id fields, so a 0 here would produce a reference that
  // can never execute — and the XRP would already be gone by the time it reverted.
  if (id === undefined) reject(`This instruction needs ${label}, and none was supplied.`)
  if (!Number.isInteger(id) || id <= 0 || BigInt(id) > UINT16_MASK) {
    reject(`${label} must be a whole number from 1 to 65535, received ${id}.`)
  }
  return BigInt(id)
}

function requireAddress(recipient: string | undefined): bigint {
  if (recipient === undefined) reject('A transfer needs a recipient address, and none was supplied.')
  if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    reject(`A recipient must be a 20-byte EVM address, received ${recipient}.`)
  }
  const packed = BigInt(recipient)
  // `PaymentReferenceParser.getAddress` reverts on the zero address.
  if (packed === 0n) reject('A transfer to the zero address is refused by the controller.')
  return packed
}

/** The 32-byte reference for an instruction, as the XRPL memo's `MemoData`. */
export function encodePaymentReference(input: EncodePaymentReferenceInput): `0x${string}` {
  const instruction = builtInInstruction(input.instructionId)
  if (!instruction) {
    reject(
      `Instruction 0x${input.instructionId.toString(16).padStart(2, '0')} is not one the kit can build. ` +
        'Composing a reference the controller may not dispatch would risk an XRPL payment for nothing.',
    )
  }

  const walletId = input.walletId ?? 0
  if (!Number.isInteger(walletId) || walletId < 0 || walletId > 255) {
    reject(`The wallet identifier must be a byte from 0 to 255, received ${walletId}.`)
  }
  // `getValue` reverts on 0, and the field is 80 bits wide.
  if (input.value <= 0n) reject('An instruction value must be greater than zero.')
  if (input.value > VALUE_MASK) {
    reject(`An instruction value must fit in 80 bits, received ${input.value}.`)
  }

  let packed =
    (BigInt(instruction.id) << 248n) | (BigInt(walletId) << 240n) | (input.value << VALUE_SHIFT)

  switch (instruction.tail) {
    case 'agentVault':
      packed |= requireUint16('an agent vault id', input.agentVaultId) << AGENT_VAULT_SHIFT
      break
    case 'agentVaultAndVault':
      packed |= requireUint16('an agent vault id', input.agentVaultId) << AGENT_VAULT_SHIFT
      packed |= requireUint16('a vault id', input.vaultId) << VAULT_SHIFT
      break
    case 'vault':
      packed |= requireUint16('a vault id', input.vaultId) << VAULT_SHIFT
      break
    case 'recipient':
      packed |= requireAddress(input.recipient)
      break
    case 'none':
      break
  }

  return `0x${packed.toString(16).padStart(REFERENCE_BYTES * 2, '0')}`
}

/**
 * Decode a reference read back off the chain — from `standardPaymentReference` in a proof,
 * or from an `InstructionExecuted` topic.
 *
 * An id the kit does not recognise decodes to `instruction: undefined` with the value still
 * read, rather than throwing: the deployment may dispatch instructions added after this
 * table was written, and a catalogue that hid them would misrepresent the account's history.
 */
export function decodePaymentReference(reference: string): PaymentReferenceParts {
  if (!/^0x[0-9a-fA-F]{64}$/.test(reference)) {
    reject(`A payment reference must be 32 bytes, received ${reference}.`)
  }
  const packed = BigInt(reference)
  const instructionId = Number(packed >> 248n)
  const instruction = builtInInstruction(instructionId)

  const parts: {
    -readonly [K in keyof PaymentReferenceParts]: PaymentReferenceParts[K]
  } = {
    instructionId,
    instruction,
    walletId: Number((packed >> 240n) & 0xffn),
    value: (packed >> VALUE_SHIFT) & VALUE_MASK,
    denomination: instruction?.denomination,
  }

  // Only the windows this command actually uses. Reading them all would surface a
  // meaningless agent vault id for every transfer, because the two fields overlap.
  switch (instruction?.tail) {
    case 'agentVault':
      parts.agentVaultId = Number((packed >> AGENT_VAULT_SHIFT) & UINT16_MASK)
      break
    case 'agentVaultAndVault':
      parts.agentVaultId = Number((packed >> AGENT_VAULT_SHIFT) & UINT16_MASK)
      parts.vaultId = Number((packed >> VAULT_SHIFT) & UINT16_MASK)
      break
    case 'vault':
      parts.vaultId = Number((packed >> VAULT_SHIFT) & UINT16_MASK)
      break
    case 'recipient':
      parts.recipient = `0x${(packed & ADDRESS_MASK).toString(16).padStart(40, '0')}`
      break
    default:
      // `none`, or an unrecognised instruction: no tail is claimed.
      break
  }

  return parts
}
