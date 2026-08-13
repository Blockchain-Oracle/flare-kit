# @flare-kit/react-ui

[![npm](https://img.shields.io/npm/v/@flare-kit/react-ui.svg)](https://www.npmjs.com/package/@flare-kit/react-ui)
[![license](https://img.shields.io/npm/l/@flare-kit/react-ui.svg)](https://github.com/Blockchain-Oracle/flare-kit/blob/main/LICENSE)

Styled, embeddable Flare widgets — mint, redeem, swap, bridge, delegate, claim
— each carrying its own loading, empty, degraded, error and recovery states.

> Community-built. Not an official Flare Networks product.

## Install

```bash
npm i @flare-kit/react-ui @flare-kit/react viem
```

Requires React 18.3 or 19.

## Usage

```tsx
import { createMockKit } from '@flare-kit/core'
import { FlareProvider } from '@flare-kit/react'
import { MintFXRP } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'

const kit = createMockKit()

export function App() {
  return (
    <FlareProvider kit={kit}>
      <MintFXRP
        recipient="0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9"
        xrplAccount="rDYeq..."
        defaultAmountXrp="25"
      />
    </FlareProvider>
  )
}
```

The stylesheet is required — the components ship no inline styles and no
CSS-in-JS.

## Theming

Every custom property is prefixed `--fk-` and scoped to `.fk`, the root class
the components put on their own outermost element. **Nothing is declared on
`html`, `body` or `*`** — a widget that resets its host's page is a bug.

Dark is a peer theme, not an inversion, and is runtime rather than a build
variant. Set `data-theme` on the widget root, or on any ancestor to drive a
whole page:

```html
<div data-theme="dark">…</div>
```

Override any token to rebrand without forking a component:

```css
.fk {
  --fk-primary: #2f6bff; /* interaction: buttons, links, focus */
  --fk-brand: #e62058; /* identity only — never on text, never a status */
  --fk-bg: #fdfcf9;
  --fk-card: #ffffff;
}
```

The full token set covers surfaces (`--fk-bg`, `--fk-surface`, `--fk-card`),
text tiers (`--fk-text`, `--fk-text-muted`, `--fk-text-faint`), borders, and a
soft/line pair per state (`--fk-success-soft`, `--fk-danger-line`, and so on).
Contrast is verified against the background each token is actually painted on,
to WCAG 2.2 AA.

## Components

Operations — `MintFXRP`, `RedeemFXRP`, `SwapCard`, `AddLiquidityCard`,
`PositionCard`, `BridgeCard`, `GaslessCard`, `X402Card`, `DelegationCard`,
`ClaimCard`, `StakeCard`, `DepositCard`.

Account and state — `ConnectModal`, `AccountSheet`, `PortfolioTable`,
`ActivityTable`, `PendingTray`, `OperationTimeline`, `RecoveryPanel`.

Data — `FeedCatalogue`, `FeedDetail`, `FeedHistoryTable`,
`AttestationCatalogue`, `AttestationTimeline`, `ProofDetail`,
`RouteCatalogue`, `PoolCatalogue`, `VaultCatalogue`.

Exact values render in a mono face with tabular numerals, always carrying their
asset and full precision.

## Documentation

Full documentation at [flare-kit.xyz](https://flare-kit.xyz).

## License

MIT
