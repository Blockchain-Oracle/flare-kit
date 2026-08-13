import { describe, expect, it } from 'vitest'
import { formatExact } from '../src/amounts.js'
import { attachRedemptionRequest } from '../src/fassets/redeem.js'
import { createMockKit } from '../src/mock.js'

/**
 * M1-R6, second half: the mock reproduces redemption *after* the live path
 * exists, so it copies observed behaviour rather than defining it.
 *
 * The live run on 2026-08-04 produced:
 *   ready → submitted → awaiting_external(agent) ×5 → succeeded
 * and settled by the request being deleted. The mock must do the same.
 */

const INTENT = { lots: 1, redeemerUnderlyingAddress: 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio' }

const started = (kit: ReturnType<typeof createMockKit>) =>
  attachRedemptionRequest(kit.startRedeem(INTENT), {
    requestId: '43165320',
    agentVault: '0xMockAgentNotAReal1AgentVault0000000001',
    at: Date.now(),
  })

describe('it quotes what the live chain quoted', () => {
  it('reproduces the one-lot numbers from the live run', () => {
    // Live: burned 10.000000, fee 0.050000, receives 9.950000.
    const q = createMockKit({ seed: 'r' }).quoteRedeem(INTENT)
    expect(formatExact(q.burned)).toBe('10.000000 FMockXRP')
    expect(formatExact(q.fee)).toBe('0.050000 FMockXRP')
    expect(formatExact(q.receives)).toBe('9.950000 XRP')
  })

  it('still labels itself so it cannot pass for the live chain', () => {
    expect(createMockKit().redeemState.fAssetSymbol).toMatch(/mock/i)
  })
})

describe('it reproduces the live state sequence', () => {
  it('waits on the agent, then succeeds when the request disappears', () => {
    const kit = createMockKit({ seed: 'r' })
    const states = kit.traceRedeem(started(kit)).map((r) => r.state)
    expect(states[0]).toBe('submitted')
    expect(states).toContain('awaiting_external')
    expect(states[states.length - 1]).toBe('succeeded')
  })

  it('names the agent while waiting, and offers no action', () => {
    const kit = createMockKit({ seed: 'r' })
    const waiting = kit.traceRedeem(started(kit)).find((r) => r.state === 'awaiting_external')
    expect(waiting?.awaiting?.actor).toBe('agent')
    expect(waiting?.recovery ?? []).toEqual([])
  })

  it('clears the awaited actor once settled, as the live fix requires', () => {
    // The defect the live run exposed: a settled record still claimed to be
    // waiting on somebody.
    const kit = createMockKit({ seed: 'r' })
    const settled = kit.traceRedeem(started(kit)).find((r) => r.state === 'succeeded')
    expect(settled?.awaiting).toBeUndefined()
    expect(settled?.recovery ?? []).toEqual([])
  })

  it('settles by absence, not by a success status', () => {
    const kit = createMockKit({ seed: 'r' })
    const op = started(kit)
    const late = kit.redeemChainAt(op, Date.now() + 10_000_000)
    expect(late.status).toBe('MISSING')
  })
})

describe('the agent that never pays', () => {
  const kit = () => createMockKit({ seed: 'r', scenario: 'protocol-unavailable' })

  it('does not settle, and never reports failed', () => {
    for (const record of kit().traceRedeem(started(kit()))) {
      expect(record.state).not.toBe('failed')
      expect(record.state).not.toBe('succeeded')
    }
  })

  it('waits on the FDC for a non-existence proof once the deadline passes', () => {
    const k = kit()
    const op = k.reconcileRedeemAt(started(k), k.timings.agentDeadlineMs + 1)
    expect(op.state).toBe('awaiting_external')
    expect(op.awaiting?.actor).toBe('fdc')
  })

  it('offers the collateral claim once that proof exists', () => {
    const k = kit()
    const op = k.reconcileRedeemAt(
      started(k),
      k.timings.agentDeadlineMs + k.timings.fdcProofMs + 1,
    )
    expect(op.state).toBe('action_required')
    expect(op.recovery?.[0]?.id).toBe('redemption-payment-default')
    expect(op.recovery?.[0]?.movesNewValue).toBe(false)
  })
})

describe('determinism', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createMockKit({ seed: 'same' })
    const b = createMockKit({ seed: 'same' })
    expect(a.traceRedeem(started(a)).map((r) => r.state)).toEqual(
      b.traceRedeem(started(b)).map((r) => r.state),
    )
  })
})
