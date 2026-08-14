'use client'

import { MOCK_GOVERNANCE_OBSERVED as OBSERVED, createMockGovernanceAdapter } from '@flarekit-dev/core'
import { useProposals } from '@flarekit-dev/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import { createMockGovernanceAdapter } from '@flarekit-dev/core'
import { useProposals } from '@flarekit-dev/react'
import { ProposalCatalogue } from '@flarekit-dev/react-ui'

// Proposals are read from Flare MAINNET — Coston2 hosts none.
// live: { client: publicClient, deployment: governanceFor('flare') }
const { client, deployment } = createMockGovernanceAdapter({}, 'flare')

export function Proposals({ account, onOpen }) {
  const { proposals, loading, error } = useProposals({
    readDeployment: deployment,
    publicClient: client, // keyless throughout: nothing here signs
    account,
  })

  return (
    <ProposalCatalogue
      proposals={proposals} // undefined = pending or failed; [] = confirmed-empty
      loading={loading}
      error={error}
      networkLabel="Flare mainnet"
      onSelect={onOpen}
    />
  )
}`

/**
 * Flare mainnet, because that is where the one real proposal lives — the same mock on
 * `coston2` discovers nothing, which is the confirmed-empty read, not a failure. Module
 * scope: the read effect keys on the client's and deployment's identity, and a value
 * rebuilt each render would re-read on each render.
 */
const { client, deployment } = createMockGovernanceAdapter({}, 'flare')

/**
 * The hook runs for real against the mock client. What the readout shows is the whole
 * distinction the hook exists to keep: `proposals` is an ARRAY here because the discovery
 * read genuinely succeeded and found FTSO proposal 1. Had it failed, `proposals` would be
 * `undefined` with `error` set — never `[]`, which is reserved for a read that succeeded
 * and found none.
 *
 * `detailOf` answers only for a proposal that was actually discovered, so it is shown
 * alongside: an id nobody read stays `undefined` forever rather than resolving to a
 * fabricated tally.
 */
function Probe() {
  const { proposals, loading, error, detailOf } = useProposals({
    readDeployment: deployment,
    publicClient: client,
    account: OBSERVED.signer,
  })
  return (
    <HookReadout
      name="useProposals"
      returnType="UseProposalsResult"
      value={{
        proposals,
        loading,
        error,
        'detailOf(1n, "ftso")': detailOf(OBSERVED.proposal.id, 'ftso'),
      }}
    />
  )
}

export function UseProposalsDemo() {
  return (
    <Preview code={CODE}>
      <Probe />
    </Preview>
  )
}
