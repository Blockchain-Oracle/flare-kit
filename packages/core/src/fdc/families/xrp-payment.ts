import { familyFor } from '@flare-kit/contracts'
import type { FdcClient } from '../client.js'
import {
  type AttestationFamily,
  type AttestationProof,
  evmAddress,
  hexOfLength,
} from '../family.js'

/**
 * `XRPPayment` — the family FAssets direct minting consumes, and the first
 * instance of the generic client.
 *
 * It is XRPL-specific and replaces the chain-agnostic `Payment` type's
 * `inUtxo`/`utxo` request fields with `proofOwner`, surfacing the source
 * r-address, memo data and destination tag directly. A `Payment` proof will not
 * verify against the AssetManager.
 *
 * Migrated from `packages/core/src/fdc.ts` (M3-R2). The behaviour a caller sees
 * is unchanged; what changed is that the request state machine around it is now
 * shared rather than private to this one type.
 */

export interface XrpPaymentInput {
  readonly transactionId: string
  readonly proofOwner: string
}

/** The request body as it comes back inside the proof. Both fields stay strings. */
export interface XrpPaymentRequestBody {
  readonly transactionId: string
  readonly proofOwner: string
}

export interface XrpPaymentResponseBody {
  readonly blockNumber: bigint
  readonly blockTimestamp: bigint
  readonly sourceAddress: string
  readonly sourceAddressHash: string
  readonly receivingAddressHash: string
  readonly intendedReceivingAddressHash: string
  readonly spentAmount: bigint
  readonly intendedSpentAmount: bigint
  readonly receivedAmount: bigint
  readonly intendedReceivedAmount: bigint
  readonly hasMemoData: boolean
  readonly firstMemoData: string
  readonly hasDestinationTag: boolean
  readonly destinationTag: bigint
  readonly status: bigint
}

export type XrpPaymentProof = AttestationProof<XrpPaymentRequestBody, XrpPaymentResponseBody>

/**
 * The generic client bound to this family — the shape M1's mint path has always
 * held, now spelled as one instantiation of the shared lifecycle rather than as
 * a type of its own.
 */
export type XrpPaymentFdcClient = FdcClient<
  XrpPaymentInput,
  XrpPaymentRequestBody,
  XrpPaymentResponseBody
>

/**
 * All the mint path asks of an FDC client: the proof for a round, if there is
 * one. Reconciliation never prepares or submits — by the time it runs, the XRP
 * has moved and the request is already on chain — so depending on the whole
 * client would be asking a caller for capabilities this path cannot use.
 */
export type XrpPaymentProofRetriever = Pick<XrpPaymentFdcClient, 'retrieveProof'>

export const xrpPaymentFamily: AttestationFamily<
  XrpPaymentInput,
  XrpPaymentRequestBody,
  XrpPaymentResponseBody
> = {
  name: 'XRPPayment',
  row: familyFor('XRPPayment')!,

  validateInput(input) {
    hexOfLength(input.transactionId, 32, 'transactionId')
    evmAddress(input.proofOwner, 'proofOwner')
  },

  encodeInput(input) {
    return {
      transactionId: hexOfLength(input.transactionId, 32, 'transactionId'),
      // The verifier lower-cases this; matching it means the request we sign is
      // byte-identical to the one that gets attested.
      proofOwner: evmAddress(input.proofOwner, 'proofOwner'),
    }
  },

  proofOwnerOf(input) {
    return input.proofOwner.toLowerCase()
  },

  toProofStruct(proof) {
    return toProofStruct(proof)
  },
}

/**
 * The proof as the ABI encoder wants it. Every integer stays a bigint except
 * `status`, which is a `uint8` and encodes from a number.
 *
 * Exported by name because `read-chain-state.ts` has used it since M1 to
 * simulate `executeDirectMinting`, and M3-AC8 requires that path to keep working
 * unchanged.
 */
export function toProofStruct(proof: XrpPaymentProof) {
  return {
    merkleProof: [...proof.merkleProof],
    data: {
      ...proof.data,
      responseBody: { ...proof.data.responseBody, status: Number(proof.data.responseBody.status) },
    },
  }
}
