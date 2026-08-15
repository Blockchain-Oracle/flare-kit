import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  MOCK_EVM_TRANSACTION_PROOF,
  MOCK_NONEXISTENCE_SENTINEL_PROOF,
  MOCK_UNKNOWN_REASONS,
  MOCK_XRP_PAYMENT_PROOF,
} from '@flarekit-dev/core'
import { AttestationTimeline } from '../src/AttestationTimeline.js'
import { ProofDetail } from '../src/ProofDetail.js'
import {
  FINALIZED_NO_PROOF,
  OTHER,
  OWNER,
  PROOF_READY,
  SUBMITTED,
  expectAllDistinct,
  opAt,
  rowFor,
} from './fdc-shapes.js'

/** FDC-03 and FDC-04, in every state the spec requires. */

describe('AttestationTimeline', () => {
  it('renders its required states as distinct shapes', () => {
    expectAllDistinct({
      submitted: <AttestationTimeline operation={opAt(SUBMITTED)} />,
      finalizedNoProofYet: <AttestationTimeline operation={opAt(FINALIZED_NO_PROOF)} />,
      proofReady: <AttestationTimeline operation={opAt(PROOF_READY)} />,
      verifiedFalse: (
        <AttestationTimeline
          operation={opAt({ ...PROOF_READY, verified: false })}
        />
      ),
      consumed: (
        <AttestationTimeline
          operation={opAt({ ...PROOF_READY, consumptionTxHash: '0xdone' })}
        />
      ),
    })
  })

  it('renders consensus failure as unknown, never as an invalid transaction', () => {
    // M3-AC6. The single most important sentence on this surface.
    render(
      <AttestationTimeline
        operation={opAt(FINALIZED_NO_PROOF)}
        unknownReason={MOCK_UNKNOWN_REASONS.consensus_not_reached}
      />,
    )
    expect(screen.getByText(/outcome unknown/i)).toBeTruthy()
    expect(screen.getByText(/says nothing about whether the attested data is true/i)).toBeTruthy()
    expect(screen.queryByText(/is invalid/i)).toBeNull()
  })

  it('separates finalization from proof retrieval, because they are two moments', () => {
    // Measured live 2026-08-04: isFinalized was true minutes before the proof
    // could be fetched. One combined step would show a proof that is not there.
    const { container } = render(<AttestationTimeline operation={opAt(FINALIZED_NO_PROOF)} />)
    expect(container.querySelector('[data-step="finalize"]')?.getAttribute('data-state')).toBe(
      'done',
    )
    expect(container.querySelector('[data-step="retrieve"]')?.getAttribute('data-state')).toBe(
      'active',
    )
  })

  it('stops waiting once the outcome is unknown, instead of contradicting itself', () => {
    // The first version left an unknown in `awaiting_external`, so the surface
    // showed a countdown to a deadline that had already passed, "nothing for
    // you to do", and "the request can be made again" — three claims that
    // cannot all be true at once. An unknown is not a wait.
    const timedOut = opAt({
      ...SUBMITTED,
      unknownReason: MOCK_UNKNOWN_REASONS.round_timed_out,
    })
    expect(timedOut.state).toBe('action_required')
    expect(timedOut.awaiting).toBeUndefined()
    expect(timedOut.recovery?.map((action) => action.id)).toEqual(['request-again'])

    render(
      <AttestationTimeline
        operation={timedOut}
        unknownReason={MOCK_UNKNOWN_REASONS.round_timed_out}
      />,
    )
    expect(screen.queryByText(/Waiting on/i)).toBeNull()
    expect(screen.queryByText(/Nothing for you to do yet/i)).toBeNull()
    expect(screen.getByText(/outcome unknown/i)).toBeTruthy()
  })

  it('offers asking again as an action that moves new value, not a quiet retry', () => {
    // A second request pays a second fee. That needs explicit consent.
    const [action] = opAt({
      ...FINALIZED_NO_PROOF,
      unknownReason: MOCK_UNKNOWN_REASONS.consensus_not_reached,
    }).recovery!
    expect(action?.movesNewValue).toBe(true)
  })

  it('keeps a still-open round a wait, with a real deadline and no action', () => {
    const waiting = opAt(SUBMITTED)
    expect(waiting.state).toBe('awaiting_external')
    expect(waiting.awaiting?.availableAt).toBeDefined()
    expect(waiting.recovery ?? []).toHaveLength(0)
  })

  it('marks verify as the failed step when the proof does not verify', () => {
    // Not `consume`. The first version counted `verify` as done and put the
    // failure marker on the next step, so the spine read "verified, then
    // consumption failed" — the opposite of what happened, and it silently
    // suppressed the note below, because that note keys off verify's state.
    const { container } = render(
      <AttestationTimeline operation={opAt({ ...PROOF_READY, verified: false })} />,
    )
    expect(container.querySelector('[data-step="verify"]')?.getAttribute('data-state')).toBe(
      'failed',
    )
    expect(container.querySelector('[data-step="consume"]')?.getAttribute('data-state')).toBe(
      'pending',
    )
    expect(screen.getByText(/did not verify on chain/i)).toBeTruthy()
  })

  it('omits the consume step entirely for a family with no deployed consumer', () => {
    // Declared absent, not silently skipped.
    const { container } = render(
      <AttestationTimeline
        operation={opAt({ requestBytes: '0xab', roundFinalized: false, proofAvailable: false }, false)}
      />,
    )
    expect(container.querySelector('[data-step="consume"]')).toBeNull()
  })

  it('names the actor owning every step', () => {
    // DESIGN.md: a long wait names who is being waited on, as a proper noun.
    render(<AttestationTimeline operation={opAt(SUBMITTED)} />)
    expect(screen.getAllByText(/Flare Data Connector|FDC/i).length).toBeGreaterThan(0)
  })
})

