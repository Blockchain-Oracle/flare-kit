'use client'

import type { Case } from '@gallery/sections'
import { useId, useState } from 'react'
import { Preview } from '../preview'

/**
 * The one component every component page's live preview is built on.
 *
 * It does not author fixtures. It renders the gallery's own cases — the exact
 * mounted nodes at `packages/react-ui/gallery/*` — behind a state switcher. That
 * is R6: one set of fixtures, one source of truth. The gallery's cases are
 * already browser-verified, so a docs page cannot show a state the surface never
 * actually reached, and the two can never drift because there is only one copy.
 *
 * The `code` string is documentation of the public API — how you call the
 * component in your own app. It is deliberately not a dump of a fixture's test
 * props: the live pane is the real state, the code pane is the entry point, and
 * the state switcher makes the difference legible (the same pattern the
 * OperationTimeline page established).
 */
export function GalleryDemo({
  cases,
  code,
  label,
}: {
  cases: readonly Case[]
  code: string
  label?: string
}) {
  const [index, setIndex] = useState(0)
  const selectId = useId()
  const current = cases[Math.min(index, cases.length - 1)]!

  return (
    <Preview code={code} label={label}>
      {cases.length > 1 && (
        <div className="demo-controls">
          <label className="demo-control" htmlFor={selectId}>
            <span className="eyebrow">State</span>
            <select
              id={selectId}
              value={Math.min(index, cases.length - 1)}
              onChange={(event) => setIndex(Number(event.target.value))}
            >
              {cases.map((entry, position) => (
                <option key={entry.name} value={position}>
                  {position + 1}. {entry.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {current.node}
    </Preview>
  )
}
