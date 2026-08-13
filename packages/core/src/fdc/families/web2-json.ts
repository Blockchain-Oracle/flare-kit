import { familyFor } from '@flare-kit/contracts'
import { type AttestationFamily, type AttestationProof, invalidRequest } from '../family.js'

/**
 * `Web2Json` — a public HTTPS JSON endpoint, filtered through jq and encoded to
 * an ABI signature the caller supplies.
 *
 * This is the family where **nondeterminism is expected**, and M3-R10 is about
 * what happens then. Independent data providers each fetch the URL at slightly
 * different moments. If the endpoint returns a timestamp, a rate that moves, a
 * request id or anything else that differs between two fetches seconds apart,
 * the providers hash different bytes and the round reaches no consensus for this
 * request. The data availability layer then returns no proof.
 *
 * That is **unknown**, not failure, and never a negative fact about the
 * endpoint. "No proof" here means the providers did not agree; the URL may be
 * perfectly healthy and returning correct data to everyone who asks. The client
 * surfaces it as `FDC_PROOF_NOT_AVAILABLE` with `recovery: 'wait'` and
 * `valueMoved: 'unknown'`, and the only real remedy is a more deterministic jq
 * filter — which is why `postProcessJq` is a required field a caller must think
 * about rather than an optional convenience.
 */

export interface Web2JsonInput {
  readonly url: string
  readonly httpMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** JSON object literals. `'{}'` when nothing is needed — not the empty string. */
  readonly headers?: string
  readonly queryParams?: string
  readonly body?: string
  /** The jq filter applied before ABI encoding. Determinism is decided here. */
  readonly postProcessJq: string
  /** The struct signature the filtered JSON is encoded to, e.g. `{"components":[…]}`. */
  readonly abiSignature: string
}

export interface Web2JsonRequestBody {
  readonly url: string
  readonly httpMethod: string
  readonly headers: string
  readonly queryParams: string
  readonly body: string
  readonly postProcessJq: string
  readonly abiSignature: string
}

/** Opaque by design: the caller's own ABI signature decides what is inside. */
export interface Web2JsonResponseBody {
  readonly abiEncodedData: string
}

export type Web2JsonProof = AttestationProof<Web2JsonRequestBody, Web2JsonResponseBody>

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

/** `'{}'` rather than `''`: the verifier requires the field, parsed as JSON. */
const EMPTY_OBJECT = '{}'

export const web2JsonFamily: AttestationFamily<
  Web2JsonInput,
  Web2JsonRequestBody,
  Web2JsonResponseBody
> = {
  name: 'Web2Json',
  row: familyFor('Web2Json')!,

  validateInput(input) {
    let parsed: URL
    try {
      parsed = new URL(input.url)
    } catch {
      throw invalidRequest(`url must be an absolute URL; received "${input.url}".`)
    }
    if (parsed.protocol !== 'https:') {
      // Providers will not agree on a value they fetched over a channel any of
      // them could have had tampered with.
      throw invalidRequest(`url must be https; received "${parsed.protocol}//".`)
    }
    if (input.httpMethod && !METHODS.has(input.httpMethod)) {
      throw invalidRequest(
        `httpMethod must be one of ${[...METHODS].join(', ')}; received "${input.httpMethod}".`,
      )
    }
    if (!input.postProcessJq.trim()) {
      throw invalidRequest(
        'postProcessJq is required. It is what narrows a response to the fields every data provider will agree on, and an unfiltered response rarely reaches consensus.',
      )
    }
    if (!input.abiSignature.trim()) {
      throw invalidRequest('abiSignature is required: it decides how the filtered JSON encodes.')
    }
    for (const [field, value] of [
      ['headers', input.headers],
      ['queryParams', input.queryParams],
      ['body', input.body],
    ] as const) {
      if (value === undefined) continue
      try {
        JSON.parse(value)
      } catch {
        throw invalidRequest(`${field} must be a JSON object literal, or "{}" when unused.`)
      }
    }
  },

  encodeInput(input) {
    return {
      url: input.url,
      httpMethod: input.httpMethod ?? 'GET',
      headers: input.headers ?? EMPTY_OBJECT,
      queryParams: input.queryParams ?? EMPTY_OBJECT,
      body: input.body ?? EMPTY_OBJECT,
      postProcessJq: input.postProcessJq,
      abiSignature: input.abiSignature,
    }
  },

  proofOwnerOf() {
    return undefined
  },

  /** Every field is a string or bytes; nothing to narrow. */
  toProofStruct(proof) {
    return { merkleProof: [...proof.merkleProof], data: proof.data }
  },
}
