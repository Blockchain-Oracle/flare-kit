# Flare ecosystem tools

Status: network/provider inventory, not a product-selection matrix.  
Research date: 2026-07-24.  
Provenance: [ecosystem-completeness sources](../raw/2026-07-24-flare-ecosystem-completeness-sources.md).

This page records the external and hosted tools around Flare that may affect later product research. Inclusion here does not mean the future product should integrate the tool, that every vendor feature works on every Flare network, or that Flare guarantees the service.

## What the official registry is

The Developer Hub renders its tool directory from the static file [`developer-tools.json`](../../developer-hub/src/features/DeveloperTools/developer-tools.json).

It is useful for:

- network-specific discovery;
- the provider name and official link Flare chose to list; and
- broad categories such as bridges, RPCs, OFTs, indexers, wallets and analytics.

It does **not** provide:

- service health or uptime;
- an SLA;
- live bridge routes, quotes or liquidity;
- exact feature parity across networks;
- version compatibility;
- API schemas, quotas or commercial terms; or
- a complete inventory of every Flare protocol deployment.

## Registry snapshot by network

| Category | Flare mainnet | Coston2 | Songbird | Coston |
| --- | --- | --- | --- | --- |
| Bridges | LayerZero V2, Stargate V2, zkBridge | LayerZero V2 | None listed | None listed |
| RPC discovery/providers | QuickNode, NOWNodes, Ankr, ChainList | QuickNode, NOWNodes, Ankr, ChainList | NOWNodes, Ankr, ChainList | NOWNodes, Ankr, ChainList |
| OFTs/assets | USD₮0, flrETH, USDC.e/WETH/USDT | Empty list | Empty list | Empty list |
| Indexers | Envio, Goldsky, SQD, SubQuery | Goldsky | SubQuery | None listed |
| Wallet SDKs | Turnkey, Wagmi, MetaMask Embedded, Etherspot Prime/Modular, Dfns, RainbowKit | Turnkey, Wagmi, MetaMask Embedded, Etherspot Prime/Modular, RainbowKit | Wagmi, RainbowKit, MetaMask Embedded | Wagmi, RainbowKit, MetaMask Embedded |
| Full-stack infrastructure | Tenderly, thirdweb | Tenderly, thirdweb | Tenderly, thirdweb | Tenderly, thirdweb |
| Analytics | Dune, Sentora, Arkham, Flare Metrics, Catenalytica, FlareBase | None listed | FlareBase | None listed |
| Explorers | Flare Blockscout, Systems Explorer, Flare Space | Coston2 Blockscout, Systems Explorer | Songbird Blockscout, Systems Explorer | Coston Blockscout, Systems Explorer |

The Coston2 OFT cell is a known catalogue gap: [separate FXRP OFT documentation](../../developer-hub/docs/fxrp/oft) contains Coston2 test deployments. The static registry cannot be used as the only protocol-availability source.

## Bridges, messaging and interoperable assets

| Surface | What it actually provides | Application-visible state | Boundary to preserve |
| --- | --- | --- | --- |
| LayerZero V2 | Crosschain messaging, endpoint IDs, DVNs, executors and OApp/OFT tooling | source send, message GUID, executor/DVN state, destination delivery/compose | Messaging infrastructure, not a universal quote/liquidity aggregator. Security configuration and addresses are dynamic. |
| Stargate V2 | Mainnet Hydra asset routes and bridge modes | route/quote, Taxi or Bus execution, liquidity and delivery | Availability, fees and liquidity are route-specific. |
| zkBridge listing | LayerZero zkLightClient DVN configuration | verifier selection for a LayerZero route | The listed link does not establish an independent end-user asset bridge. |
| FXRP OFT | Locks FXRP on Flare and mints/burns an OFT representation elsewhere | approval, native LayerZero fee, send, delivery, compose | Flare contracts use external LayerZero infrastructure; peers, DVNs and destinations must be refreshed. |
| thirdweb Bridge | SDK/API/React bridge and transaction surfaces exposed for Flare | quote/route/transaction status according to thirdweb | Supported assets, routes and network features are thirdweb-controlled and dynamic. |

### Listed or documented assets

| Asset | Role on Flare | Integration surface | Boundary |
| --- | --- | --- | --- |
| FXRP | FAsset representation of XRP | Asset Manager, Core Vault, ERC-20, Smart Accounts and OFT adapter | Mint/redeem is an asynchronous XRP/FDC lifecycle, not a normal EVM bridge. |
| USD₮0 | Omnichain USDT representation | OFT contracts and external bridge interfaces | Deployment and route list are controlled by USD₮0/LayerZero ecosystem. |
| USDC.e, WETH, USDT | Stargate Hydra assets listed on mainnet | Stargate UI/contracts/SDK | Route liquidity and availability can change. |
| flrETH | Liquid-staked ETH representation | Dinero contracts/OFT routes | External protocol and deployment boundary. |

FAssets documentation may discuss BTC, DOGE or LTC conceptually. The current public end-user product documentation is FXRP-focused; this page does not infer current FBTC/FDOGE/FLTC availability from names alone.

