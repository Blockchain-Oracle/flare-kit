'use client'

import { M12_GOVERNANCE_SECTIONS } from '@gallery/m12-governance-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * ProposalCatalogue's live preview. The states come from the gallery's
 * `m12-proposals` section — the discovery read in flight, the one real mainnet
 * proposal, Coston2's confirmed-empty read, the failed read, and a failed
 * refresh over rows still held. The four availability outcomes stay four here
 * for the same reason they do in the component.
 */
const PROPOSAL_CASES = M12_GOVERNANCE_SECTIONS.find((section) => section.id === 'm12-proposals')!.cases

const CODE = `import { createMockGovernanceAdapter } from '@flarekit-dev/core'
import { useProposals } from '@flarekit-dev/react'
import { ProposalCatalogue } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

// Proposals are read from Flare mainnet — Coston2 hosts none.
const { client, deployment } = createMockGovernanceAdapter({}, 'flare')

export function Proposals({ account, onOpen }) {
  const { proposals, loading, error } = useProposals({
    readDeployment: deployment,
    publicClient: client,
    account,
  })

  return (
    <ProposalCatalogue
      proposals={proposals}
      loading={loading}
      error={error}
      networkLabel="Flare mainnet"
      onSelect={(id, source) => onOpen(id, source)}
    />
  )
}`

export function ProposalCatalogueDemo() {
  return <GalleryDemo cases={PROPOSAL_CASES} code={CODE} />
}
