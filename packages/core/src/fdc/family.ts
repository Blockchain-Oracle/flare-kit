import type { AttestationFamilyRow } from '@flare-kit/contracts'
import { FlareKitError } from '../errors.js'

/**
 * What a family must know so that one state machine can serve all of them.
 *
 * M3-R1 allows exactly one implementation of prepare → submit → round → proof →
 * verify in this repository. Everything that differs between `XRPPayment` and
 * `Web2Json` therefore has to be expressible here, or the client would need a
 * branch and there would quietly be two state machines again.
 *
 * Three type parameters, because two would be a lie. The body a caller supplies
 * is not the body that comes back inside the proof: a request is written with
 * decimal strings for `uint64` fields, and the attested request body carries
 * them as `bigint`. Collapsing `TInput` and `TRequest` would make every family
 * module cast at exactly the boundary where precision is lost.
 */
export interface AttestationFamily<TInput, TRequest, TResponse> {
  /** The attestation type name, which is also the verifier path segment. */
  readonly name: string
  /** The row from `@flare-kit/contracts` this family is an implementation of. */
  readonly row: AttestationFamilyRow

  /**
   * Reject a body that cannot produce a proof, before any fee is read or any
   * transaction is sent. Throws `FlareKitError`; never returns false.
   */
  validateInput(input: TInput): void

  /** The JSON `requestBody` the verifier's `prepareRequest` expects. */
  encodeInput(input: TInput): Record<string, unknown>

  /**
   * The proof as the ABI encoder wants it. This is where `uint8` fields narrow
   * to `number` and everything else stays `bigint` — per-field, because a blanket
   * conversion in either direction corrupts the proof.
   */
  toProofStruct(proof: AttestationProof<TRequest, TResponse>): unknown

  /**
   * The EVM address authorised to use the proof, when this family binds one.
   * `undefined` means the family binds no owner and anyone may present it —
   * which is a different claim from "we do not know who owns it".
   */
  proofOwnerOf(input: TInput): string | undefined
}

/**
 * The envelope every family shares. Only `requestBody` and `responseBody`
 * differ, which is why the client can be generic at all.
 */
export interface AttestationProof<TRequest, TResponse> {
  readonly merkleProof: readonly string[]
  readonly data: {
    readonly attestationType: string
    readonly sourceId: string
    readonly votingRound: bigint
    /**
     * The oldest timestamp the attestation relied on. Common to every family,
     * and the two nonexistence families are the documented producers of the
     * `uint64`-max sentinel — so the corruption hazard is not XRP-specific.
     */
    readonly lowestUsedTimestamp: bigint
    readonly requestBody: TRequest
    readonly responseBody: TResponse
  }
}

export function invalidRequest(message: string, evidence?: Record<string, string>): FlareKitError {
  return new FlareKitError('FDC_REQUEST_INVALID', {
    domain: 'input',
    message,
    recovery: 'requires_new_value',
    valueMoved: 'no',
    ...(evidence ? { evidence } : {}),
  })
}

/**
 * A decimal integer string, as every `uint64` and `uint256` request field is
 * written on the wire. Accepts a `bigint` or `number` too, because a caller
 * holding a block height as a `bigint` should not have to stringify it and a
 * round trip through `String(1e21)` would produce `"1e+21"`.
 */
export function decimalString(
  value: string | number | bigint,
  field: string,
): string {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw invalidRequest(
        `${field} must be a whole number that JavaScript can represent exactly. Pass a bigint or a decimal string for values above 2^53.`,
      )
    }
    return value.toString()
  }
  if (!/^\d+$/.test(value)) {
    throw invalidRequest(`${field} must be a decimal integer string; received "${value}".`)
  }
  return value
}

/** A 0x-prefixed hex string of exactly `bytes` bytes. */
export function hexOfLength(value: string, bytes: number, field: string): `0x${string}` {
  const normalised = value.startsWith('0x') ? value : `0x${value}`
  if (!new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(normalised)) {
    throw invalidRequest(`${field} must be ${bytes} bytes of hex; received "${value}".`)
  }
  return normalised as `0x${string}`
}

/** A 20-byte EVM address, lower-cased to match what the verifier canonicalises to. */
export function evmAddress(value: string, field: string): `0x${string}` {
  return hexOfLength(value, 20, field).toLowerCase() as `0x${string}`
}
