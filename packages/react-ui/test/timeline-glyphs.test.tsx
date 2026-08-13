import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { type MockScenario, createMockKit } from '@flarekit-dev/core'
import { OperationTimeline } from '../src/OperationTimeline.js'

// R11: status is conveyed by text and shape as well as colour.
//
// Every step glyph was `unknown` in every state — including `succeeded` — for
// the whole of M1, because `steps` was created at quote time and never
// advanced. The timeline tests asserted words and the accessibility test
// asserted chip text, so nothing ever looked at a glyph. These do.

const INTENT = {
  amountXrp: '25.000000',
  recipient: '0xDeaDbeefDeAdbeefdEadbEEFdeadbeEFdEaDbeeF',
  xrplAccount: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
}

function trace(scenario?: MockScenario) {
  const kit = createMockKit({ seed: 'glyphs', ...(scenario ? { scenario } : {}) })
  return kit.trace(kit.start(INTENT))
}

/** The glyph modifier on each step marker, in spine order. */
function glyphs(operation: Parameters<typeof OperationTimeline>[0]['operation']): string[] {
  const { container } = render(<OperationTimeline operation={operation} />)
  return [...container.querySelectorAll('.fk-spine > li .fk-g')].map(
    (node) => node.className.replace('fk-g ', '').replace('fk-g-', ''),
  )
}

const happy = trace()
const at = (state: string) => happy.find((record) => record.state === state)

describe('the spine shows progress through shape', () => {
  it('renders a marker for every step', () => {
    expect(glyphs(happy[happy.length - 1]!)).toHaveLength(5)
  })

  it('shows nothing started before the payment is sent', () => {
    const ready = at('ready')
    if (ready) expect(new Set(glyphs(ready))).toEqual(new Set(['unknown']))
  })

  it('marks the payment done and the ledger working once submitted', () => {
    const submitted = at('submitted')
    expect(submitted).toBeDefined()
    expect(glyphs(submitted!).slice(0, 2)).toEqual(['done', 'working'])
  })

  it('advances to the Data Connector once the ledger has confirmed', () => {
    const waiting = at('awaiting_external')
    expect(waiting).toBeDefined()
    expect(glyphs(waiting!).slice(0, 3)).toEqual(['done', 'done', 'working'])
  })

  it('marks every step done when the mint succeeded', () => {
    // The one that mattered: a completed mint used to render five "outcome
    // unknown" markers.
    const succeeded = at('succeeded')
    expect(succeeded).toBeDefined()
    expect(glyphs(succeeded!)).toEqual(['done', 'done', 'done', 'done', 'done'])
    expect(glyphs(succeeded!)).not.toContain('unknown')
  })

  it('marks the awaited step as needing action, not as failed', () => {
    // An executor that has not run is a wait with a safe action, never a
    // failure — the glyph has to say so too.
    const late = trace('executor-late').find((record) => record.state === 'action_required')
    expect(late).toBeDefined()
    const shown = glyphs(late!)
    expect(shown).toContain('action')
    expect(shown).not.toContain('failed')
  })

  it('never regresses a completed step as the operation advances', () => {
    let seen = 0
    for (const record of happy) {
      const done = glyphs(record).filter((glyph) => glyph === 'done').length
      expect(done).toBeGreaterThanOrEqual(seen)
      seen = done
    }
  })
})
