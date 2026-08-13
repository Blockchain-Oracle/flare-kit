import {
  applyTransition,
  applyX402Challenge,
  createX402,
  mockX402Challenge,
  mockX402Outcome,
  reconcileX402,
  type X402Operation,
} from '@flare-kit/core'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useX402 } from '../src/use-x402.js'

type Hex = `0x${string}`
const OWNER: Hex = '0x00000000000000000000000000000000000000A1'

function submittedX402(): X402Operation {
  let op = createX402({ chainId: 114, intent: { network: 'coston2', resource: '/api/demo' }, now: 0 })
  const authorization = { from: OWNER, to: OWNER, value: 100_000n, validAfter: 0n, validBefore: 1n, nonce: `0x${'00'.repeat(32)}` as Hex }
  op = applyX402Challenge(op, { plan: { challenge: mockX402Challenge(0), authorization }, now: 0 }).record
  op = applyTransition(op, { to: 'executing', at: 0, patch: {} }).record
  op = applyTransition(op, { to: 'submitted', at: 0, patch: {} }).record
  return op
}

describe('useX402 — durable x402 poll (M9-R14)', () => {
  it('settled + delivered → succeeded (only from the observed settlement + delivery)', async () => {
    const o = mockX402Outcome('settled-delivered')
    const reconcile = async (op: X402Operation) => reconcileX402(op, o.settlement, o.resource, 1000)
    const operation = submittedX402()
    const { result } = renderHook(() => useX402({ operation, reconcile, pollMs: 5 }))
    await waitFor(() => expect(result.current.operation?.state).toBe('succeeded'))
    expect(result.current.isSettled).toBe(true)
  })

  it('settled + resource-failed → partially_succeeded (payment took, resource did not), never succeeded', async () => {
    const o = mockX402Outcome('settled-resource-failed')
    const reconcile = async (op: X402Operation) => reconcileX402(op, o.settlement, o.resource, 1000)
    const operation = submittedX402()
    const { result } = renderHook(() => useX402({ operation, reconcile, pollMs: 5 }))
    await waitFor(() => expect(result.current.operation?.state).toBe('partially_succeeded'))
    expect(result.current.operation?.state).not.toBe('succeeded')
  })

  it('a failed read is recorded but never moves the op (leaves it submitted)', async () => {
    const reconcile = async () => {
      throw new Error('server down')
    }
    const operation = submittedX402()
    const { result } = renderHook(() => useX402({ operation, reconcile, pollMs: 5 }))
    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(result.current.operation?.state).toBe('submitted')
  })
})
