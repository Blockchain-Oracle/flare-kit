'use client'

import { M7_VAULT_SECTIONS } from '@gallery/m7-vault-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * DepositCard's live preview. The states are the gallery's `m7-deposit` section —
 * quote, needs approval, approving, depositing, success, cap exceeded,
 * insufficient balance — each produced by walking the real deposit state machine
 * (`createDeposit → startQuoting → applyDepositQuote`) with the M7 Phase-A
 * observed fixtures. Nothing here is re-authored for the docs.
 */
const DEPOSIT_CASES = M7_VAULT_SECTIONS.find((section) => section.id === 'm7-deposit')!.cases

const CODE = `import { createDeposit, quoteDeposit, createMockVaultAdapter } from '@flarekit-dev/core'
import { DepositCard } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

const adapter = createMockVaultAdapter('upshift-fxrp')

// The host owns the operation and the quote; the card renders them.
export async function loadDeposit(owner: \`0x\${string}\`, now: number) {
  const intent = {
    vaultKey: 'upshift-fxrp',
    assetsIn: 1_000_000n,
    slippageBips: 50,
    recipient: owner,
    deadline: Math.floor(now / 1000) + 1200,
  }
  const operation = createDeposit({ chainId: 114, intent, now })
  const quoteResult = await quoteDeposit(adapter, intent.assetsIn, intent.slippageBips, now)
  return { operation, quoteResult }
}

export function Deposit({ operation, quoteResult, onSubmit }) {
  return (
    <DepositCard
      operation={operation}
      config={adapter.config}
      quoteResult={quoteResult}
      networkLabel="Coston2"
      onSubmit={onSubmit}
    />
  )
}`

export function DepositCardDemo() {
  return <GalleryDemo cases={DEPOSIT_CASES} code={CODE} label="observed fixtures" />
}
