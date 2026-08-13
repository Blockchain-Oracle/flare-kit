import type { ChainFamily } from '@flare-kit/core'
import { Modal } from './primitives/Modal.js'
import { NetworkLogo } from './primitives/NetworkLogo.js'

/**
 * ConnectModal — the wallet picker.
 *
 * Presentational and wallet-agnostic ON PURPOSE. The kit does not connect
 * wallets: a host owns its adapters and hands the resulting identity in (see
 * `use-accounts`), so this renders the wallets the host discovered and calls
 * back on selection — it never opens a connection itself. Owning a picker but
 * not the connection is what keeps the kit from claiming custody it lacks.
 *
 * Icons are real or honest. A wallet shows its OWN icon (EIP-6963 `info.icon`);
 * a wallet that advertised none gets a neutral wallet glyph, never a stand-in
 * brand mark. The network shows its real mark AND its name, because the mark is
 * recognition and the name is the authority.
 */

const FAMILY_LABEL: Record<ChainFamily, string> = { evm: 'Flare network', xrpl: 'XRP Ledger' }
const FAMILIES: readonly ChainFamily[] = ['evm', 'xrpl']

// Bundled brand marks for well-known wallets, used only as a fallback when the
// host did not pass the wallet's own EIP-6963 icon. Marks are vendored
// (see assets/ATTRIBUTION.md) and used nominatively; a wallet's OWN advertised
// icon always takes precedence over these.
const WALLET_MARK: Record<string, string> = {
  metamask: 'fk-wb-metamask',
  rabby: 'fk-wb-rabby',
  coinbase: 'fk-wb-coinbase',
  walletconnect: 'fk-wb-walletconnect',
  xaman: 'fk-wb-xaman',
}

function bundledMark(wallet: WalletOption): string | undefined {
  const key = `${wallet.id} ${wallet.name}`.toLowerCase()
  return Object.entries(WALLET_MARK).find(([name]) => key.includes(name))?.[1]
}

export interface WalletOption {
  /** Stable id the host maps back to its connector (e.g. the EIP-6963 uuid). */
  readonly id: string
  readonly name: string
  /** The wallet's own icon (EIP-6963 `info.icon`), a data or https URL. */
  readonly icon?: string
  readonly family: ChainFamily
  /** Announced/installed right now (EIP-6963, or an XRPL adapter present). */
  readonly detected?: boolean
  /** Last used on this device. */
  readonly recent?: boolean
}

export interface NetworkLabel {
  readonly name: string
  readonly testnet?: boolean
}

export interface ConnectModalProps {
  open: boolean
  wallets: readonly WalletOption[]
  evmNetwork?: NetworkLabel
  xrplNetwork?: NetworkLabel
  onSelect: (walletId: string) => void
  onClose: () => void
  theme?: 'light' | 'dark'
  className?: string
}

function WalletRow({
  wallet,
  onSelect,
}: {
  wallet: WalletOption
  onSelect: (id: string) => void
}) {
  const mark = bundledMark(wallet)
  return (
    <button
      type="button"
      className="fk-wallet"
      data-wallet={wallet.id}
      onClick={() => onSelect(wallet.id)}
    >
      <span className="fk-wallet-mark">
        {wallet.icon ? (
          // The wallet's own advertised icon (EIP-6963) — always preferred.
          <img className="fk-wallet-icon" src={wallet.icon} alt="" />
        ) : mark ? (
          // A recognised wallet with no advertised icon: its real brand mark.
          <span className={`fk-wallet-brand ${mark}`} aria-hidden="true" />
        ) : (
          // Unknown wallet, no icon: a neutral glyph, never a wrong brand.
          <span className="fk-i fk-i-wallet" aria-hidden="true" />
        )}
      </span>
      <span className="fk-wallet-name">{wallet.name}</span>
      <span className="fk-wallet-badges">
        {wallet.recent ? <span className="fk-wallet-badge fk-wallet-recent">Recent</span> : null}
        {wallet.detected ? (
          <span className="fk-wallet-badge fk-wallet-detected">Detected</span>
        ) : null}
      </span>
    </button>
  )
}

function WalletSection({
  family,
  network,
  wallets,
  onSelect,
}: {
  family: ChainFamily
  network: NetworkLabel | undefined
  wallets: readonly WalletOption[]
  onSelect: (id: string) => void
}) {
  const rows = wallets.filter((wallet) => wallet.family === family)
  return (
    <section className="fk-connect-section" data-family={family}>
      <div className="fk-connect-net">
        <NetworkLogo family={family} testnet={network?.testnet ?? false} />
        <span className="fk-connect-net-text">
          <span className="fk-connect-net-name">{network?.name ?? FAMILY_LABEL[family]}</span>
          <span className="fk-connect-net-fam">{FAMILY_LABEL[family]}</span>
        </span>
      </div>
      {rows.length > 0 ? (
        <div className="fk-wallet-list">
          {rows.map((wallet) => (
            <WalletRow key={wallet.id} wallet={wallet} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <p className="fk-connect-empty">
          No wallet detected for {FAMILY_LABEL[family]}. Install one, or continue and watch an
          address instead.
        </p>
      )}
    </section>
  )
}

export function ConnectModal({
  open,
  wallets,
  evmNetwork,
  xrplNetwork,
  onSelect,
  onClose,
  theme,
  className,
}: ConnectModalProps) {
  const network: Record<ChainFamily, NetworkLabel | undefined> = {
    evm: evmNetwork,
    xrpl: xrplNetwork,
  }

  return (
    <Modal
      open={open}
      title="Connect a wallet"
      ariaLabel="Connect a wallet"
      onClose={onClose}
      {...(theme ? { theme } : {})}
      {...(className ? { className } : {})}
      footer="Your wallet approves every connection — the kit never holds your keys."
    >
      <div className="fk-connect-body">
        {FAMILIES.map((family) => (
          <WalletSection
            key={family}
            family={family}
            network={network[family]}
            wallets={wallets}
            onSelect={onSelect}
          />
        ))}
      </div>
    </Modal>
  )
}
