import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  mockCatalogue,
  mockCatalogueDisagreement,
  mockCatalogueUnavailable,
  mockCatalogueUnreachableGroup,
} from '@flare-kit/core'
import { AttestationCatalogue } from '../src/AttestationCatalogue.js'
import { AttestationRequestBuilder } from '../src/AttestationRequestBuilder.js'
import { FEE, NOW, OTHER, OWNER, PREPARED, ROWS, expectAllDistinct, rowFor } from './fdc-shapes.js'

/** FDC-01 and FDC-02, in every state the spec requires. */

describe('AttestationCatalogue', () => {
  it('renders its required states as distinct shapes', () => {
    expectAllDistinct({
      BASE: <AttestationCatalogue catalogue={mockCatalogue()} now={NOW} />,
      loading: <AttestationCatalogue loading now={NOW} />,
      disagreement: <AttestationCatalogue catalogue={mockCatalogueDisagreement()} now={NOW} />,
      unreachableGroup: (
        <AttestationCatalogue catalogue={mockCatalogueUnreachableGroup()} now={NOW} />
      ),
      unavailable: <AttestationCatalogue catalogue={mockCatalogueUnavailable()} now={NOW} />,
      stale: <AttestationCatalogue catalogue={mockCatalogue()} now={NOW} stale />,
    })
  })

  it('names the specific family when the table and the verifier disagree', () => {
    // M3-AC2. A generic "some families differ" would be useless.
    render(<AttestationCatalogue catalogue={mockCatalogueDisagreement()} now={NOW} />)
    expect(screen.getByText(/disagree/i)).toBeTruthy()
    expect(screen.getAllByText('Web2Json').length).toBeGreaterThan(0)
  })

  it('never renders a planned family as supported', () => {
    // M3-R4. Five families have no builder and must say so in words.
    render(<AttestationCatalogue catalogue={mockCatalogue()} now={NOW} />)
    expect(screen.getAllByText('Planned')).toHaveLength(5)
    expect(screen.getAllByText('Supported')).toHaveLength(4)
  })

  it('keeps unreachable distinct from unavailable', () => {
    // The whole point of the three-way outcome: silence is not a denial.
    const { container } = render(
      <AttestationCatalogue catalogue={mockCatalogueUnreachableGroup()} now={NOW} />,
    )
    const evm = container.querySelector('[data-family="EVMTransaction"]')
    expect(evm?.getAttribute('data-agreement')).toBe('unreachable')
    expect(evm?.getAttribute('data-status')).not.toBe('unavailable')
    expect(screen.getByText(/not checked/i)).toBeTruthy()
  })

  it('shows nothing rather than the built-in table when the verifier is silent', () => {
    // A list that looked identical to a verified one is exactly what M3-R3
    // forbids, so the unavailable state has no rows at all.
    const { container } = render(
      <AttestationCatalogue catalogue={mockCatalogueUnavailable()} now={NOW} />,
    )
    expect(container.querySelectorAll('[data-family]')).toHaveLength(0)
    expect(screen.getByText(/could not be checked/i)).toBeTruthy()
  })

  it('names the deployed consumer where there is one, and says so where there is not', () => {
    // Corrected 2026-08-04. The first version asserted "No deployed consumer"
    // appeared — and it did, on seven families FAssets actually consumes.
    // Understating what the protocol can already do is the same error as
    // overstating it, pointed the other way.
    render(<AttestationCatalogue catalogue={mockCatalogue()} now={NOW} />)
    expect(screen.getAllByText(/FAssets AssetManager/).length).toBeGreaterThan(0)
    // The two general-purpose families, whose consumer is the integrator's.
    expect(screen.getAllByText(/Your own contract/)).toHaveLength(3)
  })

  it('knows FAssets consumes every chain family, and only the general ones have none', () => {
    // `XRPPaymentNonexistence` is the one this got wrong: FAssets takes it
    // through `xrpRedemptionPaymentDefault`, verified live on the deployed
    // Coston2 AssetManager.
    const consumerless = ROWS.filter((row) => !row.family.hasDeployedConsumer).map(
      (row) => row.family.name,
    )
    expect(consumerless.sort()).toEqual(['EVMTransaction', 'JsonApi', 'Web2Json'])
    expect(rowFor('XRPPaymentNonexistence').family.consumer).toMatch(
      /xrpRedemptionPaymentDefault/,
    )
  })
})

