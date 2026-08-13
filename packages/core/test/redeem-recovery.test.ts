import { describe, expect, it } from 'vitest'
import { type RedeemChainState, planRedeemRecovery } from '../src/fassets/redeem-recovery.js'

const NOW = 1_780_000_000_000
const DEADLINE = NOW + 900_000

const base: RedeemChainState = {
  requestId: '42',
  status: 'ACTIVE',
  agentVault: '0xAgent0000000000000000000000000000000001',
  paymentAddress: 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio',
  agentDeadline: DEADLINE,
  defaultProofAvailable: false,
}

describe('M1-R4 — success is signalled by absence', () => {
  it('resolves a deleted request to succeeded, never to missing or failed', () => {
    // "on payment confirmation the request is deleted, so there is no success
    // status" — RedemptionRequestInfo.sol
    const plan = planRedeemRecovery({ ...base, status: 'MISSING' }, NOW)
    expect(plan.state).toBe('succeeded')
    expect(plan.actions).toEqual([])
  })

  it('resolves an explicit SUCCESSFUL the same way', () => {
    expect(planRedeemRecovery({ ...base, status: 'SUCCESSFUL' }, NOW).state).toBe('succeeded')
  })
})

describe('M1-AC3 — waiting on the agent is a wait, not a failure', () => {
  it('names the agent as the awaited actor', () => {
    const plan = planRedeemRecovery(base, NOW)
    expect(plan.state).toBe('awaiting_external')
    expect(plan.awaitedActor).toBe('agent')
    expect(plan.reason).toMatch(/agent/i)
  })

  it('states the deadline rather than an open-ended wait', () => {
    expect(planRedeemRecovery(base, NOW).availableAt).toBe(DEADLINE)
  })

  it('offers nothing before the deadline, because nothing would succeed yet', () => {
    expect(planRedeemRecovery(base, NOW).actions).toEqual([])
  })

  it('never reports failed while the agent still has time', () => {
    expect(planRedeemRecovery(base, NOW).state).not.toBe('failed')
  })
})

describe('M1-AC4 — past the deadline the user gets a real action', () => {
  const past = NOW + 900_001

  it('waits on the FDC while the non-existence proof is still being obtained', () => {
    const plan = planRedeemRecovery(base, past)
    expect(plan.state).toBe('awaiting_external')
    expect(plan.awaitedActor).toBe('fdc')
    expect(plan.actions).toEqual([])
  })

  it('offers the collateral claim once the proof exists', () => {
    const plan = planRedeemRecovery({ ...base, defaultProofAvailable: true }, past)
    expect(plan.state).toBe('action_required')
    expect(plan.actions[0]?.id).toBe('redemption-payment-default')
  })

  it('says in the action itself that collateral arrives, not XRP', () => {
    const action = planRedeemRecovery({ ...base, defaultProofAvailable: true }, past).actions[0]
    expect(action?.effect).toMatch(/collateral/i)
    expect(action?.effect).toMatch(/not XRP|instead of XRP/i)
  })

  it('declares the claim reuses the burn already made', () => {
    // The FAsset was burned when the request was made. Claiming does not move
    // new value from the redeemer.
    const action = planRedeemRecovery({ ...base, defaultProofAvailable: true }, past).actions[0]
    expect(action?.movesNewValue).toBe(false)
  })
})

describe('the other named outcomes', () => {
  it('treats a late payment window as still resolvable', () => {
    const plan = planRedeemRecovery({ ...base, status: 'DEFAULTED_UNCONFIRMED' }, NOW)
    expect(plan.state).toBe('awaiting_external')
    expect(plan.state).not.toBe('failed')
  })

  it('reports paid-in-collateral as partly done, not as success', () => {
    // The redeemer wanted XRP and received collateral. That is a different
    // outcome from the one they asked for, and saying "succeeded" would hide it.
    const plan = planRedeemRecovery({ ...base, status: 'DEFAULTED_FAILED' }, NOW)
    expect(plan.state).toBe('partially_succeeded')
    expect(plan.reason).toMatch(/collateral/i)
  })

  it('does not invent an outcome for blocked or rejected', () => {
    for (const status of ['BLOCKED', 'REJECTED'] as const) {
      const plan = planRedeemRecovery({ ...base, status }, NOW)
      expect(plan.state).toBe('action_required')
      expect(plan.state).not.toBe('succeeded')
      expect(plan.awaitedActor).toBe('operator')
    }
  })
})

describe('no branch offers new value', () => {
  it('holds across every status and both sides of the deadline', () => {
    const statuses = [
      'ACTIVE', 'DEFAULTED_UNCONFIRMED', 'SUCCESSFUL', 'DEFAULTED_FAILED',
      'BLOCKED', 'REJECTED', 'MISSING',
    ] as const
    for (const status of statuses) {
      for (const now of [NOW, NOW + 900_001]) {
        for (const defaultProofAvailable of [false, true]) {
          const plan = planRedeemRecovery({ ...base, status, defaultProofAvailable }, now)
          expect(plan.movesNewValue).toBe(false)
          expect(plan.actions.every((a) => !a.movesNewValue)).toBe(true)
        }
      }
    }
  })
})
