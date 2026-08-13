import {
  type AddLiquidityIntent,
  type AddLiquidityOperation,
  type AddLiquidityQuote,
  type AddLiquidityQuoteResult,
  type Position,
  type RemoveLiquidityIntent,
  type RemoveLiquidityOperation,
  type RemoveLiquidityQuote,
  type RemoveLiquidityQuoteResult,
  FlareKitError,
  MOCK_EPOCH,
  advanceSteps,
  amount,
  applyAddQuote,
  applyRemoveQuote,
  applyTransition,
  createAddLiquidity,
  createRemoveLiquidity,
  serializeError,
  startQuoting,
} from '@flare-kit/core'
import { AddLiquidityCard, PoolCatalogue, PositionCard } from '../src/index.js'

/**
 * Dev-only. Every AC5 state of the M6 liquidity surfaces, in both themes (the
 * one gallery toggle re-themes them). States are built by walking the real
 * add/remove liquidity state machines with fixture readings — the surfaces
 * are prop-driven, so each state is just a record and a quote, never a live
 * call. Mirrors `m5-swap-sections.tsx`'s construction exactly.
 */

const NOW = MOCK_EPOCH
const NOW_S = Math.floor(NOW / 1000)
const RECIP = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as const
const FXRP = { symbol: 'FXRP', address: '0x0b6A3645c240605887a5532109323A3E12273dc7', decimals: 6 } as const
const USDT0 = { symbol: 'USD₮0', address: '0xC1A5B41512496B80903D1f32d6dEa3a73212E71F', decimals: 6 } as const
const PAIR = '0xDD598473f738df117Ee331bc07172481db60acBE' as const
const AMPLE = 10n ** 30n

const APPROVE_A_TX = '0xa11ce0000000000000000000000000000000000000000000000000000000a11c'
const ADD_TX = '0xadd00000000000000000000000000000000000000000000000000000000add0'
const APPROVE_LP_TX = '0x1970000000000000000000000000000000000000000000000000000001970000'
const REMOVE_TX = '0x2e40000000000000000000000000000000000000000000000000000002e40000'

const base = { tokenA: FXRP, tokenB: USDT0, networkLabel: 'Coston2' } as const
const BALANCE_A = amount(247_500000n, 6, 'FXRP')
const BALANCE_B = amount(12_340000n, 6, 'USD₮0')

// ---------------------------------------------------------------------------
// AddLiquidityCard — walk createAddLiquidity → startQuoting → applyAddQuote
// ---------------------------------------------------------------------------

const QUOTE: AddLiquidityQuote = {
  tokenA: FXRP,
  tokenB: USDT0,
  amountA: amount(1_000000n, 6, 'FXRP'),
  amountB: amount(1_176000n, 6, 'USD₮0'),
  minA: amount(995000n, 6, 'FXRP'),
  minB: amount(1_170120n, 6, 'USD₮0'),
  expectedLp: 1_080000000000000000n,
  lpDecimals: 18,
  lpSymbol: 'BLAZE-LP',
  poolShareBips: 40,
  slippageBips: 50,
  pair: PAIR,
  observedAt: NOW,
}
const ADD_QUOTE_RESULT: AddLiquidityQuoteResult = { kind: 'quote', quote: QUOTE }
const NO_POOL_RESULT: AddLiquidityQuoteResult = {
  kind: 'no_pool',
  message: 'No FXRP / WC2FLR pool exists on this network yet.',
}
const ADD_UNVERIFIED_RESULT: AddLiquidityQuoteResult = {
  kind: 'unavailable',
  reason: 'Adding liquidity is verified only on Coston2 in this build — FXRP/USD₮0 on this network uses an addLiquidity signature that has not been verified on chain.',
}

function addIn(allowanceA: bigint, allowanceB: bigint, result: AddLiquidityQuoteResult = ADD_QUOTE_RESULT): AddLiquidityOperation {
  const intent: AddLiquidityIntent = {
    tokenAKey: 'FXRP',
    tokenBKey: 'USDT0',
    amountADesired: 1_000000n,
    slippageBips: 50,
    recipient: RECIP,
    deadline: NOW_S + 1200,
  }
  let op = createAddLiquidity({ chainId: 114, intent, now: NOW, id: 'op_add' })
  op = startQuoting(op, NOW).record
  return applyAddQuote(op, { result, allowanceA, allowanceB, now: NOW }).record
}

const hopAdd = (op: AddLiquidityOperation, to: AddLiquidityOperation['state'], patch: object, evidence?: object[]): AddLiquidityOperation =>
  applyTransition(op, { to, at: NOW, patch, ...(evidence ? { evidence: evidence as never } : {}) }).record

