import type { DirectMintingDelayState } from '@flare-kit/contracts'
import type { RecoveryAction } from '../recovery.js'
import type { OperationState, StepActor } from '../states.js'

/**
 * The recovery matrix for a direct mint, as a pure function of observed chain
 * state (R-REC-004).
 *
 * Two rules govern every branch below, and both come from the fact that the
 * XRP has already left the payer's account by the time any of this runs:
 *
 *   1. No branch returns `failed`. Every state here is either settled, a wait
 *      on a named actor, or an action that reuses evidence we already hold.
 *   2. No action ever moves new value. The one action this capability can
 *      offer is `executeDirectMinting`, which completes the mint from the
 *      payment and proof that already exist. There is no branch on which
 *      paying again is correct, so there is no code path that can offer it.
 *
 * Verified against the contract in
 * `.thoughts/research/2026-08-04-direct-minting-execution.md`.
 */

export interface DirectMintChainState {
  /** The XRPL transaction id. Also the idempotency key (R10). */
  readonly xrplTxId: string
  /** The payment has reached the confirmations the FDC verifier requires. */
  readonly xrplFinal: boolean
  /** A finalized attestation proof has been retrieved. */
  readonly proofAvailable: boolean
  /** `directMintingDelayState(txId)`, named by the contract's own enum. */
  readonly delayState: DirectMintingDelayState
  /** The protocol's allowed-at, in epoch milliseconds, when delayed. */
  readonly allowedAt?: number
  /** The AssetManager has confirmed this payment: the mint is done. */
  readonly alreadySettled: boolean
  /** While set and in the future, only the named executor may execute. */
  readonly executorExclusiveUntil?: number
  /** A named protocol-configuration gap, if one blocks execution. */
  readonly unavailableReason?: string
}

export interface RecoveryPlan {
  readonly state: OperationState
  readonly actions: readonly RecoveryAction[]
  /** True only if any offered action would move new value. Always false here. */
  readonly movesNewValue: boolean
  readonly awaitedActor?: StepActor
  readonly reason?: string
  /** When a currently-withheld action becomes available. */
  readonly availableAt?: number
  readonly idempotencyKey: string
}

const EXECUTE_ACTION: RecoveryAction = {
  id: 'execute-direct-minting',
  label: 'Complete the mint',
  effect:
    'Completes this mint using the XRP payment you already made and the proof already obtained. It sends no further XRP.',
  preconditions: [],
  signs: true,
  broadcasts: true,
  // The load-bearing field. Executing consumes existing evidence; it never
  // creates a new value-moving action.
  movesNewValue: false,
  nextState: 'executing',
}

function wait(
  state: OperationState,
  actor: StepActor,
  reason: string,
  idempotencyKey: string,
  availableAt?: number,
): RecoveryPlan {
  return {
    state,
    actions: [],
    movesNewValue: false,
    awaitedActor: actor,
    reason,
    ...(availableAt !== undefined ? { availableAt } : {}),
    idempotencyKey,
  }
}

export function planRecovery(chain: DirectMintChainState, now: number): RecoveryPlan {
  const key = chain.xrplTxId

  // Settled first: everything below is moot once the FAsset has been credited,
  // and re-submitting would revert with PaymentAlreadyConfirmed (AC8).
  if (chain.alreadySettled) {
    return {
      state: 'succeeded',
      actions: [],
      movesNewValue: false,
      idempotencyKey: key,
    }
  }

  if (!chain.xrplFinal) {
    return wait(
      'confirming',
      'xrpl',
      'Waiting for the XRP Ledger to confirm the payment. The FDC requires three confirmations before it can be attested.',
      key,
    )
  }

  if (!chain.proofAvailable) {
    return wait(
      'awaiting_external',
      'fdc',
      'Waiting for the Flare Data Connector to finalize the voting round and publish the attestation proof for this payment.',
      key,
    )
  }

  if (chain.unavailableReason) {
    // A configuration gap on this network. Nothing the payer did, and nothing
    // they can do — but the payment and proof keep, so this is not a failure.
    return {
      state: 'action_required',
      actions: [],
      movesNewValue: false,
      awaitedActor: 'operator',
      reason: `Direct minting is not configured on this network right now (${chain.unavailableReason}). Your payment and its proof remain valid and this mint can be completed once an operator resolves it.`,
      idempotencyKey: key,
    }
  }

  if (chain.delayState === 'Delayed') {
    return wait(
      'awaiting_external',
      'flare',
      'This mint is inside the protocol’s delay window for large or rate-limited amounts. It can be completed once the window opens.',
      key,
      chain.allowedAt,
    )
  }

  if (chain.executorExclusiveUntil !== undefined && now < chain.executorExclusiveUntil) {
    // Offering execution here would revert with InvalidExecutor. An action that
    // cannot succeed is not a safe action, so none is offered.
    return wait(
      'awaiting_external',
      'executor',
      'The named executor has the exclusive right to complete this mint for a short period. If it does not, you will be able to complete it yourself.',
      key,
      chain.executorExclusiveUntil,
    )
  }

  return {
    state: 'action_required',
    actions: [EXECUTE_ACTION],
    movesNewValue: false,
    idempotencyKey: key,
  }
}
