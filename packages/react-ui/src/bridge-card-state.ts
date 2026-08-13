// packages/react-ui/src/bridge-card-state.ts
import type { BridgeError, BridgePlanResult, BridgeRoute, OperationRecord } from '@flare-kit/core'
import type { Cta, CardNote } from './card-chrome.js'
import { chainLabel } from './route-catalogue-state.js'

/**
 * How a cross-chain operation's state becomes the BridgeCard's chrome — the CTA, the
 * note and the durable delivery timeline. Split from `BridgeCard.tsx` at the seam the
 * swap/vault card-state files sit on; every honesty rule the card turns on is readable
 * here. The load-bearing one: a `submitted` send is never "delivered" — the timeline's
 * DELIVERED / REDEEMED leg is `done` only when the operation reached `succeeded` from a
 * destination read, and an unavailable read is never rendered as a confident no-balance.
 */

/** One leg of the durable delivery timeline. */
export interface TimelineLeg {
  readonly id: string
  readonly label: string
  readonly state: 'pending' | 'active' | 'done'
}

/**
 * The delivery timeline legs projected from the canonical state + the awaited actor.
 * A bridge is submitted → awaiting-delivery → delivered; the redeem extends the wait
 * through the FAssets redemption + XRPL settlement to xrp-redeemed (AC5).
 */
export function deliveryLegs(op: OperationRecord, kind: BridgeRoute['kind']): TimelineLeg[] {
  const actor = op.awaiting?.actor
  const inflight = op.state === 'submitted' || op.state === 'executing' || op.state === 'confirming'
  const awaitingDelivery = op.state === 'awaiting_external' && actor === 'executor'
  const awaitingRedeem = op.state === 'awaiting_external' && (actor === 'flare' || actor === 'xrpl')
  const done = op.state === 'succeeded'
  // Delivery is `done` ONLY when a destination read proved it — succeeded, or a redeem
  // already past its LZ leg (awaiting the FAssets/XRPL actor). Any other non-inflight
  // state (e.g. an escalated action_required) has NO delivery read, so it stays pending.
  const deliveryProven = done || awaitingRedeem

  const submitted: TimelineLeg = { id: 'submitted', label: 'Submitted', state: inflight ? 'active' : 'done' }
  const delivery: TimelineLeg = {
    id: 'awaiting-delivery',
    label: kind === 'redeem' ? 'Awaiting LayerZero delivery' : 'Awaiting delivery',
    state: awaitingDelivery ? 'active' : deliveryProven ? 'done' : 'pending',
  }
  if (kind === 'bridge') {
    return [submitted, delivery, { id: 'delivered', label: 'Delivered', state: done ? 'done' : 'pending' }]
  }
  return [
    submitted,
    delivery,
    {
      id: 'awaiting-redemption',
      label: 'Awaiting FAssets redemption',
      state: awaitingRedeem ? 'active' : done ? 'done' : 'pending',
    },
    { id: 'redeemed', label: 'Native XRP redeemed', state: done ? 'done' : 'pending' },
  ]
}

const ERROR_NOTE: Record<BridgeError['kind'], { title: string; body: string }> = {
  'not-verified': {
    title: 'Route not built here',
    body: 'This route has not been driven live in this build, so the kit will not sign a send against it.',
  },
  'no-peer': {
    title: 'Destination not wired',
    body: 'The destination peer is not set on chain, so a send would not route. This is a configuration gap, not a balance problem.',
  },
  'insufficient-balance': {
    title: 'Not enough FXRP',
    body: 'Your FXRP balance is below the amount you want to bridge.',
  },
  'insufficient-fee': {
    title: 'Not enough for the fee',
    body: 'Your native balance is below the cross-chain fee the send must pay. The fee is quoted, not estimated.',
  },
  'dust-below-min': {
    title: 'Amount too small',
    body: 'The amount that would land after the OFT removes sub-shared-decimal dust is below your minimum. Raise the amount or the slippage.',
  },
  expired: { title: 'Quote expired', body: 'The deadline has passed. Re-quote to continue.' },
}

export function bridgeErrorNote(error: BridgeError): CardNote {
  const copy = ERROR_NOTE[error.kind]
  // A no-peer/expired is a re-quotable condition; a not-verified/insufficient is a
  // hard stop until inputs change — the tone reflects that, never guessed.
  const tone = error.kind === 'expired' || error.kind === 'no-peer' ? 'att' : 'info'
  return { tone, title: copy.title, body: copy.body }
}

/** The async-delivery statement M8-R8 requires beside the receive leg. */
export function asyncDeliveryNote(route: BridgeRoute): CardNote {
  return {
    tone: 'info',
    title: 'Delivery is asynchronous',
    body: `The send confirms on ${chainLabel(route.from.key)}, then LayerZero delivers on ${chainLabel(route.to.key)} — usually a few minutes. This card holds the operation in flight until the destination chain confirms receipt; it never shows a sent message as delivered.`,
  }
}

export function ctaFor(op: OperationRecord, plan: BridgePlanResult | undefined, route: BridgeRoute): Cta {
  const active = op.steps.find((step) => step.state === 'active')
  switch (op.state) {
    case 'ready':
      return { label: route.kind === 'redeem' ? 'Review redeem' : 'Review bridge', disabled: false }
    case 'awaiting_approval':
      return { label: `Approve ${route.asset.symbol}`, disabled: false }
    case 'executing':
    case 'submitted':
    case 'confirming':
      return { label: active?.type === 'approve' ? 'Approving…' : 'Sending…', disabled: true }
    case 'awaiting_external':
      return { label: route.kind === 'redeem' ? 'Redeeming…' : 'In flight…', disabled: true }
    case 'succeeded':
      return { label: route.kind === 'redeem' ? 'Redeemed' : 'Delivered', disabled: true }
    case 'failed':
      return { label: 'Failed', disabled: true }
    case 'expired':
      return { label: 'Re-quote', disabled: false }
    default:
      if (plan?.kind === 'error' && plan.error.kind === 'not-verified') return { label: 'Not available', disabled: true }
      return { label: 'Enter an amount', disabled: true }
  }
}
