import {
  applyGaslessPlan,
  applyTransition,
  createGasless,
  createMockGaslessAdapter,
  reconcileGaslessPayment,
  type GaslessOperation,
} from '@flare-kit/core'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useGasless } from '../src/use-gasless.js'

type Hex0x = `0x${string}`
const OWNER: Hex0x = '0x00000000000000000000000000000000000000A1'

function submittedGasless(): GaslessOperation {
  let op = createGasless({ chainId: 114, intent: { network: 'coston2', to: OWNER, amount: 1_000_000n, deadlineSeconds: 3600 }, now: 0 })
  op = applyGaslessPlan(op, { plan: { kind: 'plan', plan: { payment: { from: OWNER, to: OWNER, amount: 1_000_000n, nonce: 0n, deadline: 3600n } } }, now: 0 }).record
  op = applyTransition(op, { to: 'executing', at: 0, patch: {} }).record
  op = applyTransition(op, { to: 'submitted', at: 0, patch: {} }).record
  return op
}

describe('useGasless — durable gasless poll (M9-R14)', () => {
  it('polls paymentSince via the mock adapter and reaches succeeded from the on-chain read', async () => {
    const adapter = createMockGaslessAdapter({ confirmed: true })
    const reconcile = async (op: GaslessOperation) => reconcileGaslessPayment(op, await adapter.reads.paymentSince(OWNER, 0n, 0n), 1000)
    const operation = submittedGasless()
    const { result } = renderHook(() => useGasless({ operation, reconcile, pollMs: 5 }))
    await waitFor(() => expect(result.current.operation?.state).toBe('succeeded'))
    expect(result.current.isSettled).toBe(true)
  })

  it('an in-flight transfer stays awaiting_external(relayer), never succeeded', async () => {
    const adapter = createMockGaslessAdapter({ confirmed: false })
    const reconcile = async (op: GaslessOperation) => reconcileGaslessPayment(op, await adapter.reads.paymentSince(OWNER, 0n, 0n), 1000)
    const operation = submittedGasless()
    const { result } = renderHook(() => useGasless({ operation, reconcile, pollMs: 5 }))
    await waitFor(() => expect(result.current.operation?.state).toBe('awaiting_external'))
    expect(result.current.operation?.awaiting?.actor).toBe('relayer')
    expect(result.current.isSettled).toBe(false)
  })

  it('a failed read is recorded but never moves the op to failed (leaves it submitted)', async () => {
    const reconcile = async () => {
      throw new Error('rpc down')
    }
    const operation = submittedGasless()
    const { result } = renderHook(() => useGasless({ operation, reconcile, pollMs: 5 }))
    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(result.current.operation?.state).toBe('submitted')
  })
})
