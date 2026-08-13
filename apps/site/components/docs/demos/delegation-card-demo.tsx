'use client'

import { M10_DELEGATION_SECTIONS } from '@gallery/m10-delegation-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * DelegationCard's live preview. The states are imported wholesale from the
 * gallery's `m10-delegation` section — the observed position, the honest empty,
 * needs-wrap, the wrap and delegate legs in flight, submitted, awaiting,
 * succeeded, the unavailable read, and the four refusals (two providers, Σ over
 * 10000 bips, mode conflict, not verified). Nothing here is re-authored, so the
 * docs cannot drift from the surface.
 */
const DELEGATION_CASES = M10_DELEGATION_SECTIONS.find((section) => section.id === 'm10-delegation')!.cases

const CODE = `import { useDelegation } from '@flare-kit/react'
import { DelegationCard } from '@flare-kit/react-ui'
import { createMockDelegationAdapter } from '@flare-kit/core'
import '@flare-kit/react-ui/styles.css'

const adapter = createMockDelegationAdapter()

export function Delegate({ account, nativeToken, wrappedToken }) {
  const [providers, setProviders] = useState([{ to: '', bips: 10000 }])
  const { position, operation, buildPlan, submit } = useDelegation({
    account,
    adapter,
    operation: undefined,
    reconcile: (owner) => adapter.read(owner),
  })
  const planResult = buildPlan({ kind: 'delegate', targets: providers })

  return (
    <DelegationCard
      position={position}
      operation={operation}
      planResult={planResult}
      providers={providers}
      nativeToken={nativeToken}
      wrappedToken={wrappedToken}
      networkLabel="Coston2"
      onProviderChange={(index, patch) =>
        setProviders((rows) => rows.map((row, n) => (n === index ? { ...row, ...patch } : row)))
      }
      onSubmit={() => planResult?.kind === 'plan' && submit(planResult.plan)}
    />
  )
}`

export function DelegationCardDemo() {
  return <GalleryDemo cases={DELEGATION_CASES} code={CODE} />
}
