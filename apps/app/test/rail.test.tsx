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

  it('opens with the brand lockup, above the family list', () => {
    render(<Rail currentId="swap" />)
    const home = screen.getByRole('link', { name: /flare-kit home/i })
    const swap = screen.getByRole('link', { name: 'Swap' })
    expect(
      home.compareDocumentPosition(swap) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the lockup sits above the families',
    ).toBeTruthy()
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

  /**
   * Asserted through the description's own element rather than
   * `toHaveAccessibleDescription`, which hung this suite for fifteen minutes
   * computing an accessible description over the rail. The assertions below are
   * stricter anyway: they pin WHY the note is reachable, not just that some
   * description resolved.
   */
  it('marks an unbuilt family as unbuilt, announced rather than drawn', () => {
    render(<Rail currentId="swap" />)
    const chat = screen.getByRole('link', { name: 'Chat' })
    expect(chat).toHaveAttribute('data-unbuilt', 'true')

    const describedBy = chat.getAttribute('aria-describedby')
    expect(describedBy, 'an unbuilt family must describe itself').toBeTruthy()

    const note = document.getElementById(describedBy!)
    expect(note).toHaveTextContent(/not built/i)
    // `hidden` drops the element from the accessibility tree in some user
    // agents, which would make the description invisible to exactly the reader
    // it exists for. The kit's utility keeps it announced.
    expect(note).not.toHaveAttribute('hidden')
    expect(note).toHaveClass('fk-sr')
  })
})
