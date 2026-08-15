'use client'

import { M1_SECTIONS } from '@gallery/m1-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * RedeemFXRP's live preview. The states come wholesale from the gallery's
 * `m1-redeem` section — loading, empty, the quoted base case with the
 * agent-pays note, the over-balance refusal, an expired quote, and a known
 * balance with nothing entered. Nothing here is re-authored, so the docs
 * cannot drift from the surface.
 */
const REDEEM_CASES = M1_SECTIONS.find((section) => section.id === 'm1-redeem')!.cases

const CODE = `import { createMockKit } from '@flarekit-dev/core'
import { FlareProvider } from '@flarekit-dev/react'
import { RedeemFXRP } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

const kit = createMockKit({ seed: 'demo' })

export function Redeem() {
  return (
    <FlareProvider kit={kit}>
      <RedeemFXRP
        redeemerUnderlyingAddress="rPT1Sjq…bpAYe"
        onSubmit={(lots) => console.log('redeem', lots)}
      />
    </FlareProvider>
  )
}`

export function RedeemFXRPDemo() {
  return <GalleryDemo cases={REDEEM_CASES} code={CODE} />
}
