import { ATTESTATION_TYPES, familyFor, sourceFor } from '@flare-kit/contracts'
import type { vi } from 'vitest'
import { createFdcClient } from '../src/fdc/client.js'
import { xrpPaymentFamily } from '../src/fdc/families/xrp-payment.js'

/**
 * Shared FDC test fixtures.
 *
 * The data-availability body below is the one place a proof is written out in
 * full, so the `uint64` sentinel and the wire-versus-struct key names have a
 * single definition. Three test files assert against it; three copies of it
 * would be three chances for one to be quietly corrected into passing.
 */

export const SERVICES = {
  verifierBaseUrl: 'https://fdc-verifiers-testnet.flare.network',
  dataAvailabilityBaseUrl: 'https://ctn2-data-availability.flare.network',
  apiKeyHeader: 'X-API-KEY',
  publicApiKey: '00000000-0000-0000-0000-000000000000',
  xrplSourceId: 'testXRP',
}

export const TX_ID = `0x${'33'.repeat(32)}`
export const PROOF_OWNER = '0x1234567890abcdef1234567890abcdef12345678'
export const UINT64_MAX = '18446744073709551615'
export const TESTXRP_SOURCE_ID =
  '0x7465737458525000000000000000000000000000000000000000000000000000'

export const XRPL_SOURCE = sourceFor(familyFor('XRPPayment')!, 'coston2', 'testXRP')!
export const FLR_SOURCE = sourceFor(familyFor('EVMTransaction')!, 'coston2', 'testFLR')!
export const WEB2_SOURCE = sourceFor(familyFor('Web2Json')!, 'coston2', 'PublicWeb2')!

export function jsonResponse(body: string, status = 200) {
  return { status, ok: status === 200, text: async () => body } as Response
}

export const xrpClient = (fetchMock: typeof globalThis.fetch) =>
  createFdcClient({
    services: SERVICES,
    family: xrpPaymentFamily,
    source: XRPL_SOURCE,
    fetch: fetchMock,
  })

/** The JSON body of the last request a fetch mock was called with. */
export const bodyOf = (fetchMock: ReturnType<typeof vi.fn>, call = 0) =>
  JSON.parse((fetchMock.mock.calls[call] as [string, RequestInit])[1].body as string)

/**
 * A real-shaped XRPPayment proof. `lowestUsedTimestamp` is `uint64` max — the
 * value Flare's own documentation records the naive client displaying as
 * `18446744073709552000`.
 */
export const DA_BODY = `{
  "response": {
    "attestationType": "${ATTESTATION_TYPES.XRPPayment}",
    "sourceId": "${TESTXRP_SOURCE_ID}",
    "votingRound": 1028678,
    "lowestUsedTimestamp": ${UINT64_MAX},
    "requestBody": { "transactionId": "${TX_ID}", "proofOwner": "${PROOF_OWNER}" },
    "responseBody": {
      "blockNumber": 4821766,
      "blockTimestamp": 1780000100,
      "sourceAddress": "rNBjmsJ8xLKvSbUZbGpFxk9Tt2cCPVKcRV",
      "sourceAddressHash": "0x44",
      "receivingAddressHash": "0x55",
      "intendedReceivingAddressHash": "0x55",
      "spentAmount": 250000012,
      "intendedSpentAmount": 250000012,
      "receivedAmount": 250000000,
      "intendedReceivedAmount": 250000000,
      "hasMemoData": true,
      "firstMemoData": "0x4642505266410018",
      "hasDestinationTag": false,
      "destinationTag": 0,
      "status": 0
    }
  },
  "proof": ["0xaaa", "0xbbb"]
}`
