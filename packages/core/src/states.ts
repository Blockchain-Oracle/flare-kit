/**
 * The canonical lifecycle. Every surface — widget, hook, headless client and
 * agent — reports exactly these identifiers (R-LIFE-001).
 */
export const OPERATION_STATES = [
  'draft',
  'discovering',
  'quoting',
  'awaiting_input',
  'awaiting_approval',
  'ready',
  'executing',
  'submitted',
  'confirming',
  'awaiting_external',
  'action_required',
  'partially_succeeded',
  'succeeded',
  'failed',
  'cancelled',
  'expired',
] as const

export type OperationState = (typeof OPERATION_STATES)[number]

/** Who owns a pending step (R-OP-004). The UI turns these into proper nouns. */
export type StepActor =
  | 'you'
  | 'your_wallet'
  | 'host_app'
  | 'xrpl'
  | 'fdc'
  | 'flare'
  | 'executor'
  | 'agent'
  | 'relayer'
  | 'provider'
  | 'policy'
  | 'operator'

export type StepState = 'pending' | 'active' | 'blocked' | 'done' | 'skipped' | 'failed'

export interface DurationRange {
  readonly minMs: number
  readonly maxMs: number
}

const TRANSITIONS: Record<OperationState, readonly OperationState[]> = {
  draft: ['discovering', 'quoting', 'awaiting_input', 'failed', 'cancelled', 'expired'],
  discovering: ['quoting', 'awaiting_input', 'failed', 'cancelled', 'expired'],
  quoting: ['ready', 'awaiting_approval', 'awaiting_input', 'failed', 'cancelled', 'expired'],
  awaiting_input: ['quoting', 'ready', 'awaiting_approval', 'failed', 'cancelled', 'expired'],
  awaiting_approval: ['ready', 'quoting', 'cancelled', 'expired'],
  ready: ['executing', 'quoting', 'cancelled', 'expired'],
  executing: [
    'submitted',
    'awaiting_external',
    'action_required',
    'failed',
    'cancelled',
    'expired',
  ],
  submitted: [
    'confirming',
    'awaiting_external',
    'action_required',
    'partially_succeeded',
    'succeeded',
    'failed',
  ],
  confirming: [
    'awaiting_external',
    'action_required',
    'partially_succeeded',
    'succeeded',
    'failed',
  ],
  awaiting_external: [
    'executing',
    'confirming',
    'action_required',
    'partially_succeeded',
    'succeeded',
    'failed',
    'expired',
  ],
  action_required: [
    'executing',
    'confirming',
    'awaiting_external',
    'partially_succeeded',
    'succeeded',
    'failed',
    'cancelled',
    'expired',
  ],
  partially_succeeded: [
    'executing',
    'awaiting_external',
    'action_required',
    'succeeded',
    'failed',
  ],
  succeeded: [],
  failed: [],
  cancelled: [],
  // A quote that expired is re-quotable. Only value-final states are dead ends.
  expired: ['quoting', 'cancelled'],
}

const TERMINAL: ReadonlySet<OperationState> = new Set(['succeeded', 'failed', 'cancelled'])

export function isTerminal(state: OperationState): boolean {
  return TERMINAL.has(state)
}

/** R-LIFE-002: `submitted` is never success. Only `succeeded` is. */
export function isSuccess(state: OperationState): boolean {
  return state === 'succeeded'
}

export function canTransition(from: OperationState, to: OperationState): boolean {
  return TRANSITIONS[from].includes(to)
}

/**
 * The shortest legal sequence of states from `from` to `to`, excluding `from`.
 *
 * Breadth-first over the transition table, so a reconciler that observes several
 * steps at once (a page opened after everything happened) enters the intermediate
 * states rather than jumping — `applyTransition` silently drops a patch on an
 * illegal hop, so a jump would strand every step. Returns an empty path when the
 * target is unreachable, which leaves the record where it is. Homed here beside the
 * table so the FDC and cross-chain reconcilers share one walker (R: reuse, not re-code).
 */
export function pathTo(from: OperationState, to: OperationState): OperationState[] {
  if (from === to) return []
  const queue: OperationState[][] = [[from]]
  const seen = new Set<OperationState>([from])
  while (queue.length > 0) {
    const path = queue.shift()!
    const tail = path[path.length - 1]!
    for (const next of OPERATION_STATES) {
      if (seen.has(next) || !canTransition(tail, next)) continue
      if (next === to) return [...path.slice(1), next]
      seen.add(next)
      queue.push([...path, next])
    }
  }
  return []
}
