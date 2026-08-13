import type { Amount } from './amounts.js'
import { type AccountContext, type ChainFamily, type NetworkRef, identityFor, isReadOnly } from './account.js'
import {
  type Observation,
  type ObservationSource,
  isObserved,
  sourcesAgree,
  staleness,
} from './observation.js'
import type { OperationState } from './states.js'
import type { DelegationMode, DelegationReads } from './delegation-adapter.js'
import type { StakePosition } from './pchain-rpc.js'

/**
 * What two identities hold, with the source and freshness of every number.
 *
 * The model is deliberately separate from the reads that fill it (M2-R4), so
 * the rules that decide "no assets" versus "we could not look" are testable
 * without a network. Those two are the ones worth getting right: R-DATA-002
 * lists vault, bridge, delegation and stake positions that do not exist yet,
 * and an empty vault row implies a vault you do not have.
 */

export type PositionKind = 'native' | 'fasset'

export interface PortfolioPosition {
  /** Stable across reads, so a row keeps its identity when a value updates. */
  readonly id: string
  readonly kind: PositionKind
  readonly family: ChainFamily
  readonly account: string
  readonly network: NetworkRef
  readonly asset: string
  readonly balance: Observation<Amount>
}

export function position(init: PortfolioPosition): PortfolioPosition {
  return Object.freeze({ ...init })
}

/**
 * A position type R-DATA-002 names that this build cannot observe. It carries
 * no balance field at all — not a zero, not an empty observation — because a
 * renderer that cannot reach a number cannot print one.
 */
export interface UnbuiltPositionType {
  readonly kind: string
  readonly label: string
  readonly reason: string
}

export const UNBUILT_POSITION_TYPES: readonly UnbuiltPositionType[] = Object.freeze([
  Object.freeze({
    kind: 'vault',
    label: 'Vault positions',
    reason: 'No vault capability is built yet, so this account has not been checked for one.',
  }),
  Object.freeze({
    kind: 'bridge-message',
    label: 'Bridge messages',
    reason: 'No bridge capability is built yet, so no message state can be shown.',
  }),
  // M10-R12: delegation is now BUILT — its position is observed via `delegationPosition`
  // below, so it no longer declares itself unbuilt.
  //
  // M11: the stake position MECHANISM is built (`stakePosition` below), but `stake` STAYS
  // declared-unbuilt while `stakeVerified` is false — the surface must not claim to read a
  // position off a path no live run has confirmed. This row is removed (exactly as
  // delegation's was) only when a live round trip flips `stakeVerified` true.
  Object.freeze({
    kind: 'stake',
    label: 'Stakes',
    reason: 'No staking capability is verified yet, so stakes are not read.',
  }),
  // M12: the governance position MECHANISM is built (`governancePosition` in `governance.ts`),
  // but `governance` STAYS declared-unbuilt while `governanceVerified` is false — same rule as
  // stake. This row is removed (exactly as delegation's was) only when a live Coston2 round
  // trip flips `governanceVerified` true (Task 6).
  Object.freeze({
    kind: 'governance',
    label: 'Governance vote power',
    reason: 'No governance capability is verified yet, so governance VP is not read.',
  }),
])

/**
 * The delegation position (M10-R12). The delegation type is no longer declared unbuilt: a
 * delegation read now produces a real observed view.
 *
 * The honesty rule is the M2 coverage rule applied here: an ABSENT read (`undefined` —
 * the read did not land) is `unavailable`, NEVER a confident zero-delegation, because a
 * read that never returned knows nothing about this account. A present read is
 * `observed`, even when it observes an empty position (no delegates, mode 0) — that is a
 * REAL observed-empty holding, and it is distinct from unavailable.
 */
export type DelegationPositionView =
  | {
      readonly status: 'observed'
      readonly wrappedBalance: bigint
      readonly delegates: { address: `0x${string}`; bips: number }[]
      readonly votePower: bigint
      readonly mode: DelegationMode
    }
  | { readonly status: 'unavailable' }

export function delegationPosition(reads: DelegationReads | undefined): DelegationPositionView {
  if (reads === undefined) return { status: 'unavailable' }
  return {
    status: 'observed',
    wrappedBalance: reads.wrappedBalance,
    delegates: reads.delegates,
    votePower: reads.votePower,
    mode: reads.mode,
  }
}

/**
 * The stake position (M11). The mechanism mirrors `delegationPosition`: an ABSENT read
 * (`undefined` — the P-chain read did not land) is `unavailable`, NEVER a fabricated
 * confident zero, because a read that never returned knows nothing about this account. A
 * present read is `observed`, even when it observes an empty position (no stakes) — that
 * is a REAL observed-empty holding, distinct from unavailable.
 *
 * `mirroredVotePower` is `bigint | undefined` INSIDE an observed view: the stake read
 * landed while the `PChainStakeMirror` vote-power read may still be individually
 * unavailable (it reverts on Coston2 — `readMirrorVotePower` returns `undefined`), and
 * that is carried honestly rather than collapsed to zero.
 *
 * The portfolio keeps `stake` DECLARED-UNBUILT (above) while `stakeVerified` is false: this
 * function is the built mechanism the flip surfaces, not the flip itself.
 */
export type StakePositionView =
  | {
      readonly status: 'observed'
      readonly stakes: StakePosition[]
      readonly mirroredVotePower: bigint | undefined
    }
  | { readonly status: 'unavailable' }

export function stakePosition(
  reads: { stakes: StakePosition[]; mirroredVotePower: bigint | undefined } | undefined,
): StakePositionView {
  if (reads === undefined) return { status: 'unavailable' }
  return { status: 'observed', stakes: reads.stakes, mirroredVotePower: reads.mirroredVotePower }
}

