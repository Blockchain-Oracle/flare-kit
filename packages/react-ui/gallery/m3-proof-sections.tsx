import {
  MOCK_EVM_TRANSACTION_PROOF,
  MOCK_NONEXISTENCE_SENTINEL_PROOF,
  MOCK_SOURCE,
  MOCK_UNKNOWN_REASONS,
  MOCK_XRP_PAYMENT_PROOF,
  observe,
  evmTransactionFamily,
  xrpPaymentNonexistenceFamily,
} from '@flare-kit/core'
import { AttestationTimeline, ProofDetail } from '../src/index.js'
import {
  FINALIZED_NO_PROOF,
  type GallerySection,
  NOW,
  OTHER,
  OWNER,
  PROOF_READY,
  SUBMITTED,
  opAt,
  rowFor,
} from './m3-sections.js'

/**
 * FDC-03 and FDC-04, in every state the M3 spec requires.
 *
 * The two cases worth looking at hardest: "finalized, proof not yet published"
 * is the state a live run actually produced on 2026-08-04 and must not read as
 * a failure, and "uint64-max sentinel" is the only place the twenty-digit value
 * can be seen rendered — if it ever shows `18446744073709552000` on screen, a
 * `Number` has touched the proof.
 */

/** The provenance of the reading the timeline is showing (M3-R12). */
const READING = observe(null, MOCK_SOURCE, NOW - 4_000)

export const M3_PROOF_SECTIONS: GallerySection[] = [
  {
    id: 'fdc-03',
    title: 'FDC-03 AttestationTimeline',
    cases: [
      {
        name: 'submitted, round open',
        node: (
          <AttestationTimeline
            operation={opAt(SUBMITTED)}
            reading={READING}
            now={NOW}
          />
        ),
      },
      {
        name: 'finalized, proof not yet published',
        node: (
          <AttestationTimeline
            operation={opAt({
              ...FINALIZED_NO_PROOF,
              unknownReason: MOCK_UNKNOWN_REASONS.da_not_indexed,
            })}
            unknownReason={MOCK_UNKNOWN_REASONS.da_not_indexed}
          />
        ),
      },
      {
        name: 'consensus not reached',
        node: (
          <AttestationTimeline
            operation={opAt({
              ...FINALIZED_NO_PROOF,
              unknownReason: MOCK_UNKNOWN_REASONS.consensus_not_reached,
            })}
            unknownReason={MOCK_UNKNOWN_REASONS.consensus_not_reached}
          />
        ),
      },
      {
        name: 'round timed out',
        node: (
          <AttestationTimeline
            operation={opAt({
              ...SUBMITTED,
              unknownReason: MOCK_UNKNOWN_REASONS.round_timed_out,
            })}
            unknownReason={MOCK_UNKNOWN_REASONS.round_timed_out}
          />
        ),
      },
      {
        name: 'proof ready and verified',
        node: <AttestationTimeline operation={opAt(PROOF_READY)} />,
      },
      {
        name: 'verifier-only, no consume step',
        node: <AttestationTimeline operation={opAt(PROOF_READY, false)} />,
      },
      {
        name: 'proof did not verify',
        node: <AttestationTimeline operation={opAt({ ...PROOF_READY, verified: false })} />,
      },
      {
        name: 'consumed',
        node: (
          <AttestationTimeline operation={opAt({ ...PROOF_READY, consumptionTxHash: '0xdone' })} />
        ),
      },
    ],
  },
  {
    id: 'fdc-04',
    title: 'FDC-04 ProofDetail',
    cases: [
      {
        name: 'BASE — verified, consumable',
        node: (
          <ProofDetail
            row={rowFor('XRPPayment')}
            proof={MOCK_XRP_PAYMENT_PROOF}
            verified
            proofOwner={OWNER}
            sender={OWNER}
            onConsume={() => {}}
            onDownload={() => {}}
          />
        ),
      },
      {
        name: 'not verified yet',
        node: (
          <ProofDetail
            row={rowFor('XRPPayment')}
            proof={MOCK_XRP_PAYMENT_PROOF}
            onConsume={() => {}}
          />
        ),
      },
      {
        name: 'verifier-only, with the handoff',
        node: (
          <ProofDetail
            row={rowFor('EVMTransaction')}
            proof={MOCK_EVM_TRANSACTION_PROOF}
            verified
            abiStruct={evmTransactionFamily.toProofStruct(MOCK_EVM_TRANSACTION_PROOF)}
            onDownload={() => {}}
          />
        ),
      },
      {
        /**
         * M4-R14. `value` is denominated in whichever chain the source names,
         * and three EVM sources sit on one family row — so the family declares
         * no asset and the amount rendered as a bare integer. The unit belongs
         * to the source, and passing one is what makes it readable.
         */
        name: 'EVM value, with its source unit — M4-R14',
        node: (
          <ProofDetail
            row={rowFor('EVMTransaction')}
            proof={MOCK_EVM_TRANSACTION_PROOF}
            verified
            source={{ nativeUnit: { asset: 'C2FLR', decimals: 18 } }}
            relayRootPresent
          />
        ),
      },
      {
        /**
         * M4-R14's `expired`. The Relay stops holding a round's merkle root —
         * measured on Coston2, protocol 200's root is set at round 1130919 and
         * zero at 900000 — and `FdcVerification` checks against exactly that
         * root. Past it the proof can never be verified again, by anyone.
         */
        name: 'expired — the Relay no longer holds the root',
        node: (
          <ProofDetail
            row={rowFor('EVMTransaction')}
            proof={MOCK_EVM_TRANSACTION_PROOF}
            verified
            relayRootPresent={false}
            source={{ nativeUnit: { asset: 'C2FLR', decimals: 18 } }}
          />
        ),
      },
      {
        name: 'uint64-max sentinel',
        node: (
          <ProofDetail
            row={rowFor('XRPPaymentNonexistence')}
            proof={MOCK_NONEXISTENCE_SENTINEL_PROOF}
            verified
            abiStruct={xrpPaymentNonexistenceFamily.toProofStruct(
              MOCK_NONEXISTENCE_SENTINEL_PROOF,
            )}
          />
        ),
      },
      {
        name: 'proof did not verify',
        node: (
          <ProofDetail
            row={rowFor('XRPPayment')}
            proof={MOCK_XRP_PAYMENT_PROOF}
            verified={false}
            onConsume={() => {}}
          />
        ),
      },
      {
        name: 'already consumed',
        node: (
          <ProofDetail
            row={rowFor('XRPPayment')}
            proof={MOCK_XRP_PAYMENT_PROOF}
            verified
            consumptionTxHash="0xdone"
            consumptionExplorerUrl="https://coston2-explorer.flare.network/tx/0xdone"
            onConsume={() => {}}
          />
        ),
      },
      {
        name: 'consumption failed',
        node: (
          <ProofDetail
            row={rowFor('XRPPayment')}
            proof={MOCK_XRP_PAYMENT_PROOF}
            verified
            consumptionError="The transaction reverted with PaymentAlreadyConfirmed()."
            onConsume={() => {}}
          />
        ),
      },
      {
        name: 'bound to another address',
        node: (
          <ProofDetail
            row={rowFor('XRPPayment')}
            proof={MOCK_XRP_PAYMENT_PROOF}
            verified
            proofOwner={OWNER}
            sender={OTHER}
            onConsume={() => {}}
          />
        ),
      },
    ],
  },
]
