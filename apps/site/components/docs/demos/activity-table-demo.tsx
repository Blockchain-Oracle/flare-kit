'use client'

import { SECTIONS } from '@gallery/sections'
import { GalleryDemo } from './gallery-demo'

/**
 * ActivityTable's live preview, from the gallery's `user-02` section — loading,
 * empty, ready, backfilling, partial coverage and the refused export. The
 * gallery's cases are the only fixtures; this file adds none.
 */
const ACTIVITY_CASES = SECTIONS.find((section) => section.id === 'user-02')!.cases

const CODE = `import { createMockKit } from '@flarekit-dev/core'
import { FlareProvider, useActivity } from '@flarekit-dev/react'
import { ActivityTable } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

const kit = createMockKit({ seed: 'demo' })

function History() {
  const { feed, entries, exportError, exportJson } = useActivity()

  return (
    <ActivityTable
      feed={feed}
      entries={entries}
      exportError={exportError}
      onExport={() => exportJson()}
    />
  )
}

export function Activity() {
  return (
    <FlareProvider kit={kit}>
      <History />
    </FlareProvider>
  )
}`

export function ActivityTableDemo() {
  return <GalleryDemo cases={ACTIVITY_CASES} code={CODE} />
}
