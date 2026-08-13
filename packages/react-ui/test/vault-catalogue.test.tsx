// packages/react-ui/test/vault-catalogue.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { type Observation, type VaultConfig, amount, observe, vaultByKey } from '@flarekit-dev/core'
import { VaultCatalogue } from '../src/VaultCatalogue.js'
import type { VaultReadsView, VaultRow } from '../src/vault-catalogue-state.js'

const NOW = 1_786_400_000
const firelight = vaultByKey('coston2', 'firelight-fxrp')!
const upshift = vaultByKey('coston2', 'upshift-fxrp')!

const CHAIN: Observation<unknown> = observe({}, { class: 'chain', provider: 'Coston2 RPC', network: 'Coston2', chainId: 114 }, NOW * 1000)

const firelightReads: VaultReadsView = {
  rate: amount(1_000_000n, 6, 'FTestXRP'),
  instantFeeBips: null,
  delayedFeeBips: 0,
  paused: false,
  depositCap: amount(5_939n, 6, 'FTestXRP'),
  withdrawCap: null,
}
const upshiftReads: VaultReadsView = {
  rate: amount(1_008_494n, 6, 'FTestXRP'),
  instantFeeBips: 50,
  delayedFeeBips: 25,
  paused: false,
  depositCap: null,
  withdrawCap: amount(10_000_000_000n, 6, 'FTestXRP'),
}

const verified = (cfg: VaultConfig): VaultConfig => ({ ...cfg, withdrawVerified: true })

describe('VaultCatalogue (LIQ-01)', () => {
  it('lists each vault with its protocol, share model, fees and exit routes', () => {
    const rows: VaultRow[] = [
      { config: verified(firelight), reads: firelightReads, provenance: CHAIN },
      { config: verified(upshift), reads: upshiftReads, provenance: CHAIN },
    ]
    render(<VaultCatalogue rows={rows} now={NOW} networkLabel="Coston2" />)
    expect(screen.getByText('Firelight')).toBeInTheDocument()
    expect(screen.getByText('Upshift')).toBeInTheDocument()
    expect(screen.getByText(/Self-share vault/)).toBeInTheDocument()
    expect(screen.getByText(/Separate LP token/)).toBeInTheDocument()
    // Upshift's real fees, honestly per route.
    expect(screen.getByText(/Instant 0\.50% · Delayed 0\.25%/)).toBeInTheDocument()
    // Firelight's delayed route has no fee — "None", never "0".
    expect(screen.getByText(/Delayed None/)).toBeInTheDocument()
  })

  it('renders an unknown read as — and never as 0', () => {
    const rows: VaultRow[] = [{ config: verified(upshift), reads: { ...upshiftReads, rate: null }, provenance: CHAIN }]
    render(<VaultCatalogue rows={rows} now={NOW} />)
    const rate = screen.getByText('Exchange rate').closest('.fk-row')!
    expect(within(rate as HTMLElement).getByText('—')).toBeInTheDocument()
  })

  it('marks a paused vault as paused — a first-class state, not a user error', () => {
    const rows: VaultRow[] = [{ config: verified(upshift), reads: { ...upshiftReads, paused: true }, provenance: CHAIN }]
    render(<VaultCatalogue rows={rows} now={NOW} />)
    expect(screen.getByText(/withdrawals paused/i)).toBeInTheDocument()
    expect(document.querySelector('.fk-vault-row')).toHaveAttribute('data-paused', 'true')
  })

  it('shows a declared-unbuilt withdraw affordance for an unverified vault — reads still render', () => {
    const rows: VaultRow[] = [{ config: { ...upshift, withdrawVerified: false }, reads: upshiftReads, provenance: CHAIN }]
    render(<VaultCatalogue rows={rows} now={NOW} />)
    expect(screen.getByText(/withdraw not built/i)).toBeInTheDocument()
    // The reads are still shown — an unverified vault is not a hidden vault.
    expect(screen.getByText(/Instant 0\.50%/)).toBeInTheDocument()
    // …but no actionable exit-mode affordance is offered.
    expect(screen.queryByText(/instant exit/i)).toBeNull()
  })

  it('renders unavailable — never a confident zero — when the reads could not be fetched', () => {
    const rows: VaultRow[] = [{ config: verified(upshift), reads: undefined, provenance: CHAIN }]
    render(<VaultCatalogue rows={rows} now={NOW} />)
    expect(screen.getByText(/couldn't read this vault/i)).toBeInTheDocument()
    expect(screen.queryByText('Exchange rate')).toBeNull()
  })

  it('offers the exit-mode affordances only when verified and not paused', () => {
    const rows: VaultRow[] = [{ config: verified(upshift), reads: upshiftReads, provenance: CHAIN }]
    render(<VaultCatalogue rows={rows} now={NOW} />)
    expect(screen.getByText(/instant exit/i)).toBeInTheDocument()
    expect(screen.getByText(/delayed exit/i)).toBeInTheDocument()
  })
})
