import { type OperationState, applyTransition, createOperation } from '../src/operation.js'

const INTENT = { amount: '250', asset: 'XRP' } as const

export function op(overrides: { idempotencyKey?: string } = {}) {
  return createOperation({
    capability: 'fassets.directMint',
    network: 114,
    intent: INTENT,
    now: 1_000,
    ...overrides,
  })
}

const PATHS: Partial<Record<OperationState, readonly OperationState[]>> = {
  quoting: ['quoting'],
  ready: ['quoting', 'ready'],
  executing: ['quoting', 'ready', 'executing'],
  submitted: ['quoting', 'ready', 'executing', 'submitted'],
  confirming: ['quoting', 'ready', 'executing', 'submitted', 'confirming'],
  awaiting_external: ['quoting', 'ready', 'executing', 'submitted', 'awaiting_external'],
  action_required: ['quoting', 'ready', 'executing', 'submitted', 'action_required'],
  succeeded: ['quoting', 'ready', 'executing', 'submitted', 'confirming', 'succeeded'],
}

/** Walks a fresh operation forward through legal transitions only. */
export function advanceTo(target: OperationState) {
  const steps = PATHS[target]
  if (!steps) throw new Error(`no test path to ${target}`)
  let record = op()
  let at = 1_000
  for (const to of steps) {
    at += 1_000
    const result = applyTransition(record, { to, at })
    if (result.rejection) throw new Error(`test path illegal: ${record.state} -> ${to}`)
    record = result.record
  }
  return record
}
