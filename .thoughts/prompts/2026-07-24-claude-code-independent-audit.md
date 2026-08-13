# Claude Code prompt: independent audit of the Flare research corpus

> **Status: optional supplemental audit, not the current project gate.** The full Flare Application Layer direction was accepted on 2026-08-03. If this prompt is executed, its research-only constraints apply only to the audit task and must not overwrite or narrow the [canonical product decision](../decisions/2026-08-03-full-flare-application-layer-scope.md).

You are an independent senior protocol, SDK and developer-ecosystem auditor. Work from:

`/Users/abu/dev/hackathon/flare`

Your job is to audit the existing Flare Summer Signal research as a second set of eyes. Do not merely summarize it or agree with it. Verify the important claims, find genuine omissions, contradictions, stale facts, mislabeled maturity, missing first-party surfaces and missing external integration boundaries. Add durable supplemental context only where evidence supports it.

Within this optional audit task, remain in the **research phase**. Do not choose what belongs in the kit, generate project ideas, rank capabilities, define an MVP, write a product specification, design packages/components/screens, or implement code. These restrictions end with the audit task; they are not global project routing.

## The objective

Answer these questions with evidence:

1. Does the current corpus accurately cover Flare's protocols, user jobs, developer packages, APIs, CLIs, applications, operator services, agent surfaces and external ecosystem tools?
2. Did the existing research overlook any current first-party or important third-party surface that could matter during later product specification?
3. Are any “missing,” “available,” “production-ready,” “managed,” “hosted,” “mainnet,” “testnet,” “safe,” “private,” or “agent-capable” claims too broad?
4. Are versions, network matrices, routes, product status, repository status or hackathon facts stale as of 2026-07-24?
5. Do source code, current documentation, package metadata and examples disagree anywhere?
6. Which conclusions are confirmed, corrected, newly discovered or still unresolved?

Do not add filler. If the existing research is correct for a domain, record that it was checked and confirmed. If no material addition is found, say so.

## Read and inspect in this order

Use this order to reduce confirmation bias:

1. Read only these navigation/state pages first:
   - `/Users/abu/dev/hackathon/flare/.thoughts/wiki/index.md`
   - `/Users/abu/dev/hackathon/flare/.thoughts/wiki/log.md`
2. Read the raw source records before reading the corpus's conclusions:
   - `/Users/abu/dev/hackathon/flare/.thoughts/raw/2026-07-22-flare-source-manifest.md`
   - `/Users/abu/dev/hackathon/flare/.thoughts/raw/2026-07-24-flare-application-layer-sources.md`
   - `/Users/abu/dev/hackathon/flare/.thoughts/raw/2026-07-24-flare-ecosystem-completeness-sources.md`
3. Independently inventory the local source roots and live public organization/package surfaces. Write down preliminary discrepancies before reading the derived conclusions.
4. Then read:
   - `/Users/abu/dev/hackathon/flare/.thoughts/research/2026-07-22-flare-summer-signal-reality.md`
   - `/Users/abu/dev/hackathon/flare/.thoughts/research/2026-07-24-flare-application-layer-reality.md`
   - `/Users/abu/dev/hackathon/flare/.thoughts/research/2026-07-24-flare-ecosystem-completeness-audit.md`
   - `/Users/abu/dev/hackathon/flare/.thoughts/wiki/capability-inventory.md`
   - `/Users/abu/dev/hackathon/flare/.thoughts/wiki/ecosystem-tools.md`
   - `/Users/abu/dev/hackathon/flare/.thoughts/wiki/application-layer.md`
   - `/Users/abu/dev/hackathon/flare/.thoughts/wiki/platform-map.md`
   - `/Users/abu/dev/hackathon/flare/.thoughts/wiki/interoperable-assets.md`
   - `/Users/abu/dev/hackathon/flare/.thoughts/wiki/fcc.md`
   - `/Users/abu/dev/hackathon/flare/.thoughts/wiki/reference-products.md`

Read the earlier idea scout and hackathon strategy only **after** the factual audit:

- `/Users/abu/dev/hackathon/flare/.thoughts/research/2026-07-22-flare-summer-signal-idea-scout.md`
- `/Users/abu/dev/hackathon/flare/.thoughts/wiki/hackathon-strategy.md`

