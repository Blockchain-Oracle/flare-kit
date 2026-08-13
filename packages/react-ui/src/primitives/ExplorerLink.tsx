import { truncateAddress, truncateHash } from '@flare-kit/core'

/**
 * The one link anatomy: a shortened identifier that opens its explorer, with a
 * trailing external glyph. Neutral, never accent-coloured, and it dims on hover
 * rather than underlining.
 *
 * With no `href` it renders the same shortened value as plain text — an
 * identifier no explorer indexes (a voting round, a Merkle proof, an address on
 * a chain with no indexer) is still a real value a person reads and copies, so
 * the atom never disables and never shows an error. The whole value is always
 * on the `title`, so truncation is display only.
 */

export interface ExplorerLinkProps {
  /** The full identifier. Always the title; never itself truncated in the data. */
  value: string
  /** The explorer URL, when one indexes this identifier. Absent → plain text. */
  href?: string
  /** Addresses shorten first-6/last-4; hashes show a longer head/tail. */
  shorten?: 'address' | 'hash'
  /** Applied to the element that carries the value, so a chip can reuse it. */
  className?: string
}

export function ExplorerLink({ value, href, shorten = 'hash', className }: ExplorerLinkProps) {
  const shown = shorten === 'address' ? truncateAddress(value) : truncateHash(value)
  const cls = `fk-xl${className ? ` ${className}` : ''}`

  if (href) {
    // The visible text is truncated and the glyph is decorative, so the
    // accessible name carries the whole value and warns of the new tab
    // (WCAG 2.4.4 / G201) rather than announcing a context-free "0xabc…".
    return (
      <a
        className={`${cls} fk-xl-link`}
        href={href}
        title={value}
        aria-label={`${value}, opens in a new tab`}
        target="_blank"
        rel="noreferrer"
      >
        {shown}
        <span className="fk-i fk-i-external" aria-hidden="true" />
      </a>
    )
  }

  return (
    <span className={cls} title={value}>
      {shown}
    </span>
  )
}
