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
import { type UnsignedXrplPayment, buildDirectMintPayment } from '../xrpl.js'
import type { DirectMintIntent, DirectMintQuote } from './direct-mint-quote.js'
import { type DirectMintChainState, planRecovery } from './direct-mint-recovery.js'

/**
 * The direct-mint capability: turn an approved quote into a durable operation,
 * attach the XRPL payment, and reconcile against the chain.
 *
 * There is no `resume()` and no Resume button. `reconcileDirectMint` is safe to
 * call at any time from any state, and it is the only thing that advances the
 * operation, so opening the app and receiving a websocket event are the same
 * code path.
 */

export type DirectMintOperation = OperationRecord<DirectMintIntent, DirectMintQuote, never>

/** The spine, in order. Each step names the actor that owns it. */
export const DIRECT_MINT_STEPS = [
  'pay-xrpl',
  'xrpl-finality',
  'fdc-attest',
  'execute-mint',
  'credit-fasset',
] as const

const STEP_DETAIL: Record<
  (typeof DIRECT_MINT_STEPS)[number],
  { readonly actor: StepActor; readonly label: string }
> = {
  'pay-xrpl': { actor: 'your_wallet', label: 'Send the XRP payment' },
  'xrpl-finality': { actor: 'xrpl', label: 'Confirm on the XRP Ledger' },
  'fdc-attest': { actor: 'fdc', label: 'Prove the payment through the Flare Data Connector' },
  'execute-mint': { actor: 'executor', label: 'Execute the minting' },
  'credit-fasset': { actor: 'flare', label: 'Credit the FAsset' },
}

function initialSteps(): OperationStep[] {
  return DIRECT_MINT_STEPS.map((id) => ({
    id,
    type: STEP_DETAIL[id].label,
    actor: STEP_DETAIL[id].actor,
    state: 'pending',
    attempts: 0,
  }))
}

/**
 * Where the spine stands, from what the chain actually shows.
 *
 * Derived from evidence rather than from the operation state alone: a step is
 * only `done` when something observed says it happened. `succeeded` is the one
 * case where all five are known complete, because the FAsset was credited.
 */
export function directMintStepProgress(
  state: OperationState,
  chain?: DirectMintChainState,
): StepProgress {
  if (state === 'succeeded') return { done: DIRECT_MINT_STEPS.length, current: 'pending' }

  // How far the evidence reaches, independent of how the operation is faring.
  const reached = !chain?.xrplTxId
    ? 0
    : chain.alreadySettled
      ? 4
      : chain.proofAvailable
        ? 3
        : chain.xrplFinal
          ? 2
          : 1

  if (state === 'failed' || state === 'cancelled' || state === 'expired') {
    return { done: reached, current: state === 'failed' ? 'failed' : 'pending' }
  }
  if (state === 'action_required') return { done: reached, current: 'blocked' }
  if (state === 'draft' || state === 'quoting' || state === 'ready') {
    return { done: 0, current: 'pending' }
  }
  // executing, submitted, confirming, awaiting_external, partially_succeeded:
  // the payment is in flight and the next unfinished step is the live one.
  return { done: reached, current: 'active' }
}

export interface CreateDirectMintInput {
  quote: DirectMintQuote
  intent: DirectMintIntent
  network: number
  now: number
  idempotencyKey?: string
  id?: string
}

