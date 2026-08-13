# Asset attribution

Real, verified logo files vendored for the FTSO feed catalogue (Set A) and the
connect modal (Set B). Every file below was fetched with `curl`, checked for
HTTP 200 + non-empty body, and confirmed to be a valid image (`file`) at the
recorded dimensions. Crypto marks were additionally spot-checked visually.

Fetched 2026-08-09.

## Set A — FTSO crypto marks (Trust Wallet Assets, MIT)

Source repo: https://github.com/trustwallet/assets — License: **MIT**.
Base URL: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/`

| Symbol | File | Source path (under base URL) | Dimensions |
| --- | --- | --- | --- |
| BTC | `btc.png` | `bitcoin/info/logo.png` | 128×128 |
| ETH | `eth.png` | `ethereum/info/logo.png` | 192×192 |
| LTC | `ltc.png` | `litecoin/info/logo.png` | 256×256 |
| DOGE | `doge.png` | `doge/info/logo.png` | 256×256 |
| ADA | `ada.png` | `cardano/info/logo.png` | 256×256 |
| XLM | `xlm.png` | `stellar/info/logo.png` | 256×256 |
| BCH | `bch.png` | `bitcoincash/info/logo.png` | 256×256 |
| ALGO | `algo.png` | `algorand/info/logo.png` | 256×256 |
| AVAX | `avax.png` | `avalanchec/info/logo.png` | 256×256 |
| BNB | `bnb.png` | `binance/info/logo.png` | 256×256 |
| SOL | `sol.png` | `solana/info/logo.png` | 512×512 |
| POL/MATIC | `pol.png` | `polygon/info/logo.png` | 406×406 |
| DOT | `dot.png` | `polkadot/info/logo.png` | 256×256 |
| TRX | `trx.png` | `tron/info/logo.png` | 256×256 |
| XRP | `xrp.png` | `ripple/info/logo.png` | 256×256 |
| USDC | `usdc.png` | `ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png` | 181×181 |
| USDT | `usdt.png` | `ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png` | 300×300 |
| DAI | `dai.png` | `ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png` | 512×512 |

Notes:
- Stablecoins use the ERC-20 asset path with the checksummed mainnet contract
  address (USDC = Circle, USDT = Tether, DAI = MakerDAO). Addresses verified.
- BNB uses the `binance` (BNB Beacon Chain) mark; the `smartchain` variant is
  the identical BNB diamond if preferred.
- `pol.png` is the current Polygon brand mark (covers both POL and legacy MATIC).

## Set B — Wallet brand marks

Each is the wallet's **official** mark taken from the vendor's own repository.
The image files themselves carry the code repo's license; the marks remain the
**trademarks** of their respective owners and are used here nominatively to
identify each wallet in the connect modal.

| Wallet | File | Source | Repo license | Dimensions |
| --- | --- | --- | --- | --- |
| MetaMask | `wallet-metamask.svg` | `MetaMask/metamask-extension` → `app/images/logo/metamask-fox.svg` (develop) | MetaMask license (© ConsenSys); fox is a ConsenSys/MetaMask trademark | viewBox 0 0 35 33 |
| Rabby | `wallet-rabby.svg` | `RabbyHub/Rabby` → `src/ui/assets/rabby-logo-circle.svg` (master) | MIT (repo); mark is a Rabby/DeBank trademark | viewBox 0 0 33 32 |
| Coinbase Wallet | `wallet-coinbase.svg` | `coinbase/coinbase-wallet-sdk` → `packages/wallet-sdk/src/assets/wallet-logo.ts` (`standard` variant, data-URI decoded) | Apache-2.0 (© Coinbase); mark is a Coinbase trademark | viewBox 0 0 1024 1024 |
| WalletConnect | `wallet-walletconnect.svg` | `WalletConnect/walletconnect-assets` → `Icon/Blue (Default)/Icon.svg` (master) | WalletConnect brand assets; mark is a WalletConnect/Reown trademark | viewBox 0 0 400 400 |
| Xaman (formerly Xumm) | `wallet-xaman.png` | `XRPL-Labs/Xaman-Branding` → `Xumm-Xaman-Icon.png` (main) | Official Xaman branding repo; mark is an XRPL Labs trademark | 512×512 |

Full source URLs:
- MetaMask: `https://raw.githubusercontent.com/MetaMask/metamask-extension/develop/app/images/logo/metamask-fox.svg`
- Rabby: `https://raw.githubusercontent.com/RabbyHub/Rabby/master/src/ui/assets/rabby-logo-circle.svg`
- Coinbase Wallet: `https://github.com/coinbase/coinbase-wallet-sdk/blob/master/packages/wallet-sdk/src/assets/wallet-logo.ts` (`standard` case)
- WalletConnect: `https://raw.githubusercontent.com/WalletConnect/walletconnect-assets/master/Icon/Blue%20(Default)/Icon.svg`
- Xaman: `https://raw.githubusercontent.com/XRPL-Labs/Xaman-Branding/main/Xumm-Xaman-Icon.png`

None skipped — all five wallet marks were verified from official sources.
