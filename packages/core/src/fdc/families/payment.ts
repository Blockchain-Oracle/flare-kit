import { familyFor } from '@flare-kit/contracts'
import type { FdcClient } from '../client.js'
import { type AttestationFamily, type AttestationProof, hexOfLength } from '../family.js'

/**
 * `Payment` — the CHAIN-AGNOSTIC payment attestation, and the proof the XRPL-controlled
 * Smart Accounts `MasterAccountController` dispatches instructions from.
 *
 * This is the sibling of `xrp-payment.ts`, and the two are NOT interchangeable. That file
 * records the asymmetry from its own side: *"A `Payment` proof will not verify against the
 * AssetManager."* The corollary is what this family exists for — an `XRPPayment` proof
 * cannot dispatch a Smart Accounts instruction, because the field the dispatcher reads is
 * not in it:
 *
 * | | `XRPPayment` | `Payment` (this file) |
 * |---|---|---|
 * | request body | `{transactionId, proofOwner}` | `{transactionId, inUtxo, utxo}` |
 * | binds a proof owner | yes | **no** |
 * | carries `standardPaymentReference` | **no** | **yes** |
 * | carries the memo / destination tag | yes | no |
 * | consumer | FAssets `executeDirectMinting` | Smart Accounts `executeInstruction` |
 *
 * Because `Payment` binds no proof owner, anyone holding the proof may present it. The
 * controller does not rely on owner binding for authority: it checks that
 * `responseBody.sourceAddressHash` equals `keccak256(bytes(xrplAddress))`, so the XRPL
 * signature over the payment IS the authorisation. That is the whole account-abstraction
 * claim, and it is why this kit can act as its own operator.
 *
 * M3 catalogued this family with `hasBuilder: false`. M13-R2b built the builder and flipped
 * the row.
 */

export interface PaymentInput {
  readonly transactionId: string
  /**
   * UTXO indices. Both are `0` on XRPL and every other account-based chain, but they are
   * not optional: the request body is hashed into the attestation, so omitting them
   * attests a different request than the one intended.
   */
  readonly inUtxo?: bigint
  readonly utxo?: bigint
}

/** The request body as it comes back inside the proof. */
export interface PaymentRequestBody {
  readonly transactionId: string
  readonly inUtxo: string
  readonly utxo: string
}

export interface PaymentResponseBody {
  readonly blockNumber: bigint
  readonly blockTimestamp: bigint
  readonly sourceAddressHash: string
  readonly sourceAddressesRoot: string
  readonly receivingAddressHash: string
  readonly intendedReceivingAddressHash: string
  readonly spentAmount: bigint
  readonly intendedSpentAmount: bigint
  readonly receivedAmount: bigint
  readonly intendedReceivedAmount: bigint
  /** The 32 bytes the Smart Accounts controller decodes the instruction from. */
  readonly standardPaymentReference: string
  readonly oneToOne: boolean
  readonly status: bigint
}

export type PaymentProof = AttestationProof<PaymentRequestBody, PaymentResponseBody>

export type PaymentFdcClient = FdcClient<PaymentInput, PaymentRequestBody, PaymentResponseBody>

/**
 * All the instruction path asks of an FDC client. By the time reconciliation runs the XRP
 * has moved and the request is already on chain, so depending on the whole client would
 * ask a caller for capabilities this path cannot use — the `XrpPaymentProofRetriever`
 * reasoning, unchanged.
 */
export type PaymentProofRetriever = Pick<PaymentFdcClient, 'retrieveProof'>

export const paymentFamily: AttestationFamily<
  PaymentInput,
  PaymentRequestBody,
  PaymentResponseBody
> = {
  name: 'Payment',
  row: familyFor('Payment')!,

  validateInput(input) {
    hexOfLength(input.transactionId, 32, 'transactionId')
  },

  encodeInput(input) {
    return {
      transactionId: hexOfLength(input.transactionId, 32, 'transactionId'),
      // Strings, because the verifier's schema declares both as strings.
      inUtxo: (input.inUtxo ?? 0n).toString(),
      utxo: (input.utxo ?? 0n).toString(),
    }
  },

  /**
   * `undefined`, and that is a claim rather than an omission: this family binds no owner,
   * so anyone may present the proof. The Smart Accounts controller authorises on the XRPL
   * source address instead.
   */
  proofOwnerOf() {
    return undefined
  },

  toProofStruct(proof) {
    return toPaymentProofStruct(proof)
  },
}

/**
 * Named distinctly from `xrp-payment.ts`'s `toProofStruct` on purpose. These two produce
 * structurally different tuples for consumers that reject each other's, and a shared name
 * behind an `export *` is how that distinction gets lost at a call site.
 *
 * The proof as the ABI encoder wants it. Every integer stays a `bigint` except `status`,
 * which is a `uint8`, and the two UTXO indices, which the verifier returns as strings and
 * the encoder needs as numbers it can widen — a blanket conversion in either direction
 * corrupts the proof, so each field is handled on its own.
 */
export function toPaymentProofStruct(proof: PaymentProof) {
  return {
    merkleProof: [...proof.merkleProof],
    data: {
      ...proof.data,
      requestBody: {
        ...proof.data.requestBody,
        inUtxo: BigInt(proof.data.requestBody.inUtxo),
        utxo: BigInt(proof.data.requestBody.utxo),
      },
      responseBody: {
        ...proof.data.responseBody,
        status: Number(proof.data.responseBody.status),
      },
    },
  }
}
