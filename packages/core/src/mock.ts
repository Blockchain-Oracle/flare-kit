import {
  type DirectMintIntent,
  type DirectMintProtocolState,
  type DirectMintQuote,
  quoteDirectMint,
} from './fassets/direct-mint-quote.js'
import type { DirectMintChainState } from './fassets/direct-mint-recovery.js'
import type { RedeemChainState } from './fassets/redeem-recovery.js'
import { mockRedeemChainAt, mockRequestId, redeemTraceMarks } from './mock-redeem.js'
import {
  type RedeemContext,
  type RedeemIntent,
  type RedeemProtocolState,
  type RedeemQuote,
  quoteRedeem,
} from './fassets/quote-redeem.js'
import {
  type RedeemOperation,
  createRedeemOperation,
  reconcileRedeem,
} from './fassets/redeem.js'
import {
  DEFAULT_TIMINGS,
  MOCK_EPOCH,
  MOCK_PROTOCOL_STATE,
  MOCK_REDEEM_STATE,
  type MockScenario,
  type MockTimings,
  SCENARIO_TIMINGS,
  hashSeed,
} from './mock-config.js'

export * from './mock-config.js'
export * from './mock-redeem.js'
export * from './mock-fdc.js'
import {
  type DirectMintOperation,
  attachXrplPayment,
  createDirectMintOperation,
  reconcileDirectMint,
} from './fassets/direct-mint.js'

/**
 * The mock kit: the whole operation lifecycle with no wallet, no key and no
 * network.
 *
 * It does **not** reimplement the state machine. It supplies observed chain
 * state on a simulated clock and lets the real `reconcileDirectMint` run, so a
 * component driven by the mock exercises exactly the code a live mint does. A
 * parallel implementation would drift, and every state it showed would be a
 * claim about the product rather than a demonstration of it.
 *
 * Mock mode is explicit and labelled, and is never a fallback triggered by a
 * failure (CLAUDE.md).
 */

export interface MockKitOptions {
  scenario?: MockScenario
  timings?: Partial<MockTimings>
  /** Deterministic ids and timestamps, so docs and tests never flake. */
  seed?: string
  startedAt?: number
  /**
   * How much simulated time passes per second of real time. A fifteen-minute
   * mint at 200x plays out in about four seconds, so a preview shows the real
   * waits instead of skipping them. Only `reconcile()` uses this; `reconcileAt`
   * and `trace` stay clock-free.
   */
  speed?: number
  /**
   * The least simulated time each `reconcile()` advances, regardless of the
   * wall clock. Without it a caller polling in a tight loop would never make
   * progress, because no real time passes between calls.
   */
  stepMs?: number
}

/**
 * What a surface needs from a kit, whether it is the mock or a live one. The
 * React layer depends on this and nothing more, which is what lets one
 * component tree run against either.
 */
export interface DirectMintKit {
  readonly isMock: boolean
  readonly label: string
  /**
   * The network this kit is bound to. `0` on the mock, which is not on a
   * network at all — an operation it creates records `network: 0` too, so the
   * two never disagree about where the work happened.
   */
  readonly chainId: number
  readonly protocolState: DirectMintProtocolState
  quote(intent: DirectMintIntent, now?: number): DirectMintQuote
  start(intent: DirectMintIntent): DirectMintOperation
  /** Advance against whatever this kit reads as current truth. */
  reconcile(record: DirectMintOperation): Promise<DirectMintOperation>
  /**
   * Redemption. Both the live kit and the mock implement it, so it is required
   * rather than optional — a surface should never have to ask whether the kit
   * it was handed can redeem.
   */
  readonly redeemState: RedeemProtocolState
  quoteRedeem(intent: RedeemIntent, now?: number, context?: RedeemContext): RedeemQuote
  startRedeem(intent: RedeemIntent): RedeemOperation
  reconcileRedeem(record: RedeemOperation): Promise<RedeemOperation>
}

export interface MockKit extends DirectMintKit {
  readonly isMock: true
  readonly label: string
  readonly chainId: number
  readonly scenario: MockScenario
  readonly timings: MockTimings
  readonly protocolState: DirectMintProtocolState
  quote(intent: DirectMintIntent, now?: number): DirectMintQuote
  start(intent: DirectMintIntent): DirectMintOperation
  pay(record: DirectMintOperation): DirectMintOperation
  chainAt(record: DirectMintOperation, now: number): DirectMintChainState
  reconcileAt(record: DirectMintOperation, elapsedMs: number): DirectMintOperation
  /** Every distinct record the operation passes through, in order. */
  trace(record: DirectMintOperation): DirectMintOperation[]
  redeemChainAt(record: RedeemOperation, now: number): RedeemChainState
  reconcileRedeemAt(record: RedeemOperation, elapsedMs: number): RedeemOperation
  traceRedeem(record: RedeemOperation): RedeemOperation[]
  runToCompletion(record: DirectMintOperation): DirectMintOperation
}

