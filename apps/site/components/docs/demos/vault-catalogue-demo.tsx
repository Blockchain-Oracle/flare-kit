'use client'

import { M7_VAULT_SECTIONS } from '@gallery/m7-vault-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * VaultCatalogue's live preview. The rows come wholesale from the gallery's
 * `m7-vault-catalogue` section — the list, a paused vault, a vault whose withdraw
 * path is unverified on this network, and a row whose reads could not be fetched.
 * Nothing is re-authored here, so the docs cannot drift from the surface.
 *
 * The label is `observed fixtures`, not `mock kit`: these rows are built from the
 * M7 Phase-A live reads, not from `createMockKit()`.
 */
const VAULT_CASES = M7_VAULT_SECTIONS.find((section) => section.id === 'm7-vault-catalogue')!.cases

const CODE = `import { vaultsFor } from '@flare-kit/core'
import { VaultCatalogue, type VaultReadsView } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

export function Vaults({
  reads,
  now,
}: {
  reads: Record<string, VaultReadsView | undefined>
  now: number
}) {
  const rows = vaultsFor('coston2').map((config) => ({
    config,
    // Undefined reads render "couldn't read this vault", never a zero.
    ...(reads[config.key] ? { reads: reads[config.key]! } : {}),
  }))

  return <VaultCatalogue rows={rows} now={now} networkLabel="Coston2" />
}`

export function VaultCatalogueDemo() {
  return <GalleryDemo cases={VAULT_CASES} code={CODE} label="observed fixtures" />
}
