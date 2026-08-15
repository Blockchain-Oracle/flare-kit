'use client'

import { M13_SMART_ACCOUNT_SECTIONS } from '@gallery/m13-smart-account-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * InstructionComposer's live preview. The states are imported wholesale from the
 * gallery's `m13-instruction-composer` section — the full chain before approval
 * for both live runs, the mainnet verified gate, a real refusal, the four legs
 * in flight, the effect-confirmed success, the success another submitter
 * dispatched, the expired proof, and an in-flight operation nothing is watching.
 * Nothing here is re-authored, so the docs cannot drift from the surface.
 */
const COMPOSER_CASES = M13_SMART_ACCOUNT_SECTIONS.find(
  (section) => section.id === 'm13-instruction-composer',
)!.cases

const CODE = `import { smartAccountsFor } from '@flarekit-dev/contracts'
import { useInstruction, useSmartAccount } from '@flarekit-dev/react'
import { InstructionComposer } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

const deployment = smartAccountsFor('coston2')

export function Compose({ xrplOwner, publicClient, intent, observe, onSign }) {
  const { settings, catalogue, account, balanceRequested } = useSmartAccount({
    deployment,
    xrplOwner,
    publicClient,
  })
  const { plan, record, proofDeadline, reconciling } = useInstruction({
    deployment,
    settings,
    catalogue,
    personalAccount: account,
    intent,
    balanceRequested,
    observe, // what you can see of the four legs; the hook walks the record
  })

  return (
    <InstructionComposer
      planResult={plan}          // a refusal is a state to render, not an error
      record={record}
      proofDeadline={proofDeadline} // undefined until the XRPL payment lands
      now={Date.now()}
      nativeSymbol="C2FLR"
      reconciling={reconciling}
      networkLabel="Coston2"
      onSign={onSign}            // your XRPL wallet signs; the kit holds no seed
    />
  )
}`

export function InstructionComposerDemo() {
  return <GalleryDemo cases={COMPOSER_CASES} code={CODE} />
}
