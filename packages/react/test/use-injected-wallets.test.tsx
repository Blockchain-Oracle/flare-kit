import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useInjectedWallets } from '../src/use-injected-wallets.js'

/** Announce a wallet exactly as EIP-6963 specifies. */
function announce(uuid: string, rdns: string, name: string) {
  const detail = Object.freeze({
    info: { uuid, rdns, name, icon: 'data:image/svg+xml,<svg/>' },
    provider: { request: async () => [] },
  })
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }))
}

describe('useInjectedWallets', () => {
  it('starts empty, so no wallet is claimed before one announces', () => {
    const { result } = renderHook(() => useInjectedWallets())
    expect(result.current).toEqual([])
  })

  it('collects a wallet that announces itself', () => {
    const { result } = renderHook(() => useInjectedWallets())
    act(() => announce('uuid-1', 'io.metamask', 'MetaMask'))
    expect(result.current.map((w) => w.name)).toEqual(['MetaMask'])
  })

  it('keeps one entry per wallet when it announces twice', () => {
    const { result } = renderHook(() => useInjectedWallets())
    act(() => {
      announce('uuid-1', 'io.metamask', 'MetaMask')
      announce('uuid-2', 'io.metamask', 'MetaMask')
    })
    // Deduped on rdns, not uuid: the uuid is per-announcement and a wallet that
    // announces on every request would otherwise stack up duplicate rows.
    expect(result.current).toHaveLength(1)
  })

  it('collects several distinct wallets', () => {
    const { result } = renderHook(() => useInjectedWallets())
    act(() => {
      announce('uuid-1', 'io.metamask', 'MetaMask')
      announce('uuid-2', 'io.rabby', 'Rabby')
    })
    expect(result.current.map((w) => w.rdns).sort()).toEqual(['io.metamask', 'io.rabby'])
  })
})
