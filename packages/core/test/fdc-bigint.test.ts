import { describe, expect, it, vi } from 'vitest'
import { xrpPaymentNonexistenceFamily } from '../src/fdc/families/xrp-payment-nonexistence.js'
import { toProofStruct } from '../src/fdc/families/xrp-payment.js'
import { parseJsonWithBigInts } from '../src/json.js'
import { DA_BODY, UINT64_MAX, jsonResponse, xrpClient } from './fdc-fixtures.js'

/**
 * M3-AC5 and M3-R6. `18446744073709551615` never becomes
 * `18446744073709552000`.
 *
 * This is the failure that looks like nothing at all: the bytes are
 * well-formed, the merkle proof is present, and verification simply returns
 * false. Flare's own documentation records their data-availability client
 * displaying the corrupted value, so the hazard is not hypothetical — and it is
 * not XRP-specific either, because `lowestUsedTimestamp` is common to every
 * family and the nonexistence families are the documented sentinel producers.
 */

const SENTINEL = 18446744073709551615n

describe('uint64 max survives the round trip', () => {
  it('parses the sentinel out of the response text without touching Number', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(DA_BODY))
    const proof = await xrpClient(fetchMock).retrieveProof({
      votingRoundId: 1028678n,
      requestBytes: '0xdead',
    })
    expect(proof.data.lowestUsedTimestamp).toBe(SENTINEL)
  })

  it('re-encodes it byte-identical to the attested value', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(DA_BODY))
    const proof = await xrpClient(fetchMock).retrieveProof({
      votingRoundId: 1028678n,
      requestBytes: '0xdead',
    })
    const struct = toProofStruct(proof)
    expect(struct.data.lowestUsedTimestamp.toString()).toBe(UINT64_MAX)
  })

  it('demonstrates what the obvious parse would have produced', () => {
    // Kept as an assertion rather than a comment: if a future JS engine ever
    // made JSON.parse lossless, this test would fail and say so, rather than
    // leaving a stale warning in the tree.
    const corrupted = JSON.parse(`{"v": ${UINT64_MAX}}`).v
    expect(corrupted).toBe(18446744073709552000)
    expect(String(corrupted)).not.toBe(UINT64_MAX)
  })
})

interface NonexistenceWire {
  proof: readonly string[]
  response: Parameters<typeof xrpPaymentNonexistenceFamily.toProofStruct>[0]['data']
}

describe('the nonexistence family, where the sentinel actually arrives', () => {
  const nonexistenceBody = (overflowBlock: string) => `{
    "response": {
      "attestationType": "0x585250",
      "sourceId": "0x00",
      "votingRound": 1028900,
      "lowestUsedTimestamp": ${UINT64_MAX},
      "requestBody": {
        "minimalBlockNumber": 1000,
        "deadlineBlockNumber": 2000,
        "deadlineTimestamp": 1780000000,
        "destinationAddressHash": "0x11",
        "amount": 250000000,
        "checkFirstMemoData": true,
        "firstMemoDataHash": "0x22",
        "checkDestinationTag": false,
        "destinationTag": 0,
        "proofOwner": "0x33"
      },
      "responseBody": {
        "minimalBlockTimestamp": 1779000000,
        "firstOverflowBlockNumber": ${overflowBlock},
        "firstOverflowBlockTimestamp": ${overflowBlock}
      }
    },
    "proof": ["0xaaa"]
  }`

  const structFor = (overflowBlock: string) => {
    // The real parser, not a copy of it: a test that reimplements the reviver
    // proves the reimplementation works and says nothing about the shipped one.
    const parsed = parseJsonWithBigInts(nonexistenceBody(overflowBlock)) as NonexistenceWire
    return xrpPaymentNonexistenceFamily.toProofStruct({
      merkleProof: parsed.proof,
      data: parsed.response,
    }) as { data: { responseBody: Record<string, bigint> } }
  }

  it('keeps every response field a bigint, narrowing none of them', () => {
    // Nothing in this family is uint8. A blanket Number() over the response —
    // the shape that works fine for XRPPayment's `status` — corrupts both
    // sentinel fields here.
    for (const [field, value] of Object.entries(structFor('1').data.responseBody)) {
      expect(typeof value, field).toBe('bigint')
    }
  })

  it('carries the sentinel through unchanged when the window had no overflow block', () => {
    const body = structFor(UINT64_MAX).data.responseBody
    expect(body.firstOverflowBlockNumber).toBe(SENTINEL)
    expect(body.firstOverflowBlockNumber?.toString()).toBe(UINT64_MAX)
    expect(body.firstOverflowBlockTimestamp).toBe(SENTINEL)
  })
})