// quote → both allowances ample, straight to ready
const READY = addIn(AMPLE, AMPLE)
// needs approval, each side its own step
const NEEDS_APPROVAL_A = addIn(0n, AMPLE)
const NEEDS_APPROVAL_B = addIn(AMPLE, 0n)
// approve confirmed out-of-band → ready to execute (mirrors m5's READY_AT_SWAP),
// steps still carry the approve-a + add pair so the spine has both to walk
const READY_AT_ADD = hopAdd(NEEDS_APPROVAL_A, 'ready', {})
const APPROVING = hopAdd(READY_AT_ADD, 'executing', {
  steps: advanceSteps(READY_AT_ADD.steps, { done: 0, current: 'active' }, NOW),
})
const ADDING = hopAdd(
  APPROVING,
  'submitted',
  { steps: advanceSteps(APPROVING.steps, { done: 1, current: 'active' }, NOW) },
  [{ kind: 'flare_tx', label: 'Approval', value: APPROVE_A_TX, observedAt: NOW }],
)
const ADD_SUCCEEDED = hopAdd(
  ADDING,
  'succeeded',
  { steps: advanceSteps(ADDING.steps, { done: 2, current: 'done' }, NOW) },
  [{ kind: 'flare_tx', label: 'Add liquidity', value: ADD_TX, observedAt: NOW }],
)

const NO_POOL = addIn(0n, 0n, NO_POOL_RESULT)
const ADD_UNVERIFIED = addIn(0n, 0n, ADD_UNVERIFIED_RESULT)

const RATIO_EXCEEDED = hopAdd(
  hopAdd(READY, 'executing', { steps: advanceSteps(READY.steps, { done: 0, current: 'active' }, NOW) }),
  'expired',
  {
    steps: advanceSteps(READY.steps, { done: 0, current: 'failed' }, NOW),
    error: serializeError(
      new FlareKitError('SLIPPAGE_EXCEEDED', {
        domain: 'protocol',
        message:
          'The pool ratio moved past your minimums before the add confirmed. Nothing moved — re-quote to continue.',
        recovery: 'safe_to_retry',
        valueMoved: 'no',
      }),
    ),
  },
)

// ---------------------------------------------------------------------------
// PositionCard — walk createRemoveLiquidity → startQuoting → applyRemoveQuote
// ---------------------------------------------------------------------------

const POSITION: Position = {
  tokenA: FXRP,
  tokenB: USDT0,
  lpBalance: 6_250000n,
  amountA: amount(5_900000n, 6, 'FXRP'),
  amountB: amount(6_945000n, 6, 'USD₮0'),
  poolShareBips: 250,
  pair: PAIR,
}

const REMOVE_QUOTE: RemoveLiquidityQuote = {
  tokenA: FXRP,
  tokenB: USDT0,
  liquidity: 3_125000n,
  amountA: amount(2_950000n, 6, 'FXRP'),
  amountB: amount(3_472500n, 6, 'USD₮0'),
  minA: amount(2_935250n, 6, 'FXRP'),
  minB: amount(3_455137n, 6, 'USD₮0'),
  slippageBips: 50,
  pair: PAIR,
  observedAt: NOW,
}
const REMOVE_QUOTE_RESULT: RemoveLiquidityQuoteResult = { kind: 'quote', quote: REMOVE_QUOTE }

function removeIn(lpAllowance: bigint): RemoveLiquidityOperation {
  const intent: RemoveLiquidityIntent = {
    tokenAKey: 'FXRP',
    tokenBKey: 'USDT0',
    liquidity: 3_125000n,
    slippageBips: 50,
    recipient: RECIP,
    deadline: NOW_S + 1200,
  }
  let op = createRemoveLiquidity({ chainId: 114, intent, now: NOW, id: 'op_remove' })
  op = startQuoting(op, NOW).record
  return applyRemoveQuote(op, { result: REMOVE_QUOTE_RESULT, lpAllowance, now: NOW }).record
}

const hopRemove = (op: RemoveLiquidityOperation, to: RemoveLiquidityOperation['state'], patch: object, evidence?: object[]): RemoveLiquidityOperation =>
  applyTransition(op, { to, at: NOW, patch, ...(evidence ? { evidence: evidence as never } : {}) }).record

// LP allowance short → its own approve step, named "remove-approval"
const REMOVE_NEEDS_APPROVAL = removeIn(0n)
// approve confirmed out-of-band → ready to execute (mirrors the add chain above)
const REMOVE_READY = hopRemove(REMOVE_NEEDS_APPROVAL, 'ready', {})
const REMOVE_APPROVING = hopRemove(REMOVE_READY, 'executing', {
  steps: advanceSteps(REMOVE_READY.steps, { done: 0, current: 'active' }, NOW),
})
const REMOVING = hopRemove(
  REMOVE_APPROVING,
  'submitted',
  { steps: advanceSteps(REMOVE_APPROVING.steps, { done: 1, current: 'active' }, NOW) },
  [{ kind: 'flare_tx', label: 'Approval', value: APPROVE_LP_TX, observedAt: NOW }],
)
const REMOVED = hopRemove(
  REMOVING,
  'succeeded',
  { steps: advanceSteps(REMOVING.steps, { done: 2, current: 'done' }, NOW) },
  [{ kind: 'flare_tx', label: 'Remove liquidity', value: REMOVE_TX, observedAt: NOW }],
)

