# Flare capability inventory

Status: completeness research, not a product specification.  
Research date: 2026-07-24.  
Provenance: [ecosystem-completeness sources](../raw/2026-07-24-flare-ecosystem-completeness-sources.md).

This page records what users, developers, agents and operators can currently do across the public Flare stack. It deliberately does **not** decide which capabilities belong in a future kit, which should be in an MVP, or how packages/components should be designed.

## Evidence classes

“Exists” has several meanings in this ecosystem. The inventory keeps them separate:

| Class | Meaning |
| --- | --- |
| Protocol | Onchain/network capability with current contracts or specifications. |
| Published package | Installable npm/library surface with a current public version. |
| WIP/RC package | Installable, but its own release material says APIs may change or it is a release candidate. |
| Source application | Working or illustrative app whose code is not a reusable component package. |
| Example/script | Demonstrates an integration; production operation, recovery and hosting remain with the adopter. |
| Self-hosted service | Long-running infrastructure with databases, RPCs, secrets, monitoring or other operator responsibilities. |
| External integration | Third-party product or protocol listed for Flare; support, liquidity and terms are controlled externally. |
| Legacy/historical | Still visible in code/docs, but no longer a current user-accrual path or has been superseded. |

These are maturity and responsibility labels, not feature priorities.

## Stack by layer

| Layer | Current first-party surfaces | What the layer actually supplies |
| --- | --- | --- |
| Network | EVM C-chain, P-chain, X-chain, Contract Registry | Transactions, staking, cross-chain platform primitives and runtime address discovery. |
| Data protocols | FTSO, FDC, secure random, Data Availability | Price/data feeds, external-event attestations, proofs, randomness and protocol results. |
| Interoperable assets | FAssets/FXRP, Core Vault, Smart Accounts, FXRP OFT | XRP↔FXRP lifecycle, XRPL-authorized Flare actions and crosschain FXRP movement. |
| Network participation | WNat, rewards, governance, staking, rNat | Delegation, claims, voting, validation and incentive flows. |
| Confidential compute | FCC/FCE contracts, proxy, relay and TEE node | Private offchain computation whose signed result can be consumed onchain. |
| Contract foundations | Periphery artifacts/contracts, Wagmi hooks, Foundry package | ABIs, interfaces, chain configuration, generated hooks and address resolution. |
| Transaction foundations | Transaction SDK, FlareJS, transaction verifier | High-level actions, low-level X/P/C transaction construction and pre-signing inspection. |
| Wallet foundations | Multichain Wallet Connector, external wallet SDKs | EVM/XRPL connection and signing clients; no first-party styled modal/widget package. |
| Protocol encoders | Smart Accounts Encoder, Smart Accounts CLI | Instruction encoding and sandbox execution helpers, not a managed executor. |
| Application examples | FAssets demo, Viem/Hardhat starters, FCC apps, x402 agent | Working source patterns and UX baselines, not a unified reusable application kit. |
| Operator services | FAsset bots/UI/indexer, DA/verifier/indexers, observer, rebalancer | Self-hosted automation, data, monitoring and operational control planes. |
| AI surfaces | six AI Skills, docs MCP, alpha AI Kit, app-specific tool agents | Agent-readable guidance, documentation lookup and experimental/action examples. |

## Published and reusable first-party surfaces

