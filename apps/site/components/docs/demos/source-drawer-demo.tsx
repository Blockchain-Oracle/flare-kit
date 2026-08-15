'use client'

import { SECTIONS } from '@gallery/sections'
import { GalleryDemo } from './gallery-demo'

/**
 * SourceDrawer's live preview, from the gallery's `user-03` section — the
 * ordinary case, the canonical/indexed conflict where both claims stay on
 * screen, and the provider that did not answer.
 */
const SOURCE_CASES = SECTIONS.find((section) => section.id === 'user-03')!.cases

const CODE = `import { createMockKit, mockPortfolio, type PortfolioPosition } from '@flarekit-dev/core'
import { FlareProvider, usePortfolio } from '@flarekit-dev/react'
import { SourceDrawer } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

const kit = createMockKit({ seed: 'demo' })

function Sources({ indexed }: { indexed: readonly PortfolioPosition[] }) {
  // conflicts is empty unless a second source was handed over to compare
  // against, because one source cannot disagree with itself.
  const { portfolio, conflicts } = usePortfolio({
    read: async ({ now }) => mockPortfolio('source-conflict', now),
    compareWith: indexed,
  })

  return <SourceDrawer portfolio={portfolio} conflicts={conflicts} now={Date.now()} />
}

export function Provenance({ indexed }: { indexed: readonly PortfolioPosition[] }) {
  return (
    <FlareProvider kit={kit}>
      <Sources indexed={indexed} />
    </FlareProvider>
  )
}`

export function SourceDrawerDemo() {
  return <GalleryDemo cases={SOURCE_CASES} code={CODE} />
}
