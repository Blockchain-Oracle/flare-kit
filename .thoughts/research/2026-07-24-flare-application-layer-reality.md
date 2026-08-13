# Reality Research: Flare application layer

Date: 2026-07-24

## Scope

Establish whether the proposed “Flare App Kit” solves a real, currently unfilled developer problem; distinguish it from existing Flare SDKs, examples and AI tooling; identify what the Circle inspiration actually consists of; and assess its fit with Flare Summer Signal. This is research for product definition. It intentionally stops before package architecture, component specification, implementation planning or code generation.

## Sources Checked

- The participant's hackathon brief and product direction: [A01](../raw/2026-07-24-flare-application-layer-sources.md).
- Current Flare documentation and the Context7 `/flare-foundation/developer-hub` snapshot: [A02](../raw/2026-07-24-flare-application-layer-sources.md).
- Current npm package metadata and source for Flare's reusable packages: [A03](../raw/2026-07-24-flare-application-layer-sources.md).
- Official Flare demos, starters, indexer, AI kit and AI skills: [A04](../raw/2026-07-24-flare-application-layer-sources.md).
- Circle App Kit, Circle Wallets and Circle Agent Stack: [A05](../raw/2026-07-24-flare-application-layer-sources.md).
- Reown, LI.FI, thirdweb, RainbowKit/Wagmi/Viem and Socket/Bungee as adjacent product-system references: [A06](../raw/2026-07-24-flare-application-layer-sources.md).
- The existing pinned Flare protocol corpus and wiki: [2026-07-22 manifest](../raw/2026-07-22-flare-source-manifest.md).

## Verified Facts

### Hackathon fit

- Bounty 1 explicitly accepts applications, integrations and user experiences that make assets easier to move, access, manage or use through Flare.
- Named directions include FXRP onboarding, crosschain dashboards, wallet experiences, payments, DeFi integrations, asset-movement UX, portfolio tools and liquidity interfaces.
- Product usefulness, meaningful Flare integration, working execution, evidence of new work, clarity and future potential are judging criteria.
- The hackathon does not have a separate AI-agent bounty. An agent surface contributes only when it materially operates or improves a product in one of the two bounties.
- Bounty 2 requires sensitive logic to run inside a TEE and the result to connect back to an onchain workflow. A normal SDK, widget or transaction agent does not qualify by itself.

### What the Circle inspiration actually is

- Circle App Kit is a headless TypeScript orchestration SDK, not a React component or authentication library.
- Its current package family separates an umbrella package, capability kits, adapters and providers.
- Current operations include Send, Bridge, Swap, Unified Balance and, in `1.10.0`, Earn.
- It models estimates, typed steps, partial execution, progress events/status, retries and persistable results rather than returning only a transaction hash.
- Circle Bridge uses CCTP and Circle Unified Balance uses Gateway; neither is a general bridge aggregator.
- Passkeys and gas sponsorship belong to Circle Modular Wallets.
- Email OTP, social login and user custody belong to Circle User-Controlled Wallets.
- Wallet modal, React buttons, embedded-wallet onboarding and packaged send/swap/onramp views closely match Reown AppKit, a separate product.
- Circle Agent Stack is another separate layer: CLI, Agent Wallets, Nanopayments, Marketplace and Skills. Circle App Kit itself does not export AI tools.

### Existing Flare reusable layers

| Existing surface | What it already provides | Boundary |
| --- | --- | --- |
| Flare Transaction SDK `1.5.2` | Wallet abstraction; EIP-1193, Ledger and Trezor support; balances; native/wrapped transfers; reward claims; FTSO delegation; staking; governance; selected FDC requests; arbitrary C-chain reads/writes; Safe multisig; transaction callbacks | Broad Node-oriented action SDK; no styled React widgets and no complete FXRP/Smart Account/crosschain journey abstraction |
| Flare Wagmi Periphery `3.6.0` | Typed chain definitions, ABIs and generated React hooks | Contract-level primitives, not composed product workflows |
| Periphery artifacts `0.1.52` | ABI and deployment/address material | Foundation data; dynamic resolution still matters |
| Smart Accounts encoder `0.1.2` | Typed encoding/decoding of XRPL memo instructions | Encoding only; no executor, XRPL submission, monitoring or recovery service |
| FTSO adapters `0.0.1-rc.1` | Familiar oracle-interface adapters | Release candidate; requires deployment and an offchain refresh operator |
| Flare AI Skills | Structured development guidance for general Flare, FTSO, FAssets, FDC, Smart Accounts and FCC | Documentation/reference only; explicitly does not sign or transact |
| Developer Hub MCP | `docs_search` and `docs_fetch` over Flare documentation | Documentation retrieval only |

