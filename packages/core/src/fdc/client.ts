import {
  type FamilySource,
  type FdcServices,
  VERIFY_FUNCTIONS,
  attestationName,
  fdcVerificationAbi,
  prepareRequestUrl,
  proofByRequestRoundUrl,
} from '@flarekit-dev/contracts'
import { keccak256 } from 'viem'
import { FlareKitError } from '../errors.js'
import { parseJsonWithBigInts } from '../json.js'
import type { AttestationFamily, AttestationProof } from './family.js'

/**
 * The Flare Data Connector client: one request state machine, generic over the
 * family.
 *
 * Submitting on chain and waiting for the round are the caller's job, because
 * both need a wallet and a public client this package deliberately does not
 * own — `round.ts` and `fee.ts` supply the pieces that do touch the chain.
 * What lives here is everything that must be exactly right about the bytes.
 *
 * M3-R1: this is the only implementation of the lifecycle in the repository. A
 * domain that needs FDC calls it rather than restating it, which is what let
 * FAssets' direct mint become the first *instance* of the client rather than
 * its owner.
 */

export interface CreateFdcClientInput<TInput, TRequest, TResponse> {
  services: FdcServices
  family: AttestationFamily<TInput, TRequest, TResponse>
  /** Which of the family's sources on this network to attest against. */
  source: FamilySource
  /** Injected so tests need no network and hosts can supply their own. */
  fetch?: typeof globalThis.fetch
  apiKey?: string
  /** Overrides the registry's verifier host, for a self-hosted verifier (M3-R9). */
  verifierBaseUrl?: string
  /** Overrides the registry's data-availability host (M3-R9). */
  dataAvailabilityBaseUrl?: string
}

export interface PreparedRequest {
  /** The bytes to submit to `FdcHub.requestAttestation`, and to price. */
  readonly abiEncodedRequest: string
  /**
   * `keccak256` of those exact bytes. M3-R7 asks for the request hash beside the
   * request: 960 bytes of hex is not something a person can compare across two
   * screens, and the hash is what makes "these are the bytes I approved"
   * checkable at a glance.
   */
  readonly requestHash: `0x${string}`
  readonly attestationType: string
  readonly sourceId: string
  /** Which verifier produced it, so the timeline can name the endpoint (M3-R9). */
  readonly verifier: string
}

export interface FdcClient<TInput, TRequest, TResponse> {
  readonly family: AttestationFamily<TInput, TRequest, TResponse>
  readonly source: FamilySource
  /** Where requests go and proofs come from, so a surface can render them. */
  readonly verifierBaseUrl: string
  readonly dataAvailabilityBaseUrl: string
  prepareRequest(input: TInput): Promise<PreparedRequest>
  retrieveProof(input: {
    votingRoundId: bigint
    requestBytes: string
  }): Promise<AttestationProof<TRequest, TResponse>>
  /**
   * `FdcVerification` on chain, returning the real boolean. For the three
   * families with no deployed consumer this is the whole of the on-chain story,
   * and the surfaces say so rather than implying consumption follows.
   */
  verifyProof(
    proof: AttestationProof<TRequest, TResponse>,
    reader: ProofVerificationReader,
    fdcVerificationAddress: `0x${string}`,
  ): Promise<boolean>
}

/** viem's `PublicClient.readContract`, structurally. */
export interface ProofVerificationReader {
  readContract(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
  }): Promise<unknown>
}

function transportError(cause: unknown): FlareKitError {
  return new FlareKitError('FDC_UNREACHABLE', {
    domain: 'network',
    message: 'The FDC service did not respond.',
    recovery: 'safe_to_retry',
    valueMoved: 'no',
    cause,
  })
}

