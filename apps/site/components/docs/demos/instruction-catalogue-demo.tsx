'use client'

import { M13_SMART_ACCOUNT_SECTIONS } from '@gallery/m13-smart-account-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * InstructionCatalogue's live preview. The states are imported wholesale from
 * the gallery's `m13-instruction-catalogue` section — the live Coston2 read, the
 * mainnet read lens with its diverging per-id fees, an unreadable controller,
 * a controller registering no vaults, and the read still in flight. Nothing here
 * is re-authored, so the docs cannot drift from the surface.
 */
const CATALOGUE_CASES = M13_SMART_ACCOUNT_SECTIONS.find(
  (section) => section.id === 'm13-instruction-catalogue',
)!.cases

const CODE = `import { smartAccountsFor } from '@flarekit-dev/contracts'
import { useSmartAccount } from '@flarekit-dev/react'
import { InstructionCatalogue } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

export function Catalogue({ xrplOwner, publicClient, onSelect }) {
  // The catalogue is derived from the deployment read, not fetched separately.
  const { catalogue, loading } = useSmartAccount({
    deployment: smartAccountsFor('coston2'),
    xrplOwner,
    publicClient, // keyless throughout: nothing here signs
  })

  return (
    <InstructionCatalogue
      rows={catalogue}      // always eleven rows; availability says what is knowable
      loading={loading}
      networkLabel="Coston2"
      onSelect={onSelect}   // offered only for rows the deployment can actually serve
    />
  )
}`

export function InstructionCatalogueDemo() {
  return <GalleryDemo cases={CATALOGUE_CASES} code={CODE} />
}
