import { M1_SECTIONS } from '@gallery/m1-sections'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OperationTimelineDemo } from '../components/docs/demos/operation-timeline-demo'
import { Preview } from '../components/docs/preview'

/**
 * The gallery is the single source of fixtures (R6). Importing it here is
 * itself a guard: m1-sections derives every case from the mock's own trace and
 * throws at import time if a state it names was never produced.
 */
const TIMELINE_CASES = M1_SECTIONS.find((section) => section.id === 'm1-timeline')!.cases

describe('Preview', () => {
  it('labels the surface as the mock', () => {
    render(<Preview code="const a = 1">stage</Preview>)
    expect(screen.getByText(/mock kit/i)).toBeInTheDocument()
  })

  /**
   * The M13 composers are wider than any column this layout gives — measured at
   * a 1728px viewport with the widened shell, `InstructionComposer` needs 1291px
   * against a 1106px column. The stage had `overflow-x: visible`, so the part
   * that did not fit was simply unreachable: not scrolled, not clipped with an
   * affordance, just gone.
   *
   * DESIGN.md's rule is that the PAGE never scrolls horizontally, and the
   * sanctioned answer is a container that scrolls itself. The code window next
   * to it already does exactly this, including the focusability an
   * axe-scrollable-region-focusable pass requires — a region a mouse can scroll
   * and a keyboard cannot reach is not reachable.
   */
  it('lets a component wider than the column scroll, and a keyboard reach it', () => {
    render(<Preview code="const a = 1">stage</Preview>)
    expect(screen.getByRole('tabpanel', { name: 'Preview' })).toHaveAttribute('tabindex', '0')
  })

  it('offers both panes, with preview selected first', () => {
    render(<Preview code="const a = 1">stage</Preview>)
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Code' })).toHaveAttribute('aria-selected', 'false')
  })
})

describe('OperationTimelineDemo', () => {
  /**
   * The guard that matters: the state switcher must be built from the
   * gallery's cases, one for one. If it ever drifts to a hand-written list,
   * the docs could offer a state the machine never reaches — the exact
   * failure the gallery's own loud `at()` throw exists to prevent.
   */
  it('offers exactly the gallery cases, never an authored list', () => {
    render(<OperationTimelineDemo />)
    const options = within(screen.getByRole('combobox'))
      .getAllByRole('option')
      .map((option) => option.textContent?.replace(/^\d+\.\s*/, ''))

    expect(options).toEqual(TIMELINE_CASES.map((entry) => entry.name))
  })

  it('switching states swaps the rendered record', () => {
    render(<OperationTimelineDemo />)
    const target = TIMELINE_CASES.findIndex((entry) => entry.name.startsWith('action required'))
    expect(target).toBeGreaterThan(-1)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: String(target) } })
    expect(screen.getByRole('status')).toHaveTextContent(/action required/i)
  })
})
