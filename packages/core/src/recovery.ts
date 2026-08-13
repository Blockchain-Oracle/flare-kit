import type { SerializedError } from './errors.js'
import type { DurationRange, OperationState, StepActor } from './states.js'

/**
 * What a long wait must be able to say, in DESIGN.md's order: current stage,
 * expected range, awaited actor, safe user action. The safe action is the
 * `RecoveryAction` list below; this type carries the other three.
 */
export interface AwaitingDescriptor {
  readonly actor: StepActor
  readonly reason: string
  readonly since: number
  readonly expectedRange?: DurationRange
  /**
   * The exact moment the wait ends, where the protocol states one — a delay
   * window's allowed-at, or an executor's exclusivity expiry. Absent when the
   * wait has no knowable end, which is a real answer: a countdown we cannot
   * honestly compute is worse than none.
   */
  readonly availableAt?: number
}

/**
 * R-REC-004: every capability publishes a matrix mapping error and state to
 * safe actions. An empty list is a real answer — it means nothing is safe yet,
 * and the surface says so rather than offering a button that could pay twice.
 */
export interface RecoveryAction {
  readonly id: string
  readonly label: string
  /** Plain-language effect, shown before the user commits to it. */
  readonly effect: string
  readonly preconditions: readonly string[]
  readonly signs: boolean
  readonly broadcasts: boolean
  /**
   * The single most important field on this type. False means the action
   * completes the operation from evidence that already exists; true means it
   * creates a new value-moving action and needs explicit renewed consent.
   */
  readonly movesNewValue: boolean
  readonly nextState: OperationState
  /** The protocol's allowed-at time, when one governs the action. */
  readonly availableAt?: number
  readonly expiresAt?: number
  readonly blocked?: { readonly reason: string }
}

/**
 * Whether this action can honestly be offered right now. A button that would
 * revert is not a safe action, so availability is computed rather than assumed
 * — and it is here rather than in the UI because an agent needs the same answer.
 */
export function isAvailable(action: RecoveryAction, now: number): boolean {
  if (action.blocked) return false
  if (action.availableAt !== undefined && now < action.availableAt) return false
  return action.expiresAt === undefined || now < action.expiresAt
}

export function availableActions(
  actions: readonly RecoveryAction[] | undefined,
  now: number,
): readonly RecoveryAction[] {
  return (actions ?? []).filter((action) => isAvailable(action, now))
}

export type AttemptOutcome = 'submitted' | 'succeeded' | 'failed' | 'no_op'

/**
 * R-REC-006: the original plan and every attempt are retained; recovery
 * appends. R-OP-008: each attempt declares what it reused.
 */
export interface OperationAttempt {
  readonly id: string
  readonly at: number
  readonly actionId: string
  readonly reusedEvidence: readonly string[]
  readonly movedNewValue: boolean
  readonly outcome: AttemptOutcome
  readonly error?: SerializedError
}