## Swaps, liquidity and vaults

| Surface | Documented Flare use | Integration form | Boundary |
| --- | --- | --- | --- |
| SparkDEX/Uniswap V3-compatible router | Specific USDT0→FXRP sample path | Router contract and scripts | Fixed venue/pool example, not a first-party route aggregator. |
| BlazeSwap | WCFLR→FXRP swap and redemption examples | Direct contract integration | Venue-specific liquidity and quote handling. |
| Firelight | FXRP vault | ERC-4626-style calls/scripts | Withdrawal is period/request/claim based. |
| Upshift | FXRP strategies/vault | Deposit, instant redemption or delayed request/claim | Fee/liquidity determine the exit path. |
| Hyperliquid destination paths | FXRP OFT delivery and optional composer/spot actions | LayerZero plus destination contracts | Destination setup, fees and execution timing differ from a Flare-local swap. |

No current first-party universal DEX/bridge/liquidity quote service was found in the audited public corpus.

## Wallet, custody and account surfaces

| Tool | Flare-relevant surface | Network evidence | Boundary |
| --- | --- | --- | --- |
| First-party Multichain Wallet Connector | Headless EVM/XRPL clients, React hooks, CAIP-2, wallet-selection state | Flare family, Ethereum/Sepolia, XRPL main/test | WIP `0.0.1`; source URL is private; host builds the UI. |
| MetaMask Embedded Wallets | Embedded/web/mobile wallet onboarding and Flare EVM configuration | Explicit Flare/Coston2 documentation; registry also lists Songbird/Coston | Feature support follows MetaMask's current SDK matrix. |
| Etherspot Prime | Smart-account/bundler/batching/sponsorship modules | Flare-specific guide emphasizes Coston2; registry lists mainnet too | Mainnet and sponsored-transaction support require live confirmation. |
| Etherspot Modular | ERC-7579 modular-account SDK | Registry lists Flare/Coston2 | Linked documentation is generic rather than a complete Flare feature matrix. |
| Turnkey | MPC custody, policies and Viem/Ethers signing adapters | Flare works as an EVM signing network | Checked gas-sponsorship matrices did not establish Flare sponsorship. |
| Dfns | Wallet-as-a-service and MPC policies | Coston2 Tier 1; Flare C-chain support described as on request | Enablement differs by network/account. |
| Wagmi | Generic React hooks and custom chains | Registry lists all four networks | Does not encode Flare protocol workflows. |
| RainbowKit | Styled wallet-connect UI over Wagmi | Registry lists all four networks | Generic EVM wallet UI; WalletConnect/project configuration still applies. |
| XRPL Smart Accounts | XRP payment memo/tag authorizes Flare execution | First-party FAssets/XRPL protocol | Not an ERC-4337 wallet product and still needs FDC proof/executor flow. |
| Protocol Managed Wallets | Future protocol concept in specifications | Not generally available | Roadmap/in-development surface, not current application infrastructure. |

## RPC and full-stack infrastructure

| Provider/surface | Actual role | Networks in the registry | Boundary |
| --- | --- | --- | --- |
| Flare public RPC | First-party JSON-RPC entry point | Flare/Coston2 prominently documented | Public developer infrastructure; no production SLA is implied. |
| QuickNode | Managed HTTP/WSS/archive and Flare C/X/P/debug APIs; Streams/Webhooks | Flare, Coston2 | Authentication, archive access, rate limits and credits depend on plan. |
| Ankr | Managed EVM and Flare C/X/P JSON-RPC | All four | Plan/API-key limits apply. |
| NOWNodes | Managed RPC provider | All four | Registry points to a generic page; exact endpoint/features need separate verification. |
| ChainList | Community chain/RPC metadata directory | All four | Discovery directory, not an RPC operator or SLA. |
| thirdweb | RPC, SDKs, wallets, contracts, tokens, transactions, bridge and UI | All four in registry | Each capability must be checked per network; a chain page is not universal feature proof. |
| Tenderly | Simulation/debugging/monitoring/virtual networks | All four in registry | Per-feature Flare support must be checked in current vendor documentation. |

Network IDs used by current docs and package metadata:

- Flare mainnet: EVM chain `14`
- Coston2: EVM chain `114`
- Songbird: EVM chain `19`
- Coston: EVM chain `16`

## Indexers and data APIs

| Surface | Data/API form | Network scope | Operational boundary |
| --- | --- | --- | --- |
| Flare Data Availability | REST/OpenAPI for FTSO anchors/proofs, FDC proofs and FSP status | Four Flare-family networks through current endpoints/config | Public service is rate-limited; production operators can self-host. |
| FAsset Indexer | NestJS REST/Swagger, database, watchdog and lifecycle state | Flare/Coston2/Songbird/Coston configs | Self-hosted; replay/backfill and database operation remain with adopter. |
| C-chain/P-chain indexers | MySQL-backed protocol/provider data | Operator-configured Flare networks | Provider/system infrastructure, not a public consumer API promise. |
| Envio | HyperIndex/HyperSync/HyperRPC and hosted/self-hosted GraphQL | Flare mainnet in registry | Coston2 is not listed in the official registry snapshot. |
| Goldsky | Subgraphs/GraphQL, pipelines and Edge RPC | Flare and Coston2 | Current support material did not list Flare gas sponsorship for Compose. |
| SQD | Portal API/SDK | Flare mainnet | API key/current interface migration requirements apply. |
| SubQuery | Hosted/self-hosted indexer and GraphQL | Flare and Songbird in registry | Its current “Flare” quickstart example uses Songbird events; configuration must be changed for mainnet. |

