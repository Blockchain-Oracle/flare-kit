'use client'

import { type DirectMintIntent, createMockKit } from '@flare-kit/core'
import { FlareProvider, useDirectMint, useOperation } from '@flare-kit/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import { useOperation } from '@flare-kit/react'
import { OperationTimeline } from '@flare-kit/react-ui'

function Operation({ id }: { id: string }) {
  // A read of the registry. It subscribes; it does not advance anything.
  const operation = useOperation(id)

  if (!operation) return <p>No operation with that id on this device.</p>
  return <OperationTimeline operation={operation} />
}`

const INTENT: DirectMintIntent = {
  amountXrp: '25.000000',
  recipient: '0xDeaDbeefDeAdbeefdEadbEEFdeadbeEFdEaDbeeF',
  xrplAccount: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
}

/**
 * `useOperation` reads; it never writes. So the demo needs a record to exist
 * before there is anything to show: `useDirectMint` starts one against the mock
 * kit, which needs no wallet and no key, and the provider's interval reconciles
 * it on the mock's simulated clock. Everything in the readout below came from
 * the registry through `useOperation` — including the states it passes through
 * while you watch.
 */
function Probe() {
  const { start } = useDirectMint()
  const [id, setId] = useState<string | undefined>(undefined)
  const started = useRef(false)

  useEffect(() => {
    // `start` is re-created whenever the account binding is, so the guard is
    // what keeps this to exactly one operation rather than one per render.
    if (started.current) return
    started.current = true
    setId(start(INTENT)?.id)
  }, [start])

  const operation = useOperation(id)

  return (
    <HookReadout
      name="useOperation"
      value={
        operation
          ? {
              id: operation.id,
              capability: operation.capability,
              network: operation.network,
              state: operation.state,
              steps: operation.steps,
              evidence: operation.evidence,
              createdAt: operation.createdAt,
              updatedAt: operation.updatedAt,
            }
          : undefined
      }
    />
  )
}

export function UseOperationDemo() {
  const kit = useMemo(() => createMockKit({ seed: 'docs-hooks' }), [])
  return (
    <Preview code={CODE}>
      <FlareProvider kit={kit}>
        <Probe />
      </FlareProvider>
    </Preview>
  )
}
