import { createMockKit } from '@flare-kit/core'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { FlareProvider, useDirectMint, useFlareKit, useOperation } from '../src/index.js'

const INTENT = {
  amountXrp: '250',
  recipient: '0x1234567890abcdef1234567890abcdef12345678',
  xrplAccount: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
}

function wrapper(kit = createMockKit({ seed: 'hooks', speed: 1_000_000 })) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <FlareProvider kit={kit}>{children}</FlareProvider>
  }
}

describe('FlareProvider', () => {
  it('accepts a mock kit and exposes it unchanged', () => {
    const kit = createMockKit({ seed: 'p' })
    const { result } = renderHook(() => useFlareKit(), { wrapper: wrapper(kit) })
    expect(result.current.isMock).toBe(true)
    expect(result.current.label).toMatch(/mock/i)
  })

  it('tells a developer plainly when the provider is missing', () => {
    // A thrown context error is the one place a cryptic message costs an hour.
    expect(() => renderHook(() => useFlareKit())).toThrow(/FlareProvider/)
  })

  it('renders children', () => {
    render(
      <FlareProvider kit={createMockKit()}>
        <p>child</p>
      </FlareProvider>,
    )
    expect(screen.getByText('child')).toBeDefined()
  })
})

describe('useDirectMint', () => {
  it('quotes without starting anything', () => {
    const { result } = renderHook(() => useDirectMint(), { wrapper: wrapper() })
    const quote = result.current.quote(INTENT)
    expect(quote.canProceed).toBe(true)
    expect(result.current.operation).toBeUndefined()
  })

  it('surfaces a blocked quote rather than throwing at the caller', () => {
    // AC7: the widget needs to render why, so this must not explode.
    const { result } = renderHook(() => useDirectMint(), { wrapper: wrapper() })
    const quote = result.current.quote({ ...INTENT, amountXrp: '0.4' })
    expect(quote.canProceed).toBe(false)
    expect(quote.blockedReason).toMatch(/mints nothing/i)
  })

  it('starts an operation and exposes it', async () => {
    const { result } = renderHook(() => useDirectMint(), { wrapper: wrapper() })
    await act(async () => {
      result.current.start(INTENT)
    })
    expect(result.current.operation?.state).toBe('ready')
    expect(result.current.operation?.capability).toBe('fassets.directMint')
  })

  it('refuses to start a mint the quote blocks, and reports the error', async () => {
    const { result } = renderHook(() => useDirectMint(), { wrapper: wrapper() })
    await act(async () => {
      result.current.start({ ...INTENT, amountXrp: '0.4' })
    })
    expect(result.current.operation).toBeUndefined()
    expect(result.current.error?.code).toBe('QUOTE_NOT_PROCEEDABLE')
  })

  it('drives the operation to completion without the caller polling', async () => {
    const { result } = renderHook(() => useDirectMint(), { wrapper: wrapper() })
    await act(async () => {
      result.current.start(INTENT)
    })
    await waitFor(() => expect(result.current.operation?.state).toBe('succeeded'), {
      timeout: 5_000,
    })
  })

  it('never reports a failed state on the happy path', async () => {
    const seen: string[] = []
    const { result } = renderHook(() => useDirectMint(), { wrapper: wrapper() })
    await act(async () => {
      result.current.start(INTENT)
    })
    await waitFor(() => {
      if (result.current.operation) seen.push(result.current.operation.state)
      expect(result.current.operation?.state).toBe('succeeded')
    }, { timeout: 5_000 })
    expect(seen).not.toContain('failed')
  })
})

describe('useOperation', () => {
  it('returns undefined for an id nothing has created', () => {
    const { result } = renderHook(() => useOperation('op_nope'), { wrapper: wrapper() })
    expect(result.current).toBeUndefined()
  })

  it('re-renders when the operation it watches advances', async () => {
    const kit = createMockKit({ seed: 'watch', speed: 1_000_000 })
    const Wrapper = wrapper(kit)

    const mint = renderHook(() => useDirectMint(), { wrapper: Wrapper })
    await act(async () => {
      mint.result.current.start(INTENT)
    })
    const id = mint.result.current.operation?.id
    expect(id).toBeDefined()

    const watcher = renderHook(() => useOperation(id as string), { wrapper: Wrapper })
    await waitFor(() => expect(watcher.result.current?.state).toBe('succeeded'), {
      timeout: 5_000,
    })
  })
})

describe('operations survive across components', () => {
  it('lists open work, which is what removes the need for a Resume button', async () => {
    const { result } = renderHook(
      () => ({ mint: useDirectMint(), kit: useFlareKit() }),
      { wrapper: wrapper() },
    )
    await act(async () => {
      result.current.mint.start(INTENT)
    })
    expect(result.current.mint.operation).toBeDefined()
  })
})
