// packages/react-ui/src/vault-catalogue-state.ts
import type { Amount, Observation, VaultConfig } from '@flare-kit/core'
import { feeBipsLabel } from './card-chrome.js'

/**
 * The pure state → chrome mapping for VaultCatalogue (LIQ-01), split from the JSX
 * at the seam the swap/liquidity cards sit on. Every honesty rule the catalogue
 * turns on is readable here: an unknown read is `—` (never `0`), a route with no
 * fee reads "None", and a vault whose withdraw path is not verified on this
 * network is marked for the declared-unbuilt affordance rather than an actionable
 * plan.
 */

/** The live reads for one vault row; a field is `null` when unknown (renders `—`). */
export interface VaultReadsView {
  /** Assets returned for one whole share unit — the exchange rate. */
  readonly rate: Amount | null
  readonly instantFeeBips: number | null
  readonly delayedFeeBips: number | null
  readonly paused: boolean
  /** Firelight's real global-limit headroom (`depositLimit − totalAssets`). */
  readonly depositCap: Amount | null
  /** Upshift's `maxWithdrawalAmount`. */
  readonly withdrawCap: Amount | null
}

export interface VaultRow {
  readonly config: VaultConfig
  /** Live reads, or `undefined` when they could not be fetched (renders unavailable, never zero). */
  readonly reads?: VaultReadsView
  /** Provenance for the row's reads, for the SourceChip. */
  readonly provenance?: Observation<unknown>
}

export interface ShareModel {
  readonly kind: string
  readonly symbol: string
}

export function shareModelOf(config: VaultConfig): ShareModel {
  return config.share.kind === 'self'
    ? { kind: 'Self-share vault', symbol: config.share.symbol }
    : { kind: 'Separate LP token', symbol: config.share.symbol }
}

const EXIT_WORD: Record<'instant' | 'delayed', string> = { instant: 'Instant', delayed: 'Delayed' }

export function exitLabel(config: VaultConfig): string {
  return config.exitModes.map((m) => EXIT_WORD[m]).join(' · ')
}

/** The per-route fee line: an unknown read is `—`, a genuinely zero-fee route is "None". */
export function feesLabel(config: VaultConfig, reads?: VaultReadsView): string {
  if (!reads) return '—'
  const parts: string[] = []
  if (config.exitModes.includes('instant')) parts.push(`Instant ${feeBipsLabel(reads.instantFeeBips)}`)
  parts.push(`Delayed ${feeBipsLabel(reads.delayedFeeBips)}`)
  return parts.join(' · ')
}

/** The reasoned copy for a vault whose non-standard withdraw path is not live-verified here. */
export function unverifiedReason(config: VaultConfig): string {
  return `Withdrawing from ${config.protocol} on this network hasn't been driven live in this build. Deposits read and quote normally; the withdraw action stays unbuilt rather than sign approvals against an unverified path.`
}