Those two artifacts are prior ideation/strategy context, not facts to inherit. Do not let their rankings shape the audit.

The earlier Arc/Circle context is optional and should be used only to verify comparison claims:

- `/Users/abu/dev/hackathon/arc/.thoughts/wiki/index.md`
- `/Users/abu/dev/hackathon/arc/.thoughts/wiki/app-kit-and-crosschain.md`
- `/Users/abu/dev/hackathon/arc/.thoughts/wiki/agentic-economy.md`
- `/Users/abu/dev/hackathon/arc/.thoughts/wiki/circle-platform.md`
- `/Users/abu/dev/hackathon/arc/.thoughts/wiki/wallets-and-contracts.md`
- `/Users/abu/dev/hackathon/arc/.thoughts/raw/source-registry.md`

Do not import Arc/Circle capabilities into Flare. Record clearly when a remembered “App Kit” feature actually belongs to Circle App Kit, Circle Wallets, Circle Agent Stack or Reown AppKit.

## Source corpus

Primary local roots:

- Developer documentation and examples: `/Users/abu/dev/hackathon/flare/developer-hub`
- Official repository clones: `/Users/abu/dev/hackathon/flare/sources/flare-foundation`
- Durable research: `/Users/abu/dev/hackathon/flare/.thoughts`

Current recorded baseline:

- 53 clean local official Git repositories.
- 12,684 tracked files.
- Developer Hub commit `b9562d89133de99bd07e5c1aa099efc724a5555c`.
- 249 Markdown/MDX documentation files and 270 files under Developer Hub examples.
- A live snapshot on 2026-07-24 returned 92 public `flare-foundation` repositories.

Treat those numbers as claims to verify, not instructions to repeat. Enumerate every local repository and confirm that each one appears in a dated source manifest. Do not pretend to read all 12,684 files line by line: classify every repository, then deep-inspect the source that supports or challenges a material claim.

The recorded local clone set covers 53 of the 92 public repositories found in the 2026-07-24 snapshot. The independent audit must explicitly account for the other 39 baseline repositories instead of silently treating the local clones as the complete organization:

- `.github`
- `FTSO-Scaling`
- `JsonJqVerifierServer`
- `VerifierServerGenerator`
- `agent-log-viewer`
- `attestation-suite-deployment`
- `bmi-terraform-examples`
- `bug-bounty`
- `ccxws`
- `connected-chains-docker`
- `coreth`
- `docs`
- `docs-gitbook-old`
- `doge-indexer`
- `evm-verifier`
- `fasset-bots-deploy`
- `fasset-closed-beta`
- `fast-updates`
- `flare-foundry-starter`
- `flare-rosetta`
- `flare-smart-contracts-v1`
- `flare-solidity-periphery-package-mirror`
- `flare-system-client`
- `flare-systems-deployment`
- `flarejs`
- `fsp-reward-calculator`
- `fsp-rewards`
- `ftso-v2-provider-deployment`
- `go-flare`
- `go-songbird`
- `go-verifier-api`
- `governance-proposals`
- `npm-release-action`
- `py-flare-common`
- `signing-tool`
- `songbird-state-connector-protocol`
- `verifier-indexer-framework`
- `verifier-utxo-indexer`
- `verifier-xrp-indexer`

Take a fresh, paginated organization snapshot first. Reconcile every repository returned by that snapshot, with one row containing: repository name, local or remote-only, active/archived/fork status, default-branch head and retrieval date, role, relevance to the research, evidence inspected and an explicit include/exclude reason. If the live count or names differ from the recorded 92, explain additions, removals and archived-state changes. The supplied 39-name list is a baseline, not an allowlist. Prioritize active/recent remote-only omissions such as `FTSO-Scaling`, `fast-updates`, `connected-chains-docker`, `flare-rosetta`, `flare-system-client`, `flare-systems-deployment`, `fsp-reward-calculator`, `fsp-rewards`, `go-flare`, `governance-proposals`, `py-flare-common`, `signing-tool` and the verifier/indexer family. Do not call the inventory exhaustive unless every repository in the fresh snapshot is reconciled.

