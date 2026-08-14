'use client'

import { M12_GOVERNANCE_SECTIONS } from '@gallery/m12-governance-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * GovernanceCard's live preview. The states are imported wholesale from the
 * gallery's `m12-governance` section — the observed blank slate, the composed
 * target, the post-round-trip delegated position, the four plan refusals
 * (mainnet unverified, self-delegation, zero target, nothing to undelegate),
 * both legs in flight, submitted, awaiting, both succeeded read-backs, and the
 * unavailable read. Nothing here is re-authored, so the docs cannot drift from
 * the surface.
 */
const GOVERNANCE_CASES = M12_GOVERNANCE_SECTIONS.find((section) => section.id === 'm12-governance')!.cases

const CODE = `import { createMockGovernanceAdapter } from '@flarekit-dev/core'
import { useGovernance } from '@flarekit-dev/react'
import { GovernanceCard } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

const { client, deployment } = createMockGovernanceAdapter()

export function Governance({ account }) {
  const [targetText, setTargetText] = useState('')
  const { position, eligibility, operation, plan, delegate, undelegate } = useGovernance({
    deployment,
    account,
    publicClient: client,
  })
  const planResult = plan({ kind: 'delegate', to: targetText })

  return (
    <GovernanceCard
      position={position}
      eligibility={eligibility}
      operation={operation}
      planResult={planResult}
      targetText={targetText}
      networkLabel="Coston2"
      onTargetChange={setTargetText}
      onDelegate={() => delegate(targetText)}
      onUndelegate={undelegate}
    />
  )
}`

export function GovernanceCardDemo() {
  return <GalleryDemo cases={GOVERNANCE_CASES} code={CODE} />
}
