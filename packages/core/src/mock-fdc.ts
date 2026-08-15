import {
  ATTESTATION_FAMILIES,
  ATTESTATION_TYPES,
  attestationName,
  claimedStatus,
  familyFor,
} from '@flarekit-dev/contracts'
import type { FamilyRow } from './fdc/catalogue.js'
import type { EvmTransactionProof } from './fdc/families/evm-transaction.js'
import type { XrpPaymentProof } from './fdc/families/xrp-payment.js'
import type { XrpPaymentNonexistenceProof } from './fdc/families/xrp-payment-nonexistence.js'
import { type Observation, observe, unavailable } from './observation.js'

/**
 * Labelled FDC fixtures for the states a live run cannot be asked to produce.
 *
 * A voting round cannot be told to fail consensus on demand, a verifier cannot
 * be told to disagree with the table, and the `uint64`-max sentinel only appears
 * when a nonexistence window happens to have no overflow block — the live run of
 * 2026-08-04 asked for one and got ordinary values back. The gallery still has
 * to render all of them.
 *
 * **Every fixture here is explicitly labelled.** `MOCK_SOURCE.provider` reads
 * "Simulated" so any surface showing provenance says so, and nothing in this
 * file is ever reachable as a fallback from a failed live call — R-MOCK-004.
 * The live path throws or reports an honest unknown; it never substitutes one
 * of these.
 */

/** The provenance every fixture carries. A person reading a row must see this. */
export const MOCK_SOURCE = {
  class: 'provider' as const,
  provider: 'Simulated — flare-kit mock, not a live verifier',
  network: 'Flare Testnet Coston2 (simulated)',
  chainId: 114,
}

/** A fixed instant, so a fixture is never "fresh" by accident of when it ran. */
export const MOCK_FDC_OBSERVED_AT = 1_785_820_000_000

const TESTXRP = attestationName('testXRP')

function row(name: string, overrides: Partial<Omit<FamilyRow, 'family'>> = {}): FamilyRow {
  const family = familyFor(name)!
  const claimed = claimedStatus(family, 'coston2')
  return {
    family,
    claimed,
    status: claimed,
    agreement: 'agrees',
    servedBy: family.sources.coston2.map((s) => s.group),
    ...overrides,
  }
}

/** Everything agrees: the shape the live Coston2 verifier actually returns. */
export function mockCatalogue(): Observation<readonly FamilyRow[]> {
  return observe(
    ATTESTATION_FAMILIES.map((f) => row(f.name)),
    MOCK_SOURCE,
    MOCK_FDC_OBSERVED_AT,
  )
}

/**
 * The table claims a family the deployment does not serve. M3-AC2 requires this
 * to render and to name the family, and it cannot be produced live without
 * editing the shipped table.
 */
export function mockCatalogueDisagreement(): Observation<readonly FamilyRow[]> {
  return observe(
    ATTESTATION_FAMILIES.map((f) =>
      f.name === 'Web2Json'
        ? row(f.name, {
            status: 'unavailable',
            agreement: 'table_claims_more',
            servedBy: [],
            note: 'The built-in table lists Web2Json under web2, but this verifier serves it under none of them.',
          })
        : row(f.name),
    ),
    MOCK_SOURCE,
    MOCK_FDC_OBSERVED_AT,
  )
}

/** One group unreachable — not the same claim as the family being unavailable. */
export function mockCatalogueUnreachableGroup(): Observation<readonly FamilyRow[]> {
  return observe(
    ATTESTATION_FAMILIES.map((f) =>
      f.name === 'EVMTransaction'
        ? row(f.name, {
            agreement: 'unreachable',
            servedBy: [],
            note: 'Could not reach flr, eth, sgb, so this row is the built-in table’s claim and has not been checked against the deployment.',
          })
        : row(f.name),
    ),
    MOCK_SOURCE,
    MOCK_FDC_OBSERVED_AT,
  )
}

/** No group answered at all. The catalogue is not a list — it is unavailable. */
export function mockCatalogueUnavailable(): Observation<readonly FamilyRow[]> {
  return unavailable(
    MOCK_SOURCE,
    MOCK_FDC_OBSERVED_AT,
    'No verifier group answered. The catalogue would be the built-in table alone, which is a claim about 2026-08-04 rather than about this deployment.',
  )
}

/**
 * A real XRPPayment proof, transcribed from the live run of 2026-08-04
 * (round 1415859, XRPL ledger 19619920) so the mock copies observed behaviour
 * rather than inventing it.
 */
export const MOCK_XRP_PAYMENT_PROOF: XrpPaymentProof = {
  merkleProof: [`0x${'a1'.repeat(32)}`, `0x${'b2'.repeat(32)}`, `0x${'c3'.repeat(32)}`],
  data: {
    attestationType: ATTESTATION_TYPES.XRPPayment!,
    sourceId: TESTXRP,
    votingRound: 1415859n,
    lowestUsedTimestamp: 1785823590n,
    requestBody: {
      transactionId: '0x3f8394997fd81d36c6da3b626b4ce6d1fa594911fe97c150977b14e5b6ab6c03',
      proofOwner: '0xa4b05cdb545fa7ca12be9f866d64e8a843a31bd9',
    },
    responseBody: {
      blockNumber: 19619920n,
      blockTimestamp: 1785823590n,
      sourceAddress: 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio',
      sourceAddressHash: `0x${'a9'.repeat(32)}`,
      receivingAddressHash: `0x${'cf'.repeat(32)}`,
      intendedReceivingAddressHash: `0x${'cf'.repeat(32)}`,
      spentAmount: 25000012n,
      intendedSpentAmount: 25000012n,
      receivedAmount: 25000000n,
      intendedReceivedAmount: 25000000n,
      hasMemoData: true,
      firstMemoData: '0x464250526641001800000000a4b05cdb545fa7ca12be9f866d64e8a843a31bd9',
      hasDestinationTag: false,
      destinationTag: 0n,
      status: 0n,
    },
  },
}

