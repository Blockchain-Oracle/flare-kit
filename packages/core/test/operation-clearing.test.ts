import { describe, expect, it } from 'vitest'
import { applyTransition } from '../src/operation.js'
import { advanceTo } from './helpers.js'

/**
 * Found by the live redemption on 2026-08-04: at `succeeded` the record still
 * carried `awaiting: { actor: 'agent' }`, because the reconcilers set the
 * descriptor and never cleared it.
 *
 * A settled operation that still claims to be waiting on somebody is wrong on a
 * timeline, and "clear it" needs to be expressible — an absent key in a patch
 * means "leave alone", so there has to be a way to say "remove".
 */

const NOW = 1_780_000_000_000

describe('clearing awaiting and recovery', () => {
  const waiting = () =>
    applyTransition(advanceTo('submitted'), {
      to: 'awaiting_external',
      at: NOW,
      patch: {
        awaiting: { actor: 'agent', reason: 'waiting on the agent', since: NOW },
        recovery: [
          {
            id: 'x',
            label: 'x',
            effect: 'x',
            preconditions: [],
            signs: true,
            broadcasts: true,
            movesNewValue: false,
            nextState: 'executing',
          },
        ],
      },
    }).record

  it('keeps them when a patch does not mention them', () => {
    const next = applyTransition(waiting(), { to: 'confirming', at: NOW + 1 }).record
    expect(next.awaiting?.actor).toBe('agent')
    expect(next.recovery).toHaveLength(1)
  })

  it('clears awaiting when a patch sets it to undefined', () => {
    const next = applyTransition(waiting(), {
      to: 'succeeded',
      at: NOW + 1,
      patch: { awaiting: undefined },
    }).record
    expect(next.state).toBe('succeeded')
    expect(next.awaiting).toBeUndefined()
  })

  it('clears recovery the same way', () => {
    const next = applyTransition(waiting(), {
      to: 'succeeded',
      at: NOW + 1,
      patch: { awaiting: undefined, recovery: undefined },
    }).record
    expect(next.recovery).toBeUndefined()
  })

  it('a settled operation never claims to be waiting on anyone', () => {
    const settled = applyTransition(waiting(), {
      to: 'succeeded',
      at: NOW + 1,
      patch: { awaiting: undefined, recovery: undefined },
    }).record
    expect(settled.state).toBe('succeeded')
    expect(settled.awaiting).toBeUndefined()
    expect(settled.recovery ?? []).toEqual([])
  })
})