| Surface | Integration depth | Networks/domain | Current boundary |
| --- | --- | --- | --- |
| `@flarenetwork/flare-periphery-contract-artifacts` `0.1.52` | ABI/artifact/address data | Flare-family contracts | Runtime registry resolution remains safer than copied addresses. |
| `@flarenetwork/flare-periphery-contracts` `0.1.52` | Solidity/TypeScript interfaces | Flare-family contracts | Interfaces are not workflow implementations. |
| `@flarenetwork/flare-wagmi-periphery-package` `3.6.0` | Generated Wagmi/React hooks | Flare, Coston2, Songbird, Coston | Contract hooks, not composed journeys or styled widgets. |
| Foundry periphery package | Solidity interfaces and deployment helpers | Foundry projects | Contract-development surface rather than end-user application UX. |
| `@flarenetwork/multichain-wallet-connector` `0.0.1` | Headless core, React provider/hooks and UI-selection state | EVM Flare family/Ethereum plus XRPL | Marked WIP; private GitLab source; Node 24+; host renders its own modal. |
| `@flarenetwork/flare-tx-sdk` `1.5.2` | Node/TypeScript actions and signer callbacks | C/P-chain, rewards, FDC, governance, Safe | No high-level FXRP direct-mint, Smart Account, OFT or general swap journey. |
| `@flarenetwork/flare-tx-verifier-lib` `1.4.0` | Embeddable unsigned-transaction inspection | C/P-chain across four Flare networks | Enrichment depends on live registries/RPCs/explorers. |
| `@flarenetwork/flare-tx-verifier` `1.4.0` | Human-facing verification CLI | Same as verifier library | Separate verification experience; it does not sign or broadcast. |
| `@flarenetwork/flarejs` `4.1.1` | Low-level node APIs, UTXOs, build/sign/issue | X/P/C chains | Lower-level platform library, not an application workflow layer. |
| `@flarenetwork/flare-stake-tool` `4.3.1` | Interactive/noninteractive CLI | C↔P, validators, delegators | Operator/advanced-user CLI rather than browser components. |
| `@flarenetwork/smart-accounts-encoder` `0.1.2` | Dependency-free instruction encoding/decoding | XRPL-controlled Flare Smart Accounts | Does not send XRPL payments, obtain proofs, relay or recover operations. |
| `@flarenetwork/ftso-adapters` `0.0.1-rc.1` | Solidity compatibility adapters | Familiar oracle interfaces | RC; adopter deploys adapter and operates public `refresh()` calls. |
| `@flarenetwork/mcc` `4.5.0` | Normalized cross-chain node queries | BTC/XRP/EVM and other FDC sources | Provider/FDC backend library, not the similarly named wallet connector. |
| `fasset-indexer-core` `0.1.10` | Backend event/indexing framework | FAssets state and lifecycle data | Reusable server core; no hosted frontend API/SLA follows from the package. |
| `@flarenetwork/js-flare-common` `0.0.4` | Shared JavaScript package | Internal/common Flare code | No higher-level application contract was documented in the checked Developer Hub; do not infer one from its name. |
| `@flarenetwork/state-connector-protocol` `1.0.0-beta.4` | Older State Connector surface | Legacy attestation stack | Beta/legacy context, not the current FDC consumer API. |
| Flare AI Skills | Six Markdown instruction packages | General, FTSO, FAssets, FDC, Smart Accounts, FCC | Knowledge and safety guidance; no transaction runtime or wallet. |
| Developer Hub MCP | `docs_search` and `docs_fetch` | Flare documentation | Documentation only; no mutable actions. |

Evidence: [npm/source inventory](../raw/2026-07-24-flare-ecosystem-completeness-sources.md), [Transaction SDK](../../sources/flare-foundation/flare-tx-sdk/README.md), [transaction verifier](../../sources/flare-foundation/flare-tx-verifier-lib/README.md), [FlareJS](../../sources/flare-foundation/flare-js/README.md), and [Stake Tool](../../sources/flare-foundation/flare-stake-tool/README.md).

## Connection, discovery and signing jobs

