# Flare ecosystem-completeness source addendum — 2026-07-24

This dated provenance record supports the completeness audit of Flare protocols, packages, applications, operator services and external ecosystem tools. It extends the immutable [2026-07-22 manifest](2026-07-22-flare-source-manifest.md) and the earlier [application-layer addendum](2026-07-24-flare-application-layer-sources.md). It does not replace either record.

## Corpus snapshot

- Local corpus: **53 official repositories / 12,684 tracked files**.
- Worktree state at capture: **all 53 clean**.
- Developer Hub commit: `b9562d89133de99bd07e5c1aa099efc724a5555c`.
- Developer Hub content: **249 Markdown/MDX documentation files** and **270 files under `examples/`**.
- Local roots:
  - Developer Hub: `../../developer-hub/`
  - Companion repositories: `../../sources/flare-foundation/`

The 26 repositories already recorded by the two earlier manifests were not repinned or rewritten. The following 27 repositories were added afterward:

| Repository | Commit | Files | Research role |
| --- | --- | ---: | --- |
| [`fasset-agent-ui`](https://github.com/flare-foundation/fasset-agent-ui) | `cb8207d1f7e6062dbf9ce82d75127d0b39ac7da3` | 138 | Existing private FAsset agent/operator dashboard and operational job inventory. |
| [`fce-weather-insurance-x402-agent`](https://github.com/flare-foundation/fce-weather-insurance-x402-agent) | `1ab5efc5b69889eea28bf16a7d4f042a27245f28` | 274 | Current FCC, x402, in-app agent and MCP execution reference. |
| [`flare-ai-defai`](https://github.com/flare-foundation/flare-ai-defai) | `6113890bbac106938ce6bd08df87fca0bf37bc75` | 60 | Earlier DeFAI template and maturity baseline. |
| [`flare-ai-rag`](https://github.com/flare-foundation/flare-ai-rag) | `77620d81f9bf9b708aeead232c2e775b8b6deb82` | 83 | Earlier verifiable-RAG template and maturity baseline. |
| [`flare-ai-social`](https://github.com/flare-foundation/flare-ai-social) | `6cc376dfc9492d7b08d08cfc76cfed0eaaadc5f3` | 57 | Earlier social-agent template and maturity baseline. |
| [`flare-stake-tool`](https://github.com/flare-foundation/flare-stake-tool) | `ddd29bb2d37b45b8e855569d01b9ef602644db08` | 87 | Current C/P-chain transfer, validator and delegation CLI. |
| [`flare-tx-verifier`](https://github.com/flare-foundation/flare-tx-verifier) | `295860deb0a6324aa1d354b476ee105afd2ff8a7` | 11 | CLI for explaining and verifying unsigned C/P-chain transactions. |
| [`flare-tx-verifier-lib`](https://github.com/flare-foundation/flare-tx-verifier-lib) | `54a926528c59101ce21ebe562a869efc627d0645` | 32 | Reusable transaction-decoding and pre-signing verification library. |
| [`smart-accounts-cli`](https://github.com/flare-foundation/smart-accounts-cli) | `a678da8e3844049be9950ac43d826ef5e9f99694` | 55 | Sandbox CLI for XRPL-controlled Smart Account instructions. |
| [`FTSO-price-provider`](https://github.com/flare-foundation/FTSO-price-provider) | `88a48475ee6b04952c1f59677f8329bf79098ef6` | 35 | Older provider implementation; used only as historical/operator context. |
| [`Governance-Backend`](https://github.com/flare-foundation/Governance-Backend) | `ab5f72a623433ad2b695e83e88bd750036ead3af` | 96 | Self-hosted governance event collector, API and proposal/voting backend. |
| [`attestation-client`](https://github.com/flare-foundation/attestation-client) | `af88df2adf6d2307bf52f05258ae8523c8d93878` | 611 | Attestation-client suite and older State Connector operator context. |
| [`data-availability`](https://github.com/flare-foundation/data-availability) | `24e2eb174da0deeb592686250974d7cd0c814ed8` | 109 | Current FTSO/FDC Merkle-data collection, persistence and API service. |
| [`fdc-suite-deployment`](https://github.com/flare-foundation/fdc-suite-deployment) | `c075b02ab74735a4a8f2a9a535edb214e35fbd19` | 49 | FDC provider-suite deployment and operational boundary. |
| [`flare-demo-examples`](https://github.com/flare-foundation/flare-demo-examples) | `37284477a539c66786729e69fb8d7bfeac7ede78` | 35 | Additional first-party example catalogue. |
| [`flare-foundry-periphery-package`](https://github.com/flare-foundation/flare-foundry-periphery-package) | `ca264d6a31ddfb53d1bef7cb7bd1942aa89d323a` | 747 | Foundry/Solidity counterpart to the periphery ABI/address packages. |
| [`flare-js`](https://github.com/flare-foundation/flare-js) | `82d17117d260330facc2d66acf9b11e3306af94a` | 391 | Low-level X/P/C-chain node API and transaction-building library. |
| [`flare-p-chain-indexer`](https://github.com/flare-foundation/flare-p-chain-indexer) | `69769a7490a812e5b3e0044c8c3141fd8449c7a2` | 172 | P-chain/staking indexer and provider infrastructure. |
| [`flare-system-c-chain-indexer`](https://github.com/flare-foundation/flare-system-c-chain-indexer) | `65a3b809eda8930e185d443c82dfcbc35cb14c99` | 80 | Generic/FSP C-chain indexing with Contract Registry resolution. |
| [`flare-vtpm-attestation`](https://github.com/flare-foundation/flare-vtpm-attestation) | `13d798541484720a4777c68eb0338255aa15989c` | 48 | Alpha Solidity vTPM verification work for FCC trust research. |
| [`fsp-observer`](https://github.com/flare-foundation/fsp-observer) | `78f9c711855946c51535891436ec8ff944f34fb1` | 59 | Stateless FSP provider monitoring and Prometheus alerts. |
| [`ftso-v2-example-value-provider`](https://github.com/flare-foundation/ftso-v2-example-value-provider) | `47de1d3b5f7f54739ff9410193be4adb1ecd6af3` | 32 | Example API for current FTSO scaling/fast-update value providers. |
| [`multi-chain-client`](https://github.com/flare-foundation/multi-chain-client) | `8c8b9585ef9feb91380682b535a8a4d8cd833030` | 156 | FDC/provider-oriented cross-chain node query and normalization library. |
| [`rebalancer`](https://github.com/flare-foundation/rebalancer) | `14f92b17c0df62726e65cc56079568d170417b9b` | 43 | Self-hosted native-balance top-up service with spending limits and metrics. |
| [`reward-scripts`](https://github.com/flare-foundation/reward-scripts) | `345b3d051ae3e3c9936a4a03c432e53f3860716b` | 2,057 | Validator reward calculation, verification and distribution data. |
| [`rnat-distribution-tool`](https://github.com/flare-foundation/rnat-distribution-tool) | `41fa016c9463a4251d556e56d330a473b8f2a9d6` | 14 | Project-side rNat reward distribution utility. |
| [`verifier-indexer-api`](https://github.com/flare-foundation/verifier-indexer-api) | `b4bc7af932ef2b9b39ef2a6e5146fbb580946d90` | 236 | Self-hosted FDC verifier/indexer API implementation. |

## B01 — Live Flare GitHub organization

- Organization: [flare-foundation](https://github.com/flare-foundation).
- Retrieval method: GitHub REST API, `orgs/flare-foundation/repos`, all public pages, on 2026-07-24.
- Snapshot returned: **92 public repositories**, of which **83 were not archived**, **9 were archived**, and **1 was a fork**.
- `fasset-bots` and `fasset-bots-deploy` were archived at retrieval time. Their source remains useful for protocol-actor and operational analysis, but they were not treated as current application SDKs.
- The organization count is dynamic. This snapshot supersedes earlier point-in-time counts only for this audit date.

## B02 — Current first-party npm packages

Package metadata was queried directly from npm on 2026-07-24. Source was checked locally where a public repository was available.

| Package | Current tag/version | Verified role and boundary |
| --- | --- | --- |
| [`@flarenetwork/flare-tx-sdk`](https://www.npmjs.com/package/@flarenetwork/flare-tx-sdk) | `latest` `1.5.2` | Broad transaction/action SDK for balances, transfers, rewards, staking, governance, selected FDC flows, contracts and Safe multisig. |
| [`@flarenetwork/flare-tx-verifier`](https://www.npmjs.com/package/@flarenetwork/flare-tx-verifier) | `1.4.0` | Human-facing CLI for pre-signing transaction inspection. |
| [`@flarenetwork/flare-tx-verifier-lib`](https://www.npmjs.com/package/@flarenetwork/flare-tx-verifier-lib) | `1.4.0` | Embeddable decoder/verifier for unsigned C/P-chain transactions. |
| [`@flarenetwork/flarejs`](https://www.npmjs.com/package/@flarenetwork/flarejs) | `4.1.1` | Lower-level X/P/C-chain API, UTXO, transaction build/sign/issue and cross-chain operations. |
| [`@flarenetwork/flare-stake-tool`](https://www.npmjs.com/package/@flarenetwork/flare-stake-tool) | `4.3.1` | Dedicated CLI for C↔P movement, staking and delegation. |
| [`@flarenetwork/flare-periphery-contract-artifacts`](https://www.npmjs.com/package/@flarenetwork/flare-periphery-contract-artifacts) | `0.1.52` | ABIs, artifacts and deployment/address material. |
| [`@flarenetwork/flare-periphery-contracts`](https://www.npmjs.com/package/@flarenetwork/flare-periphery-contracts) | `0.1.52` | Contract interfaces and TypeScript integration material. |
| [`@flarenetwork/flare-wagmi-periphery-package`](https://www.npmjs.com/package/@flarenetwork/flare-wagmi-periphery-package) | `3.6.0` | Generated Wagmi/React hooks and Flare chain definitions. |
| [`@flarenetwork/smart-accounts-encoder`](https://www.npmjs.com/package/@flarenetwork/smart-accounts-encoder) | `0.1.2` | Encodes/decodes XRPL-controlled Smart Account instructions; it does not execute them. |
| [`@flarenetwork/ftso-adapters`](https://www.npmjs.com/package/@flarenetwork/ftso-adapters) | `0.0.1-rc.1` | Release-candidate Solidity adapters for familiar oracle interfaces; applications still operate refresh keepers. |
| [`@flarenetwork/mcc`](https://www.npmjs.com/package/@flarenetwork/mcc) | `4.5.0` | Provider/FDC-oriented multichain node queries and normalized transaction/accounting data; not a wallet connector. |
| [`@flarenetwork/multichain-wallet-connector`](https://www.npmjs.com/package/@flarenetwork/multichain-wallet-connector) | `latest` `0.0.1`; `beta` `0.0.2-rc.27` | WIP headless core and React bindings for EVM/XRPL wallets. Stable README states APIs may change. |
| [`fasset-indexer-core`](https://www.npmjs.com/package/fasset-indexer-core) | `0.1.10` | Reusable backend indexing core from the FAsset Indexer monorepo; not a hosted frontend data service. |
| [`@flarenetwork/js-flare-common`](https://www.npmjs.com/package/@flarenetwork/js-flare-common) | `0.0.4` | Published shared JavaScript package whose higher-level application contract is not documented in the checked Developer Hub. |
| [`@flarenetwork/state-connector-protocol`](https://www.npmjs.com/package/@flarenetwork/state-connector-protocol) | `1.0.0-beta.4` | Legacy/beta State Connector surface; it was not treated as the current FDC application API. |

The multichain wallet connector's npm package was inspected from its published tarball. Its source URL points to a private GitLab repository, so no public source commit was available to pin. The stable package documents:

- MetaMask, WalletConnect, Ledger, Xaman and D'CENT;
- Ethereum, Flare, Songbird, Coston/Coston2 and XRPL main/test networks through CAIP-2 identifiers;
- `MultiChain`, a React `MultichainProvider`, wallet/chain hooks and typed event/error handling;
- Viem-backed EVM clients and an XRPL client that can submit payments;
- headless wallet/chain selection and Ledger-address selection helpers; and
- Node.js 24+ plus React 18/19 requirements.

It does **not** ship a styled widget library; applications own modal presentation and view routing.

## B03 — Current Developer Hub and first-party APIs

Primary documentation and source:

- [Developer Hub](https://dev.flare.network/) and local `../../developer-hub/`.
- [Developer tools catalogue](https://dev.flare.network/network/developer-tools) and local `../../developer-hub/src/features/DeveloperTools/developer-tools.json`.
- [Transaction SDK](https://dev.flare.network/network/flare-tx-sdk).
- [Contract Registry](https://dev.flare.network/network/guides/flare-contracts-registry).
- [FAssets and FXRP](https://dev.flare.network/fassets/overview).
- [FDC](https://dev.flare.network/fdc/overview).
- [FTSO](https://dev.flare.network/ftso/overview).
- [Secure random numbers](https://dev.flare.network/ftso/guides/secure-random-numbers).
- [Smart Accounts](https://dev.flare.network/smart-accounts/overview).
- [Flare Confidential Compute](https://dev.flare.network/fcc/overview).
- [Staking and rewards](https://dev.flare.network/network/staking).
- [Governance](https://dev.flare.network/network/governance).
- [Flare AI Skills](https://dev.flare.network/network/guides/flare-ai-skills).
- [Developer Hub MCP](https://dev.flare.network/network/guides/flare-developer-hub-mcp-server).
- Data Availability OpenAPI: local `../../developer-hub/static/openapi/data-availability-api.yaml`.

The Developer Hub MCP exposes documentation search/fetch. It was not treated as a wallet, execution, bridge or governance MCP.

## B04 — Official applications, agents and operator services

The following were used to distinguish reusable app surfaces from examples and self-hosted infrastructure:

- FAssets user app: `../../sources/flare-foundation/fassets-demo-dapp/`.
- FAssets private operator dashboard: `../../sources/flare-foundation/fasset-agent-ui/`.
- FAssets agent/challenger/liquidator/keeper stack: `../../sources/flare-foundation/fasset-bots/`.
- FAssets indexer/API: `../../sources/flare-foundation/fasset-indexer/`.
- Smart Account sandbox CLI: `../../sources/flare-foundation/smart-accounts-cli/`.
- FDC/FTSO DA and verifier stacks: `../../sources/flare-foundation/data-availability/`, `fdc-suite-deployment/`, `verifier-indexer-api/`, `flare-system-c-chain-indexer/`, `flare-p-chain-indexer/`, and `fsp-observer/`.
- Balance automation: `../../sources/flare-foundation/rebalancer/`.
- Governance and rewards: `../../sources/flare-foundation/Governance-Backend/`, `reward-scripts/`, and `rnat-distribution-tool/`.
- FCC+x402+agent example: `../../sources/flare-foundation/fce-weather-insurance-x402-agent/`.

The weather-insurance application supplies two different authority models:

- its in-app assistant executes reads on the server and wallet actions on the client; buy actions render an inline confirmation before signing;
- its MCP endpoint is explicitly documented as development-only and unauthenticated, derives a wallet from `DEPLOYMENT_PRIVATE_KEY`, and signs buy actions immediately without the in-app confirmation.

This repository is evidence that manual and agent clients can reuse shared action logic. It is also evidence that an example MCP must not be treated as a production authorization model.

## B05 — External ecosystem catalogue and primary vendor sources

The local Developer Hub catalogue was the inventory starting point. Vendor-primary pages were checked to clarify actual surfaces and network-specific boundaries:

- LayerZero V2 [Flare deployment](https://docs.layerzero.network/v2/deployments/chains/flare).
- Stargate V2 [developer documentation](https://stargateprotocol.gitbook.io/stargate/v2-developer-docs).
- zkBridge [LayerZero zkLightClient DVN configuration](https://docs.zkbridge.com/layerzero-zklightclient-configurations/layerzero-v2-zklightclient-dvn-addresses).
- USD₮0 [deployments](https://docs.usdt0.to/technical-documentation/deployments).
- Dinero [flrETH contracts](https://dinero.xyz/docs/deployed-contracts#flr-eth-contracts).
- thirdweb [Flare chain page](https://thirdweb.com/flare).
- QuickNode [Flare documentation](https://www.quicknode.com/docs/flare).
- Ankr [Flare RPC](https://www.ankr.com/rpc/flare/).
- Envio [Flare guide](https://docs.envio.dev/docs/HyperIndex/flare).
- Goldsky [Flare support](https://docs.goldsky.com/chains/flare).
- SQD [supported EVM networks](https://docs.sqd.dev/subsquid-network/reference/networks/).
- SubQuery [Flare quickstart](https://academy.subquery.network/indexer/quickstart/quickstart_chains/flare.html).
- MetaMask Embedded Wallets [Flare configuration](https://docs.metamask.io/embedded-wallets/connect-blockchain/evm/flare/).
- Etherspot Prime [Flare guide](https://etherspot.fyi/prime-sdk/other-chains/getting-started-on-flare).
- Turnkey [network support](https://docs.turnkey.com/networks/ethereum).
- Dfns [network support](https://docs.dfns.co/networks).
- Wagmi [chains](https://wagmi.sh/react/chains) and RainbowKit [documentation](https://www.rainbowkit.com/docs/introduction).
- Tenderly [supported networks](https://docs.tenderly.co/supported-networks).

## Source-handling notes

1. The Developer Hub tool registry is a curated static catalogue. A listing is not proof of uptime, SLA, API stability, route liquidity or equal feature support across every listed network.
2. The Coston2 registry has an empty generic `OFTs` list even though the separate FXRP documentation describes Coston2 OFT deployments. The registry is not a complete protocol inventory.
3. `zkBridge` is linked for a LayerZero zkLightClient DVN. That link does not establish a separate consumer asset-bridge route.
4. Analytics and explorers are mainly read/dashboard surfaces unless a documented API is separately verified.
5. No general hosted first-party Flare relayer SDK was found. Executors, gasless relayers, x402 facilitators, FTSO adapter keepers and FCC services in the checked source are examples or self-hosted responsibilities.
6. Public RPC, verifier, DA and explorer reachability is point-in-time evidence, not an availability guarantee.
7. Routes, tokens, liquidity, fees, addresses, package tags and provider support are dynamic and must be refreshed before implementation.
8. Context7 resolved the official corpus as `/flare-foundation/developer-hub`, but it also returned an `@flarenetwork/smart-accounts` TypeScript API snippet that could not be found in the pinned Developer Hub, official npm inventory or public source. That snippet was excluded. It must not be treated as a real package or API.
9. Shallow Git clones preserve exact current heads for research, not full repository history.
