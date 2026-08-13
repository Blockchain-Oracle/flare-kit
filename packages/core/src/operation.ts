import { type EvidenceItem, mergeEvidence } from './evidence.js'
import { type FlareKitError, type SerializedError, serializeError } from './errors.js'
import type {
  AttemptOutcome,
  AwaitingDescriptor,
  OperationAttempt,
  RecoveryAction,
} from './recovery.js'
import {
  type DurationRange,
  type OperationState,
  type StepActor,
  type StepState,
  canTransition,
  isTerminal,
} from './states.js'

export * from './states.js'
export * from './recovery.js'

export interface OperationStep {
  readonly id: string
  readonly type: string
  readonly actor: StepActor
  readonly state: StepState
  readonly attempts: number
  readonly startedAt?: number
  readonly endedAt?: number
  readonly expectedRange?: DurationRange
  readonly error?: SerializedError
}

export interface OperationRecord<TIntent = unknown, TQuote = unknown, TPlan = unknown> {
  readonly schemaVersion: number
  readonly id: string
  readonly capability: string
  readonly network: number
  readonly idempotencyKey?: string
  readonly intent: TIntent
  readonly quote?: TQuote
  /** R-OP-005: re-quoting links a revision; it never rewrites approved terms. */
  readonly quoteHistory: readonly TQuote[]
  readonly plan?: TPlan
  readonly state: OperationState
  readonly steps: readonly OperationStep[]
  readonly evidence: readonly EvidenceItem[]
  readonly attempts: readonly OperationAttempt[]
  readonly recovery?: readonly RecoveryAction[]
  readonly awaiting?: AwaitingDescriptor
  readonly error?: SerializedError
  readonly createdAt: number
  readonly updatedAt: number
}

function randomId(prefix: string): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes) out += byte.toString(36).padStart(2, '0')
  return `${prefix}_${out.slice(0, 20)}`
}

export interface CreateOperationInput<TIntent> {
  capability: string
  network: number
  intent: TIntent
  now: number
  idempotencyKey?: string
  /** Injectable so the mock kit and tests are deterministic. */
  id?: string
}

export function createOperation<TIntent, TQuote = unknown, TPlan = unknown>(
  input: CreateOperationInput<TIntent>,
): OperationRecord<TIntent, TQuote, TPlan> {
  return {
    schemaVersion: 1,
    // R-OP-002: independent of any transaction hash, because one operation
    // correlates several across XRPL, FDC and Flare.
    id: input.id ?? randomId('op'),
    capability: input.capability,
    network: input.network,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    intent: Object.freeze(input.intent),
    quoteHistory: [],
    state: 'draft',
    steps: [],
    evidence: [],
    attempts: [],
    createdAt: input.now,
    updatedAt: input.now,
  }
}

export interface StepProgress {
  /** How many leading steps are finished. */
  readonly done: number
  /** What the step after those is doing. */
  readonly current: StepState
}

/**
 * Moves the spine to match a reading.
 *
 * The steps existed from the first quote but nothing ever advanced them, so
 * every row rendered `pending` — which the timeline draws as "outcome unknown"
 * — even on a succeeded operation. R11 requires status be carried by shape as
 * well as colour, and a spine that never changes shape carries none.
 *
 * A step never regresses. Protocol readings arrive duplicated, out of order and
 * backfilled (R-LIFE-005), and a later, poorer reading must not walk the spine
 * backwards past evidence we already had.
 */
export function advanceSteps(
  steps: readonly OperationStep[],
  progress: StepProgress,
  at: number,
): OperationStep[] {
  const done = Math.max(0, Math.min(progress.done, steps.length))

  return steps.map((step, index) => {
    if (step.state === 'done') return step

    if (index < done) {
      return { ...step, state: 'done', startedAt: step.startedAt ?? at, endedAt: step.endedAt ?? at }
    }
    if (index > done) return step

    // The current step. `pending` is not a state to stamp a start on: nothing
    // has begun.
    if (progress.current === 'pending') return step
    return {
      ...step,
      state: progress.current,
      startedAt: step.startedAt ?? at,
      ...(progress.current === 'failed' ? { endedAt: step.endedAt ?? at } : {}),
    }
  })
}

export interface OperationPatch<TQuote = unknown, TPlan = unknown> {
  quote?: TQuote
  plan?: TPlan
  steps?: readonly OperationStep[]
  recovery?: readonly RecoveryAction[]
  awaiting?: AwaitingDescriptor
  error?: SerializedError
}

export interface TransitionInput<TQuote = unknown, TPlan = unknown> {
  to: OperationState
  at: number
  evidence?: readonly EvidenceItem[]
  patch?: OperationPatch<TQuote, TPlan>
}

export type TransitionRejection = 'same_state' | 'not_allowed' | 'terminal'

export interface TransitionResult<TIntent = unknown, TQuote = unknown, TPlan = unknown> {
  readonly record: OperationRecord<TIntent, TQuote, TPlan>
  readonly stateChanged: boolean
  readonly rejection?: TransitionRejection
}

