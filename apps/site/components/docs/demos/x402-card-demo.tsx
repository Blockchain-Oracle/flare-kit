'use client'

import { M9_X402_SECTIONS } from '@gallery/m9-x402-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * X402Card's live preview. The states are imported wholesale from the gallery's
 * `m9-x402` section — the challenge review, expired, signing, settling, settled +
 * delivered, the settled-but-resource-failed split, rejected, the idempotent
 * duplicate, and the unreachable facilitator. Nothing here is re-authored, so the
 * docs cannot drift from the surface.
 */
const X402_CASES = M9_X402_SECTIONS.find((section) => section.id === 'm9-x402')!.cases

const CODE = `import type { X402Challenge, X402Operation } from '@flarekit-dev/core'
import { useX402 } from '@flarekit-dev/react'
import { X402Card } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

export function Paywall({ op, challenge, reconcile }: {
  op: X402Operation
  challenge: X402Challenge
  reconcile: (op: X402Operation) => Promise<X402Operation>
}) {
  const { operation } = useX402({ operation: op, reconcile })
  if (!operation) return null

  return (
    <X402Card
      operation={operation}
      challenge={challenge}
      amountText="0.1 mUSDT0"
      networkLabel="Coston2"
      onSubmit={() => console.log('sign the EIP-3009 authorization')}
    />
  )
}`

export function X402CardDemo() {
  return <GalleryDemo cases={X402_CASES} code={CODE} />
}