| Job | Current surface | Lifecycle and output | Maturity/operational boundary |
| --- | --- | --- | --- |
| Connect an EVM wallet | Multichain Wallet Connector; MetaMask/WalletConnect/Ledger; external SDKs | Connect, restore session, expose address/client, handle events/errors | First-party connector is WIP/headless; external wallets have their own support matrices. |
| Connect an XRPL wallet | Multichain Wallet Connector through WalletConnect/Ledger/Xaman/D'CENT | Connect XRPL main/test, expose typed client, submit payment | WIP; Xaman needs an API key; D'CENT is in-app-browser-specific. |
| Connect EVM and XRPL together | WalletConnect multi-chain mode or multiple connector instances | CAIP-2 chain selection and typed per-chain clients | Connection only; it does not orchestrate an FAssets journey. |
| Resolve current Flare contracts | Onchain Contract Registry and periphery helpers | Name→address/ABI resolution | Names/deployments can change; copied addresses become stale. |
| Read/write a C-chain contract | Viem/Wagmi, generated hooks, Transaction SDK | Simulate/read/write and return transaction state | Raw contract access; application owns protocol semantics and recovery. |
| Build and issue X/P/C transactions | FlareJS and Transaction SDK | Serialize, sign and submit imports/exports/staking/transfers | Advanced platform actions; signer and fee handling vary by chain. |
| Explain an unsigned transaction before signing | Transaction Verifier library/CLI | Network, type, recipients, values, fees, decoded call, provenance, warnings and signing message | Useful for human/agent review; online enrichment may be partial when services are unavailable. |
| Use Safe multisig | Transaction SDK | Create/read/submit Safe operations and inspect nested calls | Its “smart account” vocabulary means Safe, not XRPL-controlled Smart Accounts. |
| Keep operational accounts funded | `rebalancer` | Monitor thresholds, top up, enforce rolling daily/weekly limits, expose metrics | Self-hosted Go service holding a funded key; not a user gas-sponsorship API. |

## Interoperable-asset and DeFi jobs

### XRP, FXRP and FAssets

| Job | Current path | Important lifecycle states | Current boundary |
| --- | --- | --- | --- |
| Discover mint conditions | Asset Manager settings, agent state, mint limits, Core Vault and registry reads | Fee, minimum, recipient/executor, limits, current addresses | Values are dynamic and must be refreshed. |
| Direct-mint XRP into FXRP | Pay the Core Vault on XRPL with memo/tag; executor obtains FDC proof and executes | payment → proof → execute → success or delayed execution | Current standard public path is XRP/FXRP. A delayed mint reuses the same payment/proof; the user must not resend XRP. |
| Reserve collateral then mint | Legacy reserve/agent path | reserve → XRP payment → proof → execute or expiry/default | Still useful protocol context, but direct mint is the current documented XRP flow. |
| Reuse an XRPL destination tag | Minting Tag ERC-721 | reserve → bind recipient/executor → transfer/cooldown | Transfer changes recipient and clears executor. |
| Hold/approve/transfer FXRP | ERC-20 interface | balance, allowance, transfer receipt | Standard token action after minting. |
| Redeem FXRP to XRP | Asset Manager redemption | burn/request → one or more agent payments → success, incomplete or default proof/compensation | Redemption can fan out across agents; “submitted” is not final settlement. |
| Prove an agent did not pay | FDC `ReferencedPaymentNonexistence` plus Asset Manager default call | wait through time/block thresholds → proof → state-changing default | Verification alone does not execute compensation. |
| Operate an FAsset agent | FAsset Bots, Agent UI and contracts | vault creation/activation, collateral, self-mint/close, Core Vault, rewards, liquidation/challenge | Source/self-hosted operator stack; bots repository is archived; not a consumer SDK. |
| Query FAsset lifecycle state | FAsset Indexer | mint/redemption/Core Vault flows, state transitions, events, statistics | Self-hosted database/API; no documented hosted production SLA. |

Current public product focus is FXRP. BTC, DOGE and LTC FAsset names appear in conceptual, configuration or future-facing material; that is not evidence of equivalent current user-facing FBTC/FDOGE/FLTC availability.

Evidence: [FAssets documentation](../../developer-hub/docs/fassets), [FAssets contracts](../../sources/flare-foundation/fassets), [FAsset Indexer](../../sources/flare-foundation/fasset-indexer/README.md), and [operator UI](../../sources/flare-foundation/fasset-agent-ui).

### XRPL-controlled Smart Accounts

