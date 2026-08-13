import { FlareKitError } from '../errors.js'
import { type EvidenceItem, evidence } from '../evidence.js'
import {
  type OperationRecord,
  type OperationStep,
  type StepProgress,
  advanceSteps,
  applyTransition,
  createOperation,
} from '../operation.js'
import type { OperationState, StepActor } from '../states.js'
import type { RedeemIntent, RedeemQuote } from './quote-redeem.js'
import { type RedeemChainState, planRedeemRecovery } from './redeem-recovery.js'

/**
 * The redemption capability, on the same durable operation record as the mint.
 *
 * The spine differs in who owns each step: after the burn, every remaining step
 * belongs to a counterparty. That is the honest shape of redemption and it is
 * why the timeline names an agent rather than a protocol.
 */

export type RedeemOperation = OperationRecord<RedeemIntent, RedeemQuote, never>

export const REDEEM_STEPS = [
  'request-redemption',
  'agent-payment',
  'xrpl-delivery',
  'settle',
] as const

const STEP_DETAIL: Record<
  (typeof REDEEM_STEPS)[number],
  { readonly actor: StepActor; readonly label: string }
> = {
  'request-redemption': { actor: 'your_wallet', label: 'Request redemption and burn the FAsset' },
  'agent-payment': { actor: 'agent', label: 'Agent sends your XRP' },
  'xrpl-delivery': { actor: 'xrpl', label: 'Payment lands on the XRP Ledger' },
  settle: { actor: 'flare', label: 'Redemption settles' },
}

function initialSteps(): OperationStep[] {
  return REDEEM_STEPS.map((id) => ({
    id,
    type: STEP_DETAIL[id].label,
    actor: STEP_DETAIL[id].actor,
    state: 'pending',
    attempts: 0,
  }))
}

/**
 * Where the redemption spine stands. The burn is evidenced as soon as the
 * request exists; everything after it waits on an agent we do not control, so
 * nothing past `agent-payment` is marked done until the protocol says settled.
 */
export function redeemStepProgress(
  state: OperationState,
  chain?: RedeemChainState,
): StepProgress {
  if (state === 'succeeded') return { done: REDEEM_STEPS.length, current: 'pending' }
  if (state === 'draft' || state === 'quoting' || state === 'ready') {
    return { done: 0, current: 'pending' }
  }

  // The request exists, so the FAsset is burned: step one is done, whatever
  // happens next.
  const reached = chain?.requestId ? 1 : 0
  if (state === 'failed') return { done: reached, current: 'failed' }
  if (state === 'action_required') return { done: reached, current: 'blocked' }
  if (state === 'partially_succeeded') return { done: reached, current: 'blocked' }
  return { done: reached, current: 'active' }
}

export interface CreateRedeemInput {
  quote: RedeemQuote
  intent: RedeemIntent
  network: number
  now: number
  id?: string
}

export function createRedeemOperation(input: CreateRedeemInput): RedeemOperation {
  if (!input.quote.canProceed) {
    throw new FlareKitError('QUOTE_NOT_PROCEEDABLE', {
      domain: 'input',
      message: input.quote.blockedReason ?? 'This redemption cannot proceed.',
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }

  const base = createOperation<RedeemIntent, RedeemQuote, never>({
    capability: 'fassets.redeem',
    network: input.network,
    intent: input.intent,
    now: input.now,
    ...(input.id ? { id: input.id } : {}),
  })

  const terms: EvidenceItem[] = [
    evidence({
      kind: 'recipient_address',
      label: 'Your XRPL address',
      value: input.quote.redeemerUnderlyingAddress,
      observedAt: input.now,
    }),
  ]

  const quoted = applyTransition(base, {
    to: 'quoting',
    at: input.now,
    evidence: terms,
    patch: { quote: input.quote, steps: initialSteps() },
  }).record
  return applyTransition(quoted, { to: 'ready', at: input.now }).record
}

export interface AttachRedemptionRequestInput {
  requestId: string
  agentVault: string
  /** The agent's underlying address, from `RedemptionRequested`. */
  paymentAddress?: string
  at: number
}

/**
 * The redemption request landed and the FAsset is burned. From here the
 * operation is waiting on somebody, and the request id is its idempotency key.
 */
export function attachRedemptionRequest(
  record: RedeemOperation,
  input: AttachRedemptionRequestInput,
): RedeemOperation {
  const signing =
    record.state === 'ready'
      ? applyTransition(record, { to: 'executing', at: input.at }).record
      : record

  const items: EvidenceItem[] = [
    evidence({
      kind: 'reservation_id',
      label: 'Redemption request',
      value: input.requestId,
      observedAt: input.at,
    }),
    evidence({
      kind: 'agent_vault',
      label: 'Agent',
      value: input.agentVault,
      observedAt: input.at,
    }),
  ]
  if (input.paymentAddress) {
    items.push(
      evidence({
        kind: 'xrpl_destination',
        label: 'Paying from',
        value: input.paymentAddress,
        observedAt: input.at,
      }),
    )
  }

  const result = applyTransition(signing, {
    to: 'submitted',
    at: input.at,
    evidence: items,
    // The burn has happened by the time a request id exists.
    patch: { steps: advanceSteps(signing.steps, { done: 1, current: 'active' }, input.at) },
  })
  return { ...result.record, idempotencyKey: record.idempotencyKey ?? input.requestId }
}

/**
 * Advance to match the chain. Same shape as the mint's reconcile, over the
 * redemption matrix — so one reducer and one set of canonical states serve both
 * capabilities.
 */
export function reconcileRedeem(
  record: RedeemOperation,
  chain: RedeemChainState,
  now: number,
): RedeemOperation {
  const plan = planRedeemRecovery(chain, now)

  const observed: EvidenceItem[] = []
  if (chain.agentVault) {
    observed.push(
      evidence({
        kind: 'agent_vault',
        label: 'Agent',
        value: chain.agentVault,
        observedAt: now,
      }),
    )
  }

  return applyTransition(record, {
    to: plan.state,
    at: now,
    evidence: observed,
    patch: {
      steps: advanceSteps(record.steps, redeemStepProgress(plan.state, chain), now),
      recovery: plan.actions,
      // Always present, so a plan naming no actor clears a stale descriptor.
      // A settled operation must not keep claiming it waits on somebody.
      awaiting: plan.awaitedActor
        ? {
            actor: plan.awaitedActor,
            reason: plan.reason ?? '',
            since: now,
            // The protocol's own deadline, carried verbatim, so the timeline
            // states it rather than showing an open-ended wait.
            ...(plan.availableAt !== undefined ? { availableAt: plan.availableAt } : {}),
          }
        : undefined,
    },
  }).record
}
