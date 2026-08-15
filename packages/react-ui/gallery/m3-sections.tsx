import {
  type AttestationChainState,
  type PreparedRequest,
  createAttestationOperation,
  mockCatalogue,
  mockCatalogueDisagreement,
  mockCatalogueUnavailable,
  mockCatalogueUnreachableGroup,
  reconcileAttestation,
} from '@flarekit-dev/core'
import { AttestationCatalogue, AttestationRequestBuilder } from '@flarekit-dev/react-ui'

/**
 * FDC-01 and FDC-02, in every state the M3 spec requires, plus the fixtures
 * `m3-proof-sections.tsx` shares.
 *
 * Every value is from the labelled mock. `MOCK_SOURCE.provider` reads
 * "Simulated", so the provenance chip on the catalogue says so on screen —
 * which is the point: a gallery that looked live would be the exact confusion
 * the mock rules exist to prevent.
 */

export const NOW = 1_785_820_400_000
export const OWNER = '0xa4b05cdb545fa7ca12be9f866d64e8a843a31bd9'
export const OTHER = '0x000000000000000000000000000000000000dead'

const catalogue = mockCatalogue()
const ROWS = catalogue.status === 'observed' ? catalogue.value : []
export const rowFor = (name: string) => ROWS.find((row) => row.family.name === name)!

const FEE = { value: 1000n, asset: 'C2FLR', decimals: 18 }
const PREPARED: PreparedRequest = {
  abiEncodedRequest: `0x${'ab'.repeat(80)}`,
  requestHash: `0x${'7e'.repeat(32)}`,
  attestationType: `0x${'11'.repeat(32)}`,
  sourceId: `0x${'22'.repeat(32)}`,
  verifier: 'https://fdc-verifiers-testnet.flare.network/verifier/xrp/XRPPayment/prepareRequest',
}
const DA = 'https://ctn2-data-availability.flare.network'

const INTENT = {
  familyName: 'XRPPayment',
  source: { group: 'xrp', sourceId: 'testXRP', chain: 'XRP Ledger Testnet' },
  input: {},
  proofOwner: OWNER,
}

export const opAt = (chain: AttestationChainState, hasConsumer = true) =>
  reconcileAttestation(
    createAttestationOperation({ intent: INTENT, network: 114, now: NOW, hasConsumer }),
    chain,
    NOW,
  )

export const SUBMITTED: AttestationChainState = {
  requestBytes: '0xab',
  submissionTxHash: '0xtx',
  votingRoundId: 1415859n,
  roundFinalized: false,
  proofAvailable: false,
  expectedFinalizedAt: NOW + 180_000,
}
export const FINALIZED_NO_PROOF: AttestationChainState = { ...SUBMITTED, roundFinalized: true }
export const PROOF_READY: AttestationChainState = {
  ...FINALIZED_NO_PROOF,
  proofAvailable: true,
  verified: true,
}

export interface GalleryCase {
  name: string
  node: React.ReactNode
}

export interface GallerySection {
  id: string
  title: string
  cases: GalleryCase[]
}

export const M3_SECTIONS: GallerySection[] = [
  {
    id: 'fdc-01',
    title: 'FDC-01 AttestationCatalogue',
    cases: [
      { name: 'loading', node: <AttestationCatalogue loading now={NOW} /> },
      {
        name: 'BASE — all nine live',
        node: <AttestationCatalogue catalogue={mockCatalogue()} now={NOW} />,
      },
      {
        name: 'docs/verifier disagreement',
        node: <AttestationCatalogue catalogue={mockCatalogueDisagreement()} now={NOW} />,
      },
      {
        name: 'a group unreachable',
        node: <AttestationCatalogue catalogue={mockCatalogueUnreachableGroup()} now={NOW} />,
      },
      {
        name: 'no current family list',
        node: (
          <AttestationCatalogue
            catalogue={mockCatalogueUnavailable()}
            now={NOW}
            onRefresh={() => {}}
          />
        ),
      },
      {
        name: 'matrix stale',
        node: (
          <AttestationCatalogue catalogue={mockCatalogue()} now={NOW} stale onRefresh={() => {}} />
        ),
      },
    ],
  },
  {
    id: 'fdc-02',
    title: 'FDC-02 AttestationRequestBuilder',
    cases: [
      {
        name: 'BASE — ready to submit',
        node: (
          <AttestationRequestBuilder
            row={rowFor('XRPPayment')}
            sourceId="testXRP"
            prepared={PREPARED}
            fee={FEE}
            dataAvailabilityBaseUrl={DA}
            expectedRound={1415859n}
            expectedRangeSeconds={{ min: 90n, max: 180n }}
            proofOwner={OWNER}
            sender={OWNER}
            onSubmit={() => {}}
          />
        ),
      },
      {
        name: 'not canonicalised yet',
        node: <AttestationRequestBuilder row={rowFor('XRPPayment')} sourceId="testXRP" />,
      },
      {
        name: 'fee unavailable',
        node: (
          <AttestationRequestBuilder
            row={rowFor('XRPPayment')}
            sourceId="testXRP"
            prepared={PREPARED}
            feeUnavailableReason="This deployment would not price the request: the type and source combination is not supported on chain."
          />
        ),
      },
      {
        name: 'builder planned',
        node: <AttestationRequestBuilder row={rowFor('Payment')} sourceId="testXRP" />,
      },
      {
        name: 'proof-owner mismatch',
        node: (
          <AttestationRequestBuilder
            row={rowFor('XRPPayment')}
            sourceId="testXRP"
            prepared={PREPARED}
            fee={FEE}
            proofOwner={OWNER}
            sender={OTHER}
          />
        ),
      },
      {
        name: 'invalid body',
        node: (
          <AttestationRequestBuilder
            row={rowFor('XRPPaymentNonexistence')}
            sourceId="testXRP"
            fee={FEE}
            error={{
              code: 'FDC_REQUEST_INVALID',
              domain: 'input',
              recovery: 'requires_new_value',
              valueMoved: 'no',
              evidence: {},
              message:
                'Set checkFirstMemoData or checkDestinationTag. A nonexistence proof needs a discriminator.',
            }}
          />
        ),
      },
      {
        name: 'submitting',
        node: (
          <AttestationRequestBuilder
            row={rowFor('XRPPayment')}
            sourceId="testXRP"
            prepared={PREPARED}
            fee={FEE}
            submitting
          />
        ),
      },
    ],
  },
]