| Job | Current path | Important lifecycle/recovery | Current boundary |
| --- | --- | --- | --- |
| Derive/use a Personal Account | Deterministic mapping from XRPL account | derive → activate/deploy → read nonce/state | XRPL authorization still needs proof relay to Flare. |
| Execute a built-in FAsset action | XRPL payment memo/tag instruction | pay operator/Core Vault → FDC proof → controller → Personal Account | Built-ins cover FXRP, Firelight and Upshift operations. |
| Execute arbitrary Flare calls | `PackedUserOperation` in `0xFF` or hash-only `0xFE` mode | encode → deliver bytes where needed → executor → all-or-nothing batch | `0xFE` hides bytes from the XRPL memo, not from eventual public Flare calldata. |
| Recover a stuck operation | Ignore memo, raise nonce, replace executor fee, pin/unpin executor | recovery instruction changes controller state | Recovery itself is part of the user journey. |
| Mint and then bridge/redeem | Direct-mint callback plus batched calls or FAsset Redeem Composer | mint → approve → OFT send/compose or redemption | Requires multiple protocols, executor availability and destination configuration. |

The encoder and Python CLI help construct instructions. No public managed production executor was found.

### Swap, vault, bridge and payment integrations

| Job | Documented integration | Lifecycle | Boundary |
| --- | --- | --- | --- |
| Swap into/out of FXRP | SparkDEX/Uniswap V3 and BlazeSwap examples | pool/quote → approval → slippage/deadline → swap → reconcile output | Venue-specific examples; no first-party universal quote/router layer. |
| Deposit FXRP into Firelight | ERC-4626-style vault integration | approve → deposit; withdrawal request → period delay → claim | Exit is not always immediate. |
| Deposit FXRP into Upshift | Vault/strategy contracts | deposit; instant fee route or delayed request → epoch/date → claim | Liquidity and fee determine exit path. |
| Move FXRP crosschain | LayerZero OFT adapter | peer/route → quote native fee → approve → send → delivery/compose | Routes, DVNs, fees, destination gas and liquidity are external/dynamic. |
| Auto-redeem bridged FXRP | FAsset Redeem Composer | bridge back with compose data → composer fee → Asset Manager redemption | Normal XRP redemption lifecycle still follows. |
| Send gasless USD₮0 | EIP-3009 authorization and app-run relayer | typed signature → validate/simulate → relay → receipt | Application operates/authenticates the relayer. |
| Send gasless FXRP | Custom forwarder plus one-time allowance | approve → nonce/deadline signature → allowlisted relayer → receipt | FXRP does not expose EIP-3009. |
| Gate an HTTP resource with x402 | Coston2 MockUSDT0/facilitator example | HTTP 402 → EIP-712 authorization → settlement → resource | Current tutorial is a demo, not a general hosted facilitator or FXRP-native flow. |

## Data, oracle and proof jobs

### FTSO

| Job | Current surface | Timing/output | Boundary |
| --- | --- | --- | --- |
| Read a block-latency feed | FTSO contracts/RPC | Approximately block-latency (~1.8 seconds), feed value, decimals, timestamp | Feed IDs are not contract addresses; decimals and lists are dynamic. |
| Read a scaling feed | Data Availability proof plus onchain anchor | Approximately 90-second rounds with proof | Client must fetch/verify the correct round. |
| Read history | DA/API or retained protocol data | Current docs describe roughly two weeks for relevant historical data | Retention and provider availability constrain queries. |
| Use a familiar oracle interface | FTSO Adapters | Chainlink/Pyth/API3/Band/Chronicle-compatible reads | Adopter deploys adapter and operates `refresh()`; package is RC. |
| Publish a custom feed | Developer-owned updater/feed contract | Application-specific value and update policy | Trust/availability differ from standard FTSO feeds. |
| Incentivize volatility updates | Fast Update incentive contracts | Dynamic fee increases expected sampling for the next eight blocks | Fee and effect are runtime state. |
| Obtain secure randomness | Random provider contract | Value, timestamp and `isSecure` flag; roughly 90-second cadence | Consumers must reject or handle `isSecure == false`. |

### FDC

FDC is an asynchronous request/proof system:

`prepare request → query minimum fee → submit to FdcHub → wait for voting round/Relay → fetch DA proof → verify → consume`

Typical production finalization is documented around 90–180 seconds. A result requires more than 50% signing weight.