/**
 * An `EVMTransaction` proof, from the Coston2 transaction M3's live run attested
 * (`0xb5bf295…`, the FDC request M1's mint submitted). Its own fixture rather
 * than reusing the XRPPayment one, because a screen showing an XRPL response
 * body under an `EVMTransaction` heading — with a snippet claiming
 * `IEVMTransaction.Proof` — is a demo telling a small lie about the protocol.
 */
export const MOCK_EVM_TRANSACTION_PROOF: EvmTransactionProof = {
  merkleProof: [`0xe1${'11'.repeat(31)}`, `0xe2${'22'.repeat(31)}`],
  data: {
    attestationType: ATTESTATION_TYPES.EVMTransaction!,
    sourceId: attestationName('testFLR'),
    votingRound: 1415859n,
    lowestUsedTimestamp: 1785823530n,
    requestBody: {
      transactionHash: '0xb5bf29512bae84f3837303721dad7241a6dae64dcf39c1568123ef4fc5715cd0',
      requiredConfirmations: 1n,
      provideInput: true,
      listEvents: true,
      logIndices: [],
    },
    responseBody: {
      blockNumber: 22447891n,
      timestamp: 1785823530n,
      sourceAddress: '0xa4b05cdb545fa7ca12be9f866d64e8a843a31bd9',
      isDeployment: false,
      receivingAddress: '0x48ac463d7975828989331f4de43341627b9c5f1d',
      // 1000 wei — the request fee this very transaction paid.
      value: 1000n,
      input: '0x6c6d7bdd',
      status: 1n,
      events: [
        {
          logIndex: 0n,
          emitterAddress: '0x48ac463d7975828989331f4de43341627b9c5f1d',
          topics: [`0x${'ab'.repeat(32)}`],
          data: '0x00',
          removed: false,
        },
      ],
    },
  },
}

/**
 * The `uint64`-max sentinel, which the live run did not produce.
 *
 * `firstOverflowBlockNumber` and `firstOverflowBlockTimestamp` come back as
 * `18446744073709551615` when the searched window had no overflow block. It is
 * the value `JSON.parse` renders as `18446744073709552000`, so a surface that
 * can display it correctly is the only proof the whole path is intact.
 */
export const UINT64_MAX = 18446744073709551615n

export const MOCK_NONEXISTENCE_SENTINEL_PROOF: XrpPaymentNonexistenceProof = {
  merkleProof: [`0x${'d4'.repeat(32)}`],
  data: {
    attestationType: ATTESTATION_TYPES.XRPPaymentNonexistence!,
    sourceId: TESTXRP,
    votingRound: 1415859n,
    lowestUsedTimestamp: 1785820772n,
    requestBody: {
      minimalBlockNumber: 19619000n,
      deadlineBlockNumber: 19619900n,
      deadlineTimestamp: 1780000000n,
      destinationAddressHash: `0x${'11'.repeat(32)}`,
      amount: 1n,
      checkFirstMemoData: false,
      firstMemoDataHash: `0x${'00'.repeat(32)}`,
      checkDestinationTag: true,
      destinationTag: 987654321n,
      proofOwner: '0xa4b05cdb545fa7ca12be9f866d64e8a843a31bd9',
    },
    responseBody: {
      minimalBlockTimestamp: 1785820772n,
      firstOverflowBlockNumber: UINT64_MAX,
      firstOverflowBlockTimestamp: UINT64_MAX,
    },
  },
}

/**
 * Why an attestation has no proof. Every one of these is an **unknown**: none of
 * them says the underlying transaction is invalid or that the endpoint is
 * broken (M3-R10).
 */
export type MockUnknownReason =
  | 'consensus_not_reached'
  | 'round_timed_out'
  | 'verifier_5xx'
  | 'da_not_indexed'

export const MOCK_UNKNOWN_REASONS: Readonly<Record<MockUnknownReason, string>> = Object.freeze({
  consensus_not_reached:
    'The round finalized without this request reaching consensus. Independent data providers did not agree on a single answer — most often because the source moved between their fetches. Nothing here says the source is wrong.',
  round_timed_out:
    'The voting round had not finalized within the wait. It may still finalize; nothing here says the attested data is invalid.',
  verifier_5xx:
    'The verifier returned a 5xx and did not answer the question. This is not a statement that the transaction is invalid — the `eth` verifier returns 500 where `flr` returns a clean INVALID.',
  da_not_indexed:
    'The round is finalized on chain but the data availability provider has not indexed it yet. Measured on 2026-08-04, this gap ran to minutes.',
})
