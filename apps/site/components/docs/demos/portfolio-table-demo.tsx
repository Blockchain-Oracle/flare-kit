'use client'

import { SECTIONS } from '@gallery/sections'
import { GalleryDemo } from './gallery-demo'

/**
 * PortfolioTable's live preview. The states come wholesale from the gallery's
 * `user-01` section — loading, then one case per `MOCK_PORTFOLIO_SCENARIOS`
 * entry, including the unavailable read that must never render as zero (AC4).
 * Nothing here is re-authored, so the docs cannot drift from the surface.
 */
const PORTFOLIO_CASES = SECTIONS.find((section) => section.id === 'user-01')!.cases

const CODE = `import { createMockKit, mockPortfolio } from '@flarekit-dev/core'
import { FlareProvider, usePortfolio } from '@flarekit-dev/react'
import { PortfolioTable } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

const kit = createMockKit({ seed: 'demo' })

function Balances() {
  const { portfolio, loading, conflicts } = usePortfolio({
    read: async ({ now }) => mockPortfolio('ready', now),
  })

  return (
    <PortfolioTable
      portfolio={portfolio}
      loading={loading}
      now={Date.now()}
      hasConflict={conflicts.length > 0}
      onOpenSources={() => console.log('open the source drawer')}
    />
  )
}

export function Holdings() {
  return (
    <FlareProvider kit={kit}>
      <Balances />
    </FlareProvider>
  )
}`

export function PortfolioTableDemo() {
  return <GalleryDemo cases={PORTFOLIO_CASES} code={CODE} />
}