Current nondeprecated documentation exposes nine families:

1. Address Validity
2. EVM Transaction
3. Payment
4. Balance Decreasing Transaction
5. Confirmed Block Height Exists
6. Referenced Payment Nonexistence
7. Web2Json
8. XRPPayment
9. XRPPayment Nonexistence

The Transaction SDK supplies convenience request flows for only selected types: EVM Transaction, Payment, Address Validity and Web2Json. Public verifier/DA endpoints are rate-limited; production documentation points toward self-hosting. Nondeterministic Web2Json responses can fail consensus and produce no proof.

Evidence: [FDC docs](../../developer-hub/docs/fdc), [Data Availability](../../sources/flare-foundation/data-availability/README.md), and [provider client](../../sources/flare-foundation/fdc-client).

## Network participation jobs

| Job | Current surface | Lifecycle | Boundary |
| --- | --- | --- | --- |
| Wrap native token | WNat contracts/Transaction SDK | wrap/unwrap FLR or SGB | Common prerequisite for vote-power operations. |
| Delegate FTSO vote power | WNat/Transaction SDK | inspect delegates → delegate/undelegate → later claim | Vote power and reward epochs are dynamic. |
| Claim FSP rewards | Reward Manager plus published distribution data | tuple/Merkle proof → claim → receipt | Delegation rewards expire after 25 reward epochs; staking rewards do not. |
| Distribute/claim rNat | rNat contracts and distribution tool | project distribution → claim → locked/unlocked state → withdrawal/penalty | Project/operator distribution differs from user claim. |
| Stake or delegate on P-chain | Stake Tool, FlareJS, Transaction SDK | C→P export/import → stake/delegate lock → expiry → P→C → rewards | Time ranges, minimums, validator state and hardware/external signing matter. |
| Participate in governance | Governance contracts, backend and Transaction SDK | proposal discovery/state → vote-power block → vote/delegate → result | Historical reads can require archive data; proposal families differ. |
| Claim FlareDrops | Legacy contracts/SDK guides | historical claim interfaces remain callable where applicable | The FlareDrop distribution concluded on 2026-01-30; no new drops accrue. |

## Confidential-compute jobs

FCC is a separate application and infrastructure lifecycle rather than an ordinary synchronous contract helper:

`define Solidity + Go operation → deploy/register extension → run Redis/proxy/TEE/relay/indexer → register code/machine → submit instruction or direct request → execute privately → collect signed result → poll/consume onchain`

| Job | Current surface | Trust/operational boundary |
| --- | --- | --- |
| Build a confidential extension | Extension scaffold, specs and examples | Requires matching Solidity/Go types, deployment, registration and runtime operation. |
| Submit through the protocol path | `InstructionSender`, relay/providers, proxy and TEE | Weighted provider signatures and onchain result path; asynchronous. |
| Submit directly to a TEE | Proxy `/direct` | Can use an API key but bypasses the C-chain/provider relay; disabled by default. |
| Preserve private state | Extension-specific sealed/persisted state | Several examples keep state in memory or have partial persistence; restart/rotation behavior is app-specific. |
| Consume a private result onchain | Signed bounded result | Publishing result bytes in calldata makes those result bytes public. |
| Verify hardware identity | GCP Confidential Space/vTPM work | Real TEE deployment needs access, attestation and code/machine registration; Coston2 default examples can simulate. |

See [FCC](fcc.md) for the detailed trust and deployment model.

## AI and machine-facing jobs

