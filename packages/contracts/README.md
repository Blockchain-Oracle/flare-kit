# @flarekit-dev/contracts

[![npm](https://img.shields.io/npm/v/@flarekit-dev/contracts.svg)](https://www.npmjs.com/package/@flarekit-dev/contracts)
[![license](https://img.shields.io/npm/l/@flarekit-dev/contracts.svg)](https://github.com/Blockchain-Oracle/flare-kit/blob/main/LICENSE)

Typed ABIs and the single address registry for the Flare network. Every address
flare-kit uses is resolved from here, and from nowhere else.

> Community-built. Not an official Flare Networks product.

## Install

```bash
npm i @flarekit-dev/contracts
```

No required dependencies. `viem` is an **optional** peer — install it only if
you want the ABIs typed as viem `Abi` values.

## Usage

```ts
import { chainFor, registryFor, fassetFor, explorerTxUrl } from '@flarekit-dev/contracts'

const COSTON2 = 114

const chain = chainFor(COSTON2)
chain.name //         'Flare Testnet Coston2'
chain.rpcUrl //       'https://coston2-api.flare.network/ext/C/rpc'
chain.underlying //   the XRP Ledger this network settles against

const registry = registryFor(COSTON2)
registry.contractRegistry // Flare's own registry, from which the rest resolve
registry.fdcHub

// On Coston2 the deployed symbol is FTestXRP, not FXRP. The registry reports
// what the chain actually deploys; rendering it as FXRP would be a lie.
const asset = fassetFor(COSTON2, 'XRP')
asset.symbol //                'FTestXRP'
asset.supportsDirectMinting // true

explorerTxUrl(COSTON2, '0x68d6bb35…') // a real link, never a template in a component
```

## Networks

Network is configuration. Both entries are public constants — there is no
environment variable to set, and no source change to switch between them.

| Key | Chain ID | Native | Underlying | Explorer |
| --- | --- | --- | --- | --- |
| `coston2` | `114` | C2FLR | XRP Ledger Testnet | [coston2-explorer.flare.network](https://coston2-explorer.flare.network) |
| `flare` | `14` | FLR | XRP Ledger | [flare-explorer.flare.network](https://flare-explorer.flare.network) |

`chainFor(id)` throws `UnsupportedNetworkError` for anything else, naming the
ids it does support. It never guesses.

## What is exported

| | |
| --- | --- |
| `FLARE_NETWORKS`, `chainFor` | chain ids, RPC and explorer roots, the underlying XRPL chain |
| `registryFor` | per-network contract addresses — FDC hub, relay, asset manager controller, registry |
| `fassetFor` | the FAsset deployed for an underlying symbol, with its real on-chain symbol |
| `explorerTxUrl`, `explorerAddressUrl`, `explorerBlockUrl` | Flare-side links |
| `underlyingExplorerTxUrl`, `…AccountUrl`, `…LedgerUrl` | XRPL-side links |
| `BRIDGE_ROUTES`, `routesFor`, `routeByKey` | LayerZero OFT routes, per route |
| `vaultsFor`, `vaultByKey` | vault registry |
| `STAKING`, `stakingFor` | P-chain staking deployment and endpoint |
| `encodeFeedId`, `decodeFeedId`, `FEED_CATEGORY` | FTSO feed identifiers |
| `*Abis` | typed ABIs per protocol — FDC, FTSO, bridge, delegation, rewards, staking, gasless, x402 |

## Capability flags

Every registry entry that describes a **write** carries a `*Verified` boolean.
It is `true` only where a full round trip has been driven on chain and read
back — never because the code exists, and never because a simulation passed.

```ts
import { STAKING, stakingFor } from '@flarekit-dev/contracts'

stakingFor(114).stakeVerified // false
```

Today, on Coston2:

| Flag | Value | Meaning |
| --- | --- | --- |
| `bridgeVerified` | `true` | a bridge landed and was confirmed by reading the destination chain |
| `gaslessVerified` | `true` | a payment landed with the payer's gas balance unchanged |
| `delegationVerified` | `true` | delegate → `delegatesOf` read → undelegate, confirmed |
| `addLiquidityVerified` | `true` | a real add and remove against the live pool |
| `stakeVerified` | `false` | reads are live; the value-locking broadcast has not been made |
| `rewardsVerified` | `false` | the account has earned no reward yet, so no claim has settled |
| `withdrawVerified` | `false` | held false deliberately — a safe under-claim |

Consumers are expected to **gate on these**. `@flarekit-dev/core` refuses to build
a signable plan against an unverified capability, so a mainnet call cannot
silently sign approvals and then revert. A `false` here means "we have not
proven this," which is not the same as "this is broken."

## Documentation

Full documentation at [flare-kit.xyz](https://flare-kit.xyz).

## License

MIT
