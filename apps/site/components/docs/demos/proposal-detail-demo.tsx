'use client'

import { M12_GOVERNANCE_SECTIONS } from '@gallery/m12-governance-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * ProposalDetail's live preview. The states come from the gallery's
 * `m12-proposal-detail` section — the one real mainnet proposal at full
 * precision, the failed detail read, and a proposal opened before any read
 * landed. The carried-vote copy in every case is core's own `planCastVote`
 * refusal string, never a re-authored apology.
 */
const DETAIL_CASES = M12_GOVERNANCE_SECTIONS.find((section) => section.id === 'm12-proposal-detail')!.cases

const CODE = `import { createMockGovernanceAdapter, planCastVote } from '@flarekit-dev/core'
import { useGovernance, useProposals } from '@flarekit-dev/react'
import { ProposalDetail } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

const { client, deployment } = createMockGovernanceAdapter({}, 'flare')

export function Proposal({ account, id, source }) {
  const { proposals, detailOf } = useProposals({
    readDeployment: deployment,
    publicClient: client,
    account,
  })
  const { reads } = useGovernance({ deployment, account, publicClient: client })
  const summary = proposals?.find((p) => p.id === id && p.source === source)
  if (!summary || !reads) return null

  return (
    <ProposalDetail
      detail={detailOf(id, source)}
      networkLabel="Flare mainnet"
      carriedVoteReason={planCastVote({ proposal: summary, reads }).error.reason}
    />
  )
}`

export function ProposalDetailDemo() {
  return <GalleryDemo cases={DETAIL_CASES} code={CODE} />
}
