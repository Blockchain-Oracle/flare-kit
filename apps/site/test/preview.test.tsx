import { createMockKit, type MockScenario } from '@flare-kit/core'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OperationTimelineDemo } from '../components/docs/demos/operation-timeline-demo'
import { Preview } from '../components/docs/preview'

const RECIPIENT = '0xDeaDbeefDeAdbeefdEadbEEFdeadbeEFdEaDbeeF'
const XRPL_ACCOUNT = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

function realStates(scenario: MockScenario): string[] {
  const kit = createMockKit({ seed: `docs-${scenario}`, scenario })
  return kit
    .trace(kit.start({ amountXrp: '25.000000', recipient: RECIPIENT, xrplAccount: XRPL_ACCOUNT }))
    .map((record) => record.state)
}

describe('Preview', () => {
  it('labels the surface as the mock', () => {
    render(<Preview code="const a = 1">stage</Preview>)
    expect(screen.getByText(/mock kit/i)).toBeInTheDocument()
  })

  it('offers both panes, with preview selected first', () => {
    render(<Preview code="const a = 1">stage</Preview>)
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Code' })).toHaveAttribute('aria-selected', 'false')
  })
})

describe('OperationTimelineDemo', () => {
  /**
   * The guard that matters: the state picker must be built from the trace the
   * mock produced. If it ever drifts to a hand-written list, the docs could
   * offer a state the machine never reaches — the exact failure the landing
   * card's throw exists to prevent.
   */
  it('offers exactly the states the mock actually produced', () => {
    render(<OperationTimelineDemo />)
    const selects = screen.getAllByRole('combobox')
    const stateOptions = within(selects[1]!)
      .getAllByRole('option')
      .map((option) => option.textContent?.replace(/^\d+\.\s*/, ''))

    expect(stateOptions).toEqual(realStates('happy'))
  })

  it('never offers a succeeded-looking state the trace does not contain', () => {
    render(<OperationTimelineDemo />)
    const selects = screen.getAllByRole('combobox')
    const stateOptions = within(selects[1]!)
      .getAllByRole('option')
      .map((option) => option.textContent?.replace(/^\d+\.\s*/, ''))

    for (const state of stateOptions) {
      expect(realStates('happy')).toContain(state)
    }
  })
})
