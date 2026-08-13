// packages/core/src/bridge.ts
import { type Address, type Hex, encodeAbiParameters, zeroAddress } from 'viem'
import { REDEEM_COMPOSE_MESSAGE, type RouteKind } from '@flarekit-dev/contracts'
import {
  type OperationRecord,
  type OperationStep,
  type TransitionResult,
  applyTransition,
  createOperation,
} from './operation.js'
import {
  type BridgeAdapter,
  type BridgeCall,
  ZERO_BYTES32,
  buildSendParam,
} from './bridge-adapter.js'
import type { BridgeQuote } from './bridge-quote.js'

/**
 * The bridge + redeem operations (M8-R2/R3). They reuse the M1 lifecycle engine and
 * the EXISTING canonical states: a bridge is `quoting → ready/awaiting_approval →
 * executing → submitted → awaiting_external` (LayerZero delivery) `→ succeeded`
 * (destination read); the redeem extends the wait through a second
 * `awaiting_external` leg (FAssets redemption / XRPL) — see `bridge-states.ts`.
 *
 * The plan REFUSES an unverified route before reading, approving or paying a fee
 * (M8-R10 / the M6 F2 / M7 precedent): a route whose destination peer is not
 * live-verified never emits a plan that would spend a real cross-chain fee on a
 * message that cannot deliver. A confirmed send is `submitted`, never delivered.
 */

export interface BridgeIntent {
  readonly routeKey: string
  readonly amountIn: bigint
  readonly slippageBips: number
  readonly deadline: number
  /** The recipient on the DESTINATION chain. */
  readonly recipient: Address
}

export interface BridgeRedeemIntent {
  readonly routeKey: string
  readonly amountIn: bigint
  readonly slippageBips: number
  readonly deadline: number
  /** The XRPL address the native XRP settles to. */
  readonly xrplDestination: string
}

export interface BridgePlan {
  readonly kind: RouteKind
  /** Present only when the source is an OFT ADAPTER and its allowance is short. */
  readonly approve?: BridgeCall
  readonly send: BridgeCall
  /** The fee the send must pay (also carried on `send.value`), for the timeline. */
  readonly nativeFee: bigint
}

export type BridgeError =
  | { readonly kind: 'not-verified'; readonly reason: string }
  | { readonly kind: 'no-peer' }
  | { readonly kind: 'insufficient-balance' }
  | { readonly kind: 'insufficient-fee'; readonly needed: bigint; readonly have: bigint }
  | { readonly kind: 'dust-below-min' }
  | { readonly kind: 'expired' }

export type BridgePlanResult =
  | { readonly kind: 'plan'; readonly plan: BridgePlan }
  | { readonly kind: 'error'; readonly error: BridgeError }
  /** A live read failed — there is nothing safe to sign. Distinct from a route error. */
  | { readonly kind: 'unavailable'; readonly reason: string }

export type BridgeOperation = OperationRecord<BridgeIntent, BridgeQuote, BridgePlan>
export type BridgeRedeemOperation = OperationRecord<BridgeRedeemIntent, BridgeQuote, BridgePlan>

export { startQuoting } from './swap.js'

export function createBridge(input: { chainId: number; intent: BridgeIntent; now: number; id?: string }): BridgeOperation {
  return createOperation<BridgeIntent, BridgeQuote, BridgePlan>({
    capability: 'bridge',
    network: input.chainId,
    intent: input.intent,
    now: input.now,
    ...(input.id ? { id: input.id } : {}),
  })
}

export function createBridgeRedeem(input: { chainId: number; intent: BridgeRedeemIntent; now: number; id?: string }): BridgeRedeemOperation {
  return createOperation<BridgeRedeemIntent, BridgeQuote, BridgePlan>({
    capability: 'bridge_redeem',
    network: input.chainId,
    intent: input.intent,
    now: input.now,
    ...(input.id ? { id: input.id } : {}),
  })
}

/** Encode the compose message the redeem carries — mirrors IFAssetRedeemComposer. */
export function encodeRedeemComposeMessage(redeemer: Address, xrplDestination: string): Hex {
  return encodeAbiParameters(REDEEM_COMPOSE_MESSAGE, [
    {
      redeemer,
      redeemerUnderlyingAddress: xrplDestination,
      redeemWithTag: false,
      destinationTag: 0n,
      executor: zeroAddress,
      executorFee: 0n,
    },
  ])
}

/**
 * The slippage floor over the INPUT — the `minAmountLD` the send enforces. Clamped to
 * [0, 10000] bips so an out-of-range slippage can never produce a negative minimum
 * (which viem would reject) or one above the input (an over-promise). Shared with the
 * quote so the rendered minimum and the on-chain floor are one number.
 */
export const floorMin = (amountIn: bigint, slippageBips: number): bigint => {
  const bips = Math.max(0, Math.min(10_000, Math.trunc(slippageBips)))
  return (amountIn * BigInt(10_000 - bips)) / 10_000n
}

function reasonOf(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > 0 ? `${fallback}: ${message.slice(0, 120)}` : fallback
}

