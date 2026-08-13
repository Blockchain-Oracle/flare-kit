'use client'

import { M10_CLAIMS_SECTIONS } from '@gallery/m10-claims-sections'
import { M11_STAKING_SECTIONS } from '@gallery/m11-staking-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * ClaimCard's live preview. The states are imported wholesale from the gallery —
 * the `m10-claims` section (the FTSO, rNat and FlareDrop kinds plus the shared
 * lifecycle and the not-verified gate) concatenated with `m11-staking-reward`
 * (the fourth, non-expiring kind), so all four claim kinds are reachable from the
 * one switcher. Nothing here is re-authored, so the docs cannot drift from the
 * surface.
 */
const CLAIM_CASES = [
  ...M10_CLAIMS_SECTIONS.find((section) => section.id === 'm10-claims')!.cases,
  ...M11_STAKING_SECTIONS.find((section) => section.id === 'm11-staking-reward')!.cases,
]

const CODE = `import { useRewards } from '@flarekit-dev/react'
import { ClaimCard } from '@flarekit-dev/react-ui'
import { createMockRewardsAdapter } from '@flarekit-dev/core'
import '@flarekit-dev/react-ui/styles.css'

const adapter = createMockRewardsAdapter()

export function Rewards({ account, nativeToken }) {
  const { reads, ftso, buildPlan, submit } = useRewards({
    account,
    adapter,
    reconcile: (owner) => adapter.read(owner),
  })
  const planResult = buildPlan({ kind: 'ftso-delegation', recipient: account, wrap: false })

  return (
    <ClaimCard
      kind="ftso-delegation"
      reads={reads}
      operation={ftso.operation}
      planResult={planResult}
      recipient={account}
      nativeToken={nativeToken}
      networkLabel="Coston2"
      onSubmit={() => planResult?.kind === 'plan' && submit(planResult.plan)}
    />
  )
}`

export function ClaimCardDemo() {
  return <GalleryDemo cases={CLAIM_CASES} code={CODE} />
}
