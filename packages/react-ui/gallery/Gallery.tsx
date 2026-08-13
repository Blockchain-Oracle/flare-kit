import { useState } from 'react'
import { M12_GOVERNANCE_SECTIONS } from './m12-governance-sections.js'
import { M11_STAKING_SECTIONS } from './m11-staking-sections.js'
import { M10_DELEGATION_SECTIONS } from './m10-delegation-sections.js'
import { M10_CLAIMS_SECTIONS } from './m10-claims-sections.js'
import { M9_GASLESS_SECTIONS } from './m9-gasless-sections.js'
import { M9_X402_SECTIONS } from './m9-x402-sections.js'
import { M8_BRIDGE_SECTIONS } from './m8-bridge-sections.js'
import { M7_VAULT_SECTIONS } from './m7-vault-sections.js'
import { M6_LIQUIDITY_SECTIONS } from './m6-liquidity-sections.js'
import { M5_SWAP_SECTIONS } from './m5-swap-sections.js'
import { RECUT_SECTIONS } from './recut-sections.js'
import { SECTIONS } from './sections.js'
import { M1_SECTIONS } from './m1-sections.js'
import { M3_SECTIONS } from './m3-sections.js'
import { M3_PROOF_SECTIONS } from './m3-proof-sections.js'
import { M4_SECTIONS } from './m4-sections.js'
import { M4_PROOF_SECTIONS } from './m4-proof-sections.js'
import { M4_INCENTIVE_SECTIONS } from './m4-incentive-sections.js'

/**
 * Dev-only. Renders every required state of every M2 surface in both themes,
 * so the screens can be looked at rather than only asserted about.
 *
 * Kept apart from `main.tsx` so this file exports components and nothing else:
 * a module that both defines a component and calls `createRoot` cannot Fast
 * Refresh, so every edit full-reloads and re-roots the same container.
 */
export function Gallery() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  return (
    // The `fk` class carries the token contract. Without it the gallery chrome
    // falls back to light values and misreports the components as half-themed.
    <div className="fk g-root" data-theme={theme}>
      <header className="g-head">
        <h1>flare-kit — state gallery</h1>
        <p>
          Every required state of the M4 FTSO surfaces, the M3 FDC surfaces and the M2 surfaces,
          plus M1's four composed surfaces. All values are from the labelled mock; nothing here is
          live.
        </p>
        <button type="button" onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>
          {theme === 'light' ? 'Dark' : 'Light'} theme
        </button>
      </header>

      {[
        ...M12_GOVERNANCE_SECTIONS,
        ...M11_STAKING_SECTIONS,
        ...M10_DELEGATION_SECTIONS,
        ...M10_CLAIMS_SECTIONS,
        ...M9_GASLESS_SECTIONS,
        ...M9_X402_SECTIONS,
        ...M8_BRIDGE_SECTIONS,
        ...M7_VAULT_SECTIONS,
        ...M6_LIQUIDITY_SECTIONS,
        ...M5_SWAP_SECTIONS,
        ...RECUT_SECTIONS,
        ...M4_SECTIONS,
        ...M4_PROOF_SECTIONS,
        ...M4_INCENTIVE_SECTIONS,
        ...M3_SECTIONS,
        ...M3_PROOF_SECTIONS,
        ...SECTIONS,
        ...M1_SECTIONS,
      ].map((section) => (
        <section key={section.id} id={section.id} className="g-section">
          <h2>{section.title}</h2>
          <div className="g-cases">
            {section.cases.map((testCase) => (
              <figure key={testCase.name} className="g-case" data-case={testCase.name}>
                <figcaption>{testCase.name}</figcaption>
                <div className="g-mount">{testCase.node}</div>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
