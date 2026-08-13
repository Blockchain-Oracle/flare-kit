'use client'

import { type AccountContext, createMockKit } from '@flarekit-dev/core'
import { FlareProvider } from '@flarekit-dev/react'
import { type ReactNode, useMemo } from 'react'

/**
 * The provider every hook demo mounts: one seeded mock kit per demo instance.
 * Extracted because eight demos repeated the same wrapper verbatim.
 */
export function MockKitProvider({
  children,
  initialAccounts,
}: {
  children: ReactNode
  initialAccounts?: Partial<AccountContext>
}) {
  const kit = useMemo(() => createMockKit({ seed: 'docs-hooks' }), [])
  return (
    <FlareProvider kit={kit} initialAccounts={initialAccounts}>
      {children}
    </FlareProvider>
  )
}