/**
 * An operation still in flight, summarised for the portfolio and SH-10.
 *
 * It carries its source like every other portfolio value (M2-R1). Our own
 * record is a `local` observation — authoritative about our own operation, and
 * still a claim with a provenance. SH-10's `degraded source` state needs a
 * field to render, and `updatedAt` alone does not say where the reading came
 * from.
 */
export interface PendingOperation {
  readonly operationId: string
  readonly capability: string
  readonly state: OperationState
  readonly network: number
  readonly updatedAt: number
  readonly source: ObservationSource
}

/**
 * USER-01's `partial account coverage`, per family.
 *
 * `partial` exists because a family has more than one read — Flare has a native
 * balance and an FAsset balance — and one of them failing is neither full
 * coverage nor total silence. Collapsing it into `covered` was a real defect:
 * it let a portfolio with an unreadable FAsset balance claim to be complete.
 */
export type Coverage = 'covered' | 'partial' | 'not-connected' | 'unavailable'

export interface Portfolio {
  readonly positions: readonly PortfolioPosition[]
  readonly unbuilt: readonly UnbuiltPositionType[]
  readonly pending: readonly PendingOperation[]
  readonly coverage: Readonly<Record<ChainFamily, Coverage>>
  readonly partialCoverage: boolean
  /** True when any attached identity holds no key (M2-AC5). */
  readonly readOnly: boolean
  readonly assembledAt: number
}

export interface AssemblePortfolioInput {
  readonly context: AccountContext
  readonly positions: readonly PortfolioPosition[]
  readonly pending: readonly PendingOperation[]
  readonly at: number
}

function coverageFor(input: AssemblePortfolioInput, family: ChainFamily): Coverage {
  const identity = identityFor(input.context, family)
  if (!identity.address) return 'not-connected'
  const held = input.positions.filter((entry) => entry.family === family)
  // No rows at all for an attached identity means the read did not land, not
  // that the account is empty. An empty account still produces a zero balance.
  if (held.length === 0) return 'unavailable'
  const landed = held.filter((entry) => isObserved(entry.balance)).length
  if (landed === 0) return 'unavailable'
  // Every read, not any read. One unreadable balance means this family's
  // holdings are incomplete, and saying `covered` there would let a surface
  // present a partial picture as the whole one.
  return landed === held.length ? 'covered' : 'partial'
}

export function assemblePortfolio(input: AssemblePortfolioInput): Portfolio {
  const coverage = Object.freeze({
    evm: coverageFor(input, 'evm'),
    xrpl: coverageFor(input, 'xrpl'),
  })
  const attached = (['evm', 'xrpl'] as const).map((family) => identityFor(input.context, family))

  return Object.freeze({
    positions: Object.freeze([...input.positions]),
    unbuilt: UNBUILT_POSITION_TYPES,
    pending: Object.freeze([...input.pending]),
    coverage,
    partialCoverage: coverage.evm !== 'covered' || coverage.xrpl !== 'covered',
    readOnly: attached.some((identity) => identity.address !== undefined && isReadOnly(identity)),
    assembledAt: input.at,
  })
}

/**
 * USER-01's `no assets`. Reachable only when every attached identity's every
 * read landed: a portfolio holding an unread source knows nothing about that
 * side of the account, and saying "no assets" there would be a confident claim
 * built on silence (M2-AC4, clarified after review).
 *
 * The coverage check is what makes that true. Inspecting only the positions
 * present cannot see a family that produced no rows at all, which is precisely
 * the case where a source was asked and never answered.
 */
export function isPortfolioEmpty(portfolio: Portfolio): boolean {
  if (portfolio.pending.length > 0) return false
  if (portfolio.positions.length === 0) return false
  const asked = Object.values(portfolio.coverage)
  if (asked.some((coverage) => coverage === 'unavailable' || coverage === 'partial')) return false
  return portfolio.positions.every(
    (entry) => isObserved(entry.balance) && entry.balance.value.value === 0n,
  )
}

export function portfolioIsStale(portfolio: Portfolio, now: number): boolean {
  return portfolio.positions.some((entry) => staleness(entry.balance, now).stale)
}

/** One position claimed differently by two source classes. */
export interface SourceConflict {
  readonly positionId: string
  readonly asset: string
  readonly canonical: Observation<Amount>
  readonly other: Observation<Amount>
}

function sameAmount(left: Amount, right: Amount): boolean {
  // Compared in base units with their scale, never as formatted text: 1.0 and
  // 1.00 are the same holding, and 1 XRP is not 1 FTestXRP.
  return left.value === right.value && left.decimals === right.decimals && left.asset === right.asset
}

/**
 * USER-03's `canonical/indexed conflict`. The chain read is canonical and the
 * comparison is reported, never resolved: silently preferring one class would
 * erase exactly the distinction R-DATA-005 exists to keep.
 */
export function portfolioConflicts(
  portfolio: Portfolio,
  others: readonly PortfolioPosition[],
): readonly SourceConflict[] {
  const conflicts: SourceConflict[] = []
  for (const other of others) {
    const canonical = portfolio.positions.find((entry) => entry.id === other.id)
    if (!canonical) continue
    if (sourcesAgree(canonical.balance, other.balance, sameAmount)) continue
    conflicts.push(
      Object.freeze({
        positionId: canonical.id,
        asset: canonical.asset,
        canonical: canonical.balance,
        other: other.balance,
      }),
    )
  }
  return conflicts
}
