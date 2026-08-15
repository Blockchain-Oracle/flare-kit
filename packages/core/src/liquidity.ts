// packages/core/src/liquidity.ts
import { type Address, type DexRegistry, dexFor } from '@flarekit-dev/contracts'
import {
  type OperationRecord,
  type OperationStep,
  type TransitionResult,
  applyTransition,
  createOperation,
} from './operation.js'
import type { ApproveStep } from './swap.js'
import type {
  AddLiquidityQuote,
  AddLiquidityQuoteResult,
  RemoveLiquidityQuote,
  RemoveLiquidityQuoteResult,
} from './liquidity-quote.js'

/**
 * The add/remove liquidity operation (M6-R2). It reuses the M1 lifecycle engine:
 * an immutable intent, a re-quotable quote, an unsigned plan and the canonical
 * states. Adding may need up to two approvals (both tokens) and removing needs the
 * LP-token approval — each appears exactly when its allowance is short and is never
 * folded into the addLiquidity/removeLiquidity call. amountAMin/amountBMin are the
 * quote's slippage floors, enforced on chain: a ratio that drifts past them reverts
 * and is rendered as slippage-exceeded, not a kit failure. State only ever moves
 * along the legal table in states.ts (applyTransition drops a patch on an illegal
 * hop, so quote+plan attach on the one legal hop out of `quoting`).
 */

export interface AddLiquidityIntent {
  readonly tokenAKey: string
  readonly tokenBKey: string
  /** Raw units of tokenA the provider wants to supply. tokenB is paired at ratio. */
  readonly amountADesired: bigint
  readonly slippageBips: number
  readonly recipient: Address
  readonly deadline: number
}

export interface RemoveLiquidityIntent {
  readonly tokenAKey: string
  readonly tokenBKey: string
  /** Absolute LP-token amount to burn. A percent affordance in the UI resolves to this. */
  readonly liquidity: bigint
  readonly slippageBips: number
  readonly recipient: Address
  readonly deadline: number
}

export interface AddLiquidityCall {
  readonly functionName: 'addLiquidity'
  readonly tokenA: Address
  readonly tokenB: Address
  readonly amountADesired: bigint
  readonly amountBDesired: bigint
  readonly amountAMin: bigint
  readonly amountBMin: bigint
  /** BlazeSwap fee-on-transfer tolerance in bips; 0 for standard tokens (FXRP/USD₮0). */
  readonly feeBipsA: bigint
  readonly feeBipsB: bigint
  readonly to: Address
  readonly deadline: bigint
}

export interface RemoveLiquidityCall {
  readonly functionName: 'removeLiquidity'
  readonly tokenA: Address
  readonly tokenB: Address
  readonly liquidity: bigint
  readonly amountAMin: bigint
  readonly amountBMin: bigint
  readonly to: Address
  readonly deadline: bigint
}

export interface AddLiquidityPlan {
  readonly router: Address
  readonly approveA?: ApproveStep
  readonly approveB?: ApproveStep
  readonly add: AddLiquidityCall
}

export interface RemoveLiquidityPlan {
  readonly router: Address
  readonly approveLp?: ApproveStep
  readonly remove: RemoveLiquidityCall
}

export type AddLiquidityOperation = OperationRecord<AddLiquidityIntent, AddLiquidityQuote, AddLiquidityPlan>
export type RemoveLiquidityOperation = OperationRecord<RemoveLiquidityIntent, RemoveLiquidityQuote, RemoveLiquidityPlan>

export { startQuoting } from './swap.js'

export function createAddLiquidity(input: { chainId: number; intent: AddLiquidityIntent; now: number; id?: string }): AddLiquidityOperation {
  return createOperation<AddLiquidityIntent, AddLiquidityQuote, AddLiquidityPlan>({
    capability: 'add_liquidity',
    network: input.chainId,
    intent: input.intent,
    now: input.now,
    ...(input.id ? { id: input.id } : {}),
  })
}

export function createRemoveLiquidity(input: { chainId: number; intent: RemoveLiquidityIntent; now: number; id?: string }): RemoveLiquidityOperation {
  return createOperation<RemoveLiquidityIntent, RemoveLiquidityQuote, RemoveLiquidityPlan>({
    capability: 'remove_liquidity',
    network: input.chainId,
    intent: input.intent,
    now: input.now,
    ...(input.id ? { id: input.id } : {}),
  })
}

const approve = (token: Address, spender: Address, amount: bigint): ApproveStep => ({ token, spender, amount })

