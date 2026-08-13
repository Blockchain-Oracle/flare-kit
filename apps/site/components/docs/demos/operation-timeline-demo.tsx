'use client'

import { createMockKit, type MockScenario } from '@flare-kit/core'
import { OperationTimeline } from '@flare-kit/react-ui'
import { useState } from 'react'
import { Preview } from '../preview'

const RECIPIENT = '0xDeaDbeefDeAdbeefdEadbEEFdeadbeEFdEaDbeeF'
const XRPL_ACCOUNT = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

const CODE = `import { createMockKit } from '@flare-kit/core'
import { OperationTimeline } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

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

/** Scenarios the mock actually ships. Each produces a different real trace. */
const SCENARIOS: { id: MockScenario; label: string }[] = [
  { id: 'happy', label: 'happy' },
  { id: 'executor-late', label: 'executor-late' },
  { id: 'large-delayed', label: 'large-delayed' },
]

function traceFor(scenario: MockScenario) {
  const kit = createMockKit({ seed: `docs-${scenario}`, scenario })
  return kit.trace(
    kit.start({ amountXrp: '25.000000', recipient: RECIPIENT, xrplAccount: XRPL_ACCOUNT }),
  )
}

/**
 * The spine, driven by the real mock. Stepping through states walks the trace
 * the machine produced — the states offered are the ones that exist, so no
 * control here can render a state the operation never reached.
 */
export function OperationTimelineDemo() {
  const [scenario, setScenario] = useState<MockScenario>('happy')
  const [index, setIndex] = useState(2)

  const trace = traceFor(scenario)
  const record = trace[Math.min(index, trace.length - 1)]!

  return (
    <Preview code={CODE}>
      <div className="demo-controls">
        <label className="demo-control">
          <span className="eyebrow">Scenario</span>
          <select
            value={scenario}
            onChange={(event) => {
              setScenario(event.target.value as MockScenario)
              setIndex(0)
            }}
          >
            {SCENARIOS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="demo-control">
          <span className="eyebrow">State</span>
          <select value={Math.min(index, trace.length - 1)} onChange={(e) => setIndex(Number(e.target.value))}>
            {trace.map((entry, position) => (
              <option key={`${entry.state}-${position}`} value={position}>
                {position + 1}. {entry.state}
              </option>
            ))}
          </select>
        </label>
      </div>
      <OperationTimeline operation={record} />
    </Preview>
  )
}
