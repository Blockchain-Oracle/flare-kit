'use client'

import { openOperations, useFlareContext } from '@flarekit-dev/react'
import { useSyncExternalStore } from 'react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'
import { SeededRegistry } from './seed-registry'

const CODE = `import { openOperations, useFlareContext } from '@flarekit-dev/react'
import { useSyncExternalStore } from 'react'

function OpenCount() {
  const { registry } = useFlareContext()

  // \`snapshot\` returns the same array until something changes, which is what
  // useSyncExternalStore needs to avoid tearing under concurrent rendering.
  const records = useSyncExternalStore(
    registry.subscribe,
    registry.snapshot,
    registry.snapshot,
  )

  return <span>{openOperations(records).length} open</span>
}`

/**
 * The registry runs for real under the provider — the readout is what
 * `snapshot()` holds on this render, after three records were written in
 * through `upsert`. The records themselves are long, so the pane summarises
 * each to the fields the registry itself keys on; nothing is invented and
 * nothing is reordered.
 */
function Probe() {
  const { registry } = useFlareContext()
  const records = useSyncExternalStore(
    registry.subscribe,
    registry.snapshot,
    registry.snapshot,
  )

  return (
    <HookReadout
      name="registry"
      value={{
        'snapshot().length': records.length,
        'snapshot(), each record summarised': records.map((record) => ({
          id: record.id,
          capability: record.capability,
          state: record.state,
          network: record.network,
          updatedAt: record.updatedAt,
        })),
        'openOperations(snapshot())': openOperations(records).map((record) => record.id),
        'get("op_mock_1")?.state': registry.get('op_mock_1')?.state ?? null,
      }}
    />
  )
}

export function OperationStoreDemo() {
  return (
    <Preview code={CODE}>
      <SeededRegistry>
        <Probe />
      </SeededRegistry>
    </Preview>
  )
}
