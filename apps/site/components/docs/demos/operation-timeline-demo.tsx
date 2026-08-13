'use client'

import { M1_SECTIONS } from '@gallery/m1-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * The operation spine, driven by the gallery's own `m1-timeline` cases — ready,
 * submitted, confirming, awaiting external, succeeded, action-required (executor
 * late) and the large delayed mint. Each is a record the mock state machine
 * actually produced, imported rather than re-derived, so no control here can
 * render a state the operation never reached (R6).
 */
const TIMELINE_CASES = M1_SECTIONS.find((section) => section.id === 'm1-timeline')!.cases

const CODE = `import { createMockKit } from '@flarekit-dev/core'
import { OperationTimeline } from '@flarekit-dev/react-ui'
import '@flarekit-dev/react-ui/styles.css'

const kit = createMockKit({ seed: 'docs', scenario: 'happy' })
const trace = kit.trace(
  kit.start({
    amountXrp: '25.000000',
    recipient: '0xDeaD…beEF',
    xrplAccount: 'rPT1Sjq…bpAYe',
  }),
)

export function Mint() {
  return <OperationTimeline operation={trace[2]} />
}`

export function OperationTimelineDemo() {
  return <GalleryDemo cases={TIMELINE_CASES} code={CODE} />
}
