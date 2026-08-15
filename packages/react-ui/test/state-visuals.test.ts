import { OPERATION_STATES } from '@flarekit-dev/core'
import { describe, expect, it } from 'vitest'
import { GLYPHS, visualFor } from '../src/state-visuals.js'

/**
 * DESIGN.md fixes the glyph vocabulary and requires that state colour is never
 * the first signal: every state pairs its colour with a glyph and a word. This
 * map is the one place that decision is made, so a state cannot read one way in
 * the widget and another in the timeline.
 */

describe('coverage', () => {
  it('gives every canonical state a glyph, a tone and a word', () => {
    for (const state of OPERATION_STATES) {
      const visual = visualFor(state)
      expect(GLYPHS).toContain(visual.glyph)
      expect(visual.word.length).toBeGreaterThan(0)
      expect(visual.tone.length).toBeGreaterThan(0)
    }
  })

  it('uses only the seven glyphs DESIGN.md names', () => {
    expect([...GLYPHS]).toEqual([
      'done',
      'working',
      'waiting',
      'action',
      'partial',
      'failed',
      'unknown',
    ])
  })
})

describe('submitted is never success', () => {
  // R-LIFE-002, and the hardest rule to keep once a designer wants a green tick.
  it('gives submitted its own word, not a success word', () => {
    const visual = visualFor('submitted')
    expect(visual.word).toBe('Submitted')
    expect(visual.word).not.toMatch(/succe|done|complete/i)
  })

  it('reserves the completed glyph and the success tone for succeeded alone', () => {
    for (const state of OPERATION_STATES) {
      if (state === 'succeeded') continue
      expect(visualFor(state).glyph).not.toBe('done')
      expect(visualFor(state).tone).not.toBe('ok')
    }
    expect(visualFor('succeeded').glyph).toBe('done')
    expect(visualFor('succeeded').tone).toBe('ok')
  })

  it('does not dress confirming or partial success up as finished', () => {
    expect(visualFor('confirming').word).not.toMatch(/succe|complete/i)
    expect(visualFor('partially_succeeded').glyph).toBe('partial')
  })
})

describe('an unresolved outcome never reads as failure', () => {
  it('reserves the failed glyph for the one state that means it', () => {
    for (const state of OPERATION_STATES) {
      if (state === 'failed') continue
      expect(visualFor(state).glyph).not.toBe('failed')
    }
    expect(visualFor('failed').glyph).toBe('failed')
  })

  it('shows a wait on an external actor as waiting, not as a problem', () => {
    const visual = visualFor('awaiting_external')
    expect(visual.glyph).toBe('waiting')
    expect(visual.tone).not.toBe('bad')
  })

  it('shows action_required as your action, not as an error', () => {
    const visual = visualFor('action_required')
    expect(visual.glyph).toBe('action')
    expect(visual.tone).not.toBe('bad')
    expect(visual.word).toMatch(/action/i)
  })

  it('shows a cancelled or expired operation without claiming failure', () => {
    expect(visualFor('cancelled').glyph).not.toBe('failed')
    expect(visualFor('expired').glyph).not.toBe('failed')
  })
})

describe('the words are plain', () => {
  it('never leaks a snake_case identifier into the interface', () => {
    for (const state of OPERATION_STATES) {
      expect(visualFor(state).word).not.toMatch(/_/)
    }
  })
})
