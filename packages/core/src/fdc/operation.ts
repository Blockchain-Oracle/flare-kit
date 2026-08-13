import type { FamilySource } from '@flare-kit/contracts'
import { type EvidenceItem, evidence } from '../evidence.js'
import {
  type OperationRecord,
  type OperationStep,
  type StepProgress,
  advanceSteps,
  applyTransition,
  createOperation,
} from '../operation.js'
import { type OperationState, type StepActor, pathTo } from '../states.js'

/**
 * The attestation as a durable operation.
 *
 * The analogue of `fassets/direct-mint.ts`: the lifecycle *around* the client
 * rather than the client. It exists because operations are non-blocking and
 * self-reconciling — submitting must not lock the UI, and opening the app must
 * pick a request back up from what the chain says, with no Resume button. That
 * needs a record with evidence, which is also what M3-R7 enumerates.
 */

export interface AttestationIntent {
  readonly familyName: string
  readonly source: FamilySource
  /** The family's own request input, kept verbatim so it can be re-prepared. */
  readonly input: unknown
  /** Bound at request time when the family binds one; otherwise absent. */
  readonly proofOwner?: string
}

export type AttestationOperation = OperationRecord<AttestationIntent, never, never>

/**
 * The spine. `verify` is separate from `retrieve` because a proof that arrives
 * and a proof that verifies are two facts, and separate from `consume` because
 * three of the four families have no deployed consumer — a step that is
 * declared absent is honest; a step that silently never runs is not.
 */
export const ATTESTATION_STEPS = [
  'prepare',
  'submit',
  'finalize',
  'retrieve',
  'verify',
  'consume',
] as const

export type AttestationStepId = (typeof ATTESTATION_STEPS)[number]

const STEP_DETAIL: Record<
  AttestationStepId,
  { readonly actor: StepActor; readonly label: string }
> = {
  prepare: { actor: 'provider', label: 'Canonicalise the request at the verifier' },
  submit: { actor: 'your_wallet', label: 'Submit the request to the FDC' },
  finalize: { actor: 'fdc', label: 'Reach consensus and finalize the voting round' },
  retrieve: { actor: 'provider', label: 'Retrieve the proof from the data availability layer' },
  verify: { actor: 'flare', label: 'Verify the proof on chain' },
  consume: { actor: 'host_app', label: 'Consume the proof' },
}

function initialSteps(hasConsumer: boolean): OperationStep[] {
  return ATTESTATION_STEPS.filter((id) => id !== 'consume' || hasConsumer).map((id) => ({
    id,
    type: STEP_DETAIL[id].label,
    actor: STEP_DETAIL[id].actor,
    state: 'pending',
    attempts: 0,
  }))
}

/**
 * What the protocol has actually shown about this request. Every field is a
 * fact somebody observed, never a guess: a round that has not finalized and a
 * round whose proof we have not asked for are different, and both differ from
 * a round that finalized without this request reaching consensus.
 */
export interface AttestationChainState {
  readonly requestBytes?: string
  readonly submissionTxHash?: string
  readonly votingRoundId?: bigint
  readonly roundFinalized: boolean
  readonly proofAvailable: boolean
  /** The chain's own boolean. `undefined` means verification has not run. */
  readonly verified?: boolean
  readonly consumptionTxHash?: string
  /**
   * Why there is no proof, when there is none. Always an unknown — never a
   * statement that the attested data is false (M3-R10).
   */
  readonly unknownReason?: string
  /** When the round's root is expected, so a wait states its own duration. */
  readonly expectedFinalizedAt?: number
}

export function attestationStepProgress(
  state: OperationState,
  chain: AttestationChainState,
  hasConsumer: boolean,
): StepProgress {
  const total = hasConsumer ? 6 : 5
  if (state === 'succeeded') return { done: total, current: 'pending' }

  // How far the evidence reaches, independent of how the operation is faring.
  const reached = !chain.requestBytes
    ? 0
    : !chain.submissionTxHash
      ? 1
      : !chain.roundFinalized
        ? 2
        : !chain.proofAvailable
          ? 3
          : chain.verified === undefined
            ? 4
            : // A proof that did not verify failed at `verify`. Counting it as
              // done would put the failure marker on `consume` instead, and the
              // spine would read "verified, then consumption failed" — the
              // opposite of what happened, and a step that never ran shown as
              // the one that broke.
              chain.verified === false
              ? 4
              : chain.consumptionTxHash
                ? 6
                : 5

  if (state === 'failed' || state === 'cancelled' || state === 'expired') {
    return { done: reached, current: state === 'failed' ? 'failed' : 'pending' }
  }
  if (state === 'action_required') return { done: reached, current: 'blocked' }
  if (state === 'draft' || state === 'quoting' || state === 'ready') {
    return { done: 0, current: 'pending' }
  }
  return { done: reached, current: 'active' }
}

export interface CreateAttestationInput {
  intent: AttestationIntent
  network: number
  now: number
  /** Whether this family has a deployed consumer; decides the sixth step. */
  hasConsumer: boolean
  id?: string
}

export function createAttestationOperation(input: CreateAttestationInput): AttestationOperation {
  const base = createOperation<AttestationIntent, never, never>({
    capability: 'fdc.attest',
    network: input.network,
    intent: input.intent,
    now: input.now,
    ...(input.id ? { id: input.id } : {}),
  })

  const terms: EvidenceItem[] = [
    evidence({
      kind: 'fdc_request',
      label: 'Attestation type',
      value: input.intent.familyName,
      observedAt: input.now,
    }),
  ]
  if (input.intent.proofOwner) {
    terms.push(
      evidence({
        kind: 'recipient_address',
        label: 'Proof owner',
        value: input.intent.proofOwner,
        observedAt: input.now,
      }),
    )
  }

  const quoted = applyTransition(base, {
    to: 'quoting',
    at: input.now,
    evidence: terms,
    patch: { steps: initialSteps(input.hasConsumer) },
  }).record

  return applyTransition(quoted, { to: 'ready', at: input.now }).record
}

