import type { RedemptionStatus } from '@flare-kit/contracts'
import type { RecoveryAction } from '../recovery.js'
import type { OperationState, StepActor } from '../states.js'

/**
 * The recovery matrix for a redemption.
 *
 * It differs from the mint's in one structural way: the counterparty is a named
 * **agent**, not the protocol. A mint waits on machinery; a redemption waits on
 * somebody who might not pay. So the deadline is load-bearing, and crossing it
 * turns a wait into a genuine user action.
 *
 * The same two rules hold as for minting, for the same reason — the FAsset was
 * burned the moment the request was made:
 *   1. No branch returns `failed` for an outcome that is merely unresolved.
 *   2. No action moves new value. Claiming the default consumes the burn that
 *      already happened.
 */

/** `MISSING` is not a contract status: it is what a deleted request reads as. */
export type RedeemStatus = RedemptionStatus | 'MISSING'

export interface RedeemChainState {
  readonly requestId: string
  readonly status: RedeemStatus
  readonly agentVault: string
  readonly paymentAddress: string
  /** `lastUnderlyingTimestamp`, in milliseconds. */
  readonly agentDeadline: number
  /** A ReferencedPaymentNonexistence proof has been obtained. */
  readonly defaultProofAvailable: boolean
}

export interface RedeemRecoveryPlan {
  readonly state: OperationState
  readonly actions: readonly RecoveryAction[]
  readonly movesNewValue: boolean
  readonly awaitedActor?: StepActor
  readonly reason?: string
  readonly availableAt?: number
  readonly idempotencyKey: string
}

function claimAction(premiumNote: string): RecoveryAction {
  return {
    id: 'redemption-payment-default',
    label: 'Claim collateral instead',
    effect: `The agent did not pay within the window. This claims ${premiumNote} in collateral on Flare. You receive collateral, not XRP.`,
    preconditions: [],
    signs: true,
    broadcasts: true,
    // The FAsset was burned when the request was made. Claiming settles that
    // burn; it does not take anything further from the redeemer.
    movesNewValue: false,
    nextState: 'executing',
  }
}

function wait(
  actor: StepActor,
  reason: string,
  key: string,
  availableAt?: number,
  state: OperationState = 'awaiting_external',
): RedeemRecoveryPlan {
  return {
    state,
    actions: [],
    movesNewValue: false,
    awaitedActor: actor,
    reason,
    ...(availableAt !== undefined ? { availableAt } : {}),
    idempotencyKey: key,
  }
}

export function planRedeemRecovery(
  chain: RedeemChainState,
  now: number,
): RedeemRecoveryPlan {
  const key = chain.requestId

  // A deleted request means the agent's payment was confirmed. Absence is the
  // success signal here, and reading it as "not found" would be a lie.
  if (chain.status === 'MISSING' || chain.status === 'SUCCESSFUL') {
    return { state: 'succeeded', actions: [], movesNewValue: false, idempotencyKey: key }
  }

  if (chain.status === 'DEFAULTED_FAILED') {
    // The redeemer was paid, but in collateral rather than the XRP they asked
    // for. Calling that "succeeded" would hide the substitution.
    return {
      state: 'partially_succeeded',
      actions: [],
      movesNewValue: false,
      reason:
        'The agent did not pay, so this settled in collateral on Flare instead of XRP on the XRP Ledger.',
      idempotencyKey: key,
    }
  }

  if (chain.status === 'BLOCKED' || chain.status === 'REJECTED') {
    // Both are real protocol outcomes whose consequences depend on specifics we
    // do not read here. Neither is claimed as success or failure.
    return {
      state: 'action_required',
      actions: [],
      movesNewValue: false,
      awaitedActor: 'operator',
      reason:
        chain.status === 'REJECTED'
          ? 'The agent rejected this redemption because the destination address was not accepted. The outcome needs review before any further action.'
          : 'The agent reported the payment as blocked by the destination address. The outcome needs review before any further action.',
      idempotencyKey: key,
    }
  }

  if (chain.status === 'DEFAULTED_UNCONFIRMED') {
    return wait(
      'agent',
      'A default was called, and a late payment from the agent can still be confirmed. The outcome is not settled yet.',
      key,
    )
  }

  // ACTIVE.
  if (now <= chain.agentDeadline) {
    return wait(
      'agent',
      `The agent has until the deadline to send your XRP from their own address. Nothing is at risk while the window is open.`,
      key,
      chain.agentDeadline,
    )
  }

  if (!chain.defaultProofAvailable) {
    // The deadline has passed, but claiming needs a ReferencedPaymentNonexistence
    // proof — an FDC attestation that the payment did not happen.
    return wait(
      'fdc',
      'The window closed without payment. Obtaining proof from the Flare Data Connector that no payment was made, which is what a collateral claim requires.',
      key,
    )
  }

  return {
    state: 'action_required',
    actions: [claimAction('the value of your redemption, plus the protocol premium,')],
    movesNewValue: false,
    idempotencyKey: key,
  }
}
