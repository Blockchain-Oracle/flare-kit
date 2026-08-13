// packages/core/src/vault.ts
import type { Address } from '@flare-kit/contracts'
import {
  type OperationRecord,
  type OperationStep,
  type TransitionResult,
  applyTransition,
  createOperation,
  escalate,
} from './operation.js'
import type {
  ClaimRef,
  ExitRoute,
  PendingWithdrawal,
  VaultAdapter,
  VaultCall,
} from './vault-adapter.js'
import { withdrawalPhase } from './vault-adapter.js'
import type { DepositQuote, WithdrawQuote } from './vault-quote.js'

/**
 * The vault deposit + withdraw operations (M7-R2/R3). They reuse the M1 lifecycle
 * engine and — crucially — the EXISTING canonical states, not new ones: a deposit
 * is the familiar `quoting → ready/awaiting_approval → executing → submitted →
 * succeeded`; a delayed withdrawal is `… → submitted → awaiting_external` (the
 * vault's period/epoch clock) `→ action_required` (claimable) `→ executing →
 * succeeded` — the same shape M3's FDC proof wait uses. The instant route
 * concludes in one step. No new state identifier is invented (R-LIFE-001).
 *
 * A withdrawal REQUEST is never a withdrawal: it lands in `awaiting_external`, and
 * only the claim reaching `succeeded` means assets were received. The withdraw plan
 * REFUSES a vault whose non-standard withdraw path is not verified on this network
 * (`withdrawVerified`), rather than sign approvals then revert (M7-R10 / M6 F2).
 */

export interface DepositIntent {
  readonly vaultKey: string
  readonly assetsIn: bigint
  readonly slippageBips: number
  readonly recipient: Address
  readonly deadline: number
}

export interface WithdrawIntent {
  readonly vaultKey: string
  /** Absolute share amount to withdraw. A percent affordance in the UI resolves to this. */
  readonly shares: bigint
  readonly route: ExitRoute
  readonly slippageBips: number
  readonly recipient: Address
  readonly deadline: number
}

export interface DepositPlan {
  /** Present only when the asset allowance is short. */
  readonly approve?: VaultCall
  readonly deposit: VaultCall
}

export interface WithdrawPlan {
  /** Present only when a pulled LP token's allowance is short (Upshift); never for self-share. */
  readonly approveShare?: VaultCall
  readonly request: VaultCall
  readonly route: ExitRoute
}

export interface ClaimPlan {
  readonly claim: VaultCall
}

export type VaultError =
  | { readonly kind: 'paused' }
  | { readonly kind: 'cap_exceeded'; readonly max: bigint }
  | { readonly kind: 'insufficient_balance' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'not_verified'; readonly reason: string }

export type DepositPlanResult =
  | { readonly kind: 'plan'; readonly plan: DepositPlan }
  | { readonly kind: 'error'; readonly error: VaultError }

export type WithdrawPlanResult =
  | { readonly kind: 'plan'; readonly plan: WithdrawPlan }
  | { readonly kind: 'error'; readonly error: VaultError }

export type DepositOperation = OperationRecord<DepositIntent, DepositQuote, DepositPlan>
export type WithdrawOperation = OperationRecord<WithdrawIntent, WithdrawQuote, WithdrawPlan>

export { startQuoting } from './swap.js'

export function createDeposit(input: { chainId: number; intent: DepositIntent; now: number; id?: string }): DepositOperation {
  return createOperation<DepositIntent, DepositQuote, DepositPlan>({
    capability: 'vault_deposit',
    network: input.chainId,
    intent: input.intent,
    now: input.now,
    ...(input.id ? { id: input.id } : {}),
  })
}

export function createWithdraw(input: { chainId: number; intent: WithdrawIntent; now: number; id?: string }): WithdrawOperation {
  return createOperation<WithdrawIntent, WithdrawQuote, WithdrawPlan>({
    capability: 'vault_withdraw',
    network: input.chainId,
    intent: input.intent,
    now: input.now,
    ...(input.id ? { id: input.id } : {}),
  })
}