Before using a repository, read any applicable `AGENTS.md` or `CLAUDE.md`. Known instruction files that must be checked include:

- `/Users/abu/dev/hackathon/flare/developer-hub/AGENTS.md`
- `/Users/abu/dev/hackathon/flare/sources/flare-foundation/fassets/AGENTS.md`
- `/Users/abu/dev/hackathon/flare/sources/flare-foundation/flare-smart-accounts/AGENTS.md`
- `/Users/abu/dev/hackathon/flare/sources/flare-foundation/flare-stake-tool/AGENTS.md`
- `/Users/abu/dev/hackathon/flare/sources/flare-foundation/flare-viem-starter/AGENTS.md`

Do not modify any repository under `developer-hub/` or `sources/flare-foundation/`. Compare local commits to current default-branch heads without pulling, rebasing or checking out source worktrees.

## Source precedence

Apply precedence by claim type: use executable source/tests for behavior; canonical onchain registries, deployment bundles and current network-status material for deployed availability; official organizer material for hackathon rules; and vendor-primary documentation/status for external support. Source-code presence does not prove a live deployment, hosted service or public availability.

Within the relevant claim type, use this order and preserve unresolved conflicts:

1. Current executable contract/runtime/library source and tests at an exact commit or release tag.
2. Current protocol specifications and generated types/ABIs.
3. Current official Developer Hub pages and official package documentation.
4. Current official repository README/deployment notes.
5. Current official governance proposals, product announcements and network status.
6. Official vendor documentation for external integrations.
7. Marketing language only as a claim to verify.

An official example is not automatically production-ready. A repository is not automatically an SDK. A package manifest is not proof that a package is published. A static tool-registry row is not proof of current uptime, full feature support, liquidity or SLA.

For library/SDK/API claims, use current official documentation. If Context7 is available, resolve the official library first and fetch relevant docs, but verify its snippets against the pinned source or official package. The previous audit excluded an untraceable `@flarenetwork/smart-accounts` snippet returned by Context7; do not resurrect it without primary-source proof.

Use primary vendor sources for external tools. Date every dynamic retrieval. Never paste or expose secrets. Do not inspect `.env` values.

## Use independent subaudits

If subagent tooling is available, use at least three read-only subaudits in parallel:

1. **First-party protocols and packages:** network, Transaction SDK, verifier, FlareJS, periphery, FTSO, FDC, FAssets/FXRP, Smart Accounts, staking/rewards/governance and FCC.
2. **Applications, operators and agents:** demos, source-only UIs, bots, indexers, relayers, x402, AI Skills, docs MCP, AI Kit and FCC agent/MCP examples.
3. **External ecosystem and corpus integrity:** GitHub/npm inventory, bridges/OFTs, wallets/custody, RPCs, indexers, analytics/explorers, network matrices, manifests, links, orphans and contradictions.

The main agent must independently verify material subagent claims against primary evidence. Do not paste subagent summaries into the wiki without reconciliation.

## Required audit passes

### 1. Artifact and provenance integrity

- Enumerate `.thoughts/raw`, `.thoughts/research` and `.thoughts/wiki`.
- Check every local Markdown link.
- Check that every wiki page is indexed and no research/source artifact is orphaned.
- Confirm every factual wiki page links to provenance.
- Confirm all 53 local repositories are clean and manifested with exact commits.
- Confirm repository/file counts.
- Confirm dated reality-research reports use:
  - `# Reality Research: <topic>`
  - `## Scope`
  - `## Sources Checked`
  - `## Verified Facts`
  - `## Inferences`
  - `## Unknowns And Questions`
  - `## Not Included`

### 2. First-party inventory freshness

Refresh and classify the public Flare GitHub organization and current `@flarenetwork` npm surface. Specifically retest:

- periphery contracts/artifacts and Wagmi/Foundry packages;
- `flare-tx-sdk`;
- `flare-tx-verifier` and `flare-tx-verifier-lib`;
- `flarejs`;
- `flare-stake-tool`;
- `smart-accounts-encoder`;
- `ftso-adapters`;
- `mcc`;
- `multichain-wallet-connector`;
- FAsset Indexer packages;
- AI/agent packages and any newly published package.

