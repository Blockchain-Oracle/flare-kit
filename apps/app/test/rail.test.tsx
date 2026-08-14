import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Rail } from '../components/rail'
import { FAMILIES } from '../lib/families'

describe('the rail', () => {
  it('lists every family, so navigation cannot drift from the registry', () => {
    render(<Rail currentId="swap" />)
    const nav = screen.getByRole('navigation', { name: /capabilities/i })
    for (const family of FAMILIES) {
      expect(within(nav).getByRole('link', { name: family.label })).toBeInTheDocument()
    }
  })

  it('marks the current family for assistive technology, not by colour alone', () => {
    render(<Rail currentId="swap" />)
    expect(screen.getByRole('link', { name: 'Swap' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows an unbuilt family rather than hiding it', () => {
    render(<Rail currentId="swap" />)
    expect(screen.getByRole('link', { name: 'Chat' })).toBeInTheDocument()
  })

  /**
   * R-APP-001: the families, and BELOW A DIVIDER, the reserved seams. Without
   * the rule the seams read as ordinary capabilities sitting between Pools and
   * Vaults, which is the opposite of declaring them unbuilt.
   */
  it('puts a divider between the capability families and the reserved seams', () => {
    render(<Rail currentId="swap" />)
    const nav = screen.getByRole('navigation', { name: /capabilities/i })
    const divider = within(nav).getByRole('separator')

    const isBelowDivider = (label: string) =>
      Boolean(
        divider.compareDocumentPosition(within(nav).getByRole('link', { name: label })) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      )

    for (const family of FAMILIES) {
      const below = family.status.kind === 'unbuilt'
      expect(isBelowDivider(family.label), `${family.label} sits on the wrong side`).toBe(below)
    }
  })

  it('marks an unbuilt family as unbuilt in its accessible name', () => {
    render(<Rail currentId="swap" />)
    const chat = screen.getByRole('link', { name: 'Chat' })
    expect(chat).toHaveAttribute('data-unbuilt', 'true')
    expect(chat).toHaveAccessibleDescription(/not built/i)
  })
})
