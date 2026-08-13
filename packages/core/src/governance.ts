// packages/core/src/governance.ts
import { isAddress, zeroAddress } from 'viem'
import type { GovernanceDeployment } from '@flare-kit/contracts'
import type { OperationRecord, OperationStep } from './operation.js'
import { buildDelegateCall, buildUndelegateCall, type GovernanceVoteReads } from './governance-adapter.js'

/**
 * The M12 governance-delegation plan builder — delegate governance vote power to a single
 * representative, or undelegate it. Governance vote power is ALL-OR-NOTHING to ONE delegate
 * (`GovernanceVotePower.delegate` / `.undelegate`); there is no bips / two-provider shape,
 * so this is the single-target analog of `buildDelegationPlan` (M10). It mirrors that
 * builder's Result convention — a discriminated `{ ok: true } | { ok: false }`, never a
 * thrown error and never a partially-built call.
 *
 * Two honesty guarantees are structural here, exactly as in M10:
 *
 *  1. The VERIFIED GATE runs FIRST — before any invariant or call. Until Task 6 flips
 *     `deployment.governanceVerified` (only Coston2, only after a live `getDelegateOfAtNow`
 *     read-back confirms a real delegate), the surface may show configuration but the kit
 *     refuses to emit a signable plan that would move real governance vote power along a
 *     path no live run has driven on this network.
 *
 *  2. Every single-target invariant the protocol would silently no-op or that spends power
 *     to nowhere is caught BEFORE a call is built: a missing / zero / malformed delegate
 *     target, a self-delegation, a re-delegation to the CURRENT delegate, and an undelegate
 *     against no current delegate. We refuse rather than sign a call that burns gas to do
 *     nothing — and, for the two no-ops the chain state already satisfies
 *     (`already_delegated` / `no_delegate`), rather than emit a plan whose reconciler would
 *     read `succeeded` off pre-existing state the submission never caused.
 *
 * `reads` is a snapshot passed in (Task 3's `readGovernanceVotes`), so the builder is pure
 * and synchronous; the call builders are the adapter's pure unsigned `build*Call`s.
 */

export type GovernanceOpKind = 'delegate' | 'undelegate'

export interface GovernanceIntent {
  readonly kind: GovernanceOpKind
  /** Required for a delegate — the representative to move all governance vote power to. */
  readonly to?: `0x${string}`
}

export type GovernanceInvariantError =
  | { readonly code: 'unverified' }
  | { readonly code: 'invalid_target' } // missing / zero / malformed `to` for a delegate
  | { readonly code: 'self_delegation' } // to === account
  | { readonly code: 'already_delegated' } // to === the CURRENT delegate
  | { readonly code: 'no_delegate' } // undelegate with no current delegate

/** The unsigned calls a governance plan carries — the single delegate/undelegate call. */
export type GovernanceCall = ReturnType<typeof buildDelegateCall> | ReturnType<typeof buildUndelegateCall>

export interface GovernancePlan {
  readonly steps: OperationStep[]
  readonly calls: GovernanceCall[]
  /** Carried verbatim so `reconcileGovernance` reads the delegate target off the record. */
  readonly intent: GovernanceIntent
}

/**
 * A governance operation record. The intent rides on the record so the durable reconciler
 * (`reconcileGovernance`) can read the delegate target from `op.intent` without being handed
 * it separately.
 */
export type GovernanceOperation = OperationRecord<GovernanceIntent>

export type GovernancePlanResult =
  | { readonly ok: true; readonly plan: GovernancePlan }
  | { readonly ok: false; readonly error: GovernanceInvariantError }

function walletStep(id: string, type: string): OperationStep {
  return { id, type, actor: 'your_wallet', state: 'pending', attempts: 0 }
}

/** The trailing wait step type — Flare recording the specific governance intent on-chain. */
function recordType(intent: GovernanceIntent): string {
  return intent.kind === 'delegate' ? 'await_governance_delegation' : 'await_governance_undelegate'
}

/**
 * The lifecycle spine: one `your_wallet` signature per call, then one `flare` step the
 * reconciler advances to `done` only once `getDelegateOfAtNow` reflects the intent.
 */