- The Transaction SDK's “smart account” support means Safe multisig, not the XRPL-controlled Flare Smart Accounts protocol.
- The Transaction SDK exposes convenience FDC requests for EVM transactions, payments, address validity and Web2 JSON, plus finalization/proof retrieval/verification. Equivalent convenience methods do not cover every documented FDC attestation family.
- No first-party styled Flare React component/widget package was found in the current docs, npm inventory or 26-repository official corpus.
- No first-party unified bridge/DEX/liquidity route aggregator was found in that corpus.

### Existing apps and scripts are useful but not the missing layer

- `fassets-demo-dapp` implements settings, direct minting, minting tags, transfers and redemption as a Next.js application.
- `flare-viem-starter` contains TypeScript examples for direct minting, redemption, Smart Account instructions and recovery, FXRP OFT flows, Firelight and Upshift.
- The official developer tools catalogue delegates wallet UX, routing, indexing and analytics to external products including RainbowKit, MetaMask Embedded Wallets, Etherspot, Turnkey, Dfns, LayerZero, Stargate, zkBridge, Envio, Goldsky, SubQuery, Subsquid, thirdweb and Tenderly.
- Official swap examples integrate individual venues such as SparkDEX or BlazeSwap rather than exposing a universal quote/router contract.
- The FAssets indexer is self-hostable software, not a documented managed public production API.
- Public FDC verifier and data-availability endpoints are development services with operational/rate-limit considerations.

### The main Flare workflows are multi-system state machines

1. **FDC:** prepare a request, calculate/pay a fee, submit, identify a round, wait for Relay finalization, fetch a DA proof and verify/consume it.
2. **FXRP mint:** resolve current parameters, encode recipient/executor, submit an XRPL payment, await external-chain finality/FDC proof, execute minting, handle delayed execution and preserve the same payment/proof through recovery.
3. **Smart Account:** derive/deploy an account, read nonce, construct calls, encode an XRPL memo, submit XRP payment, wait for an executor and correlate the Flare result.
4. **FXRP redemption:** preflight amount/queue, create one or more agent obligations, wait for XRP payments, confirm each or cross both time and block-height default thresholds, obtain a nonexistence proof when needed and execute the correct state-changing default path.
5. **Gasless transfer:** check balance/allowance/nonce/deadline, obtain one-time approval where required, sign EIP-712 data, have a relayer validate and simulate, submit, then track the receipt.
6. **Swap:** discover venue/pool, quote, check liquidity and price impact, approve, enforce slippage/deadline, submit and reconcile output.
7. **FXRP OFT:** discover peers/EIDs, quote the LayerZero native fee, approve, fund source/destination/executor gas, send, track delivery/compose and correlate the destination event.

- These lifecycles recur across official scripts and applications, but they are not currently exposed as one reusable, persistable operation model.
- Direct mint limits can produce `DirectMintingDelayed`; that state is retryable and must not be treated as a new payment request.
- Smart Account recovery opcodes and redemption default paths are product-facing states, not merely low-level edge cases.

### Gasless and agent boundaries

- Gasless FXRP currently uses a custom EIP-712 forwarder plus an operated relayer and requires a one-time FXRP approval.
- It is a reference deployment pattern, not a managed Flare-wide gasless service.
- FXRP does not currently expose EIP-3009. The official x402 guide therefore uses `MockUSDT0` and says FXRP support depends on future EIP-3009 support.
- USDT0 has a separate EIP-3009 gasless-transfer pattern.
- The official Flare AI Skills require explicit per-action user confirmation for value-changing calls and treat proofs, verifier responses and external payment references as untrusted typed data.
- `flare-ai-kit` is version `0.1.0` and marked alpha. Its current FAssets connector includes mock addresses, empty ABIs and transaction methods that explicitly raise “not implemented” for swaps.
- Its current Turnkey wallet path logs `REQUIRE_APPROVAL` but proceeds, with a comment saying a real implementation would trigger an approval workflow.

### Competitive application-layer expectations

- Reown provides the polished wallet/onboarding component layer the participant recalled.
- LI.FI separates headless route execution from its widget and persists detailed per-step crosschain execution state.
- LI.FI's hosted MCP is deliberately read-only: it supplies routes and unsigned transaction requests but does not sign or broadcast.
- thirdweb exposes both headless actions and reusable transaction/bridge/swap UI; its mutable MCP documents tool filtering, secret handling and scoped session policies.
- Mature products expose more than a single integration depth: ready-made UI, hooks, headless APIs and machine-readable tooling.
- Route policy, simulation, renewed consent after quote changes, progress persistence, retries, transaction history and audit receipts are established patterns in the reviewed products.