/** The unsigned deposit plan. Reads availability/allowance/balance; gates before any signature. */
export async function buildDepositPlan(
  adapter: VaultAdapter,
  intent: DepositIntent,
  owner: Address,
  now: number,
): Promise<DepositPlanResult> {
  if (intent.deadline <= now) return { kind: 'error', error: { kind: 'expired' } }
  const availability = await adapter.reads.availability(owner)
  if (availability.depositPaused) return { kind: 'error', error: { kind: 'paused' } }
  if (availability.maxDeposit !== null && intent.assetsIn > availability.maxDeposit) {
    return { kind: 'error', error: { kind: 'cap_exceeded', max: availability.maxDeposit } }
  }
  const balance = await adapter.reads.assetBalance(owner)
  if (balance < intent.assetsIn) return { kind: 'error', error: { kind: 'insufficient_balance' } }
  const allowance = await adapter.reads.assetAllowance(owner)
  const plan: DepositPlan = {
    ...(allowance < intent.assetsIn ? { approve: adapter.writes.approveAsset(intent.assetsIn) } : {}),
    deposit: adapter.writes.deposit(intent.assetsIn, intent.recipient),
  }
  return { kind: 'plan', plan }
}

/** The unsigned withdraw plan. REFUSES an unverified withdraw path; gates paused/cap/balance. */
export async function buildWithdrawPlan(
  adapter: VaultAdapter,
  intent: WithdrawIntent,
  owner: Address,
  now: number,
): Promise<WithdrawPlanResult> {
  if (!adapter.config.withdrawVerified) {
    return {
      kind: 'error',
      error: {
        kind: 'not_verified',
        reason: `Withdrawing from ${adapter.config.protocol} on this network is not verified in this build — its non-standard withdraw path has not been driven live here, so the kit will not sign approvals against it.`,
      },
    }
  }
  if (intent.deadline <= now) return { kind: 'error', error: { kind: 'expired' } }
  const availability = await adapter.reads.availability(owner)
  if (availability.withdrawPaused) return { kind: 'error', error: { kind: 'paused' } }
  const balance = await adapter.reads.shareBalance(owner)
  if (balance < intent.shares) return { kind: 'error', error: { kind: 'insufficient_balance' } }
  if (availability.maxWithdrawal !== null) {
    const { assets } = await adapter.reads.previewWithdraw(intent.shares, intent.route)
    if (assets > availability.maxWithdrawal) {
      return { kind: 'error', error: { kind: 'cap_exceeded', max: availability.maxWithdrawal } }
    }
  }
  const needsApprove =
    adapter.writes.needsShareApproval && (await adapter.reads.shareAllowance(owner)) < intent.shares
  const plan: WithdrawPlan = {
    ...(needsApprove ? { approveShare: adapter.writes.approveShare(intent.shares) } : {}),
    request: adapter.writes.requestWithdraw(intent.shares, intent.recipient, owner, intent.route),
    route: intent.route,
  }
  return { kind: 'plan', plan }
}

/** The claim plan is pure — the request already gated, and the ref carries what claim needs. */
export function buildClaimPlan(adapter: VaultAdapter, ref: ClaimRef, recipient: Address): ClaimPlan {
  return { claim: adapter.writes.claim(ref, recipient) }
}

function depositSteps(needsApprove: boolean): OperationStep[] {
  const steps: OperationStep[] = []
  if (needsApprove) steps.push({ id: 'approve', type: 'approve', actor: 'your_wallet', state: 'pending', attempts: 0 })
  steps.push({ id: 'deposit', type: 'deposit', actor: 'your_wallet', state: 'pending', attempts: 0 })
  return steps
}

