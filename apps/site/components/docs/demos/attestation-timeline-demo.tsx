'use client'

import { M3_PROOF_SECTIONS } from '@gallery/m3-proof-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * AttestationTimeline's live preview, driven by the gallery's `fdc-03` section.
 * Every case is a reconciled operation record produced by the real state
 * machine, including "finalized, proof not yet published" — the state a live
 * Coston2 run produced on 2026-08-04, and the one a spine must not render as a
 * failure.
 */
const TIMELINE_CASES = M3_PROOF_SECTIONS.find((section) => section.id === 'fdc-03')!.cases

const CODE = `import { useAttestation } from '@flare-kit/react'
import { AttestationTimeline } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

export function Attestation({ operationId }: { operationId: string }) {
  // The provider's interval reconciles the record against the chain; nothing
  // here blocks, and there is no Resume button.
  const { operation } = useAttestation({ read: readChainState, operationId })
  if (!operation) return null

  return (
    <AttestationTimeline
      operation={operation}
      reading={reading}
      now={Date.now()}
      unknownReason={unknownReason}
    />
  )
}`

export function AttestationTimelineDemo() {
  return <GalleryDemo cases={TIMELINE_CASES} code={CODE} />
}
