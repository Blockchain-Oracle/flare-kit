// packages/core/src/gasless.ts
import { type Address, maxUint256 } from 'viem'
import { type FlareNetworkKey } from '@flare-kit/contracts'
import {
  type OperationRecord,
  type OperationStep,
  type TransitionResult,
  applyTransition,
  createOperation,
} from './operation.js'
import type { GaslessAdapter, GaslessApprove } from './gasless-adapter.js'
import type { PaymentRequestMessage } from './gasless-eip712.js'

/**
 * The gasless FXRP operation (M9-R2/R3). It reuses the M1 lifecycle engine and the
 * EXISTING canonical states: a gasless payment is `awaiting_input →
 * awaiting_approval/ready → executing` (the payer signs the request) `→ submitted`
 * (the relayer accepts the job) `→ awaiting_external` (relayer submitting) `→ succeeded`
 * (the on-chain transfer read — see `gasless-states.ts`). No new state identifier.
 *
 * The plan REFUSES an unverified forwarder before reading, approving or signing (the
 * M6/M7/M8 verified-flag gate): a forwarder no live run has confirmed never emits a plan
 * that would sign an approval. The one-time approval appears ONLY when the allowance is
 * 0 (0/1 approvals) — it is the single gas-costing step, rendered loud; every payment
 * after it is gasless.
 */

export interface GaslessIntent {
  readonly network: FlareNetworkKey
  readonly to: Address
  readonly amount: bigint
  /** The signature's validity window, in seconds from the chain block time. */
  readonly deadlineSeconds: number
}

export type GaslessError =
  | { readonly kind: 'not-verified'; readonly reason: string }
  | { readonly kind: 'insufficient-balance' }
  | { readonly kind: 'expired-deadline' }
  | { readonly kind: 'relayer-unreachable' }

export interface GaslessPlan {
  /** Present ONLY when the FXRP allowance is 0 — the one-time gas-costing approval. */
  readonly approve?: GaslessApprove
  /** The EIP-712 PaymentRequest the payer signs off-chain (no gas). */
  readonly payment: PaymentRequestMessage
}

export type GaslessPlanResult =
  | { readonly kind: 'plan'; readonly plan: GaslessPlan }
  | { readonly kind: 'error'; readonly error: GaslessError }
  /** A live read failed — nothing safe to sign. Distinct from a route error. */
  | { readonly kind: 'unavailable'; readonly reason: string }

export type GaslessOperation = OperationRecord<GaslessIntent, undefined, GaslessPlan>

export function createGasless(input: {
  chainId: number
  intent: GaslessIntent
  now: number
  id?: string
}): GaslessOperation {
  const op = createOperation<GaslessIntent, undefined, GaslessPlan>({
    capability: 'gasless',
    network: input.chainId,
    intent: input.intent,
    now: input.now,
    ...(input.id ? { id: input.id } : {}),
  })
  // No quote step for gasless: move straight to awaiting_input (the composer gathers
  // recipient + amount; the plan is built from reads, not a router quote).
  return applyTransition(op, { to: 'awaiting_input', at: input.now, patch: {} }).record
}

function reasonOf(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > 0 ? `${fallback}: ${message.slice(0, 120)}` : fallback
}

/**
 * The unsigned gasless plan (M9-R2). Gates BEFORE any signature; refuses an unverified
 * forwarder. `deadline` is derived from the chain block time (`chainTime`), not the wall
 * clock. The approval step appears only when the allowance is 0.
 */
export async function buildGaslessPlan(
  adapter: GaslessAdapter,
  intent: GaslessIntent,
  owner: Address,
  chainTime: number,
): Promise<GaslessPlanResult> {
  // Refuse an unverified forwarder FIRST — never read, approve or sign against a
  // forwarder no live run has confirmed (M9-R12 / the M6/M7/M8 verified-flag gate).
  if (!adapter.deployment.gaslessVerified) {
    return {
      kind: 'error',
      error: {
        kind: 'not-verified',
        reason: `The gasless forwarder on ${intent.network} is not verified in this build — no live run has confirmed a gasless FXRP transfer, so the kit will not sign an approval against it.`,
      },
    }
  }
  // A non-positive window is born expired (chainTime >= chainTime + deadlineSeconds).
  if (intent.deadlineSeconds <= 0) return { kind: 'error', error: { kind: 'expired-deadline' } }
  const deadline = BigInt(chainTime + intent.deadlineSeconds)

  // A read failure is `unavailable`, not an unhandled rejection at the seam — there is
  // nothing safe to sign. Distinct from a plan error.
  try {
    const balance = await adapter.reads.balance(owner)
    if (balance < intent.amount) return { kind: 'error', error: { kind: 'insufficient-balance' } }

    const allowance = await adapter.reads.allowance(owner)
    const nonce = await adapter.reads.nonce(owner)

    // The one-time approval, ONLY when the allowance is 0 (0/1 approvals). MaxUint256 so
    // every payment after the single setup step is gasless.
    const approve = allowance === 0n ? adapter.writes.approveForwarder(maxUint256) : undefined

    const payment: PaymentRequestMessage = { from: owner, to: intent.to, amount: intent.amount, nonce, deadline }
    return { kind: 'plan', plan: { ...(approve ? { approve } : {}), payment } }
  } catch (error) {
    return { kind: 'unavailable', reason: reasonOf(error, 'Could not read the forwarder to build a plan') }
  }
}

/** The lifecycle spine for a gasless payment. */
function gaslessSteps(plan: GaslessPlan): OperationStep[] {
  const steps: OperationStep[] = []
  // The one-time approval is a REAL transaction the payer signs and pays gas for.
  if (plan.approve) steps.push({ id: 'approve', type: 'approve', actor: 'your_wallet', state: 'pending', attempts: 0 })
  // Signing the PaymentRequest is off-chain — no gas.
  steps.push({ id: 'sign', type: 'sign_payment', actor: 'your_wallet', state: 'pending', attempts: 0 })
  // The relayer submits and pays the gas; the transfer confirms on-chain.
  steps.push({ id: 'relay', type: 'relay_submit', actor: 'relayer', state: 'pending', attempts: 0 })
  return steps
}

/**
 * Turn a plan reading into the next state (expects a record in `awaiting_input`). A plan
 * error/unavailable has nothing to sign — it returns to `awaiting_input`; the surface
 * renders the specific error. A plan needing approval → `awaiting_approval`, else
 * `ready`.
 */
export function applyGaslessPlan(
  record: GaslessOperation,
  input: { plan: GaslessPlanResult; now: number },
): TransitionResult<GaslessIntent, undefined, GaslessPlan> {
  if (input.plan.kind !== 'plan') {
    return applyTransition(record, { to: 'awaiting_input', at: input.now, patch: {} })
  }
  const needsApprove = input.plan.plan.approve !== undefined
  return applyTransition(record, {
    to: needsApprove ? 'awaiting_approval' : 'ready',
    at: input.now,
    patch: { plan: input.plan.plan, steps: gaslessSteps(input.plan.plan) },
  })
}
