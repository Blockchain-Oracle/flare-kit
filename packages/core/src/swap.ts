import { type Address, type DexRegistry, dexFor } from '@flare-kit/contracts'
import {
  type OperationRecord,
  type OperationStep,
  type TransitionResult,
  applyTransition,
  createOperation,
} from './operation.js'
import type { SwapQuote, SwapQuoteResult } from './swap-quote.js'

/**
 * The swap operation (M5-R3). It reuses the M1 lifecycle engine — one immutable
 * intent, a re-quotable quote, an unsigned plan and the canonical states — and
 * adds only what a swap needs: a plan whose approve step appears exactly when
 * the router's allowance is short and is never folded into the swap, and a
 * `swapExactTokensForTokens` call whose `amountOutMin` is the quote's slippage
 * floor, enforced on chain.
 *
 * State only ever moves along the legal table in `states.ts`. `applyTransition`
 * silently drops a patch on an illegal hop, so the quote and plan are attached
 * on the one legal hop out of `quoting` — never by jumping straight from draft.
 */

export interface SwapIntent {
  readonly fromKey: string
  readonly toKey: string
  /** Raw units of the `from` token. Immutable once the operation exists. */
  readonly amountIn: bigint
  readonly slippageBips: number
  readonly recipient: Address
  /** Unix seconds; the router reverts past it rather than filling a stale trade. */
  readonly deadline: number
}

export interface ApproveStep {
  readonly token: Address
  readonly spender: Address
  readonly amount: bigint
}

export interface SwapCall {
  readonly functionName: 'swapExactTokensForTokens'
  readonly amountIn: bigint
  readonly amountOutMin: bigint
  readonly path: readonly Address[]
  readonly to: Address
  readonly deadline: bigint
}

export interface SwapPlan {
  readonly router: Address
  /** Present only when the allowance is short. Absent means: no approval needed. */
  readonly approve?: ApproveStep
  readonly swap: SwapCall
}

export type SwapOperation = OperationRecord<SwapIntent, SwapQuote, SwapPlan>

export interface CreateSwapInput {
  readonly chainId: number
  readonly intent: SwapIntent
  readonly now: number
  readonly id?: string
}

export function createSwap(input: CreateSwapInput): SwapOperation {
  return createOperation<SwapIntent, SwapQuote, SwapPlan>({
    capability: 'swap',
    network: input.chainId,
    intent: input.intent,
    now: input.now,
    ...(input.id ? { id: input.id } : {}),
  })
}

/** The unsigned plan a host signs. Pure — an approve step iff the allowance is short. */
export function buildSwapPlan(
  intent: SwapIntent,
  quote: SwapQuote,
  allowance: bigint,
  dex: DexRegistry,
): SwapPlan {
  const needsApprove = allowance < intent.amountIn
  return {
    router: dex.router,
    ...(needsApprove
      ? { approve: { token: quote.from.address, spender: dex.router, amount: intent.amountIn } }
      : {}),
    swap: {
      functionName: 'swapExactTokensForTokens',
      amountIn: intent.amountIn,
      // The slippage floor the quote computed, enforced by the router itself.
      amountOutMin: quote.minReceived.value,
      path: quote.path,
      to: intent.recipient,
      deadline: BigInt(intent.deadline),
    },
  }
}

function swapSteps(needsApprove: boolean): OperationStep[] {
  const swap: OperationStep = {
    id: 'swap',
    type: 'swap',
    actor: 'your_wallet',
    state: 'pending',
    attempts: 0,
  }
  if (!needsApprove) return [swap]
  return [
    { id: 'approve', type: 'approve', actor: 'your_wallet', state: 'pending', attempts: 0 },
    swap,
  ]
}

/**
 * Move to `quoting` when a read starts. Legal from draft, awaiting_input, ready and
 * expired. Generic over the operation shape (M6-R2 reuses this verbatim for
 * add/remove liquidity, which carry their own intent/quote/plan types) — the body
 * is already state-machine-generic; only the signature was needlessly narrowed to
 * swap's own types.
 */
export function startQuoting<TIntent, TQuote, TPlan>(
  record: OperationRecord<TIntent, TQuote, TPlan>,
  now: number,
): TransitionResult<TIntent, TQuote, TPlan> {
  return applyTransition<TIntent, TQuote, TPlan>(record, { to: 'quoting', at: now })
}

export interface ApplyQuoteInput {
  readonly result: SwapQuoteResult
  /** The router's current allowance from the `from` token. Decides the approve step. */
  readonly allowance: bigint
  readonly now: number
}

/**
 * Turn a quote reading into the next state. Expects a record in `quoting`.
 *
 * - a real quote with a sufficient allowance → `ready`, plan attached;
 * - a real quote with a short allowance → `awaiting_approval`, plan carries the
 *   approve step;
 * - no route or an unreadable quote → back to `awaiting_input`: there is nothing
 *   to sign, and the inputs are what must change. No plan and no price are
 *   invented for a pool that cannot fill the trade.
 */
export function applyQuote(
  record: SwapOperation,
  input: ApplyQuoteInput,
): TransitionResult<SwapIntent, SwapQuote, SwapPlan> {
  if (input.result.kind !== 'quote') {
    return applyTransition<SwapIntent, SwapQuote, SwapPlan>(record, {
      to: 'awaiting_input',
      at: input.now,
    })
  }
  const dex = dexFor(record.network)
  const needsApprove = input.allowance < record.intent.amountIn
  const plan = buildSwapPlan(record.intent, input.result.quote, input.allowance, dex)
  return applyTransition<SwapIntent, SwapQuote, SwapPlan>(record, {
    to: needsApprove ? 'awaiting_approval' : 'ready',
    at: input.now,
    patch: { quote: input.result.quote, plan, steps: swapSteps(needsApprove) },
  })
}
