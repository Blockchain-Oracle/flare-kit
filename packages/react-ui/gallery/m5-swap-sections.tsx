import {
  FlareKitError,
  MOCK_EPOCH,
  type SwapOperation,
  type SwapQuote,
  type SwapQuoteResult,
  advanceSteps,
  amount,
  applyQuote,
  applyTransition,
  createSwap,
  serializeError,
  startQuoting,
} from '@flare-kit/core'
import { SwapCard, TokenSelector, type TokenChoice } from '../src/index.js'

/**
 * Dev-only. Every AC5 state of the M5 swap surfaces, in both themes (the one
 * gallery toggle re-themes them). States are built from the real swap state
 * machine with fixture readings — the surface is prop-driven, so each state is
 * just a record and a quote, never a live call.
 */

const NOW = MOCK_EPOCH
const NOW_S = Math.floor(NOW / 1000)
const RECIP = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as const
const FROM = { symbol: 'FXRP', address: '0x0b6A3645c240605887a5532109323A3E12273dc7', decimals: 6 } as const
const TO = { symbol: 'USD₮0', address: '0xC1A5B41512496B80903D1f32d6dEa3a73212E71F', decimals: 6 } as const
const APPROVE_TX = '0xa11ce0000000000000000000000000000000000000000000000000000000a11c'
const SWAP_TX = '0x5wa90000000000000000000000000000000000000000000000000000000005wa'

const base = { fromToken: FROM, toToken: TO, networkLabel: 'Coston2' } as const

function reading(outRaw: bigint): SwapQuoteResult {
  const quote: SwapQuote = {
    from: FROM,
    to: TO,
    amountIn: amount(100_000000n, 6, 'FXRP'),
    amountOut: amount(outRaw, 6, 'USD₮0'),
    minReceived: amount((outRaw * 9950n) / 10000n, 6, 'USD₮0'),
    slippageBips: 50,
    path: [FROM.address, TO.address],
    observedAt: NOW,
  }
  return { kind: 'quote', quote }
}

const QUOTE = reading(122_400000n) // the live Coston2 quote: 1.224 USD₮0 / FXRP

function inState(allowance: bigint, result: SwapQuoteResult): SwapOperation {
  const intent = {
    fromKey: 'FXRP',
    toKey: 'USDT0',
    amountIn: 100_000000n,
    slippageBips: 50,
    recipient: RECIP,
    deadline: NOW_S + 1200,
  }
  let op = createSwap({ chainId: 114, intent, now: NOW, id: 'op_swap' })
  op = startQuoting(op, NOW).record
  return applyQuote(op, { result, allowance, now: NOW }).record
}

const hop = (op: SwapOperation, to: SwapOperation['state'], patch: object, evidence?: object[]): SwapOperation =>
  applyTransition(op, { to, at: NOW, patch, ...(evidence ? { evidence: evidence as never } : {}) }).record

// approve needed → approve in flight → swap in flight → both settled
const NEEDS_APPROVAL = inState(0n, QUOTE)
const READY_AT_SWAP = hop(NEEDS_APPROVAL, 'ready', {})
const APPROVING = hop(READY_AT_SWAP, 'executing', {
  steps: advanceSteps(READY_AT_SWAP.steps, { done: 0, current: 'active' }, NOW),
})
const SWAPPING = hop(
  APPROVING,
  'submitted',
  { steps: advanceSteps(APPROVING.steps, { done: 1, current: 'active' }, NOW) },
  [{ kind: 'flare_tx', label: 'Approval', value: APPROVE_TX, observedAt: NOW }],
)
const SUCCEEDED = hop(
  SWAPPING,
  'succeeded',
  { steps: advanceSteps(SWAPPING.steps, { done: 2, current: 'done' }, NOW) },
  [{ kind: 'flare_tx', label: 'Swap', value: SWAP_TX, observedAt: NOW }],
)

const READY = inState(200_000000n, QUOTE) // allowance ample → straight to ready
const NO_ROUTE_READING: SwapQuoteResult = {
  kind: 'no_route',
  message: 'No FXRP / WC2FLR pool exists on this network yet. Choose a token that has one.',
}
const NO_ROUTE = inState(0n, NO_ROUTE_READING)