Do not limit distribution discovery to GitHub and npm. Audit relevant first-party delivery channels where present:

- PyPI packages;
- Go modules;
- Dockerfiles, Compose stacks and published container images;
- GitHub releases and downloadable CLI binaries;
- OpenAPI specifications;
- Solidity/Foundry/Hardhat packages and mirrors; and
- internal workspace packages that are not independently published.

For published packages, compare documentation and local source against the current release/tag and inspect:

- package/module exports and actual tarball contents;
- peer and runtime dependency requirements;
- ESM/CJS behavior;
- browser, Node and SSR compatibility;
- package-to-package version conflicts; and
- whether examples rely on unpublished/internal imports.

Use non-installing metadata/tarball inspection such as `npm view` and `npm pack --ignore-scripts` in a temporary directory. A package name or workspace manifest is not proof of a usable public release.

Also inventory licenses, published security audits, the bug-bounty surface, security advisories and redistribution constraints when they materially affect later reuse. Record only evidenced status; do not represent this pass as a security audit.

For each relevant artifact, distinguish:

- protocol/live;
- published stable package;
- alpha/RC/WIP;
- source application;
- example/script;
- self-hosted operator service;
- external provider; or
- legacy/archived/concluded.

Search for newly created or recently updated repositories since the recorded snapshot. Do not equate “official” with “current application SDK.”

### 3. Protocol and user-job coverage

Audit at least:

- network IDs, block/finality claims and Contract Registry resolution;
- C/P/X-chain actions and signing;
- WNat, FTSO delegation, rewards, rNat, staking and governance;
- FTSO fast/scaling/custom feeds, fee calculator, volatility incentives, history and secure random;
- every current nondeprecated FDC attestation family, consumer flow, provider stack, latency and public-service boundary;
- XRP→FXRP direct mint, legacy reservation mint, minting tags, rate-limit delay/retry, transfer and redemption/default;
- FAsset user, agent, liquidator, challenger, keeper, executor and indexer jobs;
- XRPL-controlled Smart Accounts, built-ins, custom operations, recovery opcodes, executor requirements and privacy reality;
- FXRP OFT, peers/DVNs/fees, compose, automint/autoredeem and destination execution;
- SparkDEX/BlazeSwap, Firelight and Upshift lifecycle differences;
- gasless USD₮0, gasless FXRP and x402 token/relayer boundaries;
- FCC instruction/direct paths, compatible release alignment, persistence, attestation, result semantics, public-output leakage and deployment/access status.

For each material protocol/user job, record a per-network matrix rather than collapsing Flare Mainnet, Songbird, Coston2 and Coston into “Flare.” Include contract/service availability, asset/route support, maturity and source date.

For stateful jobs, trace the lifecycle beyond the happy path: prerequisites, preparation/quotation, authorization/signing, submission, confirmation/finality, retry/idempotency, expiry/cancellation, failure/recovery, refund/default/liquidation where applicable, and the durable receipt or observable result.

Do not infer current FBTC/FDOGE/FLTC availability from conceptual examples or configuration names. Do not describe Smart Account `0xFE` as confidential compute. Do not describe proof verification as the state-changing redemption default.

### 4. Application, API and operator coverage

Check whether the corpus correctly distinguishes:

- reusable packages from internal Docusaurus React components;
- source applications from component libraries;
- local/self-hosted APIs from public managed services;
- public RPC/DA/verifier endpoints from SLA-backed production infrastructure;
- current code from archived operator repositories;
- examples from production authorization/security models.

Audit the FAssets demo, FAsset Agent UI, FAsset Bots, FAsset Indexer, Smart Accounts CLI, Viem/Hardhat starters, C/P-chain indexers, FSP Observer, FDC/DA/verifier suite, Governance Backend, reward tools, rNat distribution and rebalancer.

### 5. Agent and MCP authority audit

For every AI-facing surface, record:

- read-only versus prepare/simulate versus sign/broadcast authority;
- where the wallet/key lives;
- authentication and session model;
- confirmation/policy enforcement;
- granular tool/resource permissions and whether authority is enforced by code, wallet policy, prompt convention or operator trust;
- whether it is documentation, example, alpha software or production runtime;
- what happens on retries/failures; and
- whether untrusted proof/API/XRPL data stays typed and validated.

