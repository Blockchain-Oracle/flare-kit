'use client'

// `@flare-kit/react-ui`'s barrel re-exports `@flare-kit/react`, which calls
// createContext at module scope — so any import from the kit's UI package is
// client-only, even for a presentational component like OperationTimeline.
// The record below is still built at render time from a seeded mock, which is
// deterministic, so server and client agree.

import { createMockKit } from '@flare-kit/core'
import { OperationTimeline } from '@flare-kit/react-ui'

const RECIPIENT = '0xDeaDbeefDeAdbeefdEadbEEFdeadbeEFdEaDbeeF'
const XRPL_ACCOUNT = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

/**
 * The record rendered below is one the mock state machine actually produced —
 * not a fixture written to look like output. Every step, actor, wait reason and
 * evidence identifier on screen is genuine.
 *
 * `awaiting_external` is the state worth leading with: it is the problem this
 * product exists to handle. A landing page that leads with a success screenshot
 * shows the easy half.
 *
 * The throw is deliberate. A `?? trace[0]` fallback once rendered a *succeeded*
 * operation under a "ready" label in the gallery; a surface that lies about
 * which state it is showing is worse than no surface.
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

export function LiveOperation() {
  const record = awaitingRecord()

  return (
    <section className="section-tight">
      <div className="container live-operation">
        <div className="live-operation-head">
          <h2 className="h-sec">A mint, mid-flight.</h2>
          {/* R-MOCK-004: a mock surface is always labelled, and is never a
              fallback triggered by a failure. */}
          <span className="eyebrow live-operation-tag">mock kit</span>
        </div>
        <p className="lede live-operation-lede">
          Not a screenshot. The mock state machine ran, and this is the record it produced — the
          stage, the actor being waited on, and the evidence gathered so far.
        </p>
        <OperationTimeline operation={record} />
      </div>
    </section>
  )
}
