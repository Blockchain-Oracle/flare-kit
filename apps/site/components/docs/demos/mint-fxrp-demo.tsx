'use client'

import { M1_SECTIONS } from '@gallery/m1-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * MintFXRP's live preview. The states are imported wholesale from the gallery's
 * `m1-mint` section — loading, empty, quoted, the below-minimum refusal (AC7),
 * insufficient balance, the large-mint delay, executor named, quote expired.
 * Nothing here is re-authored, so the docs cannot drift from the surface.
 */
const MINT_CASES = M1_SECTIONS.find((section) => section.id === 'm1-mint')!.cases

const CODE = `import { createMockKit } from '@flare-kit/core'
import { FlareProvider } from '@flare-kit/react'
import { MintFXRP } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

const kit = createMockKit({ seed: 'demo' })

export function Mint() {
  return (
    <FlareProvider kit={kit}>
      <MintFXRP
        recipient="0xDeaD…beEF"
        xrplAccount="rPT1Sjq…bpAYe"
        onSubmit={(amountXrp) => console.log('mint', amountXrp)}
      />
    </FlareProvider>
  )
}`

export function MintFXRPDemo() {
  return <GalleryDemo cases={MINT_CASES} code={CODE} />
}
