'use client'

import { createMockKit, mockPortfolio } from '@flare-kit/core'
import { FlareProvider, usePortfolio } from '@flare-kit/react'
import { useMemo } from 'react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import { FlareProvider, usePortfolio } from '@flare-kit/react'

function Balances() {
  const { portfolio, loading, stale, error, refresh } = usePortfolio({
    read: myPortfolioReader, // the live reader, or the mock's
  })

  if (loading) return <PortfolioTable loading now={Date.now()} />
  if (error) return <p>The read failed: {error}</p>
  return <PortfolioTable portfolio={portfolio} now={Date.now()} />
}`

/**
 * The hook runs for real against the mock portfolio reader — the readout is
 * its actual return value on this render, not a transcript of one.
 */
function Probe() {
  const { portfolio, loading, stale, conflicts, error } = usePortfolio({
    read: async ({ now }) => mockPortfolio('ready', now),
  })
  return (
    <HookReadout
      name="usePortfolio"
      value={{ loading, stale, error: error ?? null, conflicts, portfolio }}
    />
  )
}

export function UsePortfolioDemo() {
  const kit = useMemo(() => createMockKit({ seed: 'docs-hooks' }), [])
  return (
    <Preview code={CODE}>
      <FlareProvider kit={kit}>
        <Probe />
      </FlareProvider>
    </Preview>
  )
}