export function createDirectMintOperation(input: CreateDirectMintInput): DirectMintOperation {
  if (!input.quote.canProceed) {
    // AC7 and availability: an operation is never created for terms that cannot
    // safely be signed. The block lives here as well as in the widget, because
    // core is also what an agent calls.
    throw new FlareKitError('QUOTE_NOT_PROCEEDABLE', {
      domain: 'input',
      message: input.quote.blockedReason ?? 'This quote cannot proceed.',
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }

  const base = createOperation<DirectMintIntent, DirectMintQuote, never>({
    capability: 'fassets.directMint',
    network: input.network,
    intent: input.intent,
    now: input.now,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.id ? { id: input.id } : {}),
  })

  const terms: EvidenceItem[] = [
    evidence({
      kind: 'xrpl_destination',
      label: 'Core vault',
      value: input.quote.xrplDestination,
      observedAt: input.now,
    }),
    evidence({
      kind: 'recipient_address',
      label: 'Recipient',
      value: input.quote.recipient,
      observedAt: input.now,
    }),
    evidence({
      kind: 'payment_reference',
      label: 'Memo',
      value: input.quote.memo,
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

export interface BuildPaymentForQuoteInput {
  /** The XRPL account that will sign and send. */
  account: string
  sequence: number
  lastLedgerSequence: number
  feeDrops: bigint
  /** Defaults to the quote's own timestamp; supply to check expiry. */
  now?: number
}

/**
 * The only supported way to obtain a signable payment.
 *
 * Every term comes from the quote, so nothing can drift between what was shown
 * and what gets signed — and, more importantly, a quote that cannot proceed
 * cannot produce a payment at all. AC7 is therefore not a check a caller might
 * forget: below the minimum there is simply no argument list that yields
 * something signable.
 *
 * `buildDirectMintPayment` in `xrpl.ts` remains the unchecked primitive and
 * knows nothing of minimums; it is not the path a product should use.
 */
export function buildPaymentForQuote(
  quote: DirectMintQuote,
  input: BuildPaymentForQuoteInput,
): UnsignedXrplPayment {
  if (!quote.canProceed) {
    throw new FlareKitError('QUOTE_NOT_PROCEEDABLE', {
      domain: 'input',
      message: quote.blockedReason ?? 'This quote cannot proceed.',
      recovery: 'terminal',
      valueMoved: 'no',
    })
  }
  const now = input.now ?? quote.quotedAt
  if (now > quote.expiresAt) {
    throw new FlareKitError('QUOTE_EXPIRED', {
      domain: 'input',
      message:
        'This quote has expired. Re-quote before signing, so the fees and the amount you approve are the ones that will apply.',
      recovery: 'requires_new_value',
      valueMoved: 'no',
    })
  }

  return buildDirectMintPayment({
    account: input.account,
    destination: quote.xrplDestination,
    amountDrops: quote.input.value,
    recipient: quote.recipient,
    ...(quote.executor ? { executor: quote.executor } : {}),
    sequence: input.sequence,
    lastLedgerSequence: input.lastLedgerSequence,
    feeDrops: input.feeDrops,
  })
}

export interface AttachXrplPaymentInput {
  xrplTxId: string
  at: number
}

/**
 * The payment has been signed and submitted. The XRPL transaction id becomes
 * the operation's idempotency key: from here on, every recovery is keyed on it
 * and no path can produce a second payment (R10).
 */
export function attachXrplPayment(
  record: DirectMintOperation,
  input: AttachXrplPaymentInput,
): DirectMintOperation {
  // A ready operation has not yet handed anything to the wallet. Signing and
  // submitting are the `executing` step, so walk through it rather than
  // jumping — the transition table is the contract, not an obstacle.
  const signing =
    record.state === 'ready'
      ? applyTransition(record, { to: 'executing', at: input.at }).record
      : record

  const result = applyTransition(signing, {
    to: 'submitted',
    at: input.at,
    evidence: [
      evidence({
        kind: 'xrpl_tx',
        label: 'XRPL payment',
        value: input.xrplTxId,
        observedAt: input.at,
      }),
    ],
  })
  return {
    ...result.record,
    // The payment exists now, so the first step is done and the ledger is
    // working on the second.
    steps: advanceSteps(result.record.steps, { done: 1, current: 'active' }, input.at),
    idempotencyKey: record.idempotencyKey ?? input.xrplTxId,
  }
}

/**
 * Advance the operation to match what the chain says. Idempotent by
 * construction: it derives the target state from observed state rather than
 * from what happened last, so calling it twice with the same reading changes
 * nothing (R-OP-007, R-LIFE-005).
 */
export function reconcileDirectMint(
  record: DirectMintOperation,
  chain: DirectMintChainState,
  now: number,
): DirectMintOperation {
  const plan = planRecovery(chain, now)

  const observed: EvidenceItem[] = []
  if (chain.xrplTxId) {
    observed.push(
      evidence({
        kind: 'xrpl_tx',
        label: 'XRPL payment',
        value: chain.xrplTxId,
        observedAt: now,
      }),
    )
  }

  const result = applyTransition(record, {
    to: plan.state,
    at: now,
    evidence: observed,
    patch: {
      steps: advanceSteps(record.steps, directMintStepProgress(plan.state, chain), now),
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
  })

  return result.record
}
