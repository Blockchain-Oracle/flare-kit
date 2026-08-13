import { ATTESTATION_TYPES } from '@flare-kit/contracts'
import { describe, expect, it, vi } from 'vitest'
import { createFdcClient } from '../src/fdc/client.js'
import { evmTransactionFamily } from '../src/fdc/families/evm-transaction.js'
import { web2JsonFamily } from '../src/fdc/families/web2-json.js'
import { toProofStruct } from '../src/fdc/families/xrp-payment.js'
import {
  DA_BODY,
  FLR_SOURCE,
  PROOF_OWNER,
  SERVICES,
  TESTXRP_SOURCE_ID,
  TX_ID,
  WEB2_SOURCE,
  bodyOf,
  jsonResponse,
  xrpClient,
} from './fdc-fixtures.js'

/**
 * The one lifecycle, over a fake transport. Migrated from `test/fdc.test.ts`
 * when M3 generalised the client: every assertion the XRPPayment-only client
 * carried is still here, now alongside the ones that only mean anything once
 * more than one family shares the state machine.
 */

describe('prepareRequest', () => {
  it('posts the XRPPayment type and the network’s source id, with the api key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse('{"status":"VALID","abiEncodedRequest":"0xdeadbeef"}'))
    const prepared = await xrpClient(fetchMock).prepareRequest({
      transactionId: TX_ID,
      proofOwner: PROOF_OWNER,
    })

    expect(prepared.abiEncodedRequest).toBe('0xdeadbeef')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://fdc-verifiers-testnet.flare.network/verifier/xrp/XRPPayment/prepareRequest',
    )
    expect((init.headers as Record<string, string>)['X-API-KEY']).toBe(SERVICES.publicApiKey)

    const body = bodyOf(fetchMock)
    // XRPPayment, not the chain-agnostic Payment type: a Payment proof does not
    // verify against the AssetManager and its request body differs.
    expect(body.attestationType).toBe(ATTESTATION_TYPES.XRPPayment)
    expect(body.sourceId).toBe(TESTXRP_SOURCE_ID)
    expect(body.requestBody).toEqual({ transactionId: TX_ID, proofOwner: PROOF_OWNER })
  })

  it('lower-cases proofOwner, because the verifier does', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse('{"status":"VALID","abiEncodedRequest":"0x01"}'))
    await xrpClient(fetchMock).prepareRequest({
      transactionId: TX_ID,
      proofOwner: '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD',
    })
    expect(bodyOf(fetchMock).requestBody.proofOwner).toBe(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    )
  })

  it('treats a non-VALID verifier status as "not yet provable", not as failed', async () => {
    // The verifier rejects a payment whose ledger lacks three confirmations.
    // That is a timing observation, never a failed mint.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('{"status":"INVALID"}'))
    await expect(
      xrpClient(fetchMock).prepareRequest({ transactionId: TX_ID, proofOwner: PROOF_OWNER }),
    ).rejects.toMatchObject({ code: 'FDC_REQUEST_NOT_PREPARED', valueMoved: 'unknown' })
  })

  it('surfaces a transport failure as retryable, with nothing moved', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    await expect(
      xrpClient(fetchMock).prepareRequest({ transactionId: TX_ID, proofOwner: PROOF_OWNER }),
    ).rejects.toMatchObject({ recovery: 'safe_to_retry', valueMoved: 'no' })
  })

  it('treats a 5xx as an unknown, never as "this transaction is invalid"', async () => {
    // M3-R10. The `eth` verifier returns 500 where `flr` and `sgb` return a
    // clean 200 {"status":"INVALID"} for the same nonexistent transaction, so
    // collapsing the two would report a healthy chain as having a bad tx.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('upstream error', 502))
    await expect(
      xrpClient(fetchMock).prepareRequest({ transactionId: TX_ID, proofOwner: PROOF_OWNER }),
    ).rejects.toMatchObject({
      code: 'FDC_VERIFIER_UNAVAILABLE',
      recovery: 'safe_to_retry',
      valueMoved: 'unknown',
    })
  })

  it('validates the body before it spends a network round trip', async () => {
    const fetchMock = vi.fn()
    await expect(
      xrpClient(fetchMock).prepareRequest({ transactionId: '0xnope', proofOwner: PROOF_OWNER }),
    ).rejects.toMatchObject({ code: 'FDC_REQUEST_INVALID', valueMoved: 'no' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the same lifecycle over a different family', () => {
  it('routes EVMTransaction to its own group and type, not XRPPayment’s', async () => {
    // M3-AC3, and the point of M3-R1: one state machine, and the family is the
    // only thing that changes. Coston2 EVM attestations are served by `flr`.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse('{"status":"VALID","abiEncodedRequest":"0x02"}'))
    const client = createFdcClient({
      services: SERVICES,
      family: evmTransactionFamily,
      source: FLR_SOURCE,
      fetch: fetchMock,
    })
    await client.prepareRequest({
      transactionHash: TX_ID,
      requiredConfirmations: 1,
      provideInput: false,
      listEvents: false,
    })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://fdc-verifiers-testnet.flare.network/verifier/flr/EVMTransaction/prepareRequest',
    )
    expect(url).not.toContain('/verifier/eth/')
    expect(bodyOf(fetchMock).attestationType).toBe(ATTESTATION_TYPES.EVMTransaction)
  })

  it('honours an overridden verifier host without changing the operation model', async () => {
    // M3-R9: a self-hosted verifier is configuration, not a different client.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse('{"status":"VALID","abiEncodedRequest":"0x03"}'))
    const client = createFdcClient({
      services: SERVICES,
      family: web2JsonFamily,
      source: WEB2_SOURCE,
      fetch: fetchMock,
      verifierBaseUrl: 'https://verifier.internal',
    })
    await client.prepareRequest({
      url: 'https://example.org/rates.json',
      postProcessJq: '{v: .value}',
      abiSignature: '{"components":[]}',
    })
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://verifier.internal/verifier/web2/Web2Json/prepareRequest')
    expect(client.verifierBaseUrl).toBe('https://verifier.internal')
  })
})

describe('retrieveProof', () => {
  it('maps the DA layer’s JSON keys onto the Solidity struct field names', async () => {
    // The wire says `response` and `proof`; the struct says `data` and
    // `merkleProof`. Getting this wrong yields a well-formed, useless proof.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(DA_BODY))
    const proof = await xrpClient(fetchMock).retrieveProof({
      votingRoundId: 1028678n,
      requestBytes: '0xdead',
    })
    expect(proof.merkleProof).toEqual(['0xaaa', '0xbbb'])
    expect(proof.data.votingRound).toBe(1028678n)
    expect(proof.data.responseBody.receivedAmount).toBe(250000000n)
  })

  it('posts votingRoundId and requestBytes to the documented path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(DA_BODY))
    await xrpClient(fetchMock).retrieveProof({ votingRoundId: 1028678n, requestBytes: '0xdead' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://ctn2-data-availability.flare.network/api/v1/fdc/proof-by-request-round',
    )
    expect(JSON.parse(init.body as string)).toEqual({
      votingRoundId: 1028678,
      requestBytes: '0xdead',
    })
  })

  it('reports an unavailable proof as a wait, never as a failure', async () => {
    // A round that finalized without this request reaching consensus answers
    // exactly this way — including every nondeterministic Web2Json (M3-R10).
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('{}', 404))
    await expect(
      xrpClient(fetchMock).retrieveProof({ votingRoundId: 1028678n, requestBytes: '0xdead' }),
    ).rejects.toMatchObject({
      code: 'FDC_PROOF_NOT_AVAILABLE',
      recovery: 'wait',
      valueMoved: 'unknown',
    })
  })

  it('refuses a response whose attestation type is not the family’s', async () => {
    const wrong = DA_BODY.replace(ATTESTATION_TYPES.XRPPayment!, `0x${'99'.repeat(32)}`)
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(wrong))
    await expect(
      xrpClient(fetchMock).retrieveProof({ votingRoundId: 1028678n, requestBytes: '0xdead' }),
    ).rejects.toMatchObject({ code: 'FDC_PROOF_MISMATCH' })
  })
})