| Surface | What it can currently do | Authority boundary |
| --- | --- | --- |
| Flare AI Skills | Teach an agent Flare, FTSO, FAssets, FDC, Smart Accounts and FCC concepts/workflows | Documentation only; guidance calls for explicit confirmation on value-changing actions. |
| Developer Hub MCP | Search and fetch official documentation | Read-only docs service. |
| `flare-ai-kit` `0.1.0` alpha | Selected connection/balance/FTSO/explorer/FLR operations and experimental scaffolding | FAssets addresses/ABIs/actions are partly mocked; swaps remain unimplemented; approval logging is not a hard gate. |
| Older DeFAI/social/RAG templates | Demonstrate 2025-era verifiable-AI patterns | Templates tied to earlier infrastructure, not a current general action SDK. |
| FCC weather-insurance in-app assistant | Reuses app actions; server reads and client wallet writes; buy actions show inline confirmation | Connected user wallet retains the signing interaction. |
| FCC weather-insurance MCP | Exposes read, x402, settlement and buy tools from a local server wallet | Explicitly dev-only/no-auth; uses `DEPLOYMENT_PRIVATE_KEY`; buy tools sign immediately. |

The two weather-insurance clients are useful evidence: shared manual/agent action logic exists in first-party source, but the example MCP's authority model is explicitly unsuitable for production.

## Self-hosted operator and infrastructure inventory

| Service | Primary operator | Dependencies/responsibility |
| --- | --- | --- |
| FAsset Bots | FAsset agent/challenger/liquidator/keeper | Databases, secrets, Flare/XRPL RPC, continuous processes, balances and monitoring. |
| FAsset Agent UI | FAsset operator | Authenticated bots API; vault/collateral/Core Vault/reward management. |
| FAsset Indexer | App/protocol operator | SQLite/Postgres, event ingestion, replay/backfill and watchdog. |
| C-chain/P-chain indexers | FSP/protocol operator | MySQL, RPC tuning, retention, registry resolution and catch-up. |
| FDC client/verifier/indexer/DA suite | FDC provider or production app | Connected-chain nodes, databases, proof generation, API operation and rate control. |
| FSP Observer | FSP provider | Stateless monitoring, alerts and Prometheus. |
| FTSO value-provider example | Feed provider | Exchange/API input, provider process and protocol participation. |
| Rebalancer | Infrastructure operator | Funded private key, RPC, thresholds, spend limits and monitoring. |
| Governance Backend | Governance UI/operator | Event collector, MySQL, web API and proposal/vote tooling. |
| Reward/rNat distribution tools | Foundation/project operator | Epoch data, calculations, distribution keys and onchain payout. |
| FCC proxy/relay/TEE/indexer | Confidential-app/provider operator | Cloud/TEE access, Redis, database, network isolation, keys, registration and observability. |

These services prove that the underlying tasks are implementable. They are not equivalent to public managed APIs.

## Known contradictions and staleness

- The FDC overview says seven attestation types; the current nondeprecated documentation tree exposes nine.
- The Developer Hub AI Skills page lists five; the current skills repository contains six, including FCC.
- Older FAssets overview/reservation material coexists with the current XRP direct-mint path.
- FlareDrop guides and SDK methods remain visible although the distribution ended on 2026-01-30.
- The Developer Hub catalogue's Coston2 `OFTs` array is empty while the separate FXRP OFT docs contain Coston2 deployments.
- The periphery README has an unresolved FIXME around `nameToAbi` and `interfaceToAbi`.
- The Transaction SDK's “smart account” means Safe multisig, not XRPL-controlled Flare Smart Accounts.
- OFT route scope, peers, fees and destination support are dynamic and some guide wording is internally uneven.
- The FAssets demo's redemption-default path verifies a proof but does not call the state-changing default function, and its direct-mint watcher does not represent every delayed state.
- Current skills describe confirmation as the safe default; the separate dev-only weather MCP signs immediately. These are different products and authority models.
- Context7 returned an untraceable `@flarenetwork/smart-accounts` snippet. No matching official package/source was found, so it is excluded.

## Still unknown

- Which source-only applications will become published packages.
- Stable API timing for the multichain wallet connector and FTSO adapters.
- Whether a hosted production FAsset Indexer, executor, general relayer or route API will be offered.
- Final FCC public availability, deployment discovery and production-access model.
- Exact provider SLAs, API quotas and feature matrices at implementation time.
- Live FAssets parameters, feed inventory, bridge routes, DVNs, DEX liquidity, fees and contract addresses.

For third-party network coverage and service-specific boundaries, see [Ecosystem tools](ecosystem-tools.md).
