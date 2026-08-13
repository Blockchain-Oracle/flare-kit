import { describe, expect, it } from 'vitest'
import { evidence } from '../src/evidence.js'
import { applyTransition, appendAttempt, escalate } from '../src/operation.js'
import { FlareKitError } from '../src/errors.js'
import { advanceTo, op } from './helpers.js'

describe('applyTransition', () => {
  it('advances through a legal transition and stamps updatedAt', () => {
    const result = applyTransition(op(), { to: 'quoting', at: 2_000 })
    expect(result.stateChanged).toBe(true)
    expect(result.record.state).toBe('quoting')
    expect(result.record.updatedAt).toBe(2_000)
  })

  it('never mutates the record it was given', () => {
    const start = op()
    applyTransition(start, { to: 'quoting', at: 2_000 })
    expect(start.state).toBe('draft')
  })

  it('rejects an illegal jump rather than silently allowing it', () => {
    const result = applyTransition(op(), { to: 'succeeded', at: 2_000 })
    expect(result.stateChanged).toBe(false)
    expect(result.rejection).toBe('not_allowed')
    expect(result.record.state).toBe('draft')
  })
})

describe('duplicate and out-of-order delivery (R-LIFE-005)', () => {
  it('treats a repeated event as a no-op, not a second effect', () => {
    const again = applyTransition(advanceTo('submitted'), { to: 'submitted', at: 9_000 })
    expect(again.stateChanged).toBe(false)
    expect(again.rejection).toBe('same_state')
  })

  it('still absorbs evidence carried by a duplicate event', () => {
    const again = applyTransition(advanceTo('submitted'), {
      to: 'submitted',
      at: 9_000,
      evidence: [
        evidence({ kind: 'xrpl_tx', label: 'XRPL payment', value: 'E3FE', observedAt: 9_000 }),
      ],
    })
    expect(again.stateChanged).toBe(false)
    expect(again.record.evidence).toHaveLength(1)
  })

  it('ignores a late event that would walk the operation backwards', () => {
    const late = applyTransition(advanceTo('confirming'), { to: 'executing', at: 500 })
    expect(late.record.state).toBe('confirming')
    expect(late.rejection).toBe('not_allowed')
  })

  it('keeps evidence from a late backwards event even while refusing the move', () => {
    const late = applyTransition(advanceTo('confirming'), {
      to: 'executing',
      at: 500,
      evidence: [
        evidence({ kind: 'xrpl_ledger', label: 'Ledger', value: '4821766', observedAt: 500 }),
      ],
    })
    expect(late.record.evidence.map((e) => e.kind)).toContain('xrpl_ledger')
  })

  it('locks a terminal operation against any further state change', () => {
    const after = applyTransition(advanceTo('succeeded'), { to: 'failed', at: 99_000 })
    expect(after.record.state).toBe('succeeded')
    expect(after.rejection).toBe('terminal')
  })
})

describe('evidence accumulation', () => {
  it('merges rather than replaces, so nothing is lost on reload', () => {
    // AC5: a reload mid-operation resumes with no lost evidence.
    const one = applyTransition(advanceTo('executing'), {
      to: 'submitted',
      at: 3_000,
      evidence: [
        evidence({ kind: 'xrpl_tx', label: 'XRPL payment', value: 'E3FE', observedAt: 3_000 }),
      ],
    }).record
    const two = applyTransition(one, {
      to: 'confirming',
      at: 4_000,
      evidence: [
        evidence({ kind: 'fdc_round', label: 'FDC round', value: '1043912', observedAt: 4_000 }),
      ],
    }).record
    expect(two.evidence.map((e) => e.kind)).toEqual(['xrpl_tx', 'fdc_round'])
  })
})

describe('escalate', () => {
  // R-LIFE-006: a timeout changes observation or escalation state. It must not
  // invent a protocol failure when the canonical outcome remains unknown.
  it('never produces failed, however long the wait has run', () => {
    const escalated = escalate(advanceTo('awaiting_external'), {
      at: 900_000,
      awaitedActor: 'executor',
      reason: 'The executor has not executed the minting.',
    })
    expect(escalated.record.state).not.toBe('failed')
    expect(['awaiting_external', 'action_required']).toContain(escalated.record.state)
  })

  it('records the awaited actor and the reason so the timeline can say them', () => {
    // DESIGN.md: long waits state stage, expected range, awaited actor, safe action.
    const escalated = escalate(advanceTo('awaiting_external'), {
      at: 900_000,
      awaitedActor: 'executor',
      reason: 'The executor has not executed the minting.',
      expectedRange: { minMs: 480_000, maxMs: 900_000 },
    })
    expect(escalated.record.awaiting?.actor).toBe('executor')
    expect(escalated.record.awaiting?.reason).toMatch(/executor/i)
    expect(escalated.record.awaiting?.expectedRange).toEqual({
      minMs: 480_000,
      maxMs: 900_000,
    })
  })

  it('moves to action_required only when a safe action is actually offered', () => {
    const escalated = escalate(advanceTo('awaiting_external'), {
      at: 900_000,
      awaitedActor: 'executor',
      reason: 'x',
      recovery: [
        {
          id: 'execute-minting',
          label: 'Execute the minting',
          effect: 'Completes the mint using the payment and proof you already made.',
          preconditions: [],
          signs: true,
          broadcasts: true,
          movesNewValue: false,
          nextState: 'executing',
        },
      ],
    })
    expect(escalated.record.state).toBe('action_required')
    expect(escalated.record.recovery?.[0]?.movesNewValue).toBe(false)
  })

  it('stays in the honest wait when no safe action exists', () => {
    const escalated = escalate(advanceTo('awaiting_external'), {
      at: 900_000,
      awaitedActor: 'executor',
      reason: 'x',
      recovery: [],
    })
    expect(escalated.record.state).toBe('awaiting_external')
  })
})

describe('appendAttempt', () => {
  // R-OP-008: every retry declares whether it reuses existing evidence or
  // creates a new value-moving action.
  // R-REC-006: recovery appends; the original plan and every attempt are kept.
  it('appends rather than replacing, and declares reuse', () => {
    const once = appendAttempt(advanceTo('action_required'), {
      at: 10_000,
      actionId: 'execute-minting',
      reusedEvidence: ['xrpl_tx', 'fdc_proof'],
      movedNewValue: false,
      outcome: 'submitted',
    })
    const twice = appendAttempt(once, {
      at: 20_000,
      actionId: 'execute-minting',
      reusedEvidence: ['xrpl_tx', 'fdc_proof'],
      movedNewValue: false,
      outcome: 'no_op',
    })
    expect(twice.attempts).toHaveLength(2)
    expect(twice.attempts[0]?.outcome).toBe('submitted')
    expect(twice.attempts.every((a) => a.movedNewValue === false)).toBe(true)
  })

  it('carries the error taxonomy of a failed attempt without ending the operation', () => {
    const next = appendAttempt(advanceTo('action_required'), {
      at: 10_000,
      actionId: 'execute-minting',
      reusedEvidence: ['xrpl_tx'],
      movedNewValue: false,
      outcome: 'failed',
      error: new FlareKitError('FDC_ROUND_NOT_FINALIZED', {
        domain: 'protocol',
        message: 'Round not finalized.',
        recovery: 'wait',
        valueMoved: 'yes',
      }),
    })
    expect(next.state).toBe('action_required')
    expect(next.attempts[0]?.error?.code).toBe('FDC_ROUND_NOT_FINALIZED')
  })
})
