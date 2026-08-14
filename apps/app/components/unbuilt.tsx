'use client'

// The react-ui barrel re-exports @flarekit-dev/react, which builds a
// createContext, so importing any kit component into a Server Component fails
// the build. Every file in apps/site that imports react-ui is a client
// component for this reason; this one follows. The props stay plain data.
import { DetailRow, Details, Note, Panel, ToneChip } from '@flarekit-dev/react-ui'
import type { Family } from '../lib/families'

/**
 * A reserved seam, stated. It names the capability, says it is not built, and
 * names the milestone that owns it — and it renders NO preview, because a
 * fabricated preview of an unbuilt capability is the same lie as a fabricated
 * balance.
 *
 * Every piece here is the kit's: the panel, the chip, the note and the detail
 * row. A hand-rolled section-and-paragraphs version of this drifts from every
 * other surface the moment the kit's chrome changes.
 *
 * The chip is a `ToneChip` without a glyph, not a `StateChip`. The seven glyphs
 * are an operation-outcome vocabulary, and "not built" is a label about the
 * software, not a claim about how an operation went.
 */
export function Unbuilt({ family }: { family: Family }) {
  if (family.status.kind !== 'unbuilt') return null
  return (
    <Panel
      title={family.label}
      className="app-unbuilt"
      aside={<ToneChip tone="neutral">Not built yet</ToneChip>}
      data-unbuilt="true"
    >
      <Note tone="info" title="What it will do">
        {family.status.will}
      </Note>
      <Details>
        <DetailRow label="Owned by" value={family.status.milestone} />
      </Details>
    </Panel>
  )
}
