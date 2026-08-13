# Flare source corpus — 2026-07-22

This is the immutable provenance record for the local Flare research corpus used by the wiki. Every repository is an official `flare-foundation` repository, shallow-cloned from GitHub unless noted otherwise. The exact commit pins the claims in the derived wiki; a future refresh should add a new manifest rather than rewriting this one.

Corpus root: `../../sources/flare-foundation/`  
Developer Hub root: `../../developer-hub/`  
Tracked files: **6,765** across **24 repositories**.  
Worktrees at capture: **all clean**.

| Repository | Commit | Commit date | Files | Why it is in the corpus |
|---|---|---:|---:|---|
| [`developer-hub`](https://github.com/flare-foundation/developer-hub) | `b9562d89133de99bd07e5c1aa099efc724a5555c` | 2026-07-22 | 893 | Public developer docs, examples, network and contract guidance. |
| [`fasset-bots`](https://github.com/flare-foundation/fasset-bots) | `6d0c7666990c130c1b50f6458f4928d2378e184e` | 2026-02-13 | 1,104 | Agent/keeper automation and FAssets operational model. |
| [`fasset-indexer`](https://github.com/flare-foundation/fasset-indexer) | `ff9370f02160a7df937115f193b402a663788ff1` | 2026-06-02 | 271 | Queryable FAssets state and integration surface. |
| [`fassets`](https://github.com/flare-foundation/fassets) | `cf139a644b8207bb74bc2cb1c07b373d429f2a0c` | 2026-07-08 | 672 | Canonical FAssets contracts, tests, deployment and asset-manager behavior. |
| [`fassets-demo-dapp`](https://github.com/flare-foundation/fassets-demo-dapp) | `16927d9594844350ae4e264464cc8662d48ffcaa` | 2026-05-18 | 91 | Existing user flow and frontend overlap baseline. |
| [`fce-direct-sign`](https://github.com/flare-foundation/fce-direct-sign) | `c3820e25f30f8007c73a9b106ca9498425ae2251` | 2026-04-15 | 119 | Direct-action signing example and bypass semantics. |
| [`fce-extension-scaffold`](https://github.com/flare-foundation/fce-extension-scaffold) | `3d0d8f2babde42298c934b15ebf4d4398eb52efe` | 2026-07-22 | 134 | Current custom-FCE starting point, deployment scripts and result lifecycle. |
| [`fce-orderbook`](https://github.com/flare-foundation/fce-orderbook) | `b7c0ba5ea9bd0d841fd3357c03743cc53a8d6d3a` | 2026-05-22 | 255 | Confidential orderbook reference and judging-overlap baseline. |
| [`fce-shielded-transfers`](https://github.com/flare-foundation/fce-shielded-transfers) | `211116c135ec2580b13dde620952fea27137dbe0` | 2026-04-29 | 198 | ECIES, private balances/withdrawals and confidential transfer reference. |
| [`fce-sign`](https://github.com/flare-foundation/fce-sign) | `c5bbf11fbcfb786a6b24e335f6e786b1c7f3d8bd` | 2026-07-20 | 135 | Most recent scaffold sync notes, testnet deployment history and signing flow. |
| [`fce-weather-api`](https://github.com/flare-foundation/fce-weather-api) | `d759e3de258913c51480c8dae485e510da6c5c64` | 2026-04-01 | 110 | Confidential external-API example. |
| [`fce-weather-insurance`](https://github.com/flare-foundation/fce-weather-insurance) | `8d569a75756bb411bc2b7c6456f6b173b11d1333` | 2026-07-20 | 169 | Stateful FCE, public app, deployment and async workflow reference. |
| [`fdc-client`](https://github.com/flare-foundation/fdc-client) | `63b57d87e992901aaa4e1fbf0c0c37dea8245328` | 2026-07-14 | 103 | FDC request/proof client implementation. |
| [`flare-ai-kit`](https://github.com/flare-foundation/flare-ai-kit) | `f29d0a7dc8ae2066c414df040d92f61fc8dd521f` | 2026-01-13 | 177 | Existing AI/agent integration surface and novelty baseline. |
| [`flare-hardhat-starter`](https://github.com/flare-foundation/flare-hardhat-starter) | `1ce4e8cafb9159a8944a2c85dc2bd3614e4ab7bb` | 2026-05-11 | 227 | Contract-project bootstrap and test conventions. |
| [`flare-npm-periphery-package`](https://github.com/flare-foundation/flare-npm-periphery-package) | `5eb805d2e92c6a56be07a09377c1278d7e937b6e` | 2026-06-30 | 753 | Published ABIs, address lookup and JavaScript/TypeScript integration package. |
| [`flare-smart-accounts`](https://github.com/flare-foundation/flare-smart-accounts) | `5d22810dfb11687771c82659317799de7f853b8a` | 2026-07-15 | 192 | XRPL-to-Flare programmable account architecture and memo instruction modes. |
| [`flare-smart-contracts-v2`](https://github.com/flare-foundation/flare-smart-contracts-v2) | `b69873e1e1a0785e2450d811f35c7927a625716b` | 2026-07-14 | 340 | Current public system contracts for FTSO/FDC/protocol integration. |
| [`flare-specs`](https://github.com/flare-foundation/flare-specs) | `fe3deefab490a9b6a85d3723234dc470a0d32d01` | 2026-07-06 | 124 | Current FCC, FCE, FDC2 and PMW protocol specification. |
| [`flare-viem-starter`](https://github.com/flare-foundation/flare-viem-starter) | `4c6e171c5799f8ae7c516ec40b2511e8b78213a3` | 2026-07-17 | 92 | Current TypeScript integration examples, especially Smart Accounts. |
| [`go-flare-common`](https://github.com/flare-foundation/go-flare-common) | `c573c79c0924d9a2f71b9ae9368db20d624967b0` | 2026-06-23 | 324 | FCC wire types, signing, attestation and generated TEE contract ABIs. |
| [`tee-node`](https://github.com/flare-foundation/tee-node) | `4ba385122662d2eef1c6014907f6dbc49166f893` | 2026-05-14 | 127 | Enclave runtime, action dispatch and system operation implementation. |
| [`tee-proxy`](https://github.com/flare-foundation/tee-proxy) | `3938b5d6665a79aa4c360a327915747bcbab1ea6` | 2026-05-27 | 95 | Public/internal APIs, voting, queues, persistence and direct endpoint. |
| [`tee-relay-client`](https://github.com/flare-foundation/tee-relay-client) | `d5692ee75737d4ce63937513a4beaaef105940d8` | 2026-06-29 | 60 | On-chain event-to-proxy delivery and data-provider/cosigner behavior. |

## Authoritative non-repository inputs

- Hackathon brief supplied by the participant in this task: timeline, bounty language, submission requirements and judging criteria.
- [STP.13](https://proposals.flare.network/STP/STP_13.html), accepted 2026-07-12: Songbird FCC/FDC2/PMW rollout and initial operating assumptions.
- [Flare developer documentation](https://dev.flare.network/), cross-checked against the local `developer-hub` commit above.
- FCC whitepaper PDF published by Flare and read during the initial reality-research pass; derived notes are in `../research/2026-07-22-flare-summer-signal-reality.md`.
- Context7 snapshot resolved as `/flare-foundation/developer-hub` during the initial documentation pass.

## Provenance caveats

1. The current `flare-smart-contracts-v2` `main` tree contains FTSO/FDC/protocol contracts but no FCC/TEE Solidity source. The remote did not expose a `tee-diamond-cut` head on 2026-07-22, and fetching the short hash `bdb7c80` mentioned by `fce-sign` did not resolve in that repository. FCC contract behavior in the wiki therefore comes from the current `flare-specs` contract reference plus the generated ABIs in `go-flare-common`, not from an invented mapping to `main`.
2. Several FCE repositories preserve deployment addresses. They are evidence of past deployments, not a promise that an address is current. Live deployment must resolve addresses from current official deployment material and verify bytecode/network before use.
3. `tee-proxy/README.md` documents obsolete flat configuration names for the direct endpoint. `config.example.toml` and `pkg/config/config.go` agree on the current `[direct]` table (`enable`, `api_key`, `api_key_variable`, `api_key_optional`, `max_body_size`) and take precedence for implementation work.
4. Shallow clones capture current heads, not full history. Historical assertions are used only where a checked-in document explicitly records them.
5. The checked-out repository heads are not a compatible FCC release train. The current relay/scaffold-pinned common library use newer chain-ID-domain-separated signatures than the checked-out node/proxy heads. Implementation should use the scaffold's self-contained pinned dependency graph; the corpus heads are for source comparison, not a request to combine them with `USE_LOCAL_SIBLINGS=1`.
