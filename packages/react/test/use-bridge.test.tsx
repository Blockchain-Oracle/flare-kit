import type { OperationRecord } from '@flarekit-dev/core'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useBridge } from '../src/use-bridge.js'

const op = (state: OperationRecord['state']): OperationRecord =>
  ({ state, id: 'x', capability: 'bridge', network: 114, intent: {}, steps: [], evidence: [], attempts: [], quoteHistory: [], createdAt: 0, updatedAt: 0, schemaVersion: 1 }) as OperationRecord

describe('useBridge — the durable delivery poll', () => {
  it('a settled operation reports isSettled and never polls', () => {
    const reconcile = vi.fn()
    const { result } = renderHook(() => useBridge({ operation: op('succeeded'), reconcile }))
    expect(result.current.isSettled).toBe(true)
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('re-reads the destination while in flight and stops the moment it settles', async () => {
    let calls = 0
    const reconcile = async (o: OperationRecord) => {
      calls += 1
      return calls >= 2 ? op('succeeded') : o // in-flight, in-flight, then delivered
    }
    const { result } = renderHook(() => useBridge({ operation: op('awaiting_external'), reconcile, pollMs: 5 }))
    await waitFor(() => expect(result.current.operation?.state).toBe('succeeded'))
    expect(result.current.isSettled).toBe(true)
  })

  it('a failed READING is recorded but never moves the operation to failed', async () => {
    const reconcile = async () => {
      throw new Error('rpc down')
    }
    const { result } = renderHook(() => useBridge({ operation: op('awaiting_external'), reconcile, pollMs: 5 }))
    await waitFor(() => expect(result.current.error).toBeDefined())
    // the destination truth has not changed — the op stays where the chain last put it
    expect(result.current.operation?.state).toBe('awaiting_external')
    expect(result.current.isSettled).toBe(false)
  })

  it('a transient read error clears once a later poll succeeds — never a sticky failure', async () => {
    let calls = 0
    const reconcile = async (_o: OperationRecord) => {
      calls += 1
      if (calls === 1) throw new Error('lagged RPC') // first poll: the Sepolia RPC lags
      return op('succeeded') // a later poll reads fine and delivers
    }
    const { result } = renderHook(() => useBridge({ operation: op('awaiting_external'), reconcile, pollMs: 5 }))
    await waitFor(() => expect(result.current.isSettled).toBe(true))
    // the transient read error was cleared by the successful poll — not left sticky
    expect(result.current.error).toBeUndefined()
  })
})