/**
 * Advance the operation to match what the protocol says. Idempotent by
 * construction: the target state is derived from observed state, so calling it
 * twice with the same reading changes nothing.
 */
export function reconcileAttestation(
  record: AttestationOperation,
  chain: AttestationChainState,
  now: number,
): AttestationOperation {
  const hasConsumer = record.steps.some((step) => step.id === 'consume')
  const state = attestationState(chain)

  const observed: EvidenceItem[] = []
  const add = (kind: EvidenceItem['kind'], label: string, value?: string) => {
    if (value) observed.push(evidence({ kind, label, value, observedAt: now }))
  }
  add('fdc_request', 'Request bytes', chain.requestBytes)
  add('flare_tx', 'Request submission', chain.submissionTxHash)
  add('fdc_round', 'Voting round', chain.votingRoundId?.toString())
  add('flare_tx', 'Consumption', chain.consumptionTxHash)

  const patch = {
    steps: advanceSteps(record.steps, attestationStepProgress(state, chain, hasConsumer), now),
    // Always present, so a settled operation stops claiming it waits on
    // somebody. An unknown is a wait on nobody in particular, and says why.
    awaiting: awaitingFor(chain, now),
    // Likewise always present: an unknown offers one honest action, and every
    // other state offers none rather than a stale list.
    recovery: recoveryFor(chain),
  }

  // Walk the transition table rather than jumping across it. One reconcile can
  // legitimately observe several steps at once — a page opened after a reload
  // sees a request that was prepared, submitted and finalized while nobody was
  // watching — and `ready → awaiting_external` is not a legal single hop. A
  // refused transition silently drops the patch with it, so jumping would leave
  // every step pending on exactly the operations that had progressed furthest.
  let current = record
  for (const next of pathTo(record.state, state)) {
    current = applyTransition(current, { to: next, at: now, evidence: observed, patch }).record
  }
  // Same-state reconciles still apply the patch, which is what makes this
  // idempotent: reading twice writes the same steps rather than nothing.
  if (current.state === state) {
    current = applyTransition(current, { to: state, at: now, evidence: observed, patch }).record
  }
  return current
}

// `pathTo` is homed in ../states.js beside the transition table and shared with the
// cross-chain reconcilers (M8) — reuse, not re-code.

function attestationState(chain: AttestationChainState): OperationState {
  if (chain.consumptionTxHash) return 'succeeded'
  // An unknown outcome stops the operation progressing on its own, and saying so
  // is the whole point. Left in `awaiting_external` the surface would show a
  // deadline that has already passed, "nothing for you to do", and "the request
  // can be made again", all at once — three claims that cannot all be true.
  // `action_required` is the honest one: nothing further will happen unless a
  // person decides something. It is still not a failure.
  if (chain.unknownReason && chain.verified === undefined) return 'action_required'
  // The proof exists and the chain accepted it. Not `succeeded`: for the three
  // families with no deployed consumer there is nothing further to do, and for
  // XRPPayment the consumption has not happened yet. Neither is a completed
  // operation, and calling it one would be rendering `submitted` as succeeded.
  if (chain.verified === true) return 'partially_succeeded'
  // The chain said the proof does not verify. A fact about the proof, and the
  // only genuinely terminal outcome here.
  if (chain.verified === false) return 'failed'
  if (!chain.requestBytes) return 'ready'
  if (!chain.submissionTxHash) return 'executing'
  return 'awaiting_external'
}

/**
 * The one action an unknown outcome offers: ask again.
 *
 * It moves new value — a second request pays a second fee — so it is marked as
 * such and needs explicit consent. Nothing is offered in any other state,
 * because there is nothing else a person can safely do to a round in progress.
 */
function recoveryFor(chain: AttestationChainState) {
  if (!chain.unknownReason || chain.verified !== undefined) return undefined
  return [
    {
      id: 'request-again',
      label: 'Make the request again',
      effect:
        'Prepares and submits a fresh attestation request for the same data, in a new voting round. The original request is unaffected; nothing about the underlying transaction has been called into question.',
      preconditions: [],
      signs: true,
      broadcasts: true,
      // A second request pays a second fee. That is new value, and it needs
      // explicit consent rather than a quiet retry.
      movesNewValue: true,
      nextState: 'executing' as const,
    },
  ]
}

function awaitingFor(chain: AttestationChainState, now: number) {
  if (chain.verified !== undefined || chain.consumptionTxHash) return undefined
  if (!chain.submissionTxHash) return undefined
  // An unknown is not a wait. Keeping the descriptor would leave the surface
  // counting down to a deadline that has already passed.
  if (chain.unknownReason) return undefined

  const reason = !chain.roundFinalized
      ? 'The voting round has not finalized yet.'
      : !chain.proofAvailable
        ? 'The round is finalized; the data availability layer has not published the proof yet.'
        : 'Verifying the proof on chain.'

  return {
    actor: 'fdc' as StepActor,
    reason,
    since: now,
    ...(chain.expectedFinalizedAt !== undefined ? { availableAt: chain.expectedFinalizedAt } : {}),
  }
}
