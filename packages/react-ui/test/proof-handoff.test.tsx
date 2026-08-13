import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  MOCK_EVM_TRANSACTION_PROOF,
  MOCK_NONEXISTENCE_SENTINEL_PROOF,
  MOCK_XRP_PAYMENT_PROOF,
  evmTransactionFamily,
  xrpPaymentFamily,
  xrpPaymentNonexistenceFamily,
} from '@flare-kit/core'
import { ProofDetail } from '../src/ProofDetail.js'
import { ProofHandoff, toProofLiteral } from '../src/ProofHandoff.js'
import { rowFor } from './fdc-shapes.js'

/**
 * The handoff exists because
 * `.thoughts/decisions/2026-08-04-no-first-party-proof-consumer.md` rules out a
 * demo consumer. Its whole job is to be paste-able, and the one way it could be
 * subtly useless is by emitting integers a reader would paste back as `number`.
 */

describe('toProofLiteral', () => {
  it('emits bigints with the n suffix, never as strings or numbers', () => {
    // JSON would render a uint64 as `"18446744073709551615"` or — far worse —
    // as `18446744073709552000`. Both are unusable; the second is the exact
    // corruption this kit exists to prevent, reintroduced at the last moment.
    const code = toProofLiteral({ votingRound: 1415859n, flag: true, name: 'XRPPayment' })
    expect(code).toContain('votingRound: 1415859n')
    expect(code).not.toContain('"1415859"')
    expect(code).toContain('flag: true')
    expect(code).toContain('name: "XRPPayment"')
  })

  it('carries the uint64-max sentinel through as a bigint literal', () => {
    const struct = xrpPaymentNonexistenceFamily.toProofStruct(MOCK_NONEXISTENCE_SENTINEL_PROOF)
    const code = toProofLiteral(struct)
    expect(code).toContain('18446744073709551615n')
    expect(code).not.toContain('18446744073709552000')
  })

  it('keeps a uint8 a plain number, because that is what the ABI encoder wants', () => {
    // `status` narrows to a number in `toProofStruct`. Emitting `0n` would be a
    // different value to viem, not a cosmetic difference.
    const code = toProofLiteral(xrpPaymentFamily.toProofStruct(MOCK_XRP_PAYMENT_PROOF))
    expect(code).toContain('status: 0')
    expect(code).not.toContain('status: 0n')
  })

  it('renders nested arrays and objects rather than [object Object]', () => {
    const code = toProofLiteral({ merkleProof: ['0xaa', '0xbb'], data: { round: 1n } })
    expect(code).toContain('"0xaa"')
    expect(code).toContain('round: 1n')
    expect(code).not.toContain('[object Object]')
  })

  it('renders an empty array as [] rather than a blank block', () => {
    expect(toProofLiteral({ logIndices: [] })).toContain('logIndices: []')
  })
})

describe('ProofHandoff', () => {
  const struct = xrpPaymentFamily.toProofStruct(MOCK_XRP_PAYMENT_PROOF)

  it('names the Solidity type the integrator writes against', () => {
    render(<ProofHandoff row={rowFor('EVMTransaction')} abiStruct={struct} />)
    // Twice on purpose: once as the labelled type, once inside the snippet
    // where it says what the contract's parameter is.
    expect(screen.getAllByText(/IEVMTransaction\.Proof/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/FdcVerification\.verifyEVMTransaction/)).toBeTruthy()
  })

  it('tells the integrator to verify again rather than trusting our pre-flight', () => {
    // The kit's `verifyProof` is a read from the app. It is not a substitute for
    // the contract verifying the proof it is handed.
    render(<ProofHandoff row={rowFor('EVMTransaction')} abiStruct={struct} />)
    expect(screen.getByText(/pre-flight, not a substitute/i)).toBeTruthy()
  })

  it('offers the snippet as copyable code', () => {
    render(<ProofHandoff row={rowFor('EVMTransaction')} abiStruct={struct} />)
    expect(screen.getByRole('button', { name: /copy consume-proof\.ts/i })).toBeTruthy()
  })
})

describe('ProofDetail with the handoff', () => {
  it('renders it only when the caller supplies the ABI struct', () => {
    const { rerender, container } = render(
      <ProofDetail row={rowFor('EVMTransaction')} proof={MOCK_EVM_TRANSACTION_PROOF} verified />,
    )
    expect(container.querySelector('.fk-code')).toBeNull()

    rerender(
      <ProofDetail
        row={rowFor('EVMTransaction')}
        proof={MOCK_EVM_TRANSACTION_PROOF}
        verified
        abiStruct={evmTransactionFamily.toProofStruct(MOCK_EVM_TRANSACTION_PROOF)}
      />,
    )
    expect(container.querySelector('.fk-code')).not.toBeNull()
    expect(screen.getByText(/Take this to your contract/i)).toBeTruthy()
  })

  it('still says verification only — the handoff is the next step, not a consumer', () => {
    // The decision is that this kit deploys nothing. The handoff must not read
    // as though it had.
    render(
      <ProofDetail
        row={rowFor('EVMTransaction')}
        proof={MOCK_EVM_TRANSACTION_PROOF}
        verified
        abiStruct={evmTransactionFamily.toProofStruct(MOCK_EVM_TRANSACTION_PROOF)}
      />,
    )
    expect(screen.getByText(/Verification only/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /consume the proof/i })).toBeNull()
  })
})
