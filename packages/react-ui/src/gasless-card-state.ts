// packages/react-ui/src/gasless-card-state.ts
import type { GaslessError, GaslessPlanResult, OperationRecord } from '@flare-kit/core'
import type { Cta, CardNote } from './card-chrome.js'
import type { Leg } from './primitives/LegTimeline.js'

/**
 * How a gasless operation's state becomes the GaslessCard's chrome — the CTA, the
 * notes and the relay timeline. Split from `GaslessCard.tsx` at the same seam the
 * swap/bridge card-state files sit on; every honesty rule the card turns on is readable
 * here. The load-bearing one: a `submitted` relay acceptance is never "paid" — the
 * timeline's CONFIRMED leg is `done` only once the operation reached `succeeded` from an
 * on-chain transfer read, never from the relayer's HTTP response.
 */

/**
 * The relay timeline legs projected from the canonical state + the awaited actor:
 * relayer-accepted (submitted) → relayer-submitting (awaiting_external, relayer) →
 * transfer-confirmed (succeeded, from the on-chain read). Rendered by the shared
 * `LegTimeline` primitive.
 */
export function relayLegs(op: OperationRecord): Leg[] {
  const inflight = op.state === 'executing' || op.state === 'submitted'
  const awaitingRelay = op.state === 'awaiting_external' && op.awaiting?.actor === 'relayer'
  const done = op.state === 'succeeded'
  return [
    { id: 'accepted', label: 'Relayer accepted the job', state: inflight ? 'active' : 'done' },
    // CONFIRMED is `done` ONLY from the on-chain transfer read (succeeded), never earlier.
    { id: 'submitting', label: 'Relayer submitting on-chain', state: awaitingRelay ? 'active' : done ? 'done' : 'pending' },
    { id: 'confirmed', label: 'FXRP transfer confirmed on-chain', state: done ? 'done' : 'pending' },
  ]
}

const ERROR_NOTE: Record<GaslessError['kind'], { title: string; body: string }> = {
  'not-verified': {
    title: 'Gasless not built here',
    body: 'No live run has confirmed a gasless FXRP transfer in this build, so the kit will not sign an approval against this forwarder.',
  },
  'insufficient-balance': {
    title: 'Not enough FXRP',
    body: 'Your FXRP balance is below the amount you want to send.',
  },
  'expired-deadline': {
    title: 'Signing window closed',
    body: 'The deadline has passed. Start again to sign a fresh payment request.',
  },
  'relayer-unreachable': {
    title: "Relayer didn't respond",
    body: 'The relayer did not accept the request. Your signature is off-chain and nothing moved — try again when the relayer is reachable.',
  },
}

export function gaslessErrorNote(error: GaslessError): CardNote {
  const copy = ERROR_NOTE[error.kind]
  // expired/relayer-unreachable are retry-able conditions; not-verified/insufficient are hard stops.
  const tone = error.kind === 'expired-deadline' || error.kind === 'relayer-unreachable' ? 'att' : 'bad'
  return { tone, title: copy.title, body: copy.body }
}

/** The relayer-covers-gas · no-fee fact (M9-R4/AC4) — shown wherever the composer is live. */
export const RELAYER_NOTE: CardNote = {
  tone: 'info',
  title: 'Relayer covers gas · no fee',
  body: 'You sign the payment off-chain; the relayer submits it on-chain and pays the gas. The reference relayer charges no fee.',
}

/** The loud one-time-approval statement (M9-R4/AC4) — gasless ≠ free. */
export const APPROVAL_NOTE: CardNote = {
  tone: 'att',
  title: 'One-time approval · costs gas, once',
  body: 'The first time, you approve the forwarder to move your FXRP. This is an ordinary transaction you pay gas for — once. Every payment after it is gasless.',
}

/** The declared gap that lives in the asset picker (M9-R10/AC5): USD₮0 has no EIP-3009 on testnet. */
export const USDT0_UNAVAILABLE = {
  symbol: 'USD₮0',
  reason: 'Unavailable on testnet — the real USD₮0 does not implement EIP-3009, so a gasless USD₮0 payment has no substrate here.',
} as const

export function ctaForGasless(op: OperationRecord, plan: GaslessPlanResult | undefined): Cta {
  const active = op.steps.find((step) => step.state === 'active')
  switch (op.state) {
    case 'ready':
      return { label: 'Review payment', disabled: false }
    case 'awaiting_approval':
      return { label: 'Approve FXRP (one-time)', disabled: false }
    case 'executing':
    case 'submitted':
      return {
        label: active?.type === 'approve' ? 'Approving…' : active?.type === 'relay_submit' ? 'Relaying…' : 'Signing…',
        disabled: true,
      }
    case 'awaiting_external':
      return { label: 'Relayer submitting…', disabled: true }
    case 'succeeded':
      return { label: 'Paid', disabled: true }
    case 'failed':
      return { label: 'Failed', disabled: true }
    default:
      if (plan?.kind === 'error') return { label: plan.error.kind === 'not-verified' ? 'Not available' : 'Review payment', disabled: true }
      if (plan?.kind === 'unavailable') return { label: 'Unavailable', disabled: true }
      return { label: 'Enter a recipient and amount', disabled: true }
  }
}
