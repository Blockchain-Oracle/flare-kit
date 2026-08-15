'use client'

import { M3_SECTIONS } from '@gallery/m3-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * AttestationCatalogue's live preview. The states come wholesale from the
 * gallery's `fdc-01` section — loading, the full family list, the table/verifier
 * disagreement, an unreachable group, no current list at all, and a list past
 * its freshness budget. Nothing is re-authored here, so the docs cannot show a
 * catalogue state the surface never actually reached.
 */
const CATALOGUE_CASES = M3_SECTIONS.find((section) => section.id === 'fdc-01')!.cases

const CODE = `import { mockCatalogue } from '@flarekit-dev/core'
import { useAttestationFamilies } from '@flarekit-dev/react'
import { AttestationCatalogue } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

export function Families() {
  const { catalogue, loading, stale, refresh } = useAttestationFamilies({
    load: async () => mockCatalogue(),
  })

  return (
    <AttestationCatalogue
      catalogue={catalogue}
      loading={loading}
      stale={stale}
      now={Date.now()}
      onRefresh={refresh}
      onSelect={(family) => console.log('build a request for', family)}
    />
  )
}`

export function AttestationCatalogueDemo() {
  return <GalleryDemo cases={CATALOGUE_CASES} code={CODE} />
}
