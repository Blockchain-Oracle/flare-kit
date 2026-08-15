'use client'

import { M3_PROOF_SECTIONS } from '@gallery/m3-proof-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * ProofHandoff's live preview.
 *
 * The gallery mounts no standalone `ProofHandoff` case: the panel is only ever
 * verified inside `ProofDetail`, which renders it whenever `abiStruct` is
 * passed. So the two cases below are exactly those — the whole proof screen,
 * with the handoff panel at the bottom of it. Mounting the panel on its own
 * would mean authoring a fixture the surface was never verified against, which
 * is the one thing these previews may not do (R6).
 */
const HANDOFF_CASE_NAMES = ['verifier-only, with the handoff', 'uint64-max sentinel']

const HANDOFF_CASES = M3_PROOF_SECTIONS.find((section) => section.id === 'fdc-04')!.cases.filter(
  (entry) => HANDOFF_CASE_NAMES.includes(entry.name),
)

const CODE = `import { evmTransactionFamily } from '@flarekit-dev/core'
import { ProofHandoff } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

export function Handoff({ row, proof }) {
  // The family module owns the ABI shape; this surface never rebuilds it.
  return <ProofHandoff row={row} abiStruct={evmTransactionFamily.toProofStruct(proof)} />
}`

export function ProofHandoffDemo() {
  return <GalleryDemo cases={HANDOFF_CASES} code={CODE} />
}
