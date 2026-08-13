'use client'

import type { Case } from '@gallery/sections'
import { M8_BRIDGE_SECTIONS } from '@gallery/m8-bridge-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * BridgeCard's live preview. One card serves both cross-chain routes, so the
 * switcher walks both gallery sections: `m8-bridge` (Coston2 → Sepolia) and
 * `m8-redeem` (Sepolia FXRP → native XRP). The nodes are the gallery's own; only
 * the switcher label is prefixed, so the reader knows which route a state belongs
 * to without the two sections' cases blurring into one list.
 */
const section = (id: string) => M8_BRIDGE_SECTIONS.find((entry) => entry.id === id)!.cases
const prefix = (label: string, cases: readonly Case[]): Case[] =>
  cases.map((entry) => ({ ...entry, name: `${label} · ${entry.name}` }))

const BRIDGE_CASES: Case[] = [
  ...prefix('bridge', section('m8-bridge')),
  ...prefix('redeem', section('m8-redeem')),
]

const CODE = `import { type BridgeOperation, type BridgeQuote, routeByKey } from '@flare-kit/core'
import { useBridge } from '@flare-kit/react'
import { BridgeCard } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

const route = routeByKey('coston2', 'coston2-sepolia')!

export function Bridge({ operation, quote, reconcile, onSend }: {
  operation: BridgeOperation
  quote?: BridgeQuote
  reconcile: (op: BridgeOperation) => Promise<BridgeOperation>
  onSend: () => void
}) {
  // Delivery lands on the destination chain, so the card is driven by a poll
  // that re-reads it. The source receipt alone concludes nothing.
  const { operation: live } = useBridge({ operation, reconcile })

  return (
    <BridgeCard
      operation={live ?? operation}
      route={route}
      sendToken={route.asset}
      receiveToken={route.asset}
      quote={quote}
      networkLabel="Coston2"
      onSubmit={onSend}
    />
  )
}`

export function BridgeCardDemo() {
  return <GalleryDemo cases={BRIDGE_CASES} code={CODE} />
}