/** Shared gate/plan body for a bridge or a redeem. `to` and `composeMsg` differ per flow. */
async function buildPlan(
  adapter: BridgeAdapter,
  owner: Address,
  amountIn: bigint,
  slippageBips: number,
  deadline: number,
  now: number,
  to: Address,
  composeMsg: Hex | undefined,
): Promise<BridgePlanResult> {
  const route = adapter.route
  // Refuse an unverified route FIRST — never read, approve or pay a fee on a message
  // that cannot deliver (M8-R10). This is the M6/M7 verified-flag gate.
  if (!route.bridgeVerified) {
    return {
      kind: 'error',
      error: {
        kind: 'not-verified',
        reason: `The ${route.key} route is not verified in this build — no live run has confirmed a delivery on ${route.to.key}, so the kit will not sign a send against it.`,
      },
    }
  }
  if (deadline <= now) return { kind: 'error', error: { kind: 'expired' } }

  // A read failure is `unavailable`, not an unhandled rejection at the seam — the
  // same honesty `quoteBridge` gives the quote path. There is nothing safe to sign.
  try {
    const peer = await adapter.reads.peer(route.to.eid)
    if (peer === ZERO_BYTES32) return { kind: 'error', error: { kind: 'no-peer' } }

    const balance = await adapter.reads.assetBalance(owner)
    if (balance < amountIn) return { kind: 'error', error: { kind: 'insufficient-balance' } }

    const minAmountLD = floorMin(amountIn, slippageBips)
    const sp = buildSendParam(route, { to, amountLD: amountIn, minAmountLD, ...(composeMsg ? { composeMsg } : {}) })
    const fee = await adapter.reads.quoteFee(sp)
    const receive = await adapter.reads.quoteReceive(sp)
    // The delivered amount would breach the floor (heavy dust) → its distinct state,
    // not a kit failure and not silently sent to revert on chain.
    if (receive.amountReceivedLD < minAmountLD) return { kind: 'error', error: { kind: 'dust-below-min' } }

    const nativeBalance = await adapter.reads.nativeBalance(owner)
    if (nativeBalance < fee.nativeFee) {
      return { kind: 'error', error: { kind: 'insufficient-fee', needed: fee.nativeFee, have: nativeBalance } }
    }

    // A native OFT (Sepolia) IS its own token and burns the caller's balance — no
    // approve. An OFT adapter (Coston2) LOCKS a separate ERC-20 — approve when short.
    const isNativeOft = route.asset.address.toLowerCase() === route.from.oft.toLowerCase()
    let approve: BridgeCall | undefined
    if (!isNativeOft) {
      const allowance = await adapter.reads.assetAllowance(owner, route.from.oft)
      if (allowance < amountIn) approve = adapter.writes.approveAsset(route.from.oft, amountIn)
    }

    const send = adapter.writes.send(sp, fee, owner)
    return {
      kind: 'plan',
      plan: { kind: route.kind, ...(approve ? { approve } : {}), send, nativeFee: fee.nativeFee },
    }
  } catch (error) {
    return { kind: 'unavailable', reason: reasonOf(error, 'Could not read the route to build a plan') }
  }
}

/** The unsigned bridge plan (M8-R2). Gates before any signature; refuses an unverified route. */
export function buildBridgePlan(
  adapter: BridgeAdapter,
  intent: BridgeIntent,
  owner: Address,
  now: number,
): Promise<BridgePlanResult> {
  return buildPlan(adapter, owner, intent.amountIn, intent.slippageBips, intent.deadline, now, intent.recipient, undefined)
}

/** The unsigned redeem plan (M8-R9). Sends to the composer with the compose message. */
export function buildRedeemPlan(
  adapter: BridgeAdapter,
  intent: BridgeRedeemIntent,
  owner: Address,
  now: number,
): Promise<BridgePlanResult> {
  const composer = adapter.route.composer
  if (!composer) {
    return Promise.resolve({
      kind: 'error',
      error: { kind: 'not-verified', reason: `The ${adapter.route.key} route has no composer — it cannot redeem to native XRP.` },
    })
  }
  const composeMsg = encodeRedeemComposeMessage(owner, intent.xrplDestination)
  return buildPlan(adapter, owner, intent.amountIn, intent.slippageBips, intent.deadline, now, composer, composeMsg)
}

function bridgeSteps(plan: BridgePlan): OperationStep[] {
  const steps: OperationStep[] = []
  if (plan.approve) steps.push({ id: 'approve', type: 'approve', actor: 'your_wallet', state: 'pending', attempts: 0 })
  steps.push({ id: 'send', type: 'bridge_send', actor: 'your_wallet', state: 'pending', attempts: 0 })
  // Delivery is asynchronous and settles on the destination chain (M8-R3/R8).
  steps.push({ id: 'deliver', type: 'await_delivery', actor: 'executor', state: 'pending', attempts: 0 })
  // The redeem extends the wait through the FAssets redemption + XRPL settlement.
  if (plan.kind === 'redeem') {
    steps.push({ id: 'redeem', type: 'await_redemption', actor: 'flare', state: 'pending', attempts: 0 })
  }
  return steps
}

/**
 * Turn a bridge/redeem quote+plan reading into the next state. Expects a record in
 * `quoting`. A plan error (unverified, no-peer, insufficient, dust, expired) has
 * nothing to sign — it returns to `awaiting_input` carrying the quote; the surface
 * renders the specific error from the `BridgePlanResult`.
 */
export function applyBridgeQuote<I, P extends BridgePlan>(
  record: OperationRecord<I, BridgeQuote, P>,
  input: { quote: BridgeQuote; plan: BridgePlanResult; now: number },
): TransitionResult<I, BridgeQuote, P> {
  if (input.plan.kind !== 'plan') {
    return applyTransition(record, { to: 'awaiting_input', at: input.now, patch: { quote: input.quote } })
  }
  const needsApprove = input.plan.plan.approve !== undefined
  return applyTransition(record, {
    to: needsApprove ? 'awaiting_approval' : 'ready',
    at: input.now,
    patch: { quote: input.quote, plan: input.plan.plan as P, steps: bridgeSteps(input.plan.plan) },
  })
}
