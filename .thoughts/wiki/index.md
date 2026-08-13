# Flare Summer Signal knowledge base

Last refreshed: 2026-08-03  
Local corpus: **53 official repositories / 12,684 tracked files / all pinned and clean**  
Live organization snapshot: **92 public repositories** on 2026-07-24  
Provenance: [base source manifest](../raw/2026-07-22-flare-source-manifest.md), [application-layer source addendum](../raw/2026-07-24-flare-application-layer-sources.md), and [ecosystem-completeness source addendum](../raw/2026-07-24-flare-ecosystem-completeness-sources.md)

## Start here

- [Canonical product-direction decision](../decisions/2026-08-03-full-flare-application-layer-scope.md) — the complete kit scope and current authority.
- [Comprehensive product specification](../specs/2026-08-03-flare-application-layer.md) — the accepted full product contract after exact Claude Opus 5 review and participant quality calibration.
- [Comprehensive user stories](../stories/2026-08-03-flare-application-layer.md) — 51 accepted traceable behavior stories covering all actors, families and shared product boundaries.
- [Story-gate verification audit](../verification/2026-08-03-flare-application-layer-story-audit.md) — passed after provider, widget, lifecycle, persistence, agent-signer, threat-model and routing corrections; the participant accepted the revised stories and waived further Opus review.
- [Product-surface map](../design/2026-08-03-product-surface-map.md) — accepted whole-application contract with 112 logical surfaces across Build/Use/Automate/Operate/Verify, universal and domain-specific states, realistic fixtures, 18 generated-artifact contracts, copy rules and story traceability.
- [Visual-design ownership decision](../decisions/2026-08-03-visual-design-ownership.md) — Claude Fable 5 owns visual and interaction design through the external-commission route; Abu retains taste authority.
- [Claude Fable 5 designer commission](../design/2026-08-03-designer-commission.md) — self-contained product, surface, fixture, law, delivery and return-audit packet.
- [Claude Fable 5 operating prompt](../design/2026-08-03-designer-agent-prompt.md) — paste-ready instructions, mandatory files, exact output directory and stop conditions.
- [Platform map](platform-map.md) — which primitive owns which job; complete XRP/FDC/FCC paths.
- [Interoperable assets](interoperable-assets.md) — contract-level FAssets, direct minting, Smart Accounts, FDC, executor and redemption gaps.
- [FCC](fcc.md) — architecture, instruction/direct paths, trust model, result semantics, persistence and deployment seams.
- [Official reference products](reference-products.md) — reusable patterns, demo-grade hazards and overlap map.
- [Flare application layer](application-layer.md) — the researched SDK/widget/agent product thesis, existing-stack boundaries and hackathon fit.
- [Capability inventory](capability-inventory.md) — broad source-backed first-party user/developer/operator/agent jobs, packages, lifecycles, maturity and contradictions.
- [Ecosystem tools](ecosystem-tools.md) — external bridge, wallet, RPC, indexer, analytics, explorer and automation coverage by network.
- [Historical hackathon strategy](hackathon-strategy.md) — superseded candidate ranking and go/no-go analysis retained as research history.
- [Research log](log.md) — what changed, contradictions found and refresh notes.

Supporting research:

- [Reality research](../research/2026-07-22-flare-summer-signal-reality.md)
- [Initial idea scout](../research/2026-07-22-flare-summer-signal-idea-scout.md)
- [Application-layer reality research](../research/2026-07-24-flare-application-layer-reality.md)
- [Ecosystem-completeness audit](../research/2026-07-24-flare-ecosystem-completeness-audit.md)
- [Optional Claude Code independent-audit handoff](../handoffs/2026-07-24-flare-independent-audit-handoff.md) — supplemental research, not the current specification gate.

## Executive context

The source is cloned locally—not merely browsed. The 53-repository corpus includes the Developer Hub, current FCC specification/runtime/proxy/relay/scaffold, FAssets contracts/demo/indexer/operator surfaces, Smart Accounts, periphery/starters, transaction SDK/verifier, FlareJS, Stake Tool, data/provider infrastructure and the major FCC reference products. Every repository-derived claim is tied to an exact commit in a dated manifest.

The highest-value findings are:

1. **Latest repository heads are not a compatible FCC release set.** The safe base is the extension scaffold's pinned self-contained dependency graph; local-sibling mode with the cloned node/proxy/relay heads would mix signing protocols.
2. **Bounty 1's real gap is operational, not protocol encoding.** Direct minting and both Smart Account memo modes already have near-complete starter code. A production executor, cross-chain receipt correlation, recovery and a vertical merchant/escrow/strategy product are still missing.
3. **FCC examples are intentionally not production systems.** Several lose private balances/rules/nonces on restart, randomly choose a machine for related stateful steps, or treat a shared API key/claimed address as user identity.
4. **Signed does not mean secret.** A TEE result published as transaction calldata is public. Confidential apps must return a minimal bounded decision, not decrypted evidence or policy fields.
5. **`0xFE` Smart Account payloads are not FCC-private.** The hash is public on XRPL and full bytes travel off-XRPL, but the executor later places those bytes in Flare calldata.
6. **Official demos leave real product seams.** The FAssets demo depends on an external executor and does not complete the state-changing redemption-default payout. The current indexer omits newer memo-protocol events.
7. **Address provenance matters.** Recent FCC diamond recuts invalidate the assumption that a copied deployment address/registration remains current. Resolve from the canonical deployment bundle/registry and record chain ID + bytecode.
8. **The complete Flare application layer, comprehensive specification, audited user stories and whole-application product-surface map are accepted.** Claude Fable 5 owns visual design through an external commission; no direction is accepted until its return passes contract audit and Abu's taste gate. Hackathon context governs sequence/evidence rather than quality, depth or scope. Older ZeroDay Escrow, XRP Checkout and other candidate rankings are historical comparison material rather than current product routing.
9. **The application layer begins above Viem/Wagmi and the Transaction SDK.** The product is reusable multi-system orchestration, durable progress/recovery, widgets, provider adapters and safe agent access—not another set of raw contract wrappers.
10. **A first-party headless EVM/XRPL wallet/React layer exists.** `@flarenetwork/multichain-wallet-connector` is WIP and bring-your-own-UI, so the accurate gap is no unified styled/composed lifecycle kit—not no wallet or React foundation.
11. **Transaction inspection is already a first-party capability.** The verifier CLI/library decodes unsigned C/P-chain actions, contract calls, Safe calls and staking details before signature.
12. **Operator source is not a hosted app API.** FAsset bots/UI/indexer, FDC/DA/indexers, observers, reward tooling and rebalancing carry databases, keys, RPC, monitoring and continuous-service responsibilities.

## Source precedence

When sources conflict, use this order and record the conflict:

1. current executable contract/runtime code, tests and example config at the pinned commit;
2. current `flare-specs` protocol state machines/types;
3. current Developer Hub guide/reference;
4. checked-in repository README/deployment notes;
5. governance/news for rollout status and historical context.

Known examples: `tee-proxy/README.md` uses obsolete direct-endpoint config keys while code/config agree on `[direct]`; the current public system-contract main tree has no FCC Solidity source; an orderbook README understates newly added optional balance-only persistence.

## Repository roots

- Developer Hub: `../../developer-hub/`
- All companion repos: `../../sources/flare-foundation/`
- Durable context: this `.thoughts/` tree

The source clones are research inputs. New hackathon product code should live in its own project directory/repository so “what existed” and “what we built” remain auditable.