function applyPatch<TIntent, TQuote, TPlan>(
  record: OperationRecord<TIntent, TQuote, TPlan>,
  at: number,
  incoming: readonly EvidenceItem[] | undefined,
  patch: OperationPatch<TQuote, TPlan> | undefined,
): OperationRecord<TIntent, TQuote, TPlan> {
  const requoted = patch?.quote !== undefined && record.quote !== undefined
  return {
    ...record,
    ...(patch?.quote !== undefined ? { quote: patch.quote } : {}),
    ...(requoted ? { quoteHistory: [...record.quoteHistory, record.quote as TQuote] } : {}),
    ...(patch?.plan !== undefined ? { plan: patch.plan } : {}),
    ...(patch?.steps !== undefined ? { steps: patch.steps } : {}),
    // Key presence, not value: an absent key means "leave alone", while an
    // explicit `undefined` means "clear". Without that a settled operation
    // keeps claiming it is waiting on somebody.
    ...(patch && 'recovery' in patch ? { recovery: patch.recovery } : {}),
    ...(patch && 'awaiting' in patch ? { awaiting: patch.awaiting } : {}),
    ...(patch?.error !== undefined ? { error: patch.error } : {}),
    evidence: incoming ? mergeEvidence(record.evidence, incoming) : record.evidence,
    updatedAt: Math.max(record.updatedAt, at),
  }
}

/**
 * The one way state moves. A refused move still absorbs the evidence its event
 * carried, so a duplicate, late or backfilled protocol event can never cost us
 * an identifier (R-LIFE-005, AC5).
 */
export function applyTransition<TIntent, TQuote, TPlan>(
  record: OperationRecord<TIntent, TQuote, TPlan>,
  input: TransitionInput<TQuote, TPlan>,
): TransitionResult<TIntent, TQuote, TPlan> {
  const refuse = (rejection: TransitionRejection): TransitionResult<TIntent, TQuote, TPlan> => ({
    record: applyPatch(record, input.at, input.evidence, undefined),
    stateChanged: false,
    rejection,
  })

  if (isTerminal(record.state)) return refuse('terminal')
  if (record.state === input.to) {
    return {
      record: applyPatch(record, input.at, input.evidence, input.patch),
      stateChanged: false,
      rejection: 'same_state',
    }
  }
  if (!canTransition(record.state, input.to)) return refuse('not_allowed')

  return {
    record: { ...applyPatch(record, input.at, input.evidence, input.patch), state: input.to },
    stateChanged: true,
  }
}

export interface EscalateInput {
  at: number
  awaitedActor: StepActor
  reason: string
  expectedRange?: DurationRange
  /** Empty or absent means: no action is safe yet, and we say so. */
  recovery?: readonly RecoveryAction[]
}

/**
 * A wait ran long. R-LIFE-006: this changes observation or escalation state and
 * never invents a protocol failure — structurally, because the only state this
 * function can move to is `action_required`, and only when a safe action exists.
 */
export function escalate<TIntent, TQuote, TPlan>(
  record: OperationRecord<TIntent, TQuote, TPlan>,
  input: EscalateInput,
): TransitionResult<TIntent, TQuote, TPlan> {
  const patch: OperationPatch<TQuote, TPlan> = {
    awaiting: {
      actor: input.awaitedActor,
      reason: input.reason,
      since: input.at,
      ...(input.expectedRange ? { expectedRange: input.expectedRange } : {}),
    },
    ...(input.recovery !== undefined ? { recovery: input.recovery } : {}),
  }
  const stayPut = (): TransitionResult<TIntent, TQuote, TPlan> => ({
    record: applyPatch(record, input.at, undefined, patch),
    stateChanged: false,
  })

  if (isTerminal(record.state) || !input.recovery?.length) return stayPut()
  const moved = applyTransition(record, { to: 'action_required', at: input.at, patch })
  return moved.rejection ? stayPut() : moved
}

export interface AttemptInput {
  at: number
  actionId: string
  reusedEvidence: readonly string[]
  movedNewValue: boolean
  outcome: AttemptOutcome
  error?: FlareKitError
}

/** R-REC-006: recovery appends. The original plan and every attempt survive. */
export function appendAttempt<TIntent, TQuote, TPlan>(
  record: OperationRecord<TIntent, TQuote, TPlan>,
  input: AttemptInput,
): OperationRecord<TIntent, TQuote, TPlan> {
  const attempt: OperationAttempt = {
    id: randomId('att'),
    at: input.at,
    actionId: input.actionId,
    reusedEvidence: [...input.reusedEvidence],
    movedNewValue: input.movedNewValue,
    outcome: input.outcome,
    ...(input.error ? { error: serializeError(input.error) } : {}),
  }
  return {
    ...record,
    attempts: [...record.attempts, attempt],
    updatedAt: Math.max(record.updatedAt, input.at),
  }
}
