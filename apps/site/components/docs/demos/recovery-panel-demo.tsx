'use client'

import { M1_SECTIONS } from '@gallery/m1-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * RecoveryPanel's live preview. The states come wholesale from the gallery's
 * `m1-recovery` section — an offered action, an in-flight operation with no
 * safe action yet, the duplicate-value danger case, and a recovery whose
 * window has closed. Nothing here is re-authored, so the docs cannot drift
 * from the surface.
 */
const RECOVERY_CASES = M1_SECTIONS.find((section) => section.id === 'm1-recovery')!.cases

const CODE = `import { useOperation } from '@flarekit-dev/react'
import { RecoveryPanel } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

export function Recovery({ id }: { id: string }) {
  const operation = useOperation(id)
  if (!operation) return null

  return (
    <RecoveryPanel
      operation={operation}
      nowMs={Date.now()}
      onAction={(actionId) => console.log('recover', actionId)}
    />
  )
}`

export function RecoveryPanelDemo() {
  return <GalleryDemo cases={RECOVERY_CASES} code={CODE} />
}
