import type { EvidenceItem } from '@flare-kit/core'
import { CopyButton } from './CopyButton.js'
import { ExplorerLink } from './ExplorerLink.js'

/**
 * The evidence chip. One anatomy everywhere: mono type label, truncated
 * identifier, copy control revealing the full value.
 *
 * The identifier and the copy control are the shared atoms — `ExplorerLink`
 * links it to its explorer (or degrades to plain text where none indexes it)
 * and `CopyButton` reveals the whole value. Truncation is display only; the
 * full value is always on the title and the copy. An identifier a user cannot
 * retrieve is not evidence.
 */

/** Addresses truncate first-6/last-4; everything else is a hash-shaped id. */
const ADDRESS_KINDS = new Set([
  'xrpl_destination',
  'recipient_address',
  'executor_address',
  'agent_vault',
])

export interface EvidenceChipProps {
  item: EvidenceItem
  className?: string
}

export function EvidenceChip({ item, className }: EvidenceChipProps) {
  return (
    <span className={`fk-ev${className ? ` ${className}` : ''}`} data-kind={item.kind}>
      <span className="fk-ev-label">{item.label}</span>
      <ExplorerLink
        value={item.value}
        href={item.href}
        shorten={ADDRESS_KINDS.has(item.kind) ? 'address' : 'hash'}
        className="fk-ev-value"
      />
      <CopyButton value={item.value} label={item.label} />
    </span>
  )
}
