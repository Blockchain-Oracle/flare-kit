'use client'

import { MOCK_GOVERNANCE_OBSERVED as OBSERVED, createMockGovernanceAdapter } from '@flarekit-dev/core'
import { useGovernance } from '@flarekit-dev/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import { createMockGovernanceAdapter } from '@flarekit-dev/core'
import { useGovernance } from '@flarekit-dev/react'
import { GovernanceCard } from '@flarekit-dev/react-ui'

// live: { client: publicClient, deployment: governanceFor('coston2') }
const { client, deployment } = createMockGovernanceAdapter()

export function Governance({ account, walletClient, target }) {
  const { position, eligibility, operation, plan, delegate, undelegate } = useGovernance({
    deployment,
    account,
    publicClient: client, // keyless: the VP, delegate and eligibility reads
    walletClient,         // the ONLY signing seam; absent = read and plan only
  })
  const planResult = plan({ kind: 'delegate', to: target }) // undefined until the read lands

  return (
    <GovernanceCard
      position={position}
      eligibility={eligibility}
      operation={operation}
      planResult={planResult}
      targetText={target}
      onDelegate={() => delegate(target)}
      onUndelegate={undelegate}
    />
  )
}`

/**
 * The mock pairs a labelled fake client with the REAL Coston2 deployment, so
 * `governanceVerified` is exactly what the live round trip left it — the mock never
 * assigns that flag and so can never make an unverified network look signable. Module
 * scope: the poll effect keys on the client's identity.
 */
const { client, deployment } = createMockGovernanceAdapter()

/**
 * The hook runs for real against the mock client, and this page has no wallet — which is
 * what makes the readout worth reading. `canWrite` is `false` and `operation` is
 * `undefined` because nothing was ever signed here; the position is the observed blank
 * slate (`0n` votes, the zero-address delegate) rather than a fabricated holding; and
 * `eligibility.isMember` is `undefined` because `PollingFtso.isMember` reverts for a
 * non-member — never coerced to `false`.
 *
 * `undefined` is passed through rather than mapped to `null`: the pane writes a TypeScript
 * literal, so it can say `undefined`, and in this kit "not read" and "read as empty" are
 * different claims that must not share a representation.
 */
function Probe() {
  const { reads, eligibility, position, operation, isSettled, canWrite, error, plan } = useGovernance({
    deployment,
    account: OBSERVED.signer,
    publicClient: client,
  })
  return (
    <HookReadout
      name="useGovernance"
      returnType="UseGovernanceResult"
      value={{
        reads,
        eligibility,
        position,
        operation,
        isSettled,
        canWrite,
        error,
        'plan({ kind: "delegate", to })': plan({ kind: 'delegate', to: OBSERVED.delegateTarget }),
        'plan({ kind: "undelegate" })': plan({ kind: 'undelegate' }),
      }}
    />
  )
}

export function UseGovernanceDemo() {
  return (
    <Preview code={CODE}>
      <Probe />
    </Preview>
  )
}
