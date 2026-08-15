import { useEffect, useState } from 'react'

/** The 1193 surface this hook needs; viem's `custom()` takes the same shape. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

export interface InjectedWallet {
  readonly id: string
  /** Reverse-DNS identity. Stable across sessions; the uuid is not. */
  readonly rdns: string
  readonly name: string
  readonly icon: string
  readonly provider: Eip1193Provider
}

interface AnnounceDetail {
  info: { uuid: string; rdns: string; name: string; icon: string }
  provider: Eip1193Provider
}

/**
 * EIP-6963 discovery. Wallets announce themselves; nothing is probed, and
 * `window.ethereum` is deliberately NOT read — it names whichever wallet won a
 * race, which is how a user with two wallets installed ends up connected to the
 * one they did not choose.
 *
 * Deduped on `rdns`: the uuid is per-announcement, and a wallet that re-announces
 * on every request would otherwise stack duplicate rows in the modal.
 */
export function useInjectedWallets(): readonly InjectedWallet[] {
  const [wallets, setWallets] = useState<readonly InjectedWallet[]>([])

  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const { info, provider } = (event as CustomEvent<AnnounceDetail>).detail
      setWallets((current) =>
        current.some((wallet) => wallet.rdns === info.rdns)
          ? current
          : [
              ...current,
              { id: info.uuid, rdns: info.rdns, name: info.name, icon: info.icon, provider },
            ],
      )
    }

    window.addEventListener('eip6963:announceProvider', onAnnounce)
    // Ask any wallet that loaded before this mounted to announce again.
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce)
  }, [])

  return wallets
}
