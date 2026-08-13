'use client'

import { M9_GASLESS_SECTIONS } from '@gallery/m9-gasless-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * GaslessCard's live preview. The states are imported wholesale from the gallery's
 * `m9-gasless` section — compose, the loud one-time approval, ready, approving,
 * signing, the `submitted` relay acceptance whose CONFIRMED leg is still pending,
 * awaiting-relay, `succeeded` from the on-chain read, and the four refusals plus the
 * failed read. Nothing here is re-authored, so the docs cannot drift from the surface.
 */
const GASLESS_CASES = M9_GASLESS_SECTIONS.find((section) => section.id === 'm9-gasless')!.cases

const CODE = `import type { GaslessOperation, GaslessPlanResult } from '@flare-kit/core'
import { useGasless } from '@flare-kit/react'
import { GaslessCard } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

const FXRP = { symbol: 'FTestXRP', address: '0x0b6A…3dc7', decimals: 6 } as const

export function Pay({ op, plan, reconcile }: {
  op: GaslessOperation
  plan: GaslessPlanResult
  reconcile: (op: GaslessOperation) => Promise<GaslessOperation>
}) {
  const { operation } = useGasless({ operation: op, reconcile })
  if (!operation) return null

  return (
    <GaslessCard
      operation={operation}
      sendToken={FXRP}
      planResult={plan}
      amountText="1"
      recipientText="0xA4b0…1Bd9"
      relayerUrl="http://localhost:8788"
      networkLabel="Coston2"
      onSubmit={() => console.log('sign the payment request')}
    />
  )
}`

export function GaslessCardDemo() {
  return <GalleryDemo cases={GASLESS_CASES} code={CODE} />
}
