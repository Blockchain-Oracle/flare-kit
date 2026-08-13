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
 * Dev-only. Renders every required state of EVERY milestone's surfaces — M1
 * through M12, newest first — in both themes, so the screens can be looked at
 * rather than only asserted about. Each milestone owns its own `m*-sections`
 * module; this file only orders them.
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
          Every required state of every surface the kit ships, newest milestone first: M12
          governance, M11 staking, M10 delegation and claims, M9 gasless and x402, M8 bridge, M7
          vault, M6 liquidity, M5 swap, the re-cut shell, M4 FTSO, M3 FDC, the M2 surfaces and
          M1's four composed screens. Every value is driven from props or a labelled mock —
          nothing here is live, and no state is shown that a live run has not observed.
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
