import { familyFor } from '@flarekit-dev/contracts'
import {
  type AttestationFamily,
  type AttestationProof,
  decimalString,
  evmAddress,
  hexOfLength,
  invalidRequest,
} from '../family.js'

/**
 * `XRPPaymentNonexistence` — that no XRPL payment matching a description
 * reached an address inside a block-and-timestamp window.
 *
 * This family and `ReferencedPaymentNonexistence` are the documented producers
 * of **`uint64`-max sentinel values**. When no overflow block exists in the
 * searched window, `firstOverflowBlockNumber` and `firstOverflowBlockTimestamp`
 * come back as `18446744073709551615`. Parsed by `JSON.parse` that becomes
 * `18446744073709552000`, and the re-encoded proof no longer matches the
 * attested one: the merkle proof is well-formed, the bytes look fine, and
 * verification simply returns false. `parseJsonWithBigInts` is what prevents it,
 * and `fdc-bigint.test.ts` pins the round trip byte-identical (M3-AC5).
 *
 * Proving a negative needs a bounded question, so the verifier requires at
 * least one of the two discriminators. Asking "did nobody ever pay this
 * address" is not a question the protocol can answer.
 */

export interface XrpPaymentNonexistenceInput {
  readonly minimalBlockNumber: string | number | bigint
  readonly deadlineBlockNumber: string | number | bigint
  readonly deadlineTimestamp: string | number | bigint
  /** The standard address hash of the address that was to be paid. */
  readonly destinationAddressHash: string
  readonly amount: string | number | bigint
  readonly checkFirstMemoData?: boolean
  readonly firstMemoDataHash?: string
  readonly checkDestinationTag?: boolean
  readonly destinationTag?: string | number | bigint
  readonly proofOwner: string
}

export interface XrpPaymentNonexistenceRequestBody {
  readonly minimalBlockNumber: bigint
  readonly deadlineBlockNumber: bigint
  readonly deadlineTimestamp: bigint
  readonly destinationAddressHash: string
  readonly amount: bigint
  readonly checkFirstMemoData: boolean
  readonly firstMemoDataHash: string
  readonly checkDestinationTag: boolean
  readonly destinationTag: bigint
  readonly proofOwner: string
}

export interface XrpPaymentNonexistenceResponseBody {
  readonly minimalBlockTimestamp: bigint
  /** `uint64` max when the window had no overflow block. Never a `number`. */
  readonly firstOverflowBlockNumber: bigint
  readonly firstOverflowBlockTimestamp: bigint
}

export type XrpPaymentNonexistenceProof = AttestationProof<
  XrpPaymentNonexistenceRequestBody,
  XrpPaymentNonexistenceResponseBody
>

const ZERO_HASH = `0x${'0'.repeat(64)}`

export const xrpPaymentNonexistenceFamily: AttestationFamily<
  XrpPaymentNonexistenceInput,
  XrpPaymentNonexistenceRequestBody,
  XrpPaymentNonexistenceResponseBody
> = {
  name: 'XRPPaymentNonexistence',
  row: familyFor('XRPPaymentNonexistence')!,

  validateInput(input) {
    const minimal = BigInt(decimalString(input.minimalBlockNumber, 'minimalBlockNumber'))
    const deadline = BigInt(decimalString(input.deadlineBlockNumber, 'deadlineBlockNumber'))
    decimalString(input.deadlineTimestamp, 'deadlineTimestamp')
    decimalString(input.amount, 'amount')
    hexOfLength(input.destinationAddressHash, 32, 'destinationAddressHash')
    evmAddress(input.proofOwner, 'proofOwner')

    if (deadline < minimal) {
      throw invalidRequest(
        `deadlineBlockNumber (${deadline}) is before minimalBlockNumber (${minimal}); the search window is empty.`,
      )
    }

    if (!input.checkFirstMemoData && !input.checkDestinationTag) {
      throw invalidRequest(
        'Set checkFirstMemoData or checkDestinationTag. A nonexistence proof needs a discriminator: "no payment matching this reference arrived" is provable, "no payment arrived at all" is not the question the protocol answers.',
      )
    }
    if (input.checkFirstMemoData) {
      hexOfLength(input.firstMemoDataHash ?? '', 32, 'firstMemoDataHash')
    }
    if (input.checkDestinationTag && input.destinationTag === undefined) {
      throw invalidRequest('destinationTag is required when checkDestinationTag is set.')
    }
  },

  encodeInput(input) {
    return {
      minimalBlockNumber: decimalString(input.minimalBlockNumber, 'minimalBlockNumber'),
      deadlineBlockNumber: decimalString(input.deadlineBlockNumber, 'deadlineBlockNumber'),
      deadlineTimestamp: decimalString(input.deadlineTimestamp, 'deadlineTimestamp'),
      destinationAddressHash: hexOfLength(
        input.destinationAddressHash,
        32,
        'destinationAddressHash',
      ),
      amount: decimalString(input.amount, 'amount'),
      checkFirstMemoData: input.checkFirstMemoData ?? false,
      // The field is required even when unchecked, and the zero hash is what
      // the verifier canonicalises an unused discriminator to.
      firstMemoDataHash: input.checkFirstMemoData
        ? hexOfLength(input.firstMemoDataHash ?? '', 32, 'firstMemoDataHash')
        : ZERO_HASH,
      checkDestinationTag: input.checkDestinationTag ?? false,
      destinationTag: input.checkDestinationTag
        ? decimalString(input.destinationTag ?? 0, 'destinationTag')
        : '0',
      proofOwner: evmAddress(input.proofOwner, 'proofOwner'),
    }
  },

  proofOwnerOf(input) {
    return input.proofOwner.toLowerCase()
  },

  /**
   * Nothing narrows. Every numeric field is `uint64` or `uint256`, including the
   * two that carry the sentinel — converting any of them to `number` is the
   * corruption this family exists to demonstrate.
   */
  toProofStruct(proof) {
    return { merkleProof: [...proof.merkleProof], data: proof.data }
  },
}
