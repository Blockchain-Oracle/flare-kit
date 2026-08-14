import type { InjectedWallet } from '@flarekit-dev/react'
import type { WalletOption } from '@flarekit-dev/react-ui'

/** Remembered across sessions so the modal can mark one row Recent. Not a secret. */
export const RECENT_WALLET_KEY = 'flare-kit:app:wallet:v1'

/**
 * Announced wallets, as rows the modal can render.
 *
 * `detected` is true because the wallet ANNOUNCED — it is an observation, not a
 * guess. Nothing here lists a wallet that is not installed: an aspirational row
 * for a wallet the user does not have is the connect-flow version of a
 * fabricated balance.
 */
export function toWalletOptions(
  wallets: readonly InjectedWallet[],
  recentRdns?: string,
): WalletOption[] {
  return wallets.map((wallet) => ({
    id: wallet.id,
    name: wallet.name,
    icon: wallet.icon,
    family: 'evm' as const,
    detected: true,
    recent: recentRdns !== undefined && wallet.rdns === recentRdns,
  }))
}