function governanceSteps(intent: GovernanceIntent, calls: GovernanceCall[]): OperationStep[] {
  const steps = calls.map((call, index) => walletStep(`call-${index}`, call.functionName))
  steps.push({ id: 'record', type: recordType(intent), actor: 'flare', state: 'pending', attempts: 0 })
  return steps
}

function asPlan(intent: GovernanceIntent, calls: GovernanceCall[]): GovernancePlanResult {
  return { ok: true, plan: { steps: governanceSteps(intent, calls), calls, intent } }
}

function asError(error: GovernanceInvariantError): GovernancePlanResult {
  return { ok: false, error }
}

/**
 * The unsigned governance-delegation plan. The verified gate runs FIRST; then the
 * single-target invariants; then — and only then — the adapter builds the one call.
 */
export function planGovernance(args: {
  intent: GovernanceIntent
  deployment: GovernanceDeployment
  reads: { delegate: `0x${string}` }
  account: `0x${string}`
}): GovernancePlanResult {
  const { intent, deployment, reads, account } = args

  // 1. Verified gate FIRST — before any invariant or call.
  if (!deployment.governanceVerified) return asError({ code: 'unverified' })

  // 2. Single-target invariants BEFORE producing a call; 3. build the call once it is legal.
  if (intent.kind === 'delegate') {
    const to = intent.to
    // Missing, the zero address, or not a well-formed address — a burn-to-nowhere delegate.
    // Format only (`strict: false`), not EIP-55 checksum: a legitimate target may be
    // lower-case (the same reason the reconcile match is case-insensitive).
    if (!to || to.toLowerCase() === zeroAddress || !isAddress(to, { strict: false })) {
      return asError({ code: 'invalid_target' })
    }
    // Delegating to yourself is a no-op the protocol would silently accept; refuse it.
    if (to.toLowerCase() === account.toLowerCase()) return asError({ code: 'self_delegation' })
    // Re-delegating to the CURRENT delegate is the symmetric no-op of `no_delegate` below, and
    // worse than wasted gas: `reconcileGovernance`'s terminal check is `getDelegateOfAtNow ===
    // intent.to`, which is ALREADY true from the pre-existing state — so the very next poll
    // would reconcile to `succeeded` regardless of whether the transaction landed, or even if
    // it reverted. Closing it here, where the pre-state is known, is the only place the two
    // otherwise-identical reads can be told apart.
    if (to.toLowerCase() === reads.delegate.toLowerCase()) return asError({ code: 'already_delegated' })
    return asPlan(intent, [buildDelegateCall(deployment, to)])
  }

  // undelegate: refuse when there is no current delegate to clear (a gas-burning no-op).
  if (reads.delegate.toLowerCase() === zeroAddress) return asError({ code: 'no_delegate' })
  return asPlan(intent, [buildUndelegateCall(deployment)])
}

/**
 * The governance position view (M12). It lives here in the governance domain module (not
 * in `portfolio.ts`, which keeps the `governance` DECLARED-UNBUILT entry) — the M12 read
 * mechanism stays together, and `portfolio.ts` stays under the 300-line limit.
 *
 * The mechanism mirrors `delegationPosition` / `stakePosition`: an ABSENT read (`undefined`
 * — `readGovernanceVotes` returned undefined because a read threw) is `unavailable`, NEVER
 * a fabricated confident zero, because a read that never returned knows nothing about this
 * account. A present read is `observed`, even when it observes an empty position — a genuine
 * blank-slate account really reads `getVotes` 0n and `getDelegateOfAtNow` the zero address
 * (probe-confirmed), and that is a REAL observed-empty holding, distinct from unavailable.
 *
 * The portfolio keeps `governance` DECLARED-UNBUILT while `governanceVerified` is false: this
 * function is the built mechanism the flip surfaces, not the flip itself.
 */
export type GovernancePositionView =
  | { readonly status: 'observed'; readonly votes: bigint; readonly delegate: `0x${string}` }
  | { readonly status: 'unavailable' }

export function governancePosition(reads: GovernanceVoteReads | undefined): GovernancePositionView {
  if (reads === undefined) return { status: 'unavailable' }
  return { status: 'observed', votes: reads.votes, delegate: reads.delegate }
}