export function createFdcClient<TInput, TRequest, TResponse>(
  input: CreateFdcClientInput<TInput, TRequest, TResponse>,
): FdcClient<TInput, TRequest, TResponse> {
  const doFetch = input.fetch ?? globalThis.fetch
  const apiKey = input.apiKey ?? input.services.publicApiKey
  const verifierBaseUrl = input.verifierBaseUrl ?? input.services.verifierBaseUrl
  const dataAvailabilityBaseUrl =
    input.dataAvailabilityBaseUrl ?? input.services.dataAvailabilityBaseUrl
  const headers = {
    [input.services.apiKeyHeader]: apiKey,
    'Content-Type': 'application/json',
  }
  const attestationType = attestationName(input.family.name)
  const sourceId = attestationName(input.source.sourceId)

  async function post(url: string, body: string): Promise<{ status: number; text: string }> {
    let response: Response
    try {
      response = await doFetch(url, { method: 'POST', headers, body })
    } catch (cause) {
      throw transportError(cause)
    }
    return { status: response.status, text: await response.text() }
  }

  return {
    family: input.family,
    source: input.source,
    verifierBaseUrl,
    dataAvailabilityBaseUrl,

    async prepareRequest(request) {
      input.family.validateInput(request)

      const url = prepareRequestUrl(verifierBaseUrl, input.source.group, input.family.name)
      const { status, text } = await post(
        url,
        JSON.stringify({
          attestationType,
          sourceId,
          requestBody: input.family.encodeInput(request),
        }),
      )
      const payload = safeParse(text) as { status?: string; abiEncodedRequest?: string }

      // A 5xx is a retryable unknown, never a negative fact about the data
      // being attested (M3-R10). The `eth` verifier returns 500 where `flr` and
      // `sgb` return a clean 200 {"status":"INVALID"} for the same nonexistent
      // transaction, so the distinction is not theoretical.
      if (status >= 500) {
        throw new FlareKitError('FDC_VERIFIER_UNAVAILABLE', {
          domain: 'provider',
          message: `The ${input.source.group} verifier returned ${status}. This says nothing about whether the data is valid — the request was not answered.`,
          recovery: 'safe_to_retry',
          valueMoved: 'unknown',
          evidence: { verifier: url, status: String(status) },
        })
      }

      if (status !== 200 || payload?.status !== 'VALID' || !payload.abiEncodedRequest) {
        // For XRPPayment this most often means the XRPL ledger has not yet
        // reached the three confirmations the verifier requires. That is "not
        // yet", not "failed", and for a mint the XRP has already left — so the
        // outcome is unknown until proven.
        throw new FlareKitError('FDC_REQUEST_NOT_PREPARED', {
          domain: 'provider',
          message: `The verifier did not accept the ${input.family.name} request (status ${payload?.status ?? status}). If the underlying transaction is recent, the chain may not yet have the confirmations the verifier requires.`,
          recovery: 'wait',
          valueMoved: 'unknown',
          evidence: { verifier: url, status: payload?.status ?? String(status) },
        })
      }
      return {
        abiEncodedRequest: payload.abiEncodedRequest,
        requestHash: keccak256(payload.abiEncodedRequest as `0x${string}`),
        attestationType,
        sourceId,
        verifier: url,
      }
    },

    async retrieveProof({ votingRoundId, requestBytes }) {
      const { status, text } = await post(
        proofByRequestRoundUrl(dataAvailabilityBaseUrl),
        JSON.stringify({ votingRoundId: Number(votingRoundId), requestBytes }),
      )

      if (status !== 200) {
        throw new FlareKitError('FDC_PROOF_NOT_AVAILABLE', {
          domain: 'provider',
          message: `No proof yet for voting round ${votingRoundId}. The round may not be finalized, or consensus may not have been reached on this request.`,
          recovery: 'wait',
          valueMoved: 'unknown',
          evidence: { votingRoundId: votingRoundId.toString(), status: String(status) },
        })
      }

      // Not JSON.parse: the proof carries uint64 values that would be silently
      // rounded, producing a different proof from the one that was attested.
      const payload = parseJsonWithBigInts(text) as {
        response?: AttestationProof<TRequest, TResponse>['data']
        proof?: readonly string[]
      }

      if (!payload?.response || !payload.proof) {
        throw new FlareKitError('FDC_PROOF_NOT_AVAILABLE', {
          domain: 'provider',
          message: `The data availability layer returned no proof for round ${votingRoundId}. A round that finalized without this request reaching consensus answers exactly this way.`,
          recovery: 'wait',
          valueMoved: 'unknown',
          evidence: { votingRoundId: votingRoundId.toString() },
        })
      }
      if (payload.response.attestationType !== attestationType) {
        throw new FlareKitError('FDC_PROOF_MISMATCH', {
          domain: 'protocol',
          message: `Expected a ${input.family.name} proof, received attestation type ${payload.response.attestationType}.`,
          recovery: 'unsafe_no_action',
          valueMoved: 'unknown',
        })
      }

      // The wire names differ from the struct names: `proof` is `merkleProof`,
      // `response` is `data`.
      return { merkleProof: payload.proof, data: payload.response }
    },

    async verifyProof(proof, reader, fdcVerificationAddress) {
      const functionName = VERIFY_FUNCTIONS[input.family.name]
      if (!functionName) {
        throw new FlareKitError('FDC_VERIFY_UNSUPPORTED', {
          domain: 'config',
          message: `FdcVerification exposes no verify function for ${input.family.name} in this build.`,
          recovery: 'terminal',
          valueMoved: 'no',
        })
      }
      const proved = await reader.readContract({
        address: fdcVerificationAddress,
        abi: fdcVerificationAbi as readonly unknown[],
        functionName,
        args: [input.family.toProofStruct(proof)],
      })
      return proved === true
    },
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