function withdrawSteps(plan: WithdrawPlan): OperationStep[] {
  const steps: OperationStep[] = []
  if (plan.approveShare) steps.push({ id: 'approve', type: 'approve', actor: 'your_wallet', state: 'pending', attempts: 0 })
  steps.push({ id: 'request', type: plan.route === 'instant' ? 'instant_redeem' : 'request_withdraw', actor: 'your_wallet', state: 'pending', attempts: 0 })
  // The delayed route adds a wait and a claim; the instant route concludes at the request.
  if (plan.route === 'delayed') {
    steps.push({ id: 'wait', type: 'await_period', actor: 'flare', state: 'pending', attempts: 0 })
    steps.push({ id: 'claim', type: 'claim', actor: 'your_wallet', state: 'pending', attempts: 0 })
  }
  return steps
}

/** Turn a deposit quote+plan reading into the next state. Expects a record in `quoting`. */
export function applyDepositQuote(
  record: DepositOperation,
  input: { quote: DepositQuote; plan: DepositPlanResult; now: number },
): TransitionResult<DepositIntent, DepositQuote, DepositPlan> {
  if (input.plan.kind !== 'plan') {
    // A gate (paused/cap/insufficient/expired) — nothing to sign; the inputs must change.
    return applyTransition(record, { to: 'awaiting_input', at: input.now, patch: { quote: input.quote } })
  }
  const needsApprove = input.plan.plan.approve !== undefined
  return applyTransition(record, {
    to: needsApprove ? 'awaiting_approval' : 'ready',
    at: input.now,
    patch: { quote: input.quote, plan: input.plan.plan, steps: depositSteps(needsApprove) },
  })
}

/** Turn a withdraw quote+plan reading into the next state. Expects a record in `quoting`. */
export function applyWithdrawQuote(
  record: WithdrawOperation,
  input: { quote: WithdrawQuote; plan: WithdrawPlanResult; now: number },
): TransitionResult<WithdrawIntent, WithdrawQuote, WithdrawPlan> {
  if (input.plan.kind !== 'plan') {
    return applyTransition(record, { to: 'awaiting_input', at: input.now, patch: { quote: input.quote } })
  }
  const needsApprove = input.plan.plan.approveShare !== undefined
  return applyTransition(record, {
    to: needsApprove ? 'awaiting_approval' : 'ready',
    at: input.now,
    patch: { quote: input.quote, plan: input.plan.plan, steps: withdrawSteps(input.plan.plan) },
  })
}

/**
 * Reconcile a submitted DELAYED withdrawal against the chain (self-reconciling, no
 * Resume button). Maps the pending reading onto canonical states: waiting →
 * `awaiting_external` with the claimable time; claimable → `action_required` with a
 * safe claim action; claimed → `succeeded`. Expects a record already past the
 * request (submitted / confirming / awaiting_external / action_required).
 */
export function reconcileWithdraw(
  record: WithdrawOperation,
  pending: PendingWithdrawal,
  now: number,
): TransitionResult<WithdrawIntent, WithdrawQuote, WithdrawPlan> {
  const phase = withdrawalPhase(pending, now)
  if (phase === 'claimed') {
    return applyTransition(record, { to: 'succeeded', at: now })
  }
  if (phase === 'claimable' && pending.kind === 'pending') {
    // Only ever moves to action_required, and only with a safe action (escalate's contract).
    // The claim settles an existing request — it moves NO new value and needs no renewed consent.
    return escalate(record, {
      at: now,
      awaitedActor: 'flare',
      reason: 'Your withdrawal is claimable.',
      recovery: [
        {
          id: 'claim',
          label: 'Claim withdrawal',
          effect: 'Transfers your withdrawn assets to your wallet.',
          preconditions: [],
          signs: true,
          broadcasts: true,
          movesNewValue: false,
          nextState: 'executing',
        },
      ],
    })
  }
  // still waiting on the vault's period/epoch clock (now and claimableAt are both unix seconds)
  const claimableAt = pending.kind === 'pending' ? pending.claimableAt : now
  return applyTransition(record, {
    to: 'awaiting_external',
    at: now,
    patch: {
      awaiting: {
        actor: 'flare',
        reason: 'Waiting for the withdrawal period to end.',
        since: now,
        expectedRange: { minMs: 0, maxMs: Math.max(0, (claimableAt - now) * 1000) },
      },
    },
  })
}
