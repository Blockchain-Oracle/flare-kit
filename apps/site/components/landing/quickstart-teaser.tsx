import Link from 'next/link'
import { CodeBlock } from '../docs/code-block'
import { InstallTabs } from '../docs/install-tabs'

const MOCK_SNIPPET = `import { createMockKit } from '@flare-kit/core'

// A real, seeded state machine — no wallet, no chain, no funds.
const kit = createMockKit({ seed: 'demo', scenario: 'happy' })

const record = kit.start({
  amountXrp: '25.000000',
  recipient: '0xDeaD…beEF',
  xrplAccount: 'rPT1Sjq…bpAYe',
})`

/**
 * The mock-first pitch, as an asymmetric split rather than a card grid: the
 * claim on the left, the exact code that backs it on the right. Every widget in
 * the docs runs on this same `createMockKit`.
 */
export function QuickstartTeaser() {
  return (
    <section className="section-tight">
      <div className="container qs-split">
        <div className="qs-copy">
          <p className="eyebrow">Start on the mock</p>
          <h2 className="h-sec">Build the whole flow with no wallet.</h2>
          <p className="lede">
            The mock is a real seeded state machine, not a set of fixtures. Build and test the
            entire operation — long waits, partial outcomes, recovery — then change one line of kit
            construction to go live on Coston2 or Flare mainnet.
          </p>
          <Link className="fk-btn fk-btn-ghost" href="/docs/quickstart">
            Read the quickstart
          </Link>
        </div>
        <div className="qs-code">
          <InstallTabs packages="@flare-kit/core @flare-kit/react @flare-kit/react-ui" />
          <CodeBlock code={MOCK_SNIPPET} language="ts" title="mock.ts" />
        </div>
      </div>
    </section>
  )
}
