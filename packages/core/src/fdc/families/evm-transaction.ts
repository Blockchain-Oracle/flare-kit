import { familyFor } from '@flarekit-dev/contracts'
import {
  type AttestationFamily,
  type AttestationProof,
  decimalString,
  hexOfLength,
  invalidRequest,
} from '../family.js'

/**
 * `EVMTransaction` — an EVM transaction's sender, value, optional calldata and
 * event logs.
 *
 * **The verifier group is `flr`, not `eth`, for Coston2.** Flare's own guides
 * instruct `/verifier/eth/` at
 * `developer-hub/docs/fdc/guides/hardhat/02-evm-transaction.mdx:187` and
 * `guides/foundry/02-evm-transaction.mdx:308`. That is wrong for this network: a
 * real Coston2 transaction returns `VALID` on `flr` and `INVALID` on both `eth`
 * and `sgb`, and there is no `coston2` sourceId at all. The group comes from the
 * family table's source entry, and `fdc-families.test.ts` fails if Coston2 ever
 * addresses `eth`.
 *
 * The `eth` verifier also returns **500** where `flr` and `sgb` return a clean
 * `200 {"status":"INVALID"}` for a nonexistent transaction — which is why the
 * client treats 5xx as a retryable unknown rather than a negative fact.
 */

export interface EvmTransactionInput {
  readonly transactionHash: string
  /** How deep the block must be before the requestor considers it confirmed. */
  readonly requiredConfirmations: string | number | bigint
  /** Whether to include the transaction's calldata in the response. */
  readonly provideInput: boolean
  readonly listEvents: boolean
  /**
   * Which log indices to relay, sorted. At most fifty. Empty with `listEvents`
   * true means all of them, capped at fifty; empty with `listEvents` false is
   * the only combination the verifier accepts when events are not wanted.
   */
  readonly logIndices?: readonly (string | number | bigint)[]
}

export interface EvmTransactionRequestBody {
  readonly transactionHash: string
  readonly requiredConfirmations: bigint
  readonly provideInput: boolean
  readonly listEvents: boolean
  readonly logIndices: readonly bigint[]
}

export interface EvmTransactionEvent {
  readonly logIndex: bigint
  readonly emitterAddress: string
  readonly topics: readonly string[]
  readonly data: string
  readonly removed: boolean
}

export interface EvmTransactionResponseBody {
  readonly blockNumber: bigint
  readonly timestamp: bigint
  readonly sourceAddress: string
  readonly isDeployment: boolean
  readonly receivingAddress: string
  readonly value: bigint
  readonly input: string
  readonly status: bigint
  readonly events: readonly EvmTransactionEvent[]
}

export type EvmTransactionProof = AttestationProof<
  EvmTransactionRequestBody,
  EvmTransactionResponseBody
>

/** The protocol's own cap. Asking for more is rejected, not silently truncated. */
const MAX_LOG_INDICES = 50

export const evmTransactionFamily: AttestationFamily<
  EvmTransactionInput,
  EvmTransactionRequestBody,
  EvmTransactionResponseBody
> = {
  name: 'EVMTransaction',
  row: familyFor('EVMTransaction')!,

  validateInput(input) {
    hexOfLength(input.transactionHash, 32, 'transactionHash')
    decimalString(input.requiredConfirmations, 'requiredConfirmations')

    const indices = input.logIndices ?? []
    if (!input.listEvents && indices.length > 0) {
      throw invalidRequest(
        'logIndices must be empty when listEvents is false. The verifier rejects the request rather than ignoring the indices.',
      )
    }
    if (indices.length > MAX_LOG_INDICES) {
      throw invalidRequest(
        `At most ${MAX_LOG_INDICES} log indices may be requested; received ${indices.length}.`,
      )
    }
  },

  encodeInput(input) {
    return {
      transactionHash: hexOfLength(input.transactionHash, 32, 'transactionHash'),
      requiredConfirmations: decimalString(input.requiredConfirmations, 'requiredConfirmations'),
      provideInput: input.provideInput,
      listEvents: input.listEvents,
      logIndices: (input.logIndices ?? []).map((index, position) =>
        decimalString(index, `logIndices[${position}]`),
      ),
    }
  },

  /** This family binds no proof owner: anyone may present the proof. */
  proofOwnerOf() {
    return undefined
  },

  toProofStruct(proof) {
    const body = proof.data.responseBody
    return {
      merkleProof: [...proof.merkleProof],
      data: {
        ...proof.data,
        requestBody: {
          ...proof.data.requestBody,
          // uint16 and uint32[] on chain; both narrow safely and neither can
          // overflow a double.
          requiredConfirmations: Number(proof.data.requestBody.requiredConfirmations),
          logIndices: proof.data.requestBody.logIndices.map(Number),
        },
        responseBody: {
          ...body,
          // `status` is uint8; `value` is uint256 and must stay a bigint.
          status: Number(body.status),
          events: body.events.map((event) => ({ ...event, logIndex: Number(event.logIndex) })),
        },
      },
    }
  },
}
