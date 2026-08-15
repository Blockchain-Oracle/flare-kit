import { type FlareChain, chainFor } from '@flarekit-dev/contracts'
import { type ChainIdentity, walletConnected, wrongNetwork } from '@flarekit-dev/core'
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

/**
 * A connect attempt, reported as what was actually observed.
 *
 * A failure carries no identity at all rather than a plausible-looking one, and
 * `declined` is only true when the wallet said so (EIP-1193 `4001`). A network
 * error is not a refusal, and calling it one would put a wrong reason in front
 * of someone trying to work out why they are not connected.
 */
export type ConnectResult =
  | { readonly ok: true; readonly identity: ChainIdentity }
  | { readonly ok: false; readonly declined: boolean; readonly message: string }

/** EIP-1193: the user rejected the request. */
const USER_REJECTED = 4001

function messageFor(cause: unknown): string {
  if (typeof cause === 'object' && cause !== null && 'message' in cause) {
    const { message } = cause as { message: unknown }
    if (typeof message === 'string' && message.length > 0) return message
  }
  return String(cause)
}

/** The observed network, named where we know the name and by its id where we do not. */
function observedNetwork(chainId: number) {
  try {
    return { name: chainFor(chainId).name, chainId }
  } catch {
    return { name: `Chain ${chainId}`, chainId }
  }
}

/**
 * Ask one announced wallet for an account.
 *
 * The app never holds a key: this asks the wallet, and the wallet decides. The
 * chain the wallet is actually on is read rather than assumed, so a wallet
 * sitting on mainnet while the app is set to testnet reports `wrong-network`
 * instead of being recorded as connected to a network it is not on.
 */
export async function connectWallet(
  wallet: Pick<InjectedWallet, 'provider'>,
  chain: FlareChain,
): Promise<ConnectResult> {
  let accounts: unknown
  let rawChainId: unknown
  try {
    accounts = await wallet.provider.request({ method: 'eth_requestAccounts' })
    rawChainId = await wallet.provider.request({ method: 'eth_chainId' })
  } catch (cause) {
    const code = (cause as { code?: unknown } | null)?.code
    const declined = code === USER_REJECTED
    return {
      ok: false,
      declined,
      message: declined ? 'You declined the connection request.' : messageFor(cause),
    }
  }

  const address = Array.isArray(accounts) ? accounts[0] : undefined
  if (typeof address !== 'string' || address.length === 0) {
    return { ok: false, declined: false, message: 'The wallet approved no account.' }
  }

  const required = { name: chain.name, chainId: chain.id }
  const walletChainId = typeof rawChainId === 'string' ? Number.parseInt(rawChainId, 16) : undefined
  if (walletChainId !== undefined && Number.isFinite(walletChainId) && walletChainId !== chain.id) {
    return {
      ok: true,
      identity: wrongNetwork('evm', address, observedNetwork(walletChainId), required),
    }
  }

  return { ok: true, identity: walletConnected('evm', address, required) }
}

/**
 * Storage access that cannot take the app down with it.
 *
 * Remembering the last wallet is a convenience, so every failure mode here
 * degrades to "nothing remembered" rather than throwing: a private-mode browser
 * can throw on access, and jsdom supplies a `localStorage` object with none of
 * the `Storage` methods on it, which is a real crash in a real test run.
 */
export function readRecentWallet(storage: Pick<Storage, 'getItem'> | undefined): string | undefined {
  if (typeof storage?.getItem !== 'function') return undefined
  try {
    return storage.getItem(RECENT_WALLET_KEY) ?? undefined
  } catch {
    return undefined
  }
}

export function rememberWallet(
  storage: Pick<Storage, 'setItem'> | undefined,
  rdns: string,
): void {
  if (typeof storage?.setItem !== 'function') return
  try {
    storage.setItem(RECENT_WALLET_KEY, rdns)
  } catch {
    // A wallet we could not remember is a missing badge, not a failed connection.
  }
}