describe('AttestationRequestBuilder', () => {
  it('renders its required states as distinct shapes', () => {
    expectAllDistinct({
      BASE: (
        <AttestationRequestBuilder
          row={rowFor('XRPPayment')}
          sourceId="testXRP"
          prepared={PREPARED}
          fee={FEE}
          proofOwner={OWNER}
          sender={OWNER}
        />
      ),
      notPreparedYet: <AttestationRequestBuilder row={rowFor('XRPPayment')} sourceId="testXRP" />,
      feeUnavailable: (
        <AttestationRequestBuilder
          row={rowFor('XRPPayment')}
          sourceId="testXRP"
          prepared={PREPARED}
          feeUnavailableReason="The deployment would not price this request."
        />
      ),
      plannedFamily: <AttestationRequestBuilder row={rowFor('Payment')} sourceId="testXRP" />,
      ownerMismatch: (
        <AttestationRequestBuilder
          row={rowFor('XRPPayment')}
          sourceId="testXRP"
          prepared={PREPARED}
          fee={FEE}
          proofOwner={OWNER}
          sender={OTHER}
        />
      ),
      submitting: (
        <AttestationRequestBuilder
          row={rowFor('XRPPayment')}
          sourceId="testXRP"
          prepared={PREPARED}
          fee={FEE}
          submitting
        />
      ),
    })
  })

  it('shows the fee with its asset and full precision, never a placeholder', () => {
    // M3-AC4 and DESIGN.md's exactness rule. 1000 wei is a real number of
    // C2FLR and renders as one.
    render(
      <AttestationRequestBuilder
        row={rowFor('XRPPayment')}
        sourceId="testXRP"
        prepared={PREPARED}
        fee={FEE}
      />,
    )
    expect(screen.getByText(/0\.000000000000001000 C2FLR/)).toBeTruthy()
  })

  it('says the fee was not read rather than showing zero', () => {
    render(<AttestationRequestBuilder row={rowFor('XRPPayment')} sourceId="testXRP" />)
    expect(screen.getByText('Not read')).toBeTruthy()
  })

  it('refuses to offer submission when the proof owner is not the sender', () => {
    // M3-R8, before gas is spent rather than after a revert.
    render(
      <AttestationRequestBuilder
        row={rowFor('XRPPayment')}
        sourceId="testXRP"
        prepared={PREPARED}
        fee={FEE}
        proofOwner={OWNER}
        sender={OTHER}
      />,
    )
    expect(screen.getByRole('button', { name: /submit/i }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/bound to another address/i)).toBeTruthy()
  })

  it('does not offer a family the kit has no builder for', () => {
    // M3-R4: `planned` is never rendered as supported, and never as broken.
    render(<AttestationRequestBuilder row={rowFor('Payment')} sourceId="testXRP" />)
    expect(screen.getByRole('button', { name: /submit/i }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/No builder in this kit/i)).toBeTruthy()
  })

  it('makes the request bytes and their hash copyable, in the one evidence anatomy', () => {
    // Changed deliberately from "render the bytes in full". DESIGN.md's rule is
    // that identifiers truncate and the full value is *always* copyable, in one
    // anatomy everywhere — so 960 bytes of Web2Json request goes through
    // `EvidenceChip` like every other identifier, rather than a bespoke
    // scrolling block that only this surface has.
    render(
      <AttestationRequestBuilder
        row={rowFor('XRPPayment')}
        sourceId="testXRP"
        prepared={PREPARED}
        fee={FEE}
      />,
    )
    expect(screen.getByTitle(PREPARED.abiEncodedRequest)).toBeTruthy()
    expect(screen.getByTitle(PREPARED.requestHash)).toBeTruthy()
    expect(screen.getByRole('button', { name: /copy bytes/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /copy keccak256/i })).toBeTruthy()
    expect(screen.getByText(/80 bytes/)).toBeTruthy()
  })
})
