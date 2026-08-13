// packages/react-ui/src/x402-card-state.ts
import type { OperationRecord } from '@flare-kit/core'
import type { Cta, CardNote } from './card-chrome.js'
import type { Leg } from './primitives/LegTimeline.js'

/**
 * How an x402 operation's state becomes the X402Card's chrome. Split from
 * `X402Card.tsx` at the same seam the other card-state files sit on. The load-bearing
 * honesty: SETTLEMENT and RESOURCE are two independent legs — a settled payment whose
 * resource failed is `partially_succeeded` (payment took, resource did not), NEVER
 * `succeeded`; and `succeeded` is entered only from settled + delivered, never the
 * `402` alone.
 */

/** The outcome legs: settlement and resource, tracked SEPARATELY. Rendered by the shared
 *  `LegTimeline` primitive (the resource leg can be `failed` while settlement is `done`). */
export function outcomeLegs(op: OperationRecord): Leg[] {
  const settling =
    op.state === 'submitted' || op.state === 'executing' || (op.state === 'awaiting_external' && op.awaiting?.actor === 'provider')
  const settled = op.state === 'succeeded' || op.state === 'partially_succeeded'
  const delivered = op.state === 'succeeded'
  const resourceFailed = op.state === 'partially_succeeded'
  return [
    { id: 'settle', label: 'Facilitator settlement', state: settled ? 'done' : settling ? 'active' : 'pending' },
    {
      id: 'resource',
      label: 'Resource delivered',
      state: delivered ? 'done' : resourceFailed ? 'failed' : settled ? 'active' : 'pending',
    },
  ]
}

/** The demo-token statement (M9-R7/R11): the asset is a labelled stand-in, the flow is real. */
export const DEMO_NOTE: CardNote = {
  tone: 'info',
  title: 'Demo token · real flow',
  body: 'The paid asset is MockUSDT0, a labelled demo stand-in — it exists because neither FXRP nor the real USD₮0 implements EIP-3009 on testnet. The 402 flow, the facilitator, and the settlement transaction are all real.',
}

/** The independent-legs statement (M9-R11): settlement ≠ resource. */
export const SPLIT_NOTE: CardNote = {
  tone: 'info',
  title: 'Settlement and resource are separate',
  body: 'The on-chain settlement and the HTTP resource are two independent facts. This card shows both — a settled payment whose resource fails reads partially settled, never delivered.',
}

export function partialNote(): CardNote {
  return {
    tone: 'att',
    title: 'Payment took, resource did not',
    body: 'The facilitator settlement landed on-chain, but the resource was not delivered. This is partially succeeded — the payment is real; do not re-pay to retry the resource.',
  }
}

export function expiredNote(): CardNote {
  return {
    tone: 'att',
    title: 'Challenge expired',
    body: 'The payment window has passed. Request the resource again for a fresh challenge before signing.',
  }
}

export function rejectedNote(): CardNote {
  return {
    tone: 'bad',
    title: 'Settlement rejected',
    body: 'The facilitator rejected the authorization (a used nonce, an expired window, or an unsupported token). Nothing was charged.',
  }
}

export function duplicateNote(): CardNote {
  return {
    tone: 'info',
    title: 'Already settled (idempotent)',
    body: 'This authorization was already settled — the payment id is a duplicate, not a second charge.',
  }
}

export function ctaForX402(op: OperationRecord, opts: { expired?: boolean }): Cta {
  if (opts.expired && (op.state === 'awaiting_input' || op.state === 'ready')) return { label: 'Challenge expired', disabled: true }
  const active = op.steps.find((step) => step.state === 'active')
  switch (op.state) {
    case 'ready':
      return { label: 'Sign & pay', disabled: false }
    case 'executing':
    case 'submitted':
      return { label: active?.type === 'settle_and_fetch' ? 'Settling…' : 'Signing…', disabled: true }
    case 'awaiting_external':
      return { label: 'Settling…', disabled: true }
    case 'succeeded':
      return { label: 'Delivered', disabled: true }
    case 'partially_succeeded':
      return { label: 'Settled · resource failed', disabled: true }
    case 'failed':
      return { label: 'Rejected', disabled: true }
    default:
      return { label: 'Awaiting challenge', disabled: true }
  }
}