describe('verifyProof', () => {
  it('calls the family’s own verify function and returns the real boolean', async () => {
    // M3-AC7. Not a derived truthiness: the chain's answer, as a bool.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(DA_BODY))
    const client = xrpClient(fetchMock)
    const proof = await client.retrieveProof({ votingRoundId: 1028678n, requestBytes: '0xdead' })

    const readContract = vi.fn().mockResolvedValue(true)
    const address = `0x${'11'.repeat(20)}` as `0x${string}`
    await expect(client.verifyProof(proof, { readContract }, address)).resolves.toBe(true)
    expect(readContract.mock.calls[0]?.[0]).toMatchObject({
      address,
      functionName: 'verifyXRPPayment',
    })
  })

  it('reports a false verification as false, not as an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(DA_BODY))
    const client = xrpClient(fetchMock)
    const proof = await client.retrieveProof({ votingRoundId: 1028678n, requestBytes: '0xdead' })
    const readContract = vi.fn().mockResolvedValue(false)
    await expect(client.verifyProof(proof, { readContract }, `0x${'11'.repeat(20)}`)).resolves.toBe(
      false,
    )
  })
})

describe('toProofStruct', () => {
  it('produces the tuple the ABI expects, with uint8 as a number', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(DA_BODY))
    const proof = await xrpClient(fetchMock).retrieveProof({
      votingRoundId: 1028678n,
      requestBytes: '0xdead',
    })

    const struct = toProofStruct(proof)
    expect(Object.keys(struct)).toEqual(['merkleProof', 'data'])
    // uint8 encodes from a number; every wider integer stays a bigint.
    expect(struct.data.responseBody.status).toBe(0)
    expect(struct.data.votingRound).toBe(1028678n)
    expect(struct.data.responseBody.receivedAmount).toBe(250000000n)
  })
})
