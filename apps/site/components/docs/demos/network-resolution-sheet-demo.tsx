'use client'

import { SECTIONS } from '@gallery/sections'
import { GalleryDemo } from './gallery-demo'

/**
 * NetworkResolutionSheet's live preview. The six states are the gallery's own
 * `sh-03` section — the two mismatches the sheet repairs, the two refusals it
 * reports, an unsettled restored session and an expired approval.
 */
const RESOLVE_CASES = SECTIONS.find((section) => section.id === 'sh-03')!.cases

const CODE = `import { useAccounts, useActionBinding } from '@flarekit-dev/react'
import { NetworkResolutionSheet } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

export function Resolve() {
  const { context } = useAccounts()
  const { binding, valid } = useActionBinding()

  // Nothing quoted, or the accounts still match: there is nothing to resolve.
  if (!binding || valid) return null

  return (
    <NetworkResolutionSheet
      binding={binding}
      context={context}
      affected="your quote for 25.000000 XRP"
      onSwitchNetwork={(family) => yourAdapter.switchNetwork(family)}
      onReconnect={(family) => yourAdapter.connect(family)}
    />
  )
}`

export function NetworkResolutionSheetDemo() {
  return <GalleryDemo cases={RESOLVE_CASES} code={CODE} />
}
