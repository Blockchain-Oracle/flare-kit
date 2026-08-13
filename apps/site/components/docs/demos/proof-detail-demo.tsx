'use client'

import { M3_PROOF_SECTIONS } from '@gallery/m3-proof-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * ProofDetail's live preview. The states come wholesale from the gallery's
 * `fdc-04` section — the verified proof, the one nobody has checked yet, the
 * verifier-only family with its handoff, the expired round, the uint64-max
 * sentinel, the failed verification, the consumed proof, the reverted
 * consumption and the owner mismatch. Nothing is re-authored here, so a docs
 * page cannot show a state the surface never reached.
 */
const PROOF_CASES = M3_PROOF_SECTIONS.find((section) => section.id === 'fdc-04')!.cases

const CODE = `import { mockCatalogue } from '@flarekit-dev/core'
import { useAttestationFamilies } from '@flarekit-dev/react'
import { ProofDetail } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

export function Proof({ proof, verified, account }) {
  const { rows } = useAttestationFamilies({ load: async () => mockCatalogue() })
  const row = rows.find((entry) => entry.family.name === 'XRPPayment')
  if (!row) return null

  return (
    <ProofDetail
      row={row}
      proof={proof}
      verified={verified}
      proofOwner={proof.data.requestBody.proofOwner}
      sender={account}
      onConsume={() => consume(proof)}
    />
  )
}`

export function ProofDetailDemo() {
  return <GalleryDemo cases={PROOF_CASES} code={CODE} />
}