describe('ProofDetail', () => {
  const noop = () => {}

  it('renders its required states as distinct shapes', () => {
    const row = rowFor('XRPPayment')
    expectAllDistinct({
      verifierOnly: (
        <ProofDetail row={rowFor('EVMTransaction')} proof={MOCK_XRP_PAYMENT_PROOF} verified />
      ),
      notVerifiedYet: <ProofDetail row={row} proof={MOCK_XRP_PAYMENT_PROOF} onConsume={noop} />,
      verifiedConsumable: (
        <ProofDetail row={row} proof={MOCK_XRP_PAYMENT_PROOF} verified onConsume={noop} />
      ),
      verifiedFalse: (
        <ProofDetail row={row} proof={MOCK_XRP_PAYMENT_PROOF} verified={false} onConsume={noop} />
      ),
      alreadyConsumed: (
        <ProofDetail
          row={row}
          proof={MOCK_XRP_PAYMENT_PROOF}
          verified
          consumptionTxHash="0xdone"
          onConsume={noop}
        />
      ),
      consumptionFailed: (
        <ProofDetail
          row={row}
          proof={MOCK_XRP_PAYMENT_PROOF}
          verified
          consumptionError="The transaction reverted."
          onConsume={noop}
        />
      ),
      ownerMismatch: (
        <ProofDetail
          row={row}
          proof={MOCK_XRP_PAYMENT_PROOF}
          verified
          proofOwner={OWNER}
          sender={OTHER}
          onConsume={noop}
        />
      ),
    })
  })

  it('offers no consumption at all for a family with no deployed consumer', () => {
    // M3-AC7. Not a disabled button — no button, and a sentence saying why.
    render(<ProofDetail row={rowFor('EVMTransaction')} proof={MOCK_XRP_PAYMENT_PROOF} verified />)
    expect(screen.queryByRole('button', { name: /consume/i })).toBeNull()
    expect(screen.getByText(/Verification only/i)).toBeTruthy()
  })

  it('keeps "not verified yet" distinct from "did not verify"', () => {
    // An unknown outcome is never rendered as failed.
    render(<ProofDetail row={rowFor('XRPPayment')} proof={MOCK_XRP_PAYMENT_PROOF} />)
    expect(screen.getByText('Not verified yet')).toBeTruthy()
    expect(screen.queryByText('Did not verify')).toBeNull()
  })

  it('renders the uint64-max sentinel at full precision, digit for digit', () => {
    // M3-AC5 on the surface. If this ever reads 18446744073709552000, a Number
    // has touched the proof somewhere between the wire and the screen.
    render(
      <ProofDetail
        row={rowFor('XRPPaymentNonexistence')}
        proof={MOCK_NONEXISTENCE_SENTINEL_PROOF}
        verified
      />,
    )
    expect(screen.getAllByText('18446744073709551615')).toHaveLength(2)
    expect(screen.queryByText('18446744073709552000')).toBeNull()
  })

  it('refuses consumption when the proof is bound to another address', () => {
    render(
      <ProofDetail
        row={rowFor('XRPPayment')}
        proof={MOCK_XRP_PAYMENT_PROOF}
        verified
        proofOwner={OWNER}
        sender={OTHER}
        onConsume={noop}
      />,
    )
    expect(screen.getByRole('button', { name: /consume/i }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/OnlyProofOwner/)).toBeTruthy()
  })

  it('links the proof owner to its explorer when the host supplies the url', () => {
    const url = `https://coston2-explorer.flare.network/address/${OWNER}`
    render(
      <ProofDetail
        row={rowFor('XRPPayment')}
        proof={MOCK_XRP_PAYMENT_PROOF}
        verified
        proofOwner={OWNER}
        proofOwnerExplorerUrl={url}
      />,
    )
    expect(screen.getByRole('link', { name: new RegExp(OWNER) })).toHaveAttribute('href', url)
  })

  it('leaves the proof owner copy-only when no explorer url is supplied', () => {
    // The surface holds no chain id, so it never guesses a link — same refusal
    // as an identifier no explorer indexes.
    render(
      <ProofDetail
        row={rowFor('XRPPayment')}
        proof={MOCK_XRP_PAYMENT_PROOF}
        verified
        proofOwner={OWNER}
      />,
    )
    expect(screen.queryByRole('link', { name: new RegExp(OWNER) })).toBeNull()
  })

  it('does not offer to consume a proof that has already been consumed', () => {
    render(
      <ProofDetail
        row={rowFor('XRPPayment')}
        proof={MOCK_XRP_PAYMENT_PROOF}
        verified
        consumptionTxHash="0xdone"
        onConsume={noop}
      />,
    )
    expect(screen.getByRole('button', { name: /consume/i }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/not a second execution/i)).toBeTruthy()
  })
})

