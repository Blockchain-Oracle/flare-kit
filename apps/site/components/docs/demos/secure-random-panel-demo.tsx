'use client'

import { M4_PROOF_SECTIONS } from '@gallery/m4-proof-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * SecureRandomPanel's live preview, running the gallery's `ftso-04` cases.
 *
 * The refusal case is driven through the real `readSecureRandom` against round
 * 872874, which genuinely reports `isSecureRandom = false` on Coston2. It is a
 * read that returned no value, not a staged one.
 */
const RANDOM_CASES = M4_PROOF_SECTIONS.find((section) => section.id === 'ftso-04')!.cases

const CODE = `import type { RoundReader } from '@flarekit-dev/core'
import { useSecureRandom } from '@flarekit-dev/react'
import { SecureRandomPanel } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

export function Random({ reader }: { reader: RoundReader }) {
  const { data, loading, refresh } = useSecureRandom({
    reader,
    chainId: 114,
    requireSecure: true,
  })

  return (
    <SecureRandomPanel
      requireSecure
      loading={loading}
      now={Date.now()}
      onRefresh={refresh}
      {...(data ? { random: data } : {})}
    />
  )
}`

export function SecureRandomPanelDemo() {
  return <GalleryDemo cases={RANDOM_CASES} code={CODE} />
}
