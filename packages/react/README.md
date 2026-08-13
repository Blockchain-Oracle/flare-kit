# @flare-kit/react

[![npm](https://img.shields.io/npm/v/@flare-kit/react.svg)](https://www.npmjs.com/package/@flare-kit/react)
[![license](https://img.shields.io/npm/l/@flare-kit/react.svg)](https://github.com/Blockchain-Oracle/flare-kit/blob/main/LICENSE)

React provider and hooks over the Flare operation lifecycle. Works against a
live kit or the mock, unchanged.

> Community-built. Not an official Flare Networks product.

## Install

```bash
npm i @flare-kit/react @flare-kit/core viem
```

Requires React 18.3 or 19.

## Usage

```tsx
import { createMockKit } from '@flare-kit/core'
import { FlareProvider, useDirectMint } from '@flare-kit/react'

const kit = createMockKit() // swap for createFlareKit() to go live

function App() {
  return (
    <FlareProvider kit={kit}>
      <Mint />
    </FlareProvider>
  )
}

function Mint() {
  const { quote, start, operation, error } = useDirectMint()

  if (error) return <p>{error.message}</p>

  return (
    <button
      onClick={() =>
        start({
          amountXrp: '25',
          recipient: '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9',
          xrplAccount: 'rDYeq...',
        })
      }
    >
      {operation?.state ?? 'mint'}
    </button>
  )
}
```

The provider takes a kit and asks nothing else of it. Because the mock and the
live kit satisfy the same contract, no component can tell them apart — and so
none of them special-case the mock.

Pass a `store` to make operations survive a reload; they reconcile themselves
on mount, so there is no resume button to build.

```tsx
<FlareProvider kit={kit} store={myStore} pollMs={2_000}>
```

## Hooks

One hook per core capability, named for it: `useDirectMint`, `useRedeem`,
`useBridge`, `useGasless`, `useX402`, `useDelegation`, `useRewards`,
`useStaking`, `useAccounts`, `usePortfolio`, `useActivity`, `useFeeds`,
`useFeedHistory`, `useAnchorProof`, `useSecureRandom`, `useIncentiveOffer`,
`useCustomFeeds`, `useAttestation`, `useAttestationFamilies`.

Each returns the same shape of thing: the typed operation, a typed `error`
carrying its recovery class, and the actions for that capability.

## Documentation

Full documentation at [flare-kit.xyz](https://flare-kit.xyz).

## License

MIT