describe('M4-R14 — expired, and the source-aware EVM value', () => {
  /**
   * `expired` means the Relay no longer holds the merkle root for this proof's
   * voting round, so `FdcVerification` can never verify it again — by anyone.
   * It is not a verdict on the attested value and not a failure.
   */
  it('renders expired as an end state, never as a failed verification', () => {
    const { container } = render(
      <ProofDetail
        row={rowFor('EVMTransaction')}
        proof={MOCK_EVM_TRANSACTION_PROOF}
        verified
        relayRootPresent={false}
      />,
    )
    expect(container.querySelector('[data-expired="true"]')).toBeTruthy()
    expect(screen.getByText(/can no longer be verified on chain/i)).toBeTruthy()
    // An end state, not a fault: `att`, and never the danger tone.
    expect(container.querySelector('.fk-note-bad')).toBeNull()
    // And it does not overwrite what the proof actually attested.
    expect(screen.getByText(/still in the response above/i)).toBeTruthy()
  })

  it('keeps expired distinct from "nobody has checked yet"', () => {
    const unchecked = render(
      <ProofDetail row={rowFor('EVMTransaction')} proof={MOCK_EVM_TRANSACTION_PROOF} />,
    )
    expect(unchecked.container.querySelector('[data-expired="unknown"]')).toBeTruthy()
    expect(unchecked.queryByText(/can no longer be verified/i)).toBeNull()
  })

  /**
   * Three EVM sources sit on one family row, so no family-level asset can be
   * right for all of them. Without a source the field stays a bare integer —
   * a wrong ticker beside a real number is worse than no ticker.
   */
  it('renders an EVM value with its source unit, and bare without one', () => {
    const withUnit = render(
      <ProofDetail
        row={rowFor('EVMTransaction')}
        proof={MOCK_EVM_TRANSACTION_PROOF}
        source={{ nativeUnit: { asset: 'C2FLR', decimals: 18 } }}
      />,
    )
    expect(withUnit.container.textContent).toMatch(/C2FLR/)
    withUnit.unmount()

    const withoutUnit = render(
      <ProofDetail row={rowFor('EVMTransaction')} proof={MOCK_EVM_TRANSACTION_PROOF} />,
    )
    expect(withoutUnit.container.textContent).not.toMatch(/C2FLR/)
  })
})
