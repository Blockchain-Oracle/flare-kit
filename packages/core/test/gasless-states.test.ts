import { describe, expect, it } from 'vitest'
import type { Address, Hex } from 'viem'
import { type GaslessOperation, createGasless, applyGaslessPlan, reconcileGaslessPayment } from '../src/index.js'
import { applyTransition } from '../src/operation.js'

const OWNER: Address = '0x00000000000000000000000000000000000000A1'
const RECIPIENT: Address = '0x00000000000000000000000000000000000000B2'
const NOW = 1_700_000_000
const TX = `0x${'ab'.repeat(32)}` as Hex

// Build a gasless op that has signed + relayed (state `submitted`, spine sign/relay),
// ready to reconcile against the on-chain transfer read.
function submittedOp(now: number): GaslessOperation {
  let op = createGasless({
    chainId: 114,
    intent: { network: 'coston2', to: RECIPIENT, amount: 1_000_000n, deadlineSeconds: 3600 },
    now,
  })
  const plan = { payment: { from: OWNER, to: RECIPIENT, amount: 1_000_000n, nonce: 0n, deadline: BigInt(now + 3600) } }
  op = applyGaslessPlan(op, { plan: { kind: 'plan', plan }, now }).record // → ready
  op = applyTransition(op, { to: 'executing', at: now, patch: {} }).record
  op = applyTransition(op, { to: 'submitted', at: now, patch: {} }).record
  return op
}

describe('reconcileGaslessPayment (M9-R3)', () => {
  it('an in-flight transfer stays awaiting_external (actor relayer), NEVER succeeded', () => {
    const r = reconcileGaslessPayment(submittedOp(NOW), { kind: 'in-flight' }, NOW + 5000)
    expect(r.state).toBe('awaiting_external')
    expect(r.awaiting?.actor).toBe('relayer')
    expect(r.state).not.toBe('succeeded')
  })

  it('a confirmed transfer reaches succeeded, finalizes the spine and clears awaiting', () => {
    const r = reconcileGaslessPayment(submittedOp(NOW), { kind: 'confirmed', txHash: TX, amount: 1_000_000n }, NOW + 8000)
    expect(r.state).toBe('succeeded')
    expect(r.awaiting).toBeUndefined()
    expect(r.steps.every((s) => s.state === 'done')).toBe(true)
  })

  it('in-flight then confirmed reaches succeeded (idempotent table walk, no lost patch)', () => {
    let op = submittedOp(NOW)
    op = reconcileGaslessPayment(op, { kind: 'in-flight' }, NOW + 1000)
    expect(op.state).toBe('awaiting_external')
    op = reconcileGaslessPayment(op, { kind: 'confirmed', txHash: TX, amount: 1_000_000n }, NOW + 2000)
    expect(op.state).toBe('succeeded')
    expect(op.steps.every((s) => s.state === 'done')).toBe(true)
  })

  it('the relayer wait `since` is preserved across repeated in-flight reconciles', () => {
    let op = reconcileGaslessPayment(submittedOp(NOW), { kind: 'in-flight' }, NOW + 1000)
    const since = op.awaiting?.since
    op = reconcileGaslessPayment(op, { kind: 'in-flight' }, NOW + 9000)
    expect(op.awaiting?.since).toBe(since) // same leg → the wait start does not reset
  })
})
