'use client'

import type { ActivityFilter } from '@flare-kit/core'
import { useActivity } from '@flare-kit/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'
import { SeededRegistry } from './seed-registry'

/**
 * Hoisted rather than written inline: the filtered view is memoised on the
 * filter's identity, and a fresh object every render would re-filter every
 * render for no change in content.
 */
const REDEMPTIONS: ActivityFilter = { capability: 'fassets.redeem' }

const CODE = `import { FlareProvider, useActivity } from '@flare-kit/react'
import { ActivityTable } from '@flare-kit/react-ui'

function History() {
  const { feed, entries, empty, filteredEmpty, exportError, exportJson } =
    useActivity({ filter: { capability: 'fassets.redeem' } })

  // \`feed.entries\` stays the unfiltered truth, so "no history" and "the
  // filter hid everything" are answered separately.
  if (empty) return <p>No operations have been started here yet.</p>

  return (
    <ActivityTable
      feed={feed}
      entries={entries}
      exportError={exportError}
      onExport={() => exportJson()}
    />
  )
}`

/**
 * The hook runs for real against the provider's registry — the readout is its
 * actual return value on this render. The registry holds three operations and
 * the filter names one capability, which is why `entries` is shorter than
 * `feed.entries` while `filteredEmpty` stays false.
 */
function Probe() {
  const { feed, entries, empty, filteredEmpty, exportError } = useActivity({
    filter: REDEMPTIONS,
  })

  return (
    <HookReadout
      name="useActivity"
      value={{
        empty,
        filteredEmpty,
        exportError: exportError ?? null,
        'feed.entries.length': feed.entries.length,
        'feed.backfilling': feed.backfilling,
        'feed.coverage': feed.coverage,
        entries,
      }}
    />
  )
}

export function UseActivityDemo() {
  return (
    <Preview code={CODE}>
      <SeededRegistry>
        <Probe />
      </SeededRegistry>
    </Preview>
  )
}
