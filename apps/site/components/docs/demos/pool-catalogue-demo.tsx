'use client'

import { M6_LIQUIDITY_SECTIONS } from '@gallery/m6-liquidity-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * PoolCatalogue's live preview. The section carries one case, because the
 * surface has one state: declared unbuilt. There is no state switcher for the
 * same reason — a switcher over a single case would imply there are others.
 */
const CATALOGUE_CASES = M6_LIQUIDITY_SECTIONS.find(
  (section) => section.id === 'm6-pool-catalogue',
)!.cases

const CODE = `import { PoolCatalogue } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

export function Pools() {
  return <PoolCatalogue networkLabel="Coston2" />
}`

export function PoolCatalogueDemo() {
  return <GalleryDemo cases={CATALOGUE_CASES} code={CODE} label="declared unbuilt" />
}
