import { describe, expect, it } from 'vitest'
import {
  type DirectMintChainState,
  planRecovery,
} from '../src/fassets/direct-mint-recovery.js'

const NOW = 1_780_000_000_000
const XRPL_TX = 'E3FE6EA3D48F0C2B639448020EA4F03D4F4F8FFDB243A852A0F59177921B4879'

const BASE: DirectMintChainState = {
  xrplTxId: XRPL_TX,
  xrplFinal: true,
  proofAvailable: true,
  delayState: 'NotDelayed',
  allowedAt: undefined,
  alreadySettled: false,
  executorExclusiveUntil: undefined,
  unavailableReason: undefined,
}

describe('AC8 — an already-settled mint never resubmits', () => {
  it('resolves succeeded from chain evidence, offering no action', () => {
    // A repeat executeDirectMinting reverts with PaymentAlreadyConfirmed, so
    // idempotency is ours to provide: read state, then submit nothing.
    const plan = planRecovery({ ...BASE, alreadySettled: true }, NOW)
    expect(plan.state).toBe('succeeded')
    expect(plan.actions).toEqual([])
    expect(plan.movesNewValue).toBe(false)
  })

  it('stays succeeded however many times recovery runs', () => {
    const once = planRecovery({ ...BASE, alreadySettled: true }, NOW)
    const twice = planRecovery({ ...BASE, alreadySettled: true }, NOW + 60_000)
    expect(twice).toEqual(once)
  })
})

describe('AC3 — a late executor reads as delayed, never as failed', () => {
  it('waits on a named actor rather than failing', () => {
    const plan = planRecovery(
      { ...BASE, executorExclusiveUntil: NOW + 300_000 },
      NOW,
    )
    expect(plan.state).toBe('awaiting_external')
    expect(plan.awaitedActor).toBe('executor')
    expect(plan.reason).toMatch(/executor/i)
  })

  it('offers no action at all while the executor holds exclusivity', () => {
    // Offering "execute" here would just revert with InvalidExecutor. An action
    // that cannot succeed is not a safe action.
    const plan = planRecovery({ ...BASE, executorExclusiveUntil: NOW + 300_000 }, NOW)
    expect(plan.actions).toEqual([])
  })

  it('never offers anything that could send XRP a second time', () => {
    for (const state of [
      { ...BASE, executorExclusiveUntil: NOW + 300_000 },
      { ...BASE, delayState: 'Delayed' as const, allowedAt: NOW + 3_600_000 },
      { ...BASE, proofAvailable: false },
      { ...BASE, xrplFinal: false },
    ]) {
      const plan = planRecovery(state, NOW)
      expect(plan.movesNewValue).toBe(false)
      expect(plan.actions.every((a) => !a.movesNewValue)).toBe(true)
    }
  })
})

describe('AC4 — past allowed-at, retry reuses the existing payment and proof', () => {
  it('offers execution once exclusivity has lapsed', () => {
    const plan = planRecovery({ ...BASE, executorExclusiveUntil: NOW - 1 }, NOW)
    expect(plan.state).toBe('action_required')
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0]?.id).toBe('execute-direct-minting')
  })

  it('declares the action reuses existing evidence and moves no new value', () => {
    const action = planRecovery({ ...BASE, executorExclusiveUntil: NOW - 1 }, NOW).actions[0]
    expect(action?.movesNewValue).toBe(false)
    expect(action?.signs).toBe(true)
    expect(action?.broadcasts).toBe(true)
    expect(action?.effect).toMatch(/already (paid|made)|existing/i)
  })

  it('holds the action back until allowed-at, carrying the timestamp', () => {
    const plan = planRecovery(
      { ...BASE, delayState: 'Delayed', allowedAt: NOW + 3_600_000 },
      NOW,
    )
    expect(plan.state).toBe('awaiting_external')
    expect(plan.availableAt).toBe(NOW + 3_600_000)
    expect(plan.actions).toEqual([])
  })

  it('releases the action the moment allowed-at passes', () => {
    const plan = planRecovery(
      { ...BASE, delayState: 'Released', allowedAt: NOW - 1 },
      NOW,
    )
    expect(plan.state).toBe('action_required')
    expect(plan.actions[0]?.id).toBe('execute-direct-minting')
  })
})

describe('waiting on evidence', () => {
  it('waits on XRPL finality before anything else', () => {
    const plan = planRecovery({ ...BASE, xrplFinal: false, proofAvailable: false }, NOW)
    expect(plan.state).toBe('confirming')
    expect(plan.awaitedActor).toBe('xrpl')
    expect(plan.actions).toEqual([])
  })

  it('waits on the FDC once the payment is final but the proof is not ready', () => {
    const plan = planRecovery({ ...BASE, proofAvailable: false }, NOW)
    expect(plan.state).toBe('awaiting_external')
    expect(plan.awaitedActor).toBe('fdc')
    expect(plan.reason).toMatch(/proof|round|attest/i)
  })

  it('never claims failure just because evidence is not yet available', () => {
    for (const state of [
      { ...BASE, xrplFinal: false },
      { ...BASE, proofAvailable: false },
    ]) {
      expect(planRecovery(state, NOW).state).not.toBe('failed')
    }
  })
})

describe('protocol unavailability', () => {
  it('reports a configuration gap as unavailable, not as user error', () => {
    const plan = planRecovery(
      { ...BASE, unavailableReason: 'MissingMintingTagManager' },
      NOW,
    )
    expect(plan.state).toBe('action_required')
    expect(plan.reason).toMatch(/not configured|unavailable|operator/i)
    expect(plan.actions).toEqual([])
  })

  it('still refuses to invent a failure, because the XRP is recoverable later', () => {
    const plan = planRecovery({ ...BASE, unavailableReason: 'MissingMintingTagManager' }, NOW)
    expect(plan.state).not.toBe('failed')
    expect(plan.movesNewValue).toBe(false)
  })
})

describe('the happy path', () => {
  it('offers execution immediately when nothing blocks it', () => {
    const plan = planRecovery(BASE, NOW)
    expect(plan.state).toBe('action_required')
    expect(plan.actions[0]?.id).toBe('execute-direct-minting')
  })

  it('carries the XRPL transaction id as the idempotency key', () => {
    // R10: idempotent by XRPL transaction id.
    expect(planRecovery(BASE, NOW).idempotencyKey).toBe(XRPL_TX)
  })
})
