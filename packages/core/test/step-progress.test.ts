import { describe, expect, it } from 'vitest'
import { advanceSteps, type OperationStep } from '../src/operation.js'

// The spine must convey progress through the shape of each step, not only
// through the note beneath it (R11: status conveyed by text and shape as well
// as colour). Every step sat at `pending` forever until this existed, so a
// completed mint rendered five "outcome unknown" markers.

const steps = (): OperationStep[] =>
  ['one', 'two', 'three', 'four'].map((id) => ({
    id,
    type: id,
    actor: 'flare' as const,
    state: 'pending' as const,
    attempts: 0,
  }))

const statesOf = (list: readonly OperationStep[]) => list.map((step) => step.state)

describe('advanceSteps', () => {
  it('marks everything before the current step done', () => {
    expect(statesOf(advanceSteps(steps(), { done: 2, current: 'active' }, 100))).toEqual([
      'done',
      'done',
      'active',
      'pending',
    ])
  })

  it('leaves everything pending at the start', () => {
    expect(statesOf(advanceSteps(steps(), { done: 0, current: 'pending' }, 100))).toEqual([
      'pending',
      'pending',
      'pending',
      'pending',
    ])
  })

  it('marks every step done when the operation completed', () => {
    expect(statesOf(advanceSteps(steps(), { done: 4, current: 'pending' }, 100))).toEqual([
      'done',
      'done',
      'done',
      'done',
    ])
  })

  it('blocks the current step when a person has to act', () => {
    expect(statesOf(advanceSteps(steps(), { done: 1, current: 'blocked' }, 100))).toEqual([
      'done',
      'blocked',
      'pending',
      'pending',
    ])
  })

  it('fails only the step that failed, never the ones already done', () => {
    // A failure late in a journey does not un-happen the payment that landed.
    expect(statesOf(advanceSteps(steps(), { done: 2, current: 'failed' }, 100))).toEqual([
      'done',
      'done',
      'failed',
      'pending',
    ])
  })

  it('never regresses a step that was already done', () => {
    // Readings arrive out of order and backfilled (R-LIFE-005). A late, poorer
    // reading must not walk the spine backwards.
    const ahead = advanceSteps(steps(), { done: 3, current: 'active' }, 100)
    const behind = advanceSteps(ahead, { done: 1, current: 'active' }, 200)
    expect(statesOf(behind).slice(0, 3)).toEqual(['done', 'done', 'done'])
  })

  it('stamps a start time on the step that became active', () => {
    const [, second] = advanceSteps(steps(), { done: 1, current: 'active' }, 5_000)
    expect(second?.startedAt).toBe(5_000)
  })

  it('stamps an end time on steps as they complete', () => {
    const [first] = advanceSteps(steps(), { done: 1, current: 'active' }, 5_000)
    expect(first?.endedAt).toBe(5_000)
  })

  it('keeps the first start time when called again', () => {
    const once = advanceSteps(steps(), { done: 1, current: 'active' }, 5_000)
    const twice = advanceSteps(once, { done: 1, current: 'active' }, 9_000)
    expect(twice[1]?.startedAt).toBe(5_000)
  })

  it('is idempotent for an unchanged reading', () => {
    const once = advanceSteps(steps(), { done: 2, current: 'active' }, 5_000)
    expect(advanceSteps(once, { done: 2, current: 'active' }, 5_000)).toEqual(once)
  })

  it('returns the steps untouched when there are none', () => {
    expect(advanceSteps([], { done: 0, current: 'active' }, 100)).toEqual([])
  })

  it('clamps a done count past the end rather than throwing', () => {
    expect(statesOf(advanceSteps(steps(), { done: 99, current: 'active' }, 100))).toEqual([
      'done',
      'done',
      'done',
      'done',
    ])
  })
})