export function createMockKit(options: MockKitOptions = {}): MockKit {
  const scenario = options.scenario ?? 'happy'
  const timings: MockTimings = {
    ...DEFAULT_TIMINGS,
    ...SCENARIO_TIMINGS[scenario],
    ...options.timings,
  }
  const seed = options.seed ?? 'flare-kit-mock'
  const startedAt = options.startedAt ?? MOCK_EPOCH
  const speed = options.speed ?? 200
  const stepMs = options.stepMs ?? 30_000
  const wallClockOrigin = Date.now()
  let cursorMs = 0
  let counter = 0

  const nextId = () => {
    counter += 1
    return `op_mock${(hashSeed(seed) + counter).toString(36).padStart(16, '0')}`
  }
  const txIdFor = (record: DirectMintOperation) =>
    `MOCK${hashSeed(record.id).toString(16).toUpperCase().padStart(60, '0')}`

  /** Stage boundaries on the simulated clock, relative to the payment. */
  const paidAt = startedAt
  const finalAt = paidAt + timings.xrplFinalityMs
  const proofAt = finalAt + timings.fdcProofMs
  const releasedAt = proofAt + timings.delayWindowMs
  const executableAt = releasedAt + timings.executorExclusiveMs
  const settledAt = executableAt + timings.settlementMs

  function chainAt(record: DirectMintOperation, now: number): DirectMintChainState {
    const delayed = timings.delayWindowMs > 0 && now < releasedAt
    return {
      xrplTxId: txIdFor(record),
      xrplFinal: now >= finalAt,
      proofAvailable: now >= proofAt,
      delayState: timings.delayWindowMs === 0 ? 'NotDelayed' : delayed ? 'Delayed' : 'Released',
      ...(timings.delayWindowMs > 0 ? { allowedAt: releasedAt } : {}),
      alreadySettled: scenario !== 'protocol-unavailable' && now >= settledAt,
      ...(timings.executorExclusiveMs > 0 ? { executorExclusiveUntil: executableAt } : {}),
      ...(scenario === 'protocol-unavailable'
        ? { unavailableReason: 'MissingMintingTagManager' }
        : {}),
    }
  }

  const kit: MockKit = {
    isMock: true,
    label: 'mock kit',
    chainId: 0,
    scenario,
    timings,
    protocolState: MOCK_PROTOCOL_STATE,

    quote(intent, now = startedAt) {
      return quoteDirectMint(MOCK_PROTOCOL_STATE, intent, now)
    },

    start(intent) {
      // The same guard a live kit applies: a below-minimum mint is refused here
      // too, so the mock cannot demonstrate something the product forbids.
      return createDirectMintOperation({
        quote: quoteDirectMint(MOCK_PROTOCOL_STATE, intent, startedAt),
        intent,
        network: 0,
        now: startedAt,
        id: nextId(),
      })
    },

    pay(record) {
      return attachXrplPayment(record, { xrplTxId: txIdFor(record), at: paidAt })
    },

    chainAt,

    /**
     * The interface a hook or an app calls on a timer.
     *
     * Simulated time follows the wall clock at `speed`, so a preview paced by a
     * real interval moves through its real waits. But the cursor also advances
     * at least `stepMs` per call, so a caller polling in a tight loop — a test,
     * or a docs page stepping through states — still makes progress. It only
     * ever moves forward.
     */
    async reconcile(record) {
      cursorMs = Math.max(cursorMs + stepMs, (Date.now() - wallClockOrigin) * speed)
      return kit.reconcileAt(record, cursorMs)
    },

    reconcileAt(record, elapsedMs) {
      const now = startedAt + elapsedMs
      const paid = record.state === 'ready' ? kit.pay(record) : record
      return reconcileDirectMint(paid, chainAt(paid, now), now)
    },

    trace(record) {
      const steps = [
        0,
        timings.xrplFinalityMs,
        finalAt - startedAt + 1,
        proofAt - startedAt + 1,
        releasedAt - startedAt + 1,
        executableAt - startedAt + 1,
        settledAt - startedAt + 1,
      ]
      const seen: DirectMintOperation[] = []
      let current = kit.pay(record)
      seen.push(current)
      for (const elapsed of steps) {
        const now = startedAt + elapsed
        current = reconcileDirectMint(current, chainAt(current, now), now)
        const previous = seen[seen.length - 1]
        if (previous?.state !== current.state || previous.updatedAt !== current.updatedAt) {
          seen.push(current)
        }
      }
      return seen
    },

    redeemState: MOCK_REDEEM_STATE,

    quoteRedeem(intent, now = startedAt, context = {}) {
      return quoteRedeem(MOCK_REDEEM_STATE, intent, now, context)
    },

    startRedeem(intent) {
      return createRedeemOperation({
        quote: quoteRedeem(MOCK_REDEEM_STATE, intent, startedAt),
        intent,
        network: 0,
        now: startedAt,
        id: nextId(),
      })
    },

    redeemChainAt(record, now) {
      return mockRedeemChainAt(
        { requestId: mockRequestId(record.id), startedAt, timings },
        now,
      )
    },

    reconcileRedeemAt(record, elapsedMs) {
      const now = startedAt + elapsedMs
      return reconcileRedeem(record, kit.redeemChainAt(record, now), now)
    },

    async reconcileRedeem(record) {
      cursorMs = Math.max(cursorMs + stepMs, (Date.now() - wallClockOrigin) * speed)
      return kit.reconcileRedeemAt(record, cursorMs)
    },

    traceRedeem(record) {
      const seen: RedeemOperation[] = [record]
      let current = record
      for (const elapsed of redeemTraceMarks(timings)) {
        current = kit.reconcileRedeemAt(current, elapsed)
        if (seen[seen.length - 1]?.state !== current.state) seen.push(current)
      }
      return seen
    },

    runToCompletion(record) {
      const trace = kit.trace(record)
      const last = trace[trace.length - 1]
      if (!last) throw new Error('unreachable: a trace always has at least one record')
      return last
    },
  }

  return kit
}
