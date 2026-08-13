import { describe, expect, it } from 'vitest'
import { findEvidence } from '../src/evidence.js'
import { quoteRedeem } from '../src/fassets/quote-redeem.js'
import type { RedeemProtocolState } from '../src/fassets/quote-redeem.js'
import type { RedeemChainState } from '../src/fassets/redeem-recovery.js'
import {
  REDEEM_STEPS,
  attachRedemptionRequest,
  createRedeemOperation,
  reconcileRedeem,
} from '../src/fassets/redeem.js'

const NOW = 1_780_000_000_000
const STATE: RedeemProtocolState = {
  fAssetSymbol: 'FTestXRP',
  fAssetDecimals: 6,
  lotSizeUBA: 10_000_000n,
  redemptionFeeBIPS: 50n,
  underlyingSecondsForPayment: 900n,
  defaultPremiumBIPS: 10_500n,
  emergencyPaused: false,
}
const INTENT = { lots: 1, redeemerUnderlyingAddress: 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio' }

const newOp = () =>
  createRedeemOperation({
    quote: quoteRedeem(STATE, INTENT, NOW),
    intent: INTENT,
    network: 114,
    now: NOW,
  })

const chain = (over: Partial<RedeemChainState> = {}): RedeemChainState => ({
  requestId: '42',
  status: 'ACTIVE',
  agentVault: '0xAgent0000000000000000000000000000000001',
  paymentAddress: 'rAgentPaysFromHere',
  agentDeadline: NOW + 900_000,
  defaultProofAvailable: false,
  ...over,
})

describe('createRedeemOperation', () => {
  it('starts ready with the quote attached', () => {
    const op = newOp()
    expect(op.state).toBe('ready')
    expect(op.capability).toBe('fassets.redeem')
    expect(op.quote?.lots).toBe(1)
  })

  it('lays out a spine whose steps belong to counterparties after the burn', () => {
    const op = newOp()
    expect(op.steps.map((s) => s.id)).toEqual([...REDEEM_STEPS])
    expect(op.steps.map((s) => s.actor)).toEqual(['your_wallet', 'agent', 'xrpl', 'flare'])
  })

  it('refuses a quote that cannot proceed', () => {
    const blocked = quoteRedeem(STATE, { ...INTENT, lots: 1.5 }, NOW)
    expect(() =>
      createRedeemOperation({ quote: blocked, intent: INTENT, network: 114, now: NOW }),
    ).toThrow(/whole lot/i)
  })
})

describe('attachRedemptionRequest', () => {
  it('moves to submitted and records the request and the agent', () => {
    const op = attachRedemptionRequest(newOp(), {
      requestId: '42',
      agentVault: '0xAgent0000000000000000000000000000000001',
      paymentAddress: 'rAgentPaysFromHere',
      at: NOW + 1_000,
    })
    expect(op.state).toBe('submitted')
    expect(findEvidence(op.evidence, 'reservation_id')?.value).toBe('42')
    expect(findEvidence(op.evidence, 'agent_vault')?.value).toMatch(/^0xAgent/)
  })

  it('adopts the request id as the idempotency key', () => {
    const op = attachRedemptionRequest(newOp(), {
      requestId: '42',
      agentVault: '0xA',
      at: NOW + 1_000,
    })
    expect(op.idempotencyKey).toBe('42')
  })

  it('is idempotent under a duplicate callback', () => {
    const once = attachRedemptionRequest(newOp(), { requestId: '42', agentVault: '0xA', at: NOW })
    const twice = attachRedemptionRequest(once, { requestId: '42', agentVault: '0xA', at: NOW + 5 })
    expect(twice.evidence.filter((e) => e.kind === 'reservation_id')).toHaveLength(1)
  })
})

describe('reconcileRedeem', () => {
  const submitted = () =>
    attachRedemptionRequest(newOp(), {
      requestId: '42',
      agentVault: '0xAgent0000000000000000000000000000000001',
      at: NOW + 1_000,
    })

  it('waits on the agent, naming the deadline', () => {
    const op = reconcileRedeem(submitted(), chain(), NOW + 5_000)
    expect(op.state).toBe('awaiting_external')
    expect(op.awaiting?.actor).toBe('agent')
    expect(op.awaiting?.availableAt).toBe(NOW + 900_000)
  })

  it('resolves a deleted request to succeeded', () => {
    const op = reconcileRedeem(submitted(), chain({ status: 'MISSING' }), NOW + 60_000)
    expect(op.state).toBe('succeeded')
  })

  it('offers the collateral claim past the deadline once the proof exists', () => {
    const op = reconcileRedeem(
      submitted(),
      chain({ defaultProofAvailable: true }),
      NOW + 900_001,
    )
    expect(op.state).toBe('action_required')
    expect(op.recovery?.[0]?.id).toBe('redemption-payment-default')
    expect(op.recovery?.[0]?.movesNewValue).toBe(false)
  })

  it('is safe to run repeatedly on the same reading', () => {
    const c = chain()
    const once = reconcileRedeem(submitted(), c, NOW + 5_000)
    const twice = reconcileRedeem(once, c, NOW + 6_000)
    expect(twice.state).toBe(once.state)
    expect(twice.evidence).toEqual(once.evidence)
  })

  it('never reports failed while the outcome is unresolved', () => {
    for (const status of ['ACTIVE', 'DEFAULTED_UNCONFIRMED', 'BLOCKED', 'REJECTED'] as const) {
      expect(reconcileRedeem(submitted(), chain({ status }), NOW + 5_000).state).not.toBe('failed')
    }
  })
})