Explicitly compare:

- Flare AI Skills;
- Developer Hub docs MCP;
- alpha `flare-ai-kit`;
- x402 CLI example;
- FCC weather-insurance in-app agent; and
- FCC weather-insurance MCP.

Preserve the current distinction: the in-app agent uses client wallet actions and inline buy confirmation, while the development MCP is no-auth, uses `DEPLOYMENT_PRIVATE_KEY` and signs buys immediately.

For FCC examples and tooling, independently verify compatibility pins, image/release alignment, deployment and access model, TEE attestation chain, secret/input boundary, persistence/restart semantics, administrator/operator powers and exactly what result is committed or exposed publicly onchain.

### 6. External ecosystem audit

Start from:

`/Users/abu/dev/hackathon/flare/developer-hub/src/features/DeveloperTools/developer-tools.json`

Then verify important claims against current official vendor documentation. Check per-network availability and semantics for:

- LayerZero, Stargate and the zkBridge/zkLightClient DVN listing;
- FXRP OFT, USD₮0, flrETH, USDC.e, WETH and USDT;
- SparkDEX/BlazeSwap and vault integrations;
- first-party connector, MetaMask Embedded, Etherspot, Turnkey, Dfns, Wagmi and RainbowKit;
- Flare public RPC, QuickNode, Ankr, NOWNodes, ChainList, thirdweb and Tenderly;
- Flare DA/FAsset Indexer, Envio, Goldsky, SQD and SubQuery;
- Dune, Sentora, Arkham, Flare Metrics, Catenalytica, FlareBase, Blockscout, Systems Explorer and Flare Space;
- relayers, executors, webhooks/streams and workflow automation.

Preserve that the official registry is static/curated. Recheck the Coston2 generic-OFT-list versus separate FXRP OFT documentation discrepancy. Do not call a DVN an independent asset bridge. Do not call an analytics dashboard a stable application API without API evidence.

### 7. Contradiction and absence-claim audit

Retest every current contradiction, including:

- FDC overview “seven” versus nine nondeprecated attestation docs;
- AI Skills page five versus repository six;
- direct mint versus older reservation-flow framing;
- concluded FlareDrops versus still-visible guides/interfaces;
- Coston2 registry OFT list versus FXRP OFT docs;
- Transaction SDK Safe “smart account” versus XRPL Smart Accounts;
- periphery ABI-helper FIXME;
- FAssets demo redemption-default and delayed-mint omissions;
- OFT route/scope wording and dynamic peers;
- Context7's untraceable Smart Accounts package snippet;
- official confirmation guidance versus the dev-only immediate-signing MCP;
- FCC repository-head compatibility versus scaffold-pinned dependencies.

Also challenge all negative claims such as “no first-party widget,” “no hosted relayer,” “no managed executor,” “no route aggregator” and “no public indexer.” State the exact corpus searched and use “not found” rather than universal impossibility.

Test negative claims against more than repository names and READMEs: inspect npm tarballs, monorepo workspaces, package exports, `src/components`/UI directories, Storybooks or examples, OpenAPI files, release assets and current vendor APIs. Distinguish “not found in the searched corpus” from “does not exist.”

Actively guard against these common category errors:

- FDC proof/attestation versus an asset bridge;
- `mcc` versus `multichain-wallet-connector`;
- Safe/Transaction SDK smart accounts versus XRPL-controlled Flare Smart Accounts;
- `flarejs` versus `flare-js`;
- a DVN or verifier versus a user-facing bridge;
- Circle App Kit/Wallets/Agent Stack versus Reown AppKit or Flare tooling;
- source/demo authorization versus production policy enforcement; and
- an MCP with signing capability versus a safe autonomous agent runtime.

### 8. Hackathon facts

Treat the participant-supplied Flare Summer Signal brief as the current programme corpus:

- development opens June 29;
- final submission August 14;
- judging August 15–21;
- winners August 24;
- Bounty 1: Interoperable Asset Products;
- Bounty 2: Confidential Compute Apps;
- $6,000 per bounty, with $4,000/$2,000 placements;
- product usefulness, meaningful Flare integration, technical execution, evidence of new work, clarity and future potential;
- existing projects must separate prior work from new/ported/integrated work.

