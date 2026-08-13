'use client'

import { M7_VAULT_SECTIONS } from '@gallery/m7-vault-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * WithdrawCard's live preview. The states are the gallery's `m7-withdraw`
 * section — the whole request → wait → claim lifecycle plus the instant route —
 * each produced by walking the real withdraw state machine with the M7 Phase-A
 * observed fixtures. The waiting case uses a fixed `now`, so its countdown is
 * deterministic rather than wall-clock.
 */
const WITHDRAW_CASES = M7_VAULT_SECTIONS.find((section) => section.id === 'm7-withdraw')!.cases

const CODE = `import { createMockVaultAdapter, readVaultPosition } from '@flare-kit/core'
import { WithdrawCard } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

const adapter = createMockVaultAdapter('upshift-fxrp')

// Read on open — the position is reconciled against the chain, not remembered.
export const loadPosition = (owner: \`0x\${string}\`) => readVaultPosition(adapter, owner)

export function Withdraw({ positionResult, nowSeconds, onSubmit }) {
  return (
    <WithdrawCard
      config={adapter.config}
      positionResult={positionResult}
      fees={{ instant: 50, delayed: 25 }}
      route="delayed"
      percent={100}
      now={nowSeconds}
      networkLabel="Coston2"
      onSubmit={onSubmit}
    />
  )
}`

export function WithdrawCardDemo() {
  return <GalleryDemo cases={WITHDRAW_CASES} code={CODE} label="observed fixtures" />
}
