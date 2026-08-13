'use client'

import { createMockKit, mockOperationRecords } from '@flare-kit/core'
import { FlareProvider, useFlareContext } from '@flare-kit/react'
import { type ReactNode, useEffect, useMemo } from 'react'

/**
 * A provider whose operation registry has records in it.
 *
 * `useActivity` and the registry itself both read the provider's registry, and
 * a registry nothing has written to is empty — a true state, but not the one
 * worth documenting. The records are the gallery's own fixtures, written in
 * through `upsert`, which is the same door a reconciler uses. Nothing here
 * bypasses the registry or hands a component a feed it did not build.
 */
export const SEEDED_RECORDS = mockOperationRecords()

function Seed({ children }: { children: ReactNode }) {
  const { registry } = useFlareContext()

  useEffect(() => {
    for (const record of SEEDED_RECORDS) registry.upsert(record)
  }, [registry])

  return <>{children}</>
}

export function SeededRegistry({ children }: { children: ReactNode }) {
  const kit = useMemo(() => createMockKit({ seed: 'docs-hooks' }), [])
  return (
    <FlareProvider kit={kit}>
      <Seed>{children}</Seed>
    </FlareProvider>
  )
}
