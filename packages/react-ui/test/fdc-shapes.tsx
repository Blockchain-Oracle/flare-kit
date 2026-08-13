import { expect } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import {
  type AttestationChainState,
  type PreparedRequest,
  createAttestationOperation,
  mockCatalogue,
  reconcileAttestation,
} from '@flare-kit/core'

/**
 * The shared shape signature for the surface tests — FDC's and, since M4,
 * FTSO's.
 *
 * Two different states must not render the same *shape*. The signature is
 * deliberately blind to colour and to prose: DESIGN.md requires colour is never
 * the first signal, so a surface whose states differ only in hue fails here, as
 * it should. It reads only what carries meaning through shape — glyph
 * modifiers, `data-*` state attributes, and which controls are disabled.
 *
 * The attribute list stays **explicit** rather than sweeping up every `data-*`.
 * Each entry is a claim that the attribute corresponds to something a person can
 * see; collecting them all automatically would let two states diverge on an
 * invisible attribute and call themselves distinct.
 */

export const NOW = 1_785_820_400_000

export function shapeOf(ui: ReactElement): string {
  const { container, unmount } = render(ui)
  const parts = [
    [...container.querySelectorAll('[class*="fk-g-"]')].map(
      (n) => (n.className.match(/fk-g-[a-z]+/) ?? [''])[0],
    ),
    [...container.querySelectorAll('[data-state]')].map((n) => n.getAttribute('data-state')),
    [...container.querySelectorAll('[data-status]')].map((n) => n.getAttribute('data-status')),
    [...container.querySelectorAll('[data-agreement]')].map((n) => n.getAttribute('data-agreement')),
    [...container.querySelectorAll('[data-verified]')].map((n) => n.getAttribute('data-verified')),
    [...container.querySelectorAll('[data-consumed]')].map((n) => n.getAttribute('data-consumed')),
    [...container.querySelectorAll('[data-blocked]')].map((n) => n.getAttribute('data-blocked')),
    [...container.querySelectorAll('[data-block]')].map((n) => n.getAttribute('data-block')),
    [...container.querySelectorAll('[data-stale]')].map((n) => n.getAttribute('data-stale')),
    [...container.querySelectorAll('[data-consumption]')].map((n) =>
      n.getAttribute('data-consumption'),
    ),
    [...container.querySelectorAll('button')].map((n) => (n.disabled ? 'off' : 'on')),
  ]
  unmount()
  return parts.map((part) => part.join(',')).join(' | ')
}

/** Every pair must be distinguishable, and the failure names the pair. */
export function expectAllDistinct(cases: Record<string, ReactElement>) {
  const seen = new Map<string, string>()
  const collisions: string[] = []
  for (const [name, ui] of Object.entries(cases)) {
    const shape = shapeOf(ui)
    const previous = seen.get(shape)
    if (previous) collisions.push(`${previous} and ${name} render an identical shape`)
    else seen.set(shape, name)
  }
  expect(collisions).toEqual([])
}

const catalogue = mockCatalogue()
export const ROWS = catalogue.status === 'observed' ? catalogue.value : []
export const rowFor = (name: string) => ROWS.find((row) => row.family.name === name)!

export const OWNER = '0xa4b05cdb545fa7ca12be9f866d64e8a843a31bd9'
export const OTHER = '0x000000000000000000000000000000000000dead'

export const FEE = { value: 1000n, asset: 'C2FLR', decimals: 18 }

export const PREPARED: PreparedRequest = {
  abiEncodedRequest: `0x${'ab'.repeat(80)}`,
  requestHash: `0x${'7e'.repeat(32)}`,
  attestationType: `0x${'11'.repeat(32)}`,
  sourceId: `0x${'22'.repeat(32)}`,
  verifier: 'https://fdc-verifiers-testnet.flare.network/verifier/xrp/XRPPayment/prepareRequest',
}

const INTENT = {
  familyName: 'XRPPayment',
  source: { group: 'xrp', sourceId: 'testXRP', chain: 'XRP Ledger Testnet' },
  input: {},
  proofOwner: OWNER,
}

/** An attestation operation reconciled to a given protocol reading. */
export const opAt = (chain: AttestationChainState, hasConsumer = true) =>
  reconcileAttestation(
    createAttestationOperation({ intent: INTENT, network: 114, now: NOW, hasConsumer }),
    chain,
    NOW,
  )

/** The reading shapes the timeline has to tell apart. */
export const SUBMITTED: AttestationChainState = {
  requestBytes: '0xab',
  submissionTxHash: '0xtx',
  votingRoundId: 1415859n,
  roundFinalized: false,
  proofAvailable: false,
  // A submitted request always has an expected finalization, because the round
  // it landed in has a known duration. A wait states when it ends.
  expectedFinalizedAt: NOW + 180_000,
}
export const FINALIZED_NO_PROOF: AttestationChainState = {
  ...SUBMITTED,
  roundFinalized: true,
}
export const PROOF_READY: AttestationChainState = {
  ...FINALIZED_NO_PROOF,
  proofAvailable: true,
  verified: true,
}
