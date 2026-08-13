import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SegmentedTabs } from '../src/primitives/SegmentedTabs.js'

/**
 * The one new shared primitive (M5-R10): the Swap/Limit control. Its load-bearing
 * job is the declared-unbuilt tab — a mode the kit cannot act on yet is shown,
 * disabled and reasoned, never faked into looking available (M5-R6, CLAUDE.md's
 * "ship it declared unbuilt rather than built badly").
 */

const ORDER_TABS = [
  { id: 'swap', label: 'Swap' },
  {
    id: 'limit',
    label: 'Limit',
    disabled: true,
    reason: 'No limit-order venue is wired; Uniswap V2 has no native limit order.',
  },
] as const

describe('SegmentedTabs', () => {
  it('renders one tab per entry in a tablist named for the group', () => {
    render(<SegmentedTabs tabs={ORDER_TABS} value="swap" label="Order type" />)
    expect(screen.getByRole('tablist', { name: 'Order type' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })

  it('marks only the active tab selected', () => {
    render(<SegmentedTabs tabs={ORDER_TABS} value="swap" label="Order type" />)
    expect(screen.getByRole('tab', { name: 'Swap' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Limit/ })).toHaveAttribute('aria-selected', 'false')
  })

  it('reports the chosen id when an enabled, inactive tab is clicked', () => {
    const onChange = vi.fn()
    render(
      <SegmentedTabs
        tabs={[
          { id: 'swap', label: 'Swap' },
          { id: 'buy', label: 'Buy' },
        ]}
        value="swap"
        label="Order type"
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Buy' }))
    expect(onChange).toHaveBeenCalledWith('buy')
  })

  it('disables a declared-unbuilt tab, ignores its clicks, and shows its reason', () => {
    const onChange = vi.fn()
    render(<SegmentedTabs tabs={ORDER_TABS} value="swap" label="Order type" onChange={onChange} />)
    const limit = screen.getByRole('tab', { name: /Limit/ })
    expect(limit).toBeDisabled()
    fireEvent.click(limit)
    expect(onChange).not.toHaveBeenCalled()
    // "Reasoned" is text on screen, and it is associated with the tab for a
    // screen reader — not a colour or a cursor a keyboard user cannot perceive.
    const reason = screen.getByText(/no native limit order/i)
    expect(reason).toBeInTheDocument()
    expect(reason.id).toBeTruthy()
    expect(limit).toHaveAttribute('aria-describedby', reason.id)
  })
})
