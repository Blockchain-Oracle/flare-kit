'use client'

// `@flarekit-dev/react-ui`'s barrel re-exports `@flarekit-dev/react`, which calls
// createContext at module scope — so any import from the kit's UI package is
// client-only, even for a presentational component like OperationTimeline. The
// record below is still built at render time from a seeded mock, which is
// deterministic, so server and client agree.

import { createMockKit } from '@flarekit-dev/core'
import { OperationTimeline } from '@flarekit-dev/react-ui'

const RECIPIENT = '0xDeaDbeefDeAdbeefdEadbEEFdeadbeEFdEaDbeeF'
const XRPL_ACCOUNT = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

/**
 * The hero's live proof: the signature component, framed, running the real mock.
 * This is `OperationTimeline` itself — not a screenshot — so the front door
 * shows the product working rather than describing it.
 *
 * `awaiting_external` is the state worth leading with: it is the problem this
 * product exists to handle. A landing that leads with a success screenshot shows
 * the easy half.
 *
 * The throw is deliberate. A `?? trace[0]` fallback once rendered a *succeeded*
 * operation under a "ready" label; a surface that lies about which state it is
 * showing is worse than no surface.
 */
function awaitingRecord() {
  const kit = createMockKit({ seed: 'landing', scenario: 'happy' })
  const trace = kit.trace(
    kit.start({ amountXrp: '25.000000', recipient: RECIPIENT, xrplAccount: XRPL_ACCOUNT }),
  )
  const found = trace.find((record) => record.state === 'awaiting_external')
  if (!found) {
    throw new Error(`No awaiting_external record in trace: ${trace.map((r) => r.state).join(', ')}`)
  }
  return found
}

export function HeroDemo() {
  const record = awaitingRecord()

  return (
    <div className="hero-demo">
      <div className="hero-demo-bar">
        <span className="hero-demo-name mono">OperationTimeline</span>
        {/* R-MOCK-004: a mock surface is always labelled, and is never a
            fallback triggered by a failure. */}
        <span className="hero-demo-tag mono">mock kit</span>
      </div>
      <div className="hero-demo-stage">
        <OperationTimeline operation={record} />
      </div>
    </div>
  )
}
