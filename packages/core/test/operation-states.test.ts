import { describe, expect, it } from 'vitest'
import { OPERATION_STATES, canTransition, isSuccess, isTerminal } from '../src/operation.js'
import { op } from './helpers.js'

describe('canonical states', () => {
  // R-LIFE-001: widgets, hooks, headless clients and agents expose the same
  // canonical state identifiers. This list is the contract.
  it('is exactly the sixteen states the accepted spec defines', () => {
    expect([...OPERATION_STATES]).toEqual([
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
    ])
  })

  it('treats only succeeded as success — submitted is never success', () => {
    // R-LIFE-002
    expect(isSuccess('succeeded')).toBe(true)
    expect(isSuccess('submitted')).toBe(false)
    expect(isSuccess('confirming')).toBe(false)
    expect(isSuccess('partially_succeeded')).toBe(false)
  })

  it('treats an unresolved wait as non-terminal, so it is never read as failed', () => {
    expect(isTerminal('awaiting_external')).toBe(false)
    expect(isTerminal('action_required')).toBe(false)
    expect(isTerminal('partially_succeeded')).toBe(false)
    expect(isTerminal('succeeded')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
  })

  it('lets an expired quote be re-quoted rather than dead-ending', () => {
    expect(isTerminal('expired')).toBe(false)
    expect(canTransition('expired', 'quoting')).toBe(true)
  })

  it('offers no transition at all out of a terminal state', () => {
    for (const to of OPERATION_STATES) {
      expect(canTransition('succeeded', to)).toBe(false)
      expect(canTransition('failed', to)).toBe(false)
      expect(canTransition('cancelled', to)).toBe(false)
    }
  })
})

describe('createOperation', () => {
  it('starts in draft with a schema version and timestamps', () => {
    const record = op()
    expect(record.state).toBe('draft')
    expect(record.schemaVersion).toBe(1)
    expect(record.createdAt).toBe(1_000)
    expect(record.updatedAt).toBe(1_000)
    expect(record.capability).toBe('fassets.directMint')
    expect(record.network).toBe(114)
  })

  it('mints an id independent of any transaction hash', () => {
    // R-OP-002: an operation correlates many hashes; it is identified by none.
    const a = op()
    const b = op()
    expect(a.id).not.toBe(b.id)
    expect(a.id).toMatch(/^op_[0-9a-z]{16,}$/)
  })

  it('carries an application-supplied idempotency key when given one', () => {
    // R-OP-003
    expect(op({ idempotencyKey: 'checkout-7781' }).idempotencyKey).toBe('checkout-7781')
  })

  it('freezes the intent, so the approved terms cannot be rewritten', () => {
    // R-OP-005
    expect(Object.isFrozen(op().intent)).toBe(true)
  })

  it('starts with empty evidence and no attempts', () => {
    const record = op()
    expect(record.evidence).toEqual([])
    expect(record.attempts).toEqual([])
  })
})
