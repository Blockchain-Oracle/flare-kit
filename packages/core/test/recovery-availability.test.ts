import { describe, expect, it } from 'vitest'
import { type RecoveryAction, availableActions, isAvailable } from '../src/recovery.js'

/**
 * A recovery action that would revert is not a safe action. Availability is
 * computed from the protocol's own constraints so a surface never offers a
 * button that cannot work — and so an agent gets the same answer as a person.
 */

const ACTION: RecoveryAction = {
  id: 'execute-direct-minting',
  label: 'Complete the mint',
  effect: 'Uses the payment you already made.',
  preconditions: [],
  signs: true,
  broadcasts: true,
  movesNewValue: false,
  nextState: 'executing',
}

const NOW = 1_780_000_000_000

describe('isAvailable', () => {
  it('offers an unconstrained action', () => {
    expect(isAvailable(ACTION, NOW)).toBe(true)
  })

  it('withholds an action before its allowed-at', () => {
    expect(isAvailable({ ...ACTION, availableAt: NOW + 1 }, NOW)).toBe(false)
  })

  it('offers it the moment allowed-at is reached', () => {
    expect(isAvailable({ ...ACTION, availableAt: NOW }, NOW)).toBe(true)
  })

  it('withholds an expired action', () => {
    expect(isAvailable({ ...ACTION, expiresAt: NOW }, NOW)).toBe(false)
    expect(isAvailable({ ...ACTION, expiresAt: NOW + 1 }, NOW)).toBe(true)
  })

  it('withholds an explicitly blocked action whatever the clock says', () => {
    const blocked = { ...ACTION, blocked: { reason: 'The executor still holds exclusivity.' } }
    expect(isAvailable(blocked, NOW)).toBe(false)
    expect(isAvailable({ ...blocked, availableAt: NOW - 1_000 }, NOW)).toBe(false)
  })
})

describe('availableActions', () => {
  it('returns an empty list rather than throwing when there are none', () => {
    expect(availableActions(undefined, NOW)).toEqual([])
    expect(availableActions([], NOW)).toEqual([])
  })

  it('filters to only what can honestly be offered', () => {
    const offered = availableActions(
      [ACTION, { ...ACTION, id: 'later', availableAt: NOW + 60_000 }],
      NOW,
    )
    expect(offered.map((a) => a.id)).toEqual(['execute-direct-minting'])
  })

  it('never invents an action that was not in the matrix', () => {
    expect(availableActions([{ ...ACTION, availableAt: NOW + 1 }], NOW)).toEqual([])
  })
})
