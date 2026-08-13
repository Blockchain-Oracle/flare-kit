'use client'

import { mockCatalogue } from '@flare-kit/core'
import { useAttestationFamilies } from '@flare-kit/react'
import { MockKitProvider } from './mock-kit-provider'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import { mockCatalogue } from '@flare-kit/core'
import { useAttestationFamilies } from '@flare-kit/react'
import { AttestationCatalogue } from '@flare-kit/react-ui'

function Families() {
  const { catalogue, loading, stale, refresh } = useAttestationFamilies({
    load: async () => mockCatalogue(), // live: loadFamilyCatalogue(...)
  })

  // The catalogue is handed over whole. The rows are reachable only through the
  // observation, so "we could not reach the verifier" cannot be rendered as
  // "the deployment serves nothing".
  return (
    <AttestationCatalogue
      catalogue={catalogue}
      loading={loading}
      stale={stale}
      now={Date.now()}
      onRefresh={refresh}
    />
  )
}`

/**
 * The hook runs for real against the mock catalogue — the readout is its actual
 * return value on this render, not a transcript of one.
 *
 * Each `FamilyRow` also carries the entire family-table row: the summary, the
 * per-network sources, the `bigint` response fields and the consumer sentence.
 * Printing all of that would bury the six fields the hook's own answer turns
 * on, so each row is shown by the fields that identify it. Nothing is added and
 * nothing is renamed.
 */
function Probe() {
  const { catalogue, rows, loading, stale, disagreements, unchecked, error } =
    useAttestationFamilies({ load: async () => mockCatalogue() })

  return (
    <HookReadout
      name="useAttestationFamilies"
      value={{
        loading,
        stale,
        error: error ?? null,
        catalogue: catalogue
          ? {
              status: catalogue.status,
              observedAt: catalogue.observedAt,
              source: catalogue.source,
            }
          : null,
        rows: rows.map((row) => ({
          family: row.family.name,
          status: row.status,
          claimed: row.claimed,
          agreement: row.agreement,
          servedBy: row.servedBy,
        })),
        disagreements: disagreements.map((row) => row.family.name),
        unchecked: unchecked.map((row) => row.family.name),
      }}
    />
  )
}

export function UseAttestationFamiliesDemo() {
  return (
    <Preview code={CODE}>
      <MockKitProvider>
        <Probe />
      </MockKitProvider>
    </Preview>
  )
}
