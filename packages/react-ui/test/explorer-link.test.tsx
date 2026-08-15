import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { truncateAddress, truncateHash } from '@flarekit-dev/core'
import { ExplorerLink } from '../src/primitives/ExplorerLink.js'

/**
 * ExplorerLink is the one link anatomy: a shortened identifier that links to
 * its explorer with a trailing external glyph, and degrades to plain text when
 * no explorer indexes it. It never disables and never shows an error — an
 * identifier no explorer covers is still a real value a person can read and
 * copy, so the worst it does is stop being a link.
 */

const HASH = '0xabc1234567890def1234567890abcdef1234567890abcdef1234567890abcd12'
const ADDRESS = '0xAbC0000000000000000000000000000000001234'
const HREF = `https://coston2-explorer.flare.network/tx/${HASH}`

describe('ExplorerLink', () => {
  it('links to the explorer with a trailing external glyph when a URL is known', () => {
    const { container } = render(<ExplorerLink value={HASH} href={HREF} />)

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', HREF)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
    // Truncation is display only — the whole value is always retrievable.
    expect(link).toHaveAttribute('title', HASH)
    expect(link).toHaveTextContent(truncateHash(HASH))
    expect(container.querySelector('.fk-i-external')).not.toBeNull()
  })

  it('gives a screen reader the whole value and warns that it opens a new tab', () => {
    // The visible text is truncated and the external glyph is aria-hidden, so
    // without this the accessible name is a meaningless "0xabc…12" that opens a
    // window with no warning (WCAG 2.4.4 / G201).
    render(<ExplorerLink value={HASH} href={HREF} />)
    const link = screen.getByRole('link', { name: /opens in a new tab/i })
    expect(link.getAttribute('aria-label')).toContain(HASH)
  })

  it('degrades to plain text — no link, no icon, no error — when no explorer covers it', () => {
    const { container } = render(<ExplorerLink value={HASH} />)

    // Not a link, not a disabled control, not an error: just the value.
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.querySelector('.fk-i-external')).toBeNull()
    const shown = screen.getByText(truncateHash(HASH))
    expect(shown).toHaveAttribute('title', HASH)
  })

  it('shortens an address first-6/last-4 rather than hash-shaped', () => {
    render(<ExplorerLink value={ADDRESS} href={HREF} shorten="address" />)
    const link = screen.getByRole('link')
    expect(link).toHaveTextContent(truncateAddress(ADDRESS))
    expect(link).toHaveAttribute('title', ADDRESS)
  })

  it('passes its class onto the element that carries the full value, so a chip can reuse it', () => {
    // EvidenceChip delegates its value slot to ExplorerLink and needs the
    // `.fk-ev-value` hook (with the title) to stay on that element.
    const { container } = render(
      <ExplorerLink value={HASH} className="fk-ev-value" />,
    )
    const valued = container.querySelector('.fk-ev-value')
    expect(valued).not.toBeNull()
    expect(valued).toHaveAttribute('title', HASH)
  })
})
