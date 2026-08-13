import { describe, expect, it } from 'vitest'
import { createOperation, applyTransition } from '../src/operation.js'
import { reconcileDelivery, reconcileBridgeRedeem } from '../src/bridge-states.js'
import type { DeliveryState, RedemptionState, SettlementState } from '../src/bridge-adapter.js'

// M8-R3: delivery lives on a DIFFERENT chain than the signature. A source receipt is
// only `submitted`; the op reaches `succeeded` ONLY from a destination read. These
// reconcilers walk the canonical table (no illegal hop drops a patch) and reuse the
// existing states — no new identifier.

/** A bridge op that has already been submitted (send broadcast, source-confirmed). */
function submittedOp() {
  const base = createOperation({ capability: 'bridge', network: 114, intent: {}, now: 0, id: 'op1' })
  // draft → executing → submitted, the legal path a broadcast send takes, with the
  // send/deliver spine steps so step-advancement is exercised.
  const steps = [
    { id: 'send', type: 'bridge_send', actor: 'your_wallet', state: 'pending', attempts: 0 },
    { id: 'deliver', type: 'await_delivery', actor: 'executor', state: 'pending', attempts: 0 },
  ] as const
  const executing = applyTransition(base, { to: 'executing', at: 1, patch: { steps: [...steps] } }).record
  return applyTransition(executing, { to: 'submitted', at: 2 }).record
}

const IN_FLIGHT: DeliveryState = { kind: 'in-flight' }
const DELIVERED: DeliveryState = { kind: 'delivered', amountReceivedLD: 1_000_000n }

describe('reconcileDelivery (plain bridge)', () => {
  it('a source-only receipt stays awaiting_external — NEVER succeeded', () => {
    const op = reconcileDelivery(submittedOp(), IN_FLIGHT, 10)
    expect(op.state).toBe('awaiting_external')
    expect(op.awaiting?.actor).toBe('executor')
    // the load-bearing honesty: submitted send is not delivery
    expect(op.state).not.toBe('succeeded')
  })

  it('a destination read of OFTReceived advances to succeeded, finalizes the spine and clears the wait', () => {
    const op = reconcileDelivery(submittedOp(), DELIVERED, 20)
    expect(op.state).toBe('succeeded')
    // H1: a settled op must not keep claiming it waits on somebody
    expect(op.awaiting).toBeUndefined()
    // M3: the deliver step reads `done`, not the "outcome unknown" a pending row draws
    expect(op.steps.every((s) => s.state === 'done')).toBe(true)
  })

  it('reconciling twice with the same in-flight read is idempotent (no illegal hop drops the patch)', () => {
    const once = reconcileDelivery(submittedOp(), IN_FLIGHT, 10)
    const twice = reconcileDelivery(once, IN_FLIGHT, 11)
    expect(twice.state).toBe('awaiting_external')
    expect(twice.awaiting?.since).toBe(10) // same-state patch re-applied without a jump
  })

  it('walks the table when a page opens after everything already happened (executing → succeeded)', () => {
    const base = createOperation({ capability: 'bridge', network: 114, intent: {}, now: 0, id: 'op2' })
    const executing = applyTransition(base, { to: 'executing', at: 1 }).record
    // executing → succeeded is NOT a legal single hop; the walk passes through submitted
    const op = reconcileDelivery(executing, DELIVERED, 30)
    expect(op.state).toBe('succeeded')
  })
})

describe('reconcileBridgeRedeem (three async legs — succeeded ONLY on XRPL settlement)', () => {
  const PENDING: RedemptionState = { kind: 'pending' }
  const FILED: RedemptionState = { kind: 'filed', redeemedAmountUBA: 9_990_000n, underlyingAddress: 'rXRP' }
  const FAILED: RedemptionState = { kind: 'failed' }
  const NOT_SETTLED: SettlementState = { kind: 'pending' }
  const SETTLED: SettlementState = { kind: 'settled', amountDrops: 9_940_050n, txHash: '0xabc' }

  it('leg 1 (awaiting LZ delivery to composer) — executor', () => {
    const op = reconcileBridgeRedeem(submittedOp(), IN_FLIGHT, PENDING, NOT_SETTLED, 10)
    expect(op.state).toBe('awaiting_external')
    expect(op.awaiting?.actor).toBe('executor')
  })

  it('leg 2 (delivered, awaiting the FAssets redemption filing) — flare', () => {
    const op = reconcileBridgeRedeem(submittedOp(), DELIVERED, PENDING, NOT_SETTLED, 20)
    expect(op.state).toBe('awaiting_external')
    expect(op.awaiting?.actor).toBe('flare')
    expect(op.awaiting?.reason).toMatch(/awaiting the FAssets redemption/i)
  })

  it('leg 3 (redemption FILED, agent paying XRPL) is NOT succeeded — it awaits settlement', () => {
    const op = reconcileBridgeRedeem(submittedOp(), DELIVERED, FILED, NOT_SETTLED, 30)
    expect(op.state).toBe('awaiting_external') // the load-bearing honesty: filed != XRP received
    expect(op.awaiting?.actor).toBe('xrpl')
    expect(op.awaiting?.reason).toMatch(/paying native XRP/i)
  })

  it('ONLY the XRPL settlement read advances to succeeded (XRP received), clearing the wait', () => {
    const op = reconcileBridgeRedeem(submittedOp(), DELIVERED, FILED, SETTLED, 40)
    expect(op.state).toBe('succeeded')
    expect(op.awaiting).toBeUndefined() // H1: no stale "agent is paying" on a settled op
  })

  it('a real FAssetRedeemFailed is the only path to failed; an unknown outcome is never failed', () => {
    expect(reconcileBridgeRedeem(submittedOp(), DELIVERED, FAILED, NOT_SETTLED, 50).state).toBe('failed')
    expect(reconcileBridgeRedeem(submittedOp(), DELIVERED, PENDING, NOT_SETTLED, 50).state).toBe('awaiting_external')
  })
})