/** The unsigned add plan. An approve appears iff that token's allowance is short. */
export function buildAddPlan(intent: AddLiquidityIntent, quote: AddLiquidityQuote, allowanceA: bigint, allowanceB: bigint, dex: DexRegistry): AddLiquidityPlan {
  const needA = allowanceA < intent.amountADesired
  const needB = allowanceB < quote.amountB.value
  return {
    router: dex.router,
    ...(needA ? { approveA: approve(quote.tokenA.address, dex.router, intent.amountADesired) } : {}),
    ...(needB ? { approveB: approve(quote.tokenB.address, dex.router, quote.amountB.value) } : {}),
    add: {
      functionName: 'addLiquidity',
      tokenA: quote.tokenA.address,
      tokenB: quote.tokenB.address,
      amountADesired: intent.amountADesired,
      amountBDesired: quote.amountB.value,
      amountAMin: quote.minA.value,
      amountBMin: quote.minB.value,
      feeBipsA: 0n,
      feeBipsB: 0n,
      to: intent.recipient,
      deadline: BigInt(intent.deadline),
    },
  }
}

/** The unsigned remove plan. The LP-token approve appears iff its allowance is short. */
export function buildRemovePlan(intent: RemoveLiquidityIntent, quote: RemoveLiquidityQuote, lpAllowance: bigint, dex: DexRegistry): RemoveLiquidityPlan {
  const needLp = lpAllowance < intent.liquidity
  return {
    router: dex.router,
    ...(needLp ? { approveLp: approve(quote.pair, dex.router, intent.liquidity) } : {}),
    remove: {
      functionName: 'removeLiquidity',
      tokenA: quote.tokenA.address,
      tokenB: quote.tokenB.address,
      liquidity: intent.liquidity,
      amountAMin: quote.minA.value,
      amountBMin: quote.minB.value,
      to: intent.recipient,
      deadline: BigInt(intent.deadline),
    },
  }
}

function addSteps(needA: boolean, needB: boolean): OperationStep[] {
  const steps: OperationStep[] = []
  if (needA) steps.push({ id: 'approve-a', type: 'approve', actor: 'your_wallet', state: 'pending', attempts: 0 })
  if (needB) steps.push({ id: 'approve-b', type: 'approve', actor: 'your_wallet', state: 'pending', attempts: 0 })
  steps.push({ id: 'add', type: 'add_liquidity', actor: 'your_wallet', state: 'pending', attempts: 0 })
  return steps
}

function removeSteps(needLp: boolean): OperationStep[] {
  const steps: OperationStep[] = []
  if (needLp) steps.push({ id: 'approve-lp', type: 'approve', actor: 'your_wallet', state: 'pending', attempts: 0 })
  steps.push({ id: 'remove', type: 'remove_liquidity', actor: 'your_wallet', state: 'pending', attempts: 0 })
  return steps
}

export interface ApplyAddQuoteInput {
  readonly result: AddLiquidityQuoteResult
  readonly allowanceA: bigint
  readonly allowanceB: bigint
  readonly now: number
}

export function applyAddQuote(record: AddLiquidityOperation, input: ApplyAddQuoteInput): TransitionResult<AddLiquidityIntent, AddLiquidityQuote, AddLiquidityPlan> {
  if (input.result.kind !== 'quote') {
    return applyTransition(record, { to: 'awaiting_input', at: input.now })
  }
  const dex = dexFor(record.network)
  const quote = input.result.quote
  const needA = input.allowanceA < record.intent.amountADesired
  const needB = input.allowanceB < quote.amountB.value
  const plan = buildAddPlan(record.intent, quote, input.allowanceA, input.allowanceB, dex)
  return applyTransition(record, {
    to: needA || needB ? 'awaiting_approval' : 'ready',
    at: input.now,
    patch: { quote, plan, steps: addSteps(needA, needB) },
  })
}

export interface ApplyRemoveQuoteInput {
  readonly result: RemoveLiquidityQuoteResult
  readonly lpAllowance: bigint
  readonly now: number
}

export function applyRemoveQuote(record: RemoveLiquidityOperation, input: ApplyRemoveQuoteInput): TransitionResult<RemoveLiquidityIntent, RemoveLiquidityQuote, RemoveLiquidityPlan> {
  if (input.result.kind !== 'quote') {
    return applyTransition(record, { to: 'awaiting_input', at: input.now })
  }
  const dex = dexFor(record.network)
  const quote = input.result.quote
  const needLp = input.lpAllowance < record.intent.liquidity
  const plan = buildRemovePlan(record.intent, quote, input.lpAllowance, dex)
  return applyTransition(record, {
    to: needLp ? 'awaiting_approval' : 'ready',
    at: input.now,
    patch: { quote, plan, steps: removeSteps(needLp) },
  })
}