FTSO block-latency feeds can be read directly from contracts/RPC; a hosted REST indexer is not required for the current value. Scaling/history/proof workflows use DA services.

## Analytics and explorers

| Surface | Primary role | Boundary |
| --- | --- | --- |
| Dune | SQL analytics and dashboards | Analytics surface; the registry entry does not establish an application runtime API. |
| Sentora | Flare DeFi/ecosystem intelligence dashboard | API/access terms need separate verification. |
| Arkham | Address/entity intelligence | External analytics and access controls. |
| Flare Metrics | FTSO/validator/FAssets/reward/network monitoring | Some broader DeFi language/pages remain incomplete; not a protocol API. |
| Catenalytica | FTSO performance, vote power and rewards monitoring | No stable application API was established by the registry entry. |
| FlareBase | Flare/Songbird network insights | Advertised APIs still require schema/quota/stability verification. |
| Flare Blockscout | Transactions, contracts, verification and explorer APIs | Separate instances per network; explorer API limits apply. |
| Systems Explorer | FTSO/FDC/provider/epoch/system inspection | First-party read/diagnostic surface, not a write API. |
| Flare Space | C/P-chain, crosschain and FAssets exploration | Some advertised features remain roadmap/coming soon. |

Most analytics entries are dashboards. They should not be silently modeled as stable application data providers.

## Automation, relayers and operators

| Facility | What it automates | Availability model |
| --- | --- | --- |
| FAsset executor | Converts external-chain proofs into mint execution | Protocol role run by an operator; paid/open/restricted executor semantics. |
| FAsset Bots | Agent, challenger, liquidator and keeper jobs | First-party source, self-hosted and operationally heavy; bots repo now archived. |
| Gasless USD₮0 relayer | Submits EIP-3009 authorizations | Application-run sample backend. |
| Gasless FXRP relayer | Submits custom-forwarder requests | Application-run sample with one-time allowance and allowlisted relayer. |
| x402 facilitator | Settles payment authorizations for an HTTP resource | Current Coston2 example is self-hosted and uses a mock token. |
| LayerZero executor | Delivers OApp/OFT messages | External protocol infrastructure and fee model. |
| QuickNode Streams/Webhooks | Delivers observed chain activity | Data/event delivery; does not execute value-changing transactions. |
| Goldsky Compose | Data-triggered workflow automation | Current support table did not establish sponsored gas for Flare. |
| Rebalancer | Tops up low-balance operational accounts | First-party self-hosted service with a funded key and spend limits. |
| FDC/FSP operator stack | Indexing, attestation, proof availability and monitoring | First-party source intended for self-hosted provider operation. |

No general-purpose hosted first-party “Flare relayer SDK” was found in the checked catalogue and repositories.

## Agent-facing surfaces in the ecosystem

| Surface | Read/prepare authority | Write authority |
| --- | --- | --- |
| Flare AI Skills | Documentation and workflow guidance | None by itself. |
| Developer Hub MCP | Documentation search/fetch | None. |
| Alpha Flare AI Kit | Selected reads and experimental actions | Incomplete FAssets/swap implementation; in-memory policy/approval limitations. |
| x402 CLI example | Interactive payment preparation/execution | Demo wallet and facilitator. |
| FCC weather in-app assistant | Server reads; typed client tools | Connected wallet and inline confirmation for buys. |
| FCC weather MCP | Server tools and local wallet | Immediate signing from a development key; explicitly no auth and localhost-only. |
| External wallet/agent products | Vendor-specific | Must be evaluated through the vendor's current policy/session/secret model. |

This inventory establishes that “agent support” can mean documentation, unsigned preparation, client-wallet confirmation or server-held signing. Those authority models are not interchangeable.

## Facts to refresh before implementation

- Contract Registry names and resolved addresses.
- FAssets fees, limits, queues, collateral and executor availability.
- FTSO feed IDs, decimals, fee groups and history.
- FDC verifier/DA endpoints, quotas and supported sources.
- OFT peers, DVNs, destination EIDs, gas and compose support.
- Stargate/thirdweb routes, assets, liquidity, fees and quote expiry.
- Wallet SDK network enablement, account-abstraction and sponsorship support.
- RPC/indexer archive access, quotas, webhook guarantees and SLAs.
- Explorer/analytics API schemas and terms.
- Package versions and prerelease/stable status.

No provider or feature has been selected for the future product in this research pass.