const SLIPPED = hop(hop(READY, 'executing', { steps: advanceSteps(READY.steps, { done: 0, current: 'active' }, NOW) }), 'expired', {
  steps: advanceSteps(READY.steps, { done: 0, current: 'failed' }, NOW),
  error: serializeError(
    new FlareKitError('SLIPPAGE_EXCEEDED', {
      domain: 'protocol',
      message:
        'The pool moved past your minimum received before the swap confirmed. Nothing moved — re-quote to continue.',
      recovery: 'safe_to_retry',
      valueMoved: 'no',
    }),
  ),
})

function Modal({ children }: { children: React.ReactNode }) {
  // A transformed ancestor becomes the containing block for the fixed overlay,
  // so the modal renders inside its own cell instead of over the whole page.
  return (
    <div style={{ position: 'relative', transform: 'translateZ(0)', height: 560, borderRadius: 10, overflow: 'hidden' }}>
      {children}
    </div>
  )
}

const CHOICES: TokenChoice[] = [
  { key: 'FXRP', token: FROM, name: 'FAsset XRP', balance: amount(247_500000n, 6, 'FXRP') },
  { key: 'USDT0', token: TO, name: 'Tether USD₮0', balance: amount(12_340000n, 6, 'USD₮0') },
  { key: 'WNAT', token: { symbol: 'WC2FLR', address: '0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273', decimals: 18 }, name: 'Wrapped C2FLR' },
  { key: 'FBTC', token: { symbol: 'FBTC', address: '0x0000000000000000000000000000000000000fbc', decimals: 8 }, name: 'FAsset BTC' },
]

export const M5_SWAP_SECTIONS = [
  {
    id: 'm5-swap',
    title: 'M5 · SwapCard (states reachable from props)',
    cases: [
      { name: 'quote — honest rate, exact minimum received, price impact', node: <SwapCard operation={READY} quoteResult={QUOTE} priceImpactBips={87} fromBalance={amount(247_500000n, 6, 'FXRP')} {...base} /> },
      { name: 'needs approval — the approval is its own step, never hidden', node: <SwapCard operation={NEEDS_APPROVAL} quoteResult={QUOTE} priceImpactBips={87} fromBalance={amount(247_500000n, 6, 'FXRP')} {...base} /> },
      { name: 'approving — approve tx in flight on the spine', node: <SwapCard operation={APPROVING} quoteResult={QUOTE} priceImpactBips={87} {...base} /> },
      { name: 'swapping — approval done, swap tx in flight', node: <SwapCard operation={SWAPPING} quoteResult={QUOTE} priceImpactBips={87} {...base} /> },
      { name: 'success — Swapped, with the approval and swap tx evidence', node: <SwapCard operation={SUCCEEDED} quoteResult={QUOTE} {...base} /> },
      { name: 'no route — stated with its reason, output is — never 0', node: <SwapCard operation={NO_ROUTE} quoteResult={NO_ROUTE_READING} {...base} /> },
      { name: 'slippage exceeded — distinct, re-quotable, never a kit failure', node: <SwapCard operation={SLIPPED} quoteResult={QUOTE} {...base} /> },
      { name: 'Limit — declared-unbuilt: shown, disabled, reasoned', node: <SwapCard operation={READY} quoteResult={QUOTE} priceImpactBips={87} {...base} /> },
    ],
  },
  {
    id: 'm5-token-selector',
    title: 'M5 · TokenSelector',
    cases: [
      { name: 'search — filtered from props (query "usd")', node: <Modal><TokenSelector open defaultQuery="usd" tokens={CHOICES} commonBases={['FXRP', 'USDT0']} onSelect={() => {}} onClose={() => {}} /></Modal> },
      { name: 'balance-sorted — held assets first, each with its mark', node: <Modal><TokenSelector open tokens={CHOICES} commonBases={['FXRP', 'USDT0']} onSelect={() => {}} onClose={() => {}} /></Modal> },
      { name: 'no-pool counter — a pair the DEX cannot quote is shown, disabled', node: <Modal><TokenSelector open counterSymbol="FXRP" tokens={[CHOICES[1]!, { ...CHOICES[2]!, pooled: false }, { ...CHOICES[3]!, pooled: false }, { ...CHOICES[0]!, pooled: true }]} onSelect={() => {}} onClose={() => {}} /></Modal> },
    ],
  },
]
