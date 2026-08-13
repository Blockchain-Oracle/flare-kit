import { useState } from 'react'
import { AssetLogo, ConnectModal, NetworkLogo, type WalletOption } from '../src/index.js'

/**
 * Dev-only. The 2026-08-09 re-cut pieces, so Abu can review them directly:
 * the asset marks (bundled → monogram fallback), the network marks, and the
 * connect-wallet modal. Wallet icons are host-provided at runtime (EIP-6963);
 * with none supplied here they show the neutral fallback, which is the honest
 * default and worth seeing too.
 */

const EVM_WALLETS: WalletOption[] = [
  { id: 'io.metamask', name: 'MetaMask', family: 'evm', detected: true, recent: true },
  { id: 'app.rabby', name: 'Rabby', family: 'evm', detected: true },
  { id: 'com.coinbase', name: 'Coinbase Wallet', family: 'evm' },
  { id: 'walletconnect', name: 'WalletConnect', family: 'evm' },
]

const XRPL_WALLETS: WalletOption[] = [{ id: 'xaman', name: 'Xaman', family: 'xrpl', detected: true }]

const ASSETS = [
  'FXRP', 'XRP', 'FLR', 'BTC', 'ETH', 'XLM', 'SOL', 'ADA', 'DOGE', 'USDC',
  'C2FLR', 'FBTC', 'USD₮0', 'sFLR', 'SGB',
]

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {children}
    </span>
  )
}

function ConnectDemo({ wallets }: { wallets: WalletOption[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="fk">
      <button
        type="button"
        className="fk-btn fk-btn-primary fk-btn-sm"
        onClick={() => setOpen(true)}
      >
        Connect wallet
      </button>
      <ConnectModal
        open={open}
        wallets={wallets}
        evmNetwork={{ name: 'Coston2', testnet: true }}
        xrplNetwork={{ name: 'XRPL Testnet', testnet: true }}
        onSelect={() => setOpen(false)}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}

export const RECUT_SECTIONS = [
  {
    id: 'recut-marks',
    title: 'Re-cut · asset & network marks',
    cases: [
      {
        name: 'AssetLogo — real Flare marks, then the seeded-monogram fallback',
        node: (
          <div className="fk" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {ASSETS.map((symbol) => (
              <Chip key={symbol}>
                <AssetLogo symbol={symbol} size={28} />
                <span className="fk-mono" style={{ fontSize: 12 }}>
                  {symbol}
                </span>
              </Chip>
            ))}
          </div>
        ),
      },
      {
        name: 'NetworkLogo — mark plus name, testnet a secondary ring',
        node: (
          <div className="fk" style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            <Chip>
              <NetworkLogo family="evm" />
              <span className="fk-mono" style={{ fontSize: 12 }}>Flare</span>
            </Chip>
            <Chip>
              <NetworkLogo family="evm" testnet />
              <span className="fk-mono" style={{ fontSize: 12 }}>Coston2</span>
            </Chip>
            <Chip>
              <NetworkLogo family="xrpl" />
              <span className="fk-mono" style={{ fontSize: 12 }}>XRP Ledger</span>
            </Chip>
          </div>
        ),
      },
    ],
  },
  {
    id: 'recut-connect',
    title: 'Re-cut · connect wallet (click to open)',
    cases: [
      {
        name: 'Wallets detected — real network marks; wallet icons host-provided',
        node: <ConnectDemo wallets={[...EVM_WALLETS, ...XRPL_WALLETS]} />,
      },
      {
        name: 'No wallet found — each family stated, never hidden',
        node: <ConnectDemo wallets={[]} />,
      },
    ],
  },
]