If you locate a current official organizer page, verify the fields and record its URL/retrieval date. Do not generate ideas or choose a bounty.

## Required outputs

Do not overwrite the immutable 2026-07-22 source manifest or erase earlier conclusions. Add a dated second-opinion layer:

1. `.thoughts/raw/2026-07-24-claude-independent-audit-sources.md`
   - exact source URLs/paths, repository commits, package versions and retrieval date;
   - what was inspected deeply versus only inventoried;
   - failures, access limits and excluded/untraceable evidence.
2. `.thoughts/research/2026-07-24-flare-independent-audit.md`
   - use the exact reality-research heading contract listed above;
   - separate confirmed, corrected, newly discovered and unresolved claims.
3. Update existing wiki pages only for **verified material corrections or additions**.
4. Update `.thoughts/wiki/index.md` and `.thoughts/wiki/log.md` for every new artifact/change.
5. If a genuinely separate domain needs durable treatment, add one concise cross-linked wiki page. Do not duplicate `capability-inventory.md` or `ecosystem-tools.md`.
6. Include a public-repository reconciliation table with one row for every repository in a fresh paginated snapshot, either in the source record or a separately linked dated raw artifact. Compare it to the recorded 92-repository baseline.
7. Include a discrepancy ledger that names the exact existing claim/file, audit status, evidence, severity/impact, recommended factual action and resulting durable change.

If the audit finds no material missing facts, still create the research report and source record, but do not manufacture wiki changes.

## Finding format

For each material finding, record:

| Field | Required content |
| --- | --- |
| Existing claim | Exact claim and artifact location. |
| Audit status | Confirmed, corrected, new, stale, unresolved or out of scope. |
| Primary evidence | Exact local path/commit or official URL with retrieval date. |
| Reasoning | Short explanation of what the evidence proves and does not prove. |
| Severity/impact | Critical, high, medium, low or informational, with the affected research boundary. |
| Durable change | File/section updated, or “none.” |
| Confidence | High, medium or low with the uncertainty named. |

Keep facts, inferences and product decisions separate.

## Guardrails

- Do not edit, reset, pull, delete or reformat source repositories.
- Do not deploy contracts, create wallets, sign transactions, send funds or access secrets.
- Do not install packages into the workspace. Temporary `npm view` and `npm pack --ignore-scripts` inspection in an isolated temporary directory is acceptable.
- Do not treat `.env`, keys, tokens or private credentials as research inputs.
- Do not perform a security audit claim; record observable security/authority boundaries only.
- Do not silently resolve contradictions.
- Do not trust search snippets, AI summaries or package names without primary evidence.
- Do not expand into project ideation, feature selection or implementation.
- Preserve unrelated user work.

## Completion checks

Before finishing:

- every public repository in the fresh paginated snapshot has a disposition row, including every remote-only repository, and drift from the recorded 92-repository baseline is explained;
- all local Markdown links resolve;
- every wiki page is indexed;
- no new raw/research artifact is orphaned;
- every material factual addition has provenance;
- repository counts and manifests reconcile;
- local repository commits are compared with current remote heads without modifying worktrees;
- relevant non-GitHub/npm distribution channels are either audited or explicitly marked not applicable/not found;
- package exports, release contents and compatibility claims are checked rather than inferred from manifests;
- per-network availability is explicit for network-sensitive capabilities;
- lifecycle and recovery behavior is recorded for stateful user jobs;
- license/security/advisory evidence is recorded where reuse could be affected;
- source worktrees remain clean;
- all dynamic facts are dated;
- every negative/absence claim names its search scope;
- contradictions and unknowns remain explicit;
- “exhaustive” is not used unless the fresh organization snapshot and distribution-channel reconciliation support it;
- the final response distinguishes what was newly found from what was merely reconfirmed.

Finish by reporting:

1. material new findings;
2. material corrections;
3. important existing findings independently confirmed;
4. unresolved questions;
5. artifacts created/updated; and
6. verification results.

Begin the audit now. Do not ask for product direction.