## Inferences

### The opportunity is real, but “Viem for Flare” is the wrong boundary

Viem, Wagmi, generated Flare hooks, ABI packages and a broad Transaction SDK already exist. Rebuilding those primitives would duplicate first-party work and could look superficial.

The unfilled layer is better described as a **Flare application/integration layer**:

> turn Flare's protocol primitives and external routes into consistent, recoverable user journeys that can be consumed headlessly, through React integrations and widgets, or by a policy-constrained agent.

Its defensible value would come from cross-system orchestration, lifecycle state, recovery and Flare-specific semantics—not from renaming contract calls.

### The participant's blended inspiration is directionally stronger than any one reference

The intended product combines:

- Circle App Kit's typed operation and recovery model;
- Reown's polished embedded component/onboarding model;
- LI.FI's routing transparency and persistent crosschain execution;
- thirdweb's multiple integration depths; and
- Circle/Flare agent skills plus a real transaction-authority boundary.

That combined product category is coherent. It should be described honestly as a system of related surfaces rather than claiming one package owns wallets, routing, UI and autonomous execution.

### The north star can be broad; the hackathon proof cannot

FTSO, FDC, FAssets, Smart Accounts, swaps, bridges, gasless transfers, governance, staking, indexers and FCC are too many operational domains to make production-grade in the remaining hackathon window.

A credible entry can present the broad application layer as the roadmap while proving one end-to-end interoperable-asset journey with:

- real Flare-specific execution;
- explicit asynchronous states;
- failure/recovery behavior;
- at least two useful integration depths; and
- a clearly bounded agent interaction using the same underlying operation model.

The strongest proof domain is FXRP/FAssets plus asset movement because that makes the integration impossible to mistake for a generic EVM wrapper. This is a product-scope inference, not a selected feature specification.

### AI should be another client of the action core

An agent should not have a second, looser implementation of bridge/swap/mint/governance logic. The safer product boundary is:

`discover/read → quote/plan → simulate → policy/approval → wallet execution → track/recover → auditable receipt`

Read-only discovery and unsigned preparation can be broadly available. Signing and broadcasting require explicit wallet authority or narrowly scoped delegated authority. Proofs, external API responses and XRPL fields should remain typed and validated rather than being injected into an LLM prompt.

### Aggregation must be transparent

Flare's documented bridges, OFTs, DEXes and wallets have different trust models, asset coverage, fee currencies, availability and failure semantics. “Aggregator” should mean provider adapters, route discovery, policy controls and comparable quotes—not an unsupported promise that every route can be treated identically.

### Hackathon positioning

- The concept has strong Bounty 1 alignment when the working demonstration makes FXRP/FAssets or another connected asset materially easier to onboard, route, use and recover.
- A generic component library with mocked transactions would score poorly on meaningful Flare integration and technical execution.
- FCC should remain outside the core claim unless an actual private computation is required. Adding a TEE merely to enter Bounty 2 would weaken clarity.
- Governance and staking are plausible later capability kits, but they are not necessary to prove the interoperable-asset thesis.

## Unknowns And Questions

- Final project name and whether “App Kit” is legally/product-wise desirable given established Circle and Reown names.
- Primary launch user: dApp developer, wallet developer, protocol team, merchant integrator or agent builder.
- Which exact asset journey will be the hackathon proof.
- Whether the product operates a relayer, indexer, route API or executor, or remains self-hosted/headless.
- Which external bridge/DEX providers permit programmatic quoting and execution on the required testnets.
- How provider allowlists, fees, monetization and route liability should work.
- Which wallet adapters and custody/delegation models are in the first supported set.
- Whether organizer infrastructure or a public test environment exists for every desired FXRP/OFT route.
- Whether the organizers will explicitly categorize a developer-infrastructure product under Bounty 1; the published language strongly supports it but does not name “SDK” as an example.
- Package names, public API, component catalogue, accessibility target, design system and compatibility matrix.
- Production policy storage, approval delivery, revocation and audit-log model for delegated agent execution.

## Not Included

- A product name, accepted specification or user-story set.
- Package/repository architecture.
- Public API names, React component props or screen designs.
- A committed MVP scope or delivery schedule.
- Smart-contract, relayer, indexer or agent implementation.
- Any wallet creation, signature, transaction, deployment or handling of credentials.
- A claim that FCC is part of the project.
