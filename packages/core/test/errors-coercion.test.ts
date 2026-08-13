import { describe, expect, it } from 'vitest'
import { FlareKitError, narratesFailure, toSerializedError } from '../src/errors.js'

/**
 * Any surface may be handed something thrown from anywhere. It still has to
 * render an honest state, so coercion into the taxonomy has to be total — and
 * it must never upgrade an unknown into a proven failure.
 */

describe('toSerializedError', () => {
  it('passes a typed error through with its taxonomy intact', () => {
    const wire = toSerializedError(
      new FlareKitError('QUOTE_NOT_PROCEEDABLE', {
        domain: 'input',
        message: 'blocked',
        recovery: 'terminal',
        valueMoved: 'no',
      }),
    )
    expect(wire.code).toBe('QUOTE_NOT_PROCEEDABLE')
    expect(wire.recovery).toBe('terminal')
    expect(wire.valueMoved).toBe('no')
  })

  it('coerces a plain Error without claiming to know the outcome', () => {
    const wire = toSerializedError(new Error('socket hang up'))
    expect(wire.message).toBe('socket hang up')
    expect(wire.valueMoved).toBe('unknown')
    expect(wire.recovery).toBe('unsafe_no_action')
  })

  it('coerces a thrown non-Error rather than exploding', () => {
    expect(toSerializedError('boom').message).toMatch(/unexpected/i)
    expect(toSerializedError(undefined).valueMoved).toBe('unknown')
  })

  it('never produces something a surface would render as failed', () => {
    // An unknown outcome is never rendered as failed (CLAUDE.md).
    for (const thrown of [new Error('x'), 'x', undefined, { weird: true }]) {
      expect(narratesFailure(toSerializedError(thrown))).toBe(false)
    }
  })

  it('does not leak a non-Error cause into the wire form', () => {
    const wire = toSerializedError({ privateKey: '0xdeadbeef' })
    expect(JSON.stringify(wire)).not.toContain('deadbeef')
  })
})