export const M6_LIQUIDITY_SECTIONS = [
  {
    id: 'm6-add-liquidity',
    title: 'M6 · AddLiquidityCard (states reachable from props)',
    cases: [
      { name: 'quote — ratio-locked pair, expected LP, pool share', node: <AddLiquidityCard operation={READY} quoteResult={ADD_QUOTE_RESULT} balanceA={BALANCE_A} balanceB={BALANCE_B} {...base} /> },
      { name: 'needs approval — token A short, its own step', node: <AddLiquidityCard operation={NEEDS_APPROVAL_A} quoteResult={ADD_QUOTE_RESULT} balanceA={BALANCE_A} balanceB={BALANCE_B} {...base} /> },
      { name: 'needs approval — token B short, its own step', node: <AddLiquidityCard operation={NEEDS_APPROVAL_B} quoteResult={ADD_QUOTE_RESULT} balanceA={BALANCE_A} balanceB={BALANCE_B} {...base} /> },
      { name: 'approving — approve tx in flight on the spine', node: <AddLiquidityCard operation={APPROVING} quoteResult={ADD_QUOTE_RESULT} {...base} /> },
      { name: 'adding — approval done, add tx in flight', node: <AddLiquidityCard operation={ADDING} quoteResult={ADD_QUOTE_RESULT} {...base} /> },
      { name: 'success — Liquidity added, with the approval and add tx evidence', node: <AddLiquidityCard operation={ADD_SUCCEEDED} quoteResult={ADD_QUOTE_RESULT} {...base} /> },
      { name: 'no pool — stated with its reason, never a zero', node: <AddLiquidityCard operation={NO_POOL} quoteResult={NO_POOL_RESULT} {...base} /> },
      { name: 'unverified venue — refuses the add rather than a plan that reverts', node: <AddLiquidityCard operation={ADD_UNVERIFIED} quoteResult={ADD_UNVERIFIED_RESULT} {...base} /> },
      { name: 'ratio exceeded — distinct, re-quotable, never a kit failure', node: <AddLiquidityCard operation={RATIO_EXCEEDED} quoteResult={ADD_QUOTE_RESULT} {...base} /> },
      { name: 'insufficient balance — blocks supply, names the short asset', node: <AddLiquidityCard operation={READY} quoteResult={ADD_QUOTE_RESULT} balanceA={amount(500000n, 6, 'FXRP')} balanceB={BALANCE_B} {...base} /> },
    ],
  },
  {
    id: 'm6-position',
    title: 'M6 · PositionCard (states reachable from props)',
    cases: [
      { name: 'no position — stated with its reason, never an empty guess', node: <PositionCard position={null} tokenA={FXRP} tokenB={USDT0} networkLabel="Coston2" /> },
      { name: 'unavailable — read failed, stated honestly (never a false empty)', node: <PositionCard position={null} unavailable="Could not reach the Coston2 RPC." tokenA={FXRP} tokenB={USDT0} networkLabel="Coston2" /> },
      { name: 'position — current composition read from reserves', node: <PositionCard position={POSITION} networkLabel="Coston2" /> },
      { name: 'remove approval — LP token short, its own step', node: <PositionCard position={POSITION} removeOperation={REMOVE_NEEDS_APPROVAL} removeQuoteResult={REMOVE_QUOTE_RESULT} percent={50} networkLabel="Coston2" /> },
      { name: 'removing — approval done, remove tx in flight', node: <PositionCard position={POSITION} removeOperation={REMOVING} removeQuoteResult={REMOVE_QUOTE_RESULT} percent={50} networkLabel="Coston2" /> },
      { name: 'removed — Withdrawn, with the remove tx evidence', node: <PositionCard position={POSITION} removeOperation={REMOVED} removeQuoteResult={REMOVE_QUOTE_RESULT} percent={50} networkLabel="Coston2" /> },
      { name: 'partial — percent selected, "you would receive" preview', node: <PositionCard position={POSITION} removeQuoteResult={REMOVE_QUOTE_RESULT} percent={50} networkLabel="Coston2" /> },
      { name: 'value change vs supplied basis — the kit recorded the add (R7)', node: <PositionCard position={POSITION} basis={{ amountA: amount(5_800000n, 6, 'FXRP'), amountB: amount(7_000000n, 6, 'USD₮0') }} networkLabel="Coston2" /> },
      { name: 'exact-entry — a non-preset percent typed in, not one of 25/50/75/100 (R7)', node: <PositionCard position={POSITION} percent={33} networkLabel="Coston2" /> },
    ],
  },
  {
    id: 'm6-pool-catalogue',
    title: 'M6 · PoolCatalogue (declared unbuilt)',
    cases: [
      { name: 'declared unbuilt — present, disabled, reasoned', node: <PoolCatalogue networkLabel="Coston2" /> },
    ],
  },
]
