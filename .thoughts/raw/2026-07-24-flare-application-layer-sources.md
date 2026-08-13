# Flare application-layer source addendum — 2026-07-24

This is a dated provenance addendum for the research into a reusable Flare application layer: headless operations, lifecycle state, React integrations, embeddable widgets and agent-callable actions. It extends, but does not rewrite, the immutable [2026-07-22 source manifest](2026-07-22-flare-source-manifest.md).

## Corpus snapshot

- Local corpus: **26 official repositories / 6,917 tracked files**.
- Worktree state at capture: **all clean**.
- The original 24 repositories remain at the exact commits in the base manifest.
- Two repositories were added for this research:

| Repository | Commit | Commit date | Files | Why it was added |
| --- | --- | ---: | ---: | --- |
| [`flare-tx-sdk`](https://github.com/flare-foundation/flare-tx-sdk) | `cb676eb7df3af3148bc31b5394226458a13f5eec` (`v1.5.2`) | 2026-06-22 | 96 | Current first-party transaction/action abstraction and wallet callback model. |
| [`flare-ai-skills`](https://github.com/flare-foundation/flare-ai-skills) | `272b6be19b1e419c99cd1142a66b8dc296cf6aee` | 2026-07-20 | 56 | Current official AI guidance, safety boundaries and skill inventory. |

Local roots:

- Developer Hub: `../../developer-hub/`
- Companion repositories: `../../sources/flare-foundation/`

## A01 — Hackathon brief and participant product direction

- Source: the participant's Flare Summer Signal brief and application-kit direction in this task.
- Facts used: dates, bounty language, prize amounts, submission requirements, judging criteria, existing-project rules and the requested product inspiration.
- Status: authoritative for the requested scope; live organizer fields should still be checked before submission.

## A02 — Current Flare documentation

- [Flare Developer Hub](https://dev.flare.network/)
- [Developer tools catalogue](https://dev.flare.network/network/developer-tools)
- [Flare Transaction SDK](https://dev.flare.network/network/flare-tx-sdk)
- [Flare for React developers](https://dev.flare.network/network/guides/flare-for-react-developers)
- [Flare AI Skills](https://dev.flare.network/network/guides/flare-ai-skills)
- [Flare Developer Hub MCP server](https://dev.flare.network/network/guides/flare-developer-hub-mcp-server)
- [FXRP overview](https://dev.flare.network/fxrp/overview)
- [FXRP OFT](https://dev.flare.network/fxrp/oft)
- [Gasless FXRP payments](https://dev.flare.network/fxrp/token-interactions/gasless-fxrp-payments)
- [x402 payments](https://dev.flare.network/fxrp/token-interactions/x402-payments)
- [FAssets developer guides](https://dev.flare.network/fassets/developer-guides)
- [FDC overview](https://dev.flare.network/fdc/overview)
- [FTSO overview](https://dev.flare.network/ftso/overview)
- [Smart Accounts overview](https://dev.flare.network/smart-accounts/overview)

Local source paths include:

- `../../developer-hub/docs/network/8-flare-tx-sdk.mdx`
- `../../developer-hub/docs/network/guides/flare-for-react-developers.mdx`
- `../../developer-hub/docs/network/guides/flare-ai-skills.mdx`
- `../../developer-hub/docs/network/guides/flare-developer-hub-mcp-server.mdx`
- `../../developer-hub/docs/network/2-developer-tools.mdx`
- `../../developer-hub/src/features/DeveloperTools/developer-tools.json`
- `../../developer-hub/docs/fxrp/token-interactions/03-x402-payments.mdx`
- `../../developer-hub/docs/fxrp/token-interactions/04-gasless-fxrp-payments.mdx`

Context7 was required by the workspace instructions and resolved the documentation as `/flare-foundation/developer-hub`. Its output was used for discovery and then checked against the local official source at commit `b9562d89133de99bd07e5c1aa099efc724a5555c`.

## A03 — Current first-party packages

Versions were queried directly from the npm registry on 2026-07-24 and checked against official source or current official examples where available.

| Package | Version | Verified role |
| --- | ---: | --- |
| [`@flarenetwork/flare-tx-sdk`](https://www.npmjs.com/package/@flarenetwork/flare-tx-sdk) | `1.5.2` | Node-oriented wallet/action SDK, transaction callbacks, Safe support, FTSO/rewards/staking/governance/FDC/contract actions. |
| [`@flarenetwork/flare-wagmi-periphery-package`](https://www.npmjs.com/package/@flarenetwork/flare-wagmi-periphery-package) | `3.6.0` | Typed Flare chain data, ABIs and generated Wagmi hooks. |
| [`@flarenetwork/flare-periphery-contract-artifacts`](https://www.npmjs.com/package/@flarenetwork/flare-periphery-contract-artifacts) | `0.1.52` | Contract artifacts and deployment/address data. |
| [`@flarenetwork/smart-accounts-encoder`](https://www.npmjs.com/package/@flarenetwork/smart-accounts-encoder) | `0.1.2` | Typed encoding/decoding for XRPL memo instructions. |
| [`@flarenetwork/ftso-adapters`](https://www.npmjs.com/package/@flarenetwork/ftso-adapters) | `0.0.1-rc.1` | Release-candidate compatibility adapters for common oracle interfaces. |

The official Transaction SDK source was checked out at the exact `v1.5.2` tag rather than an arbitrary branch head.

## A04 — First-party implementations and integration examples

- [`fassets-demo-dapp`](https://github.com/flare-foundation/fassets-demo-dapp): Next.js FAssets application and existing UX baseline.
- [`flare-viem-starter`](https://github.com/flare-foundation/flare-viem-starter): TypeScript scripts for FAssets, Smart Accounts, FXRP OFT, Firelight and Upshift.
- [`fasset-indexer`](https://github.com/flare-foundation/fasset-indexer): self-hostable indexer and API implementation.
- [`fdc-client`](https://github.com/flare-foundation/fdc-client): FDC client implementation.
- [`flare-ai-kit`](https://github.com/flare-foundation/flare-ai-kit): `0.1.0` alpha Python kit for verifiable agents/FCC and selected Flare integrations.
- [`flare-ai-skills`](https://github.com/flare-foundation/flare-ai-skills): six current skills—general, FTSO, FAssets, FDC, Smart Accounts and FCC.

The examples were read as implementation evidence, not as production specifications. In particular, the current AI kit contains placeholder FAssets addresses/ABIs and unimplemented swap transaction methods.

## A05 — Circle reference system

- [Circle App Kit](https://docs.arc.io/app-kit)
- [Circle App Kit SDK reference](https://docs.arc.io/app-kit/references/sdk-reference)
- [Circle adapter setup](https://docs.arc.io/app-kit/tutorials/adapter-setups)
- [Circle supported blockchains](https://docs.arc.io/app-kit/references/supported-blockchains)
- [`@circle-fin/app-kit`](https://www.npmjs.com/package/@circle-fin/app-kit), current version `1.10.0` on 2026-07-24
- [Circle Wallets](https://developers.circle.com/wallets)
- [Circle user-controlled wallets](https://developers.circle.com/wallets/user-controlled)
- [Circle modular wallets](https://developers.circle.com/wallets/modular)
- [Circle Agent Stack](https://developers.circle.com/agent-stack)
- [Circle CLI](https://developers.circle.com/agent-stack/circle-cli)
- [Circle Skills](https://github.com/circlefin/skills)

The package distribution, public types and official samples were checked because the overview pages lag the current package: `1.10.0` includes Earn and newer swap/status surfaces not fully reflected in the overview.

## A06 — Adjacent kit and routing references

- [Reown AppKit](https://docs.reown.com/appkit/overview?platform=web): wallet/onboarding UI, components, hooks, embedded wallets and modal flows.
- [LI.FI SDK](https://docs.li.fi/sdk/overview): headless route discovery/execution.
- [LI.FI Widget](https://docs.li.fi/widget/overview): embeddable crosschain UI.
- [LI.FI MCP](https://docs.li.fi/mcp-server/overview): read-only agent quotes and unsigned transaction requests.
- [thirdweb TypeScript SDK](https://portal.thirdweb.com/typescript/v5): headless and UI application surface.
- [thirdweb BridgeWidget](https://portal.thirdweb.com/references/typescript/v5/BridgeWidget): packaged bridge/swap/buy experience.
- [thirdweb MCP](https://portal.thirdweb.com/ai/mcp): mutable agent tools and documented permission controls.
- [RainbowKit](https://rainbowkit.com/docs/introduction), [Wagmi](https://wagmi.sh/react), and [Viem](https://viem.sh/): layered connection, hooks and typed client primitives.
- [Socket](https://docs.socket.tech/) / [Bungee agent docs](https://docs.bungee.exchange/for-agents/intro): routing and agent-readable integration precedent.

## Source-handling notes

1. “No first-party widget library” and “no unified route aggregator” mean none was found in the current Developer Hub, package inventory or 26-repository official corpus. They are scoped absence claims, not proof that no community project exists.
2. Routes, protocol peers, fees, liquidity, FAssets parameters, contract addresses, package versions and public API limits are dynamic.
3. `Socket.dev`, the dependency-security scanner shown in the participant's package table, is unrelated to Socket/Bungee crosschain routing.
4. The live Developer Hub page lists five AI skills, while the current `flare-ai-skills` repository contains six, including FCC. The repository is newer and is the source for the current inventory.
5. The six Flare skills were not exposed as callable skills in this Codex task. Their official source was nevertheless cloned and inspected as research input; they were not represented as invoked runtime skills.
6. Context7 supplied some generic-looking integration snippets that were not independently traceable to the checked-out source. Those snippets were excluded; all conclusions below use the official source and live package metadata.
