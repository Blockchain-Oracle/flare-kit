'use client'

import { SECTIONS } from '@gallery/sections'
import { GalleryDemo } from './gallery-demo'

/**
 * PendingTray's live preview, from the gallery's `sh-10` section — loading,
 * empty, one waiting operation, one that needs a decision, two at once, the
 * this-device-only warning and the restored-from-storage notice.
 */
const TRAY_CASES = SECTIONS.find((section) => section.id === 'sh-10')!.cases

const CODE = `import { createMockKit } from '@flare-kit/core'
import { FlareProvider, usePending } from '@flare-kit/react'
import { PendingTray } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

const kit = createMockKit({ seed: 'demo' })

function Tray() {
  const { pending } = usePending()

  return (
    <PendingTray
      pending={pending}
      now={Date.now()}
      onOpen={(operationId) => console.log('open', operationId)}
    />
  )
}

export function InFlight() {
  return (
    <FlareProvider kit={kit}>
      <Tray />
    </FlareProvider>
  )
}`

export function PendingTrayDemo() {
  return <GalleryDemo cases={TRAY_CASES} code={CODE} />
}
