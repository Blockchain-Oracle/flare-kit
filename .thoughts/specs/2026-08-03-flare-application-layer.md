# Spec: Flare Application Layer

Date: 2026-08-03  
Status: accepted comprehensive product specification after independent Claude Opus 5 review and participant quality calibration.  
Acceptance: explicitly approved by the participant on 2026-08-03; this accepts the primary/secondary user model and quality/evidence standard required by `AC-SPEC-005` and `AC-SPEC-006`.  
Canonical authority: [Full Flare Application Layer scope](../decisions/2026-08-03-full-flare-application-layer-scope.md).  
Derived stories: [accepted Flare Application Layer stories](../stories/2026-08-03-flare-application-layer.md).  
Accepted product surfaces: [Flare Application Layer product-surface map](../design/2026-08-03-product-surface-map.md).  
Working label: “Flare Application Layer” is descriptive, not the final product or package name.

## Objective

Create the complete Flare-native application layer: one coherent system that lets developers,
applications, wallets, operators and policy-constrained agents discover, prepare, execute, track and
recover Flare operations without rebuilding protocol orchestration and user experience for every
product.

The system must expose the same underlying operations through:

- headless TypeScript libraries and SDKs;
- React hooks and framework integrations;
- styled embeddable widgets and composed journeys;
- self-hostable service and provider-adapter contracts where continuous operation is required; and
- policy-constrained agent tools with explicit authority boundaries.

It must cover the accepted product families: FAssets/FXRP, XRPL-controlled Smart Accounts, FDC,
FTSO, wallets, swaps and liquidity, bridges and OFTs, gasless/relayed transactions, portfolio and
activity data, indexers/analytics/explorers, governance, delegation, staking, rewards and FCC.

Implementation may be sequenced. Sequence, demonstration order, third-party availability and the
hackathon deadline must not be used to delete a family or redefine the product as one FXRP flow.

## Background And Current Reality

Flare already supplies substantial foundations: protocol contracts, ABIs and registry discovery,
generated Wagmi hooks, the Transaction SDK, FlareJS, a transaction verifier, the Smart Accounts
encoder, a work-in-progress EVM/XRPL wallet connector, examples and self-hosted operator software.
The product must reuse those foundations instead of misrepresenting them as absent or replacing them
with another raw contract wrapper.

What remains fragmented is the application contract above those foundations:

- multi-chain and multi-actor orchestration;
- typed quote, intent, approval, step, error, recovery and receipt semantics;
- lifecycle state that survives reloads and long external waits;
- transparent provider and route comparison;
- styled user experiences with honest partial-success and recovery states;
- durable executor, relayer and indexer boundaries where protocols require operators; and
- safe reuse of the same operations by humans and agents.

The most Flare-specific operations are asynchronous state machines. An XRPL payment can require FDC
finality and a Flare executor before FXRP exists. A Smart Account instruction can require off-XRPL
data delivery and recovery. Redemption can fan out across agents and end in a proof-backed default.
OFT delivery crosses external messaging infrastructure. P-chain staking locks value across
transactions and time. FCC introduces a separate confidential runtime, attestation and result
lifecycle. A submitted hash is therefore not a complete result.

Current external routes, provider APIs, fees, protocol parameters, contract addresses, feed metadata,
liquidity and FCC deployments are dynamic. The product must discover and qualify them at runtime and
through a versioned compatibility matrix rather than encode research snapshots as permanent truth.

## Users

The user model below is an adopted product decision, not a researched ecosystem fact. It resolves
the previously recorded launch-user question in the [application-layer reality research](../research/2026-07-24-flare-application-layer-reality.md) and follows the participant's explicit developer “plug and play” direction in the [original attached brief](/Users/abu/.codex/attachments/c8b158fe-5b39-4d3d-aff4-3e3d6589f983/pasted-text.txt). Acceptance of this specification explicitly accepts this primary/secondary user model.

### Primary user: application developer or product team

The primary user is a team building a Flare-facing dApp, wallet, merchant product, asset product,
governance experience or agent-enabled application. They need to integrate a complete operation at
the depth appropriate to their product without becoming the operator and UX author for every
underlying protocol.

Their job-to-be-done is:

> Add a trustworthy Flare capability to my product through a widget, React integration or headless
> API, while retaining control of branding, wallet authority, providers and hosting—and without
> hiding lifecycle, fees, failure or recovery from my users.

### Secondary users

| User | Required outcome |
| --- | --- |
| XRP/Flare end user | Connect the wallet they already use, understand what will happen, approve only the intended action, follow progress and recover safely. |
| Wallet or custody integrator | Supply EVM/XRPL clients and signing authority through a stable adapter without adopting the whole UI. |
| Protocol or route provider | Expose an integration whose identity, availability, quote, risk and status remain visible to the host and user. |
| Agent builder | Give an agent read, planning and narrowly authorized execution capabilities without creating a second unsafe action implementation. |
| Infrastructure operator | Self-host executors, indexers, relayers, policy services or FCC components with health, replay and audit contracts. |
| Product support/operator team | Find an operation by correlation data, explain its state and apply only safe documented recovery actions. |

## Goals

1. **One operation language.** Every surface uses the same typed capability, intent, quote, plan,
   lifecycle, recovery, error and receipt concepts.
2. **Complete Flare coverage.** Every accepted capability family is represented as a real domain with
   its own lifecycle and trust semantics, not as a placeholder label.
3. **Multiple integration depths.** A team can choose styled widgets, React primitives, headless
   operations or agent tools without losing core behavior.
4. **Durable progress and recovery.** Long-running operations can be restored, reconciled and safely
   continued after reloads, disconnects, duplicate delivery, provider failure or process restart.
5. **Transparent aggregation.** The product normalizes integration without concealing provider,
   venue, trust, fee, approval, timing or recoverability differences.
6. **User-controlled authority by default.** Discovery, quotes and simulation are broadly available;
   signing and broadcasting require visible wallet confirmation or a narrowly scoped, revocable
   delegated capability.
7. **Honest operational boundaries.** Self-hosted software, public endpoints, external providers and
   project-operated services are clearly distinguished.
8. **Flare-native product value.** The kit makes FAssets, Smart Accounts, FDC, FTSO and FCC easier to
   use as products rather than presenting generic EVM functionality as the innovation.
9. **Auditable quality.** Exact amounts, provenance, policy decisions, provider evidence and final
   receipts are testable and observable across human and agent clients.
10. **Extensibility without fragmentation.** New protocols, networks, assets, wallets, providers,
    widgets and agent transports can join through stable product contracts without forking lifecycle
    semantics.

## Quality And Evidence Standard

The product must be as good as reasonably possible across user experience, performance, integration
depth, reliability, recovery, code quality, security, maintainability and durability. Hackathon
context governs sequence and evidence; it never lowers quality, narrows scope or excuses a shallow,
brittle, fake or buggy supported experience.

The boundary is materiality, not whether a technique is called hackathon-, production- or
enterprise-grade. A requirement belongs when it materially protects or improves working end-to-end
behavior, user experience, correctness, user funds or authority, performance, recoverability,
maintainability, the shared reusable architecture, future extensibility or the truthfulness of a
claim. Serious engineering remains required when it passes that test. Operational, certification,
compliance or infrastructure controls that do not apply to any authority, service, environment or
claim held by the project—and add no material product value—must not become performative
overengineering.

The following remain unacceptable at every gate: asset loss, replay, key leakage, silent signing,
duplicate payment, fake success, dishonest confidentiality, materially misleading status, brittle
demo paths, shallow widgets and untested declared support.

### Three-layer acceptance model

1. **Specification acceptance** judges whether this artifact defines the complete intended product
   contract without contradiction or scope leaks. Requirements may be normative here even when their
   implementation evidence belongs to a later claim or environment.
2. **Hackathon implementation evidence** judges the submitted build. Every capability declared
   `supported` must work end to end on its declared environment with polished UX, real integration,
   honest state, proportionate safety and no mocked success. Unimplemented families remain explicit
   as `planned`; they are not removed or mislabelled as upstream-unavailable.
3. **Production or operated-service claims** activate the evidence supporting the exact claim. A
   production, managed-service, custody, production-FCC or delegated-authority claim requires its
   relevant operational and security controls. A build that does not make the claim does not owe
   that certification evidence and may not use the label.

Requirements remain part of the complete product contract regardless of when they are proven. The
evidence gate changes when proof is owed, never whether the requirement belongs.

## Non-goals

- Reimplement Viem, Wagmi, the Flare Transaction SDK, FlareJS or published protocol contracts.
- Turn every protocol read or contract method into a top-level “operation” without a recognizable
  application job.
- Guarantee that every capability, asset or third-party provider is available on every Flare-family
  or connected network.
- Pretend all swap, bridge, relayer, custody, indexer or analytics providers have identical trust,
  liquidity, SLA or failure semantics.
- Claim a project-operated managed executor, relayer, indexer, route service or FCC deployment unless
  that service is actually operated and its environment/SLA is documented.
- Become a custodian by silently collecting or persisting wallet secrets. Custodial or embedded
  wallet vendors may be integrated only through explicit adapters and disclosed trust models.
- Let an agent treat a quote, natural-language instruction or a *user's* connected wallet as
  permission to sign arbitrary transactions on that user's behalf.
  Amended 2026-08-03: an agent holding its own key signs with it directly and needs no per-action
  approval. See `specs/2026-08-03-agent-cli-and-tool-surfaces.md` section A.
- Describe Smart Account `0xFE` delivery as confidential compute or claim that FCC makes public
  settlement calldata secret.
- Add FCC to an unrelated operation solely for bounty eligibility.
- Market simulated TEE execution as hardware-attested confidentiality.
- Promise FXRP-native EIP-3009/x402 behavior that the token does not currently expose.
- Revive FlareDrop as an accruing reward product after the distribution has ended; historical claims
  may be represented only with accurate availability.
- Define implementation sequence, repository topology, final public API names, visual direction or
  screen layout in this specification. Those belong to later product-surface, design, architecture
  and implementation artifacts.

## Requirements

The words **must**, **should** and **may** are normative. “Must” requirements are required for the
complete product unless a capability descriptor explicitly reports that an upstream dependency is
unavailable on the selected network. Unavailability must be represented honestly; it does not remove
the family from product scope.

### 1. Product contract and completeness

- **R-PROD-001:** The system must maintain one canonical capability catalogue covering every family
  named in this specification.
- **R-PROD-002:** Each capability must declare supported operations, networks, assets, wallet needs,
  signer needs, provider dependencies, expected duration class, fees, risks, recovery support and
  integration surfaces.
- **R-PROD-003:** Each capability must have a real headless domain contract. React, widgets and agent
  tools must consume it rather than reimplement protocol logic.
- **R-PROD-004:** A family is product-complete only when its discovery, read/preflight, execution where
  applicable, lifecycle, failure/recovery, receipts, headless/React/widget/agent surface coverage,
  documentation and test expectations are defined.
- **R-PROD-005:** A capability may be `planned`, `experimental`, `supported`, `degraded`, `unavailable`
  or `deprecated` for a particular network/provider combination. `planned` means the family is
  accepted product scope but not yet implemented by this project; `experimental` requires a real
  implementation whose support qualification is incomplete; `supported` requires the declared
  conformance evidence; `degraded` means a supported path has a current material limitation;
  `unavailable` is reserved for dated, evidenced upstream absence; and `deprecated` means a previously
  exposed path is retained only for compatibility/migration. Status, reason and evidence must be
  machine-readable and user-visible.
- **R-PROD-006:** “Complete kit” means the complete capability-family architecture and product
  contract. It does not mean unverifiable parity across every external provider.
- **R-PROD-007:** Demonstrations and release milestones must reference the catalogue; they may prove
  subsets in sequence but must label project non-delivery as `planned` and may not silently remove
  unimplemented families from the intended product.
- **R-PROD-008:** Legacy, current and future-facing protocol surfaces must be labelled. Conceptual
  asset names or stale documentation must not be promoted to supported features without runtime
  evidence.
- **R-PROD-009:** All public claims must distinguish source availability, package availability,
  deployed protocol availability, configured adapter availability and project-operated service
  availability.

### 2. Shared operation model

Every value-changing or multi-step job must use a shared operation model. Simple reads may return
typed observations directly, but must retain provenance and freshness.

#### Required domain objects

| Object | Required content |
| --- | --- |
| Capability descriptor | Stable capability ID; maturity; networks/assets; required clients/providers; read/write authority; duration; fee currencies; recovery support; source/version provenance. |
| Intent | User or application objective; exact inputs; account/chain/asset domain; constraints; optional idempotency key; no signature. |
| Quote | Provider/route identity; exact input/output; fees; gas currency; price impact where relevant; ETA/range; approvals; assumptions; expiry; freshness; trust/recovery metadata. |
| Plan | Ordered and conditional steps; responsible actor for each step; required signatures; expected external events; dependencies; cancellation boundary; estimated final outcome. |
| Approval request | Human-readable and machine-readable effect; exact chain, target, function/action, asset, amount limit, provider, expiry and changed quote terms. |
| Operation | Durable ID; capability/intent; selected quote/plan; state; timestamps; accounts; step state; correlation keys; version; persistence metadata. |
| Step | Stable step ID/type; actor; state; attempt count; inputs/outputs; submission/evidence identifiers; timeout; error; recovery options. |
| Error | Stable code; domain; message; cause/provenance; retryability; safety class; whether value moved; recommended recovery and support evidence. |
| Recovery action | Preconditions; user-visible effect; whether it signs/broadcasts; idempotency; risk; expiry; next expected state. |
| Receipt | Requested and actual outcome; all chain/provider identifiers; fees; approvals; policy decisions; timing; warnings; final/partial status; evidence links; schema version. |
| Observation | Value; units/decimals; source/provider; network/block/round; observed-at and valid-at time; confidence/security flags; staleness. |

- **R-OP-001:** Amounts, fees, rates, timestamps, block/round identifiers and nonces must use exact
  typed representations. Floating-point token arithmetic is prohibited.
- **R-OP-002:** Operation IDs must be independent of any single transaction hash. An operation may
  correlate XRPL hashes, Flare hashes, FDC rounds/proofs, LayerZero GUIDs, P-chain transaction IDs,
  FCC action IDs and provider job IDs.
- **R-OP-003:** The system must accept an application-supplied idempotency key and enforce replay-safe
  creation/submission within the applicable authority domain.
- **R-OP-004:** The operation record must identify which actor owns each pending step: user wallet,
  host app, executor, relayer, provider, protocol, TEE or destination chain.
- **R-OP-005:** Quotes and plans must be immutable snapshots. Re-quoting creates a linked revision and
  must not rewrite the terms the user approved.
- **R-OP-006:** Any material change to output, total cost, slippage, target, provider, chain, asset,
  approval, deadline or trust model must invalidate prior approval and require renewed consent.
- **R-OP-007:** Submitted effects must be reconciled from canonical chain/provider evidence, not only
  from an in-memory promise or websocket event.
- **R-OP-008:** Every retry must declare whether it reuses an existing payment/proof/signature or
  creates a new value-moving action. Unsafe resubmission must be blocked by default.
- **R-OP-009:** Cancellation must be offered only where it is technically real. The system must name
  the last reversible boundary and any funds or obligations that remain after it.
- **R-OP-010:** A receipt must remain exportable as structured JSON and renderable for humans.

#### Lifecycle states

| State | Meaning |
| --- | --- |
| `draft` | Intent exists; required inputs may be incomplete. |
| `discovering` | Capabilities, parameters, providers or routes are being resolved. |
| `quoting` | One or more time-bound plans are being prepared. |
| `awaiting_input` | A required non-signing input or external prerequisite is missing. |
| `awaiting_approval` | The exact action is ready for human or policy approval. |
| `ready` | Preconditions and approvals are satisfied; execution has not started. |
| `executing` | A client/service is constructing, signing or submitting the current step. |
| `submitted` | A transaction/request/message was accepted but is not yet final. |
| `confirming` | Canonical confirmation/finality is pending. |
| `awaiting_external` | Another chain, provider, executor, epoch, queue, payment or TEE must act. |
| `action_required` | Progress is safely recoverable but requires a named user/operator action. |
| `partially_succeeded` | At least one irreversible effect succeeded; the intended final outcome is incomplete. |
| `succeeded` | The intended outcome is final under the capability's declared finality standard. |
| `failed` | The operation cannot reach the intended outcome through a supported safe recovery. |
| `cancelled` | Cancellation completed at a real reversible boundary; residual effects are disclosed. |
| `expired` | A quote, authorization, proof window, proposal, request or other prerequisite expired. |

- **R-LIFE-001:** Widgets, hooks, headless clients and agents must expose the same canonical state and
  step identifiers.
- **R-LIFE-002:** `submitted` must never be presented as `succeeded` unless submission is the defined
  final outcome of that specific read-only/provider job.
- **R-LIFE-003:** `partially_succeeded` and `action_required` must include what moved, what remains,
  whether value is at risk and the safe next actions.
- **R-LIFE-004:** State must survive page reload, wallet reconnect and process restart when a
  configured durable store is present.
- **R-LIFE-005:** State machines must tolerate duplicate events, out-of-order delivery, reorgs,
  websocket loss and historical backfill without duplicating value-changing effects.
- **R-LIFE-006:** Timeouts must change observation or escalation state; they must not invent a
  protocol failure when the canonical outcome remains unknown.

### 3. Integration depths

#### Headless TypeScript

- **R-HEAD-001:** Every capability must expose typed discovery/read functions and, where applicable,
  quote, plan, simulate, execute, resume, recover and receipt functions.
- **R-HEAD-002:** Headless clients must support dependency injection for networks, RPCs, wallets,
  signers, providers, storage, clock, telemetry and policy evaluation.
- **R-HEAD-003:** Browser and server environments must have explicit compatibility. Secret-bearing
  provider calls must not be forced into the browser.
- **R-HEAD-004:** Errors must be typed and serializable; consumers must not parse message text to
  decide whether an action is safe to retry.
- **R-HEAD-005:** Async progress must be consumable by callbacks, subscriptions and resumable polling
  without requiring a specific UI framework.
- **R-HEAD-006:** Read and discovery paths must support batching, caching against declared freshness
  and staleness rules, request deduplication and cancellation. They must not block interaction while
  resolving, and multi-source views must resolve progressively rather than wait for the slowest
  provider. Numeric latency, throughput and availability targets belong to the quality profile.

#### React

- **R-REACT-001:** React integrations must provide context/providers and hooks for capability
  discovery, wallet/account state, quotes, operations, progress, recovery and receipts.
- **R-REACT-002:** Hooks must not create hidden duplicate operations during re-render, remount or
  development-mode effect replay.
- **R-REACT-003:** Server rendering and hydration behavior must be documented; wallet-only behavior
  must be client-gated without breaking the host page.
- **R-REACT-004:** Hosts must be able to replace presentation while preserving the operation model.
- **R-REACT-005:** React primitives must cover every capability family whose underlying operation is
  supported. A family may expose read/preflight primitives before value-changing ones, but partial
  coverage must be declared in the capability catalogue rather than hidden behind a placeholder.

#### Styled widgets

- **R-WIDGET-001:** Widgets must support standalone embeds and composition inside a host application.
- **R-WIDGET-002:** Every value-changing widget must render connect/input, preflight/quote, review,
  wallet approval, submitted/progress, success/receipt, error and recovery states.
- **R-WIDGET-003:** Hosts must be able to theme tokens, typography, spacing, radius, elevation and
  light/dark/system modes without editing protocol logic.
- **R-WIDGET-004:** Widgets must be responsive, keyboard-operable and conform to WCAG 2.2 AA for the
  kit-controlled surface.
- **R-WIDGET-005:** User-facing strings, numbers, dates, assets and network names must be localizable;
  exact onchain values must remain unambiguous across locales.
- **R-WIDGET-006:** Hosts must receive documented product events without sensitive inputs, secrets or
  unrestricted wallet data being emitted to analytics.
- **R-WIDGET-007:** Embeds must clearly show when they navigate to or rely on an external wallet,
  provider, explorer or bridge.
- **R-WIDGET-008:** The widget surface must cover every capability family whose underlying operation
  is supported. A family may expose read/preflight widgets before value-changing ones, but partial
  coverage must be machine-readable and explicit. A generic operation renderer is a fallback for
  long-tail operations within a family, never a substitute for that family's composed experience.
- **R-WIDGET-009:** All kit-controlled surfaces must share one design system and interaction
  vocabulary—including layout rhythm, state presentation, terminology, iconography, motion and focus
  behavior—so widgets from different families compose into one coherent product. Concrete visual
  direction remains owned by the later design gate.
- **R-WIDGET-010:** For any operation whose declared duration exceeds a short synchronous wait,
  progress must communicate the current stage, expected time range, awaited actor or system, and what
  the user may safely do meanwhile. An indeterminate indicator alone does not satisfy progress.

#### Agent tools

Agent requirements are specified in section 16. Agent tools are an integration depth over the same
headless operations, not a separate product implementation.

### 4. Capability, network and provider discovery

- **R-DISC-001:** The canonical network catalogue must describe Flare (`14`), Coston2 (`114`),
  Songbird (`19`) and Coston (`16`), their applicable EVM/P/X surfaces, XRPL main/test environments
  and dynamically connected EVM destinations. Evidence anchor: [network/provider inventory](../wiki/ecosystem-tools.md#rpc-and-full-stack-infrastructure).
- **R-DISC-002:** The catalogue must not imply feature parity. Every capability must be qualified per
  network, asset, provider and deployment.
- **R-DISC-003:** Current contract addresses must be resolved from the Contract Registry or current
  deployment data, then validated against the selected chain and non-empty bytecode before writes.
- **R-DISC-004:** Runtime parameters—including FAssets fees/limits, feed IDs/decimals, FDC fees,
  proposal state, bridge peers, DVNs, gas, liquidity and provider quotas—must be refreshed according
  to declared freshness rules.
- **R-DISC-005:** A provider adapter must expose identity, supported jobs, networks/assets, maturity,
  auth location, quote/status capability, timeout/retry semantics, health and provenance.
- **R-DISC-006:** Provider selection must support host allowlists/denylists, user-visible comparison
  and deterministic policy filters.
- **R-DISC-007:** Aggregation must preserve provider-specific steps, trust assumptions and recovery.
  A normalized result must not erase meaningful route differences.
- **R-DISC-008:** When only one route is available, the product must say so rather than present a
  false comparison.
- **R-DISC-009:** Provider/API credentials must be injectable through an appropriate server-side or
  wallet boundary and must never appear in public operation records or telemetry.
- **R-DISC-010:** The project must publish a machine-readable, versioned compatibility matrix. Every
  `planned`, `experimental`, `supported`, `degraded`, `unavailable` or `deprecated` combination must
  carry a dated source and, where applicable, block/deployment/package version. `planned` must identify
  project non-delivery separately from upstream qualification; `unavailable` requires evidence of
  upstream absence.

### 5. Wallet onboarding, accounts and signing authority

- **R-WALLET-001:** The product must support EVM and XRPL connection through adapters, including
  simultaneous account context where an operation crosses both environments.
- **R-WALLET-002:** It must support connection, rejection, unavailable wallet, wrong network,
  account/chain change, restored session, disconnect, hardware-wallet delay and expired-session
  states.
- **R-WALLET-003:** The baseline custody model is an external user-controlled wallet. Embedded,
  passkey, MPC, custodial or account-abstraction providers may be added through adapters with explicit
  custody, recovery and sponsorship disclosure.
- **R-WALLET-004:** The kit must never log, persist or transport seed phrases or raw private keys.
- **R-WALLET-005:** A connected account is not blanket authority. Every write must bind the approved
  account, chain, operation, target, amount/value limit, deadline and relevant provider/route.
- **R-WALLET-006:** Unsigned transaction inspection must be available before signing where the
  underlying transaction format and verifier support it.
- **R-WALLET-007:** Wallet confirmation copy and agent approval payloads must be generated from the
  same canonical plan and decoded effect.
- **R-WALLET-008:** Account mismatch between quote, approval, signature and execution must invalidate
  the action rather than silently rebind it.
- **R-WALLET-009:** The kit must distinguish EVM account abstraction/Safe products from
  XRPL-controlled Flare Smart Accounts.

### 6. FAssets and FXRP

The FAssets domain must model consumer, application and relevant operator-visible lifecycle without
pretending existing self-hosted operator systems are managed APIs.

- **R-FASSET-001:** Discover current Asset Manager/Core Vault addresses, asset/underlying network,
  fees, minimums, limits, queues, pause/emergency state, executor options and routing parameters.
- **R-FASSET-002:** Support the current direct XRP-to-FXRP mint lifecycle: prepare exact XRPL payment,
  memo/tag/recipient/executor routing, wallet submission, XRPL finality, FDC proof, Flare execution,
  delayed execution and final receipt.
- **R-FASSET-003:** A delayed direct mint must be represented as recoverable `awaiting_external` or
  `action_required`. Recovery must reuse the same XRPL payment and proof where the protocol permits;
  the user must be warned not to send XRP again.
- **R-FASSET-004:** Support Minting Tag discovery, reservation, ownership, optional executor binding,
  transfer/cooldown and the rule that transfer changes the recipient and clears the executor.
- **R-FASSET-005:** Represent conventional collateral-reservation minting where the selected
  deployment still supports it, with an explicit legacy/current label and no hardcoded sample data.
- **R-FASSET-006:** Support FXRP balance, exact transfer, allowance/approval and receipt operations,
  including emergency pause and insufficient allowance/balance states.
- **R-FASSET-007:** Support redemption preflight, exact XRP destination/tag encoding, request/burn,
  one-or-many agent obligations, XRP payment observation, completion and correlated receipt.
- **R-FASSET-008:** Support incomplete/non-payment recovery: wait for required thresholds, obtain the
  correct FDC nonexistence proof, invoke the correct state-changing default path, surface collateral
  compensation and preserve all obligation-level evidence.
- **R-FASSET-009:** A read-only proof verification must never be presented as completed default or
  compensation.
- **R-FASSET-010:** The receipt model must correlate XRPL transaction ID, FDC request/round/proof,
  Asset Manager events, executor transaction, recipient/Personal Account and downstream actions.
- **R-FASSET-011:** The capability catalogue must distinguish current public FXRP support from
  conceptual/configuration references to other FAssets. Additional assets become supported only after
  deployment and end-to-end qualification.
- **R-FASSET-012:** Operator integrations may expose agent vault, collateral, Core Vault, reward,
  liquidation, challenge, keeper and executor state through explicit operator adapters. Operator
  writes must use a separate authority profile and may not be enabled by a consumer wallet session.
- **R-FASSET-013:** Indexer-backed lifecycle data must support replay/backfill and identify known
  coverage gaps rather than fabricate a complete history.

### 7. XRPL-controlled Flare Smart Accounts

- **R-SA-001:** Support deterministic Personal Account discovery, activation/deployment state,
  balances, controller state, current memo nonce, pinned executor and fee settings.
- **R-SA-002:** Support built-in instructions exposed by current deployments, including FXRP,
  Firelight and Upshift actions, with capability discovery rather than a permanent assumed list.
- **R-SA-003:** Support arbitrary atomic batched calls through `PackedUserOperation` using both
  `0xFF` inline and `0xFE` hash-only delivery modes where available.
- **R-SA-004:** Plans must show XRPL payment, executor compensation, data-delivery path, FDC proof,
  Flare execution and every downstream call before approval.
- **R-SA-005:** `0xFE` must be described as off-XRPL payload delivery; the full operation's eventual
  public Flare calldata must be disclosed.
- **R-SA-006:** Support executor selection/pinning policies and visible executor availability, fee and
  trust status.
- **R-SA-007:** Support recovery instructions to ignore a failed memo, advance nonce, replace executor
  fee and pin/unpin an executor, with exact preconditions and effects.
- **R-SA-008:** A failed custom action in which XRP has reached the Core Vault must surface the funds'
  actual state and the applicable protocol recovery; it must not invite a duplicate payment.
- **R-SA-009:** Watchers must backfill from a safe historical boundary and have explicit timeouts;
  installing an event listener after payment is insufficient.
- **R-SA-010:** Receipts must correlate the XRPL payment, user-operation hash/data mode, FDC evidence,
  executor, Asset Manager/controller/Personal Account events and downstream calls.

### 8. FDC

- **R-FDC-001:** Expose a generic asynchronous FDC lifecycle: prepare request, validate source and
  request body, quote/query fee, submit, wait for voting round/Relay finalization, retrieve DA proof,
  verify and optionally consume.
- **R-FDC-002:** The capability catalogue must discover, requalify and cover every attestation family
  exposed as current and nondeprecated by the selected deployment's documentation and verifier. It
  must not freeze a dated family list as permanent protocol truth. Deprecated families remain visible
  with `deprecated` status where they affect compatibility or existing integrations.
- **R-FDC-003:** Convenience coverage in an upstream SDK must not be mistaken for the protocol's full
  attestation catalogue. Project-unimplemented request builders must remain `planned`; a family may
  be `unavailable` only with dated evidence of upstream absence. Neither state may be mocked or
  described as supported.
- **R-FDC-004:** Operations must expose request/response hashes, voting round, fee, proof owner,
  source, verifier/DA provider, finality evidence and onchain consumption transaction where present.
- **R-FDC-005:** Proof-owner restrictions, replay/consumption rules and selected network/source must
  be validated before execution.
- **R-FDC-006:** Public endpoint quotas and expected finalization duration must be visible. The product
  must support provider adapters and self-hosted endpoints without changing the operation model.
- **R-FDC-007:** A timeout or consensus failure, including nondeterministic Web2Json input, must be
  represented as no proof/unknown outcome rather than a fabricated negative fact.
- **R-FDC-008:** FDC proof retrieval must be reusable by FAssets, Smart Accounts and other product
  domains without those domains duplicating the request state machine.

At the pinned 2026-07-24 corpus and Developer Hub commit
`b9562d89133de99bd07e5c1aa099efc724a5555c`, the documentation tree exposes nine nondeprecated
families: Address Validity, EVM Transaction, Payment, Balance Decreasing Transaction, Confirmed Block
Height Exists, Referenced Payment Nonexistence, Web2Json, XRPPayment and XRPPayment Nonexistence.
The [FDC overview](../../developer-hub/docs/fdc/1-overview.mdx) still says seven, while
[JsonApi](../../developer-hub/docs/fdc/attestation-types/json-api.mdx) is separately marked deprecated
since May 2025. This is a dated compatibility note, not the runtime source of truth; the compatibility
matrix must record and resolve the discrepancy.

### 9. FTSO and network data

- **R-FTSO-001:** Support discovery and typed reads for block-latency feeds, scaling feeds and their
  current metadata, decimals, timestamps/rounds and staleness.
- **R-FTSO-002:** Support history queries with provider/retention boundaries and evidence for missing
  ranges.
- **R-FTSO-003:** Support scaling-feed proof retrieval/verification where required and distinguish it
  from a direct block-latency contract read.
- **R-FTSO-004:** Support current feed adapter discovery/configuration without claiming the
  release-candidate adapter package is maintained by the kit or refreshed automatically.
- **R-FTSO-005:** Support custom-feed configuration as a distinct trust class whose updater and
  availability are disclosed.
- **R-FTSO-006:** Support Fast Update incentive discovery, fee quotation, submission and the limited
  duration/effect of the incentive.
- **R-FTSO-007:** Support secure random reads with value, timestamp and `isSecure`; consumers and
  agents must be able to require `isSecure == true` through policy.
- **R-FTSO-008:** Price/risk observations supplied to quotes, widgets or agents must carry source,
  units, decimals, freshness and confidence/security metadata.

### 10. Swaps, liquidity aggregation and vaults

- **R-SWAP-001:** Expose provider-neutral swap intent and quote contracts with venue, path/pool,
  exact-in/exact-out semantics, fees, gas, price impact, slippage, deadline, allowance and expected
  output.
- **R-SWAP-002:** Support multiple venue adapters where more than one qualified route exists. Route
  comparison must be deterministic under host/user policy and must preserve venue identity.
- **R-SWAP-003:** Simulation and balance/allowance checks must occur before approval/signing where the
  selected network/provider permits them.
- **R-SWAP-004:** Approval must be exact or policy-bounded by default. Unlimited approval requires a
  separate explicit choice and warning.
- **R-SWAP-005:** Quote expiry or material state change must return to quoting/approval rather than
  execute stale terms.
- **R-SWAP-006:** Receipts must report quoted versus actual amounts, fees, slippage, venue/path,
  approvals and transaction evidence.
- **R-LIQ-001:** Liquidity/vault integrations must model deposit, share/position state, withdrawal
  liquidity, fees, locks/epochs, request/claim stages and failure/recovery.
- **R-LIQ-002:** Firelight, Upshift and future vaults must join through explicit adapters; ERC-4626
  similarity must not erase protocol-specific delayed exits.
- **R-LIQ-003:** Aggregation must never imply a guaranteed best route when route coverage, liquidity,
  provider health or private order flow is incomplete.

### 11. Bridges, messaging and OFTs

- **R-BRIDGE-001:** Expose a provider-neutral bridge intent and quote model covering source/destination
  network, asset representations, provider, mode, fees/gas currencies, amount received, approvals,
  ETA/range, security configuration and recoverability.
- **R-BRIDGE-002:** Support FXRP OFT discovery, peer/route validation, native fee quote, approval,
  send, LayerZero GUID tracking, DVN/executor state, destination delivery and compose result where
  available.
- **R-BRIDGE-003:** Support connected fungible-asset bridge adapters only after live route and asset
  qualification; a static catalogue listing is not sufficient.
- **R-BRIDGE-004:** OFT movement and liquidity-based bridging must remain distinguishable even when
  they share a widget or route comparison surface.
- **R-BRIDGE-005:** Destination gas, compose requirements, refund address, provider mode and route
  expiry must be visible before approval.
- **R-BRIDGE-006:** Partial success—such as source finality without destination execution—must retain
  message/provider identifiers and expose only provider-valid recovery/escalation actions.
- **R-BRIDGE-007:** The FAsset Redeem Composer route must continue into the normal FXRP redemption
  lifecycle; bridge delivery is not final XRP settlement.

### 12. Gasless transactions, relayers and payments

- **R-GAS-001:** Represent gasless execution as a relayer/sponsor capability with its own identity,
  policy, supported assets/actions/networks, fees, quotas, authentication and failure semantics.
- **R-GAS-002:** Support USD₮0 EIP-3009 authorization flows where deployed: typed authorization,
  nonce/deadline/domain validation, simulation, relay, canonical receipt and replay protection.
- **R-GAS-003:** Support FXRP gasless transfer only through an explicitly qualified custom
  forwarder/relayer path, including one-time allowance, signed request, allowlisted relay and exact
  trust disclosure.
- **R-GAS-004:** The product must not label FXRP as natively EIP-3009-capable or imply a one-step
  gasless path before the required approval exists.
- **R-GAS-005:** Account-abstraction sponsorship must be exposed only for wallet/provider/network
  combinations verified to support it at the time of use.
- **R-GAS-006:** Relayers must enforce target/function/asset/amount/nonce/deadline policy and be
  idempotent under duplicate requests.
- **R-GAS-007:** x402/payment-facilitator adapters may expose HTTP payment challenge, authorization,
  settlement and resource outcome as separate steps. A demo facilitator or mock token must be
  labelled accordingly.
- **R-GAS-008:** A relayed submission receipt must not be presented as the downstream resource or
  application outcome.

### 13. Portfolio, activity, indexer, analytics and explorer surfaces

- **R-DATA-001:** Expose a unified portfolio view across connected EVM/XRPL identities while keeping
  account, network, asset representation, source and freshness explicit.
- **R-DATA-002:** Portfolio data must include native/token balances, FXRP mint/redemption state,
  Smart Account balances/actions, bridge messages, vault positions, delegation/staking/reward state
  and pending operations where supported.
- **R-DATA-003:** Activity must be operation-centric and also expose the underlying chain/provider
  events. A multi-transaction journey must not be flattened into an unexplained single hash.
- **R-DATA-004:** Indexer adapters must declare covered events/blocks, confirmation policy,
  backfill/replay support, lag, schema version and known omissions.
- **R-DATA-005:** Direct RPC/contract reads, self-hosted indexers, managed indexers, analytics
  dashboards and explorers must remain distinct source classes.
- **R-DATA-006:** Analytics adapters must not be assumed to be runtime APIs because a dashboard or
  catalogue entry exists; schema, auth, quotas and freshness must be qualified.
- **R-DATA-007:** Explorer links must be generated from the operation's actual network and identifier,
  with support for separate C/P/X/XRPL/provider explorers where relevant.
- **R-DATA-008:** Reconciliation must tolerate indexer lag and compare indexed state to canonical
  chain/provider evidence before declaring finality.
- **R-DATA-009:** Hosts must be able to export activity and receipts without leaking wallet secrets,
  private FCC inputs or hidden policy data.

### 14. Governance, delegation, staking and rewards

- **R-GOV-001:** Support governance proposal discovery, type, state, vote-power/snapshot context,
  choices, quorum/result where available, delegation and voting.
- **R-GOV-002:** Historical proposal reads must expose archive/indexer requirements and unknown data
  rather than silently return incomplete state.
- **R-GOV-003:** Voting plans and approvals must show proposal, network, choice, voting power context,
  delegatee changes and transaction effect.
- **R-DEL-001:** Support native wrapping/unwrapping and FTSO vote-power delegation/undelegation with
  current delegate state and exact amounts/percentages.
- **R-REWARD-001:** Support reward discovery and claim flows with reward type, epoch, proof/source,
  expiry rules, recipient, fees and final receipt.
- **R-REWARD-002:** Delegation-reward expiry, non-expiring staking rewards and rNat locked/unlocked or
  penalty semantics must not be collapsed into one generic claim state.
- **R-STAKE-001:** Support validator discovery and C↔P-chain staking/delegation preflight, including
  time bounds, minimums, validator state, hardware/external signing and required chain transfers.
- **R-STAKE-002:** The operation must model C→P export/import, stake/delegate lock, expiry and P→C
  return/reward stages as one durable journey with multiple transaction identifiers.
- **R-STAKE-003:** Locked duration, irreversible boundary and return path must be visible before
  signing.
- **R-LEGACY-001:** FlareDrop may appear only as historical claim capability where a live unclaimed
  entitlement actually exists; the product must state that new distributions ended on 2026-01-30.
  Evidence anchor: [network participation inventory](../wiki/capability-inventory.md#network-participation-jobs).

### 15. Flare Confidential Compute

FCC is a separate confidential-compute domain inside the application layer. It is not a boolean
option added to ordinary operations.

- **R-FCC-001:** Expose an FCC capability/deployment descriptor with chain, extension ID, supported
  operations, instruction-sender contract, state verifier, code hashes/platforms, machine identity,
  attestation/production status, proxy path, result retention and version compatibility.
- **R-FCC-002:** Keep on-chain instruction and direct proxy actions as distinct authorization paths.
  The selected path and its trust/consensus implications must be visible in plans and receipts.
- **R-FCC-003:** Settlement-affecting outcomes must use the on-chain/provider-authorized instruction
  path unless a later accepted domain specification proves an equally bounded authority model.
- **R-FCC-004:** Sensitive inputs must be encrypted client-side to a qualified TEE identity before
  crossing public or untrusted transport. Plaintext on-chain instructions are never confidential.
- **R-FCC-005:** Direct requests must authenticate the user/application independently of a proxy API
  key. A claimed address or shared API key is transport access, not wallet authority.
- **R-FCC-006:** Result tracking must preserve action ID, submission tag, operation type/command,
  terminal/transient status, chain/application domain, machine/provider signatures and retention
  deadline.
- **R-FCC-007:** Onchain result consumption must independently bind the expected action/instruction,
  application/chain/contract, operation semantics, beneficiary, asset/amount limit, deadline,
  evidence/policy commitment and one-use replay state.
- **R-FCC-008:** Confidential results must reveal the minimum bounded decision required for the public
  outcome. Secret inputs must not be copied into public calldata merely because the result is signed.
- **R-FCC-009:** Every FCC operation must declare its state model: stateless, sealed/persisted,
  event-reconstructible or replicated. Machine selection/replacement and restart recovery must be
  specified before the operation can custody or control value.
- **R-FCC-010:** Simulation/local-TEE, Coston2-connected simulation, test attestation and production
  hardware-attested execution must be distinct capability statuses and visual labels. `production`
  requires evidenced `MODE=0`, enabled bootstrap attestation verification with pinned code hash,
  platform, debug state, secure boot and freshness, and a registered code hash matching the image
  exercised. Those controls are mandatory evidence for a production or hardware-attested claim, not
  for an honestly labelled simulation, testnet or attested-test execution. Evidence anchor:
  [FCC live deployment traps](../wiki/fcc.md#live-deployment-traps).
- **R-FCC-011:** The product's compatible FCC runtime must follow a validated release graph. The
  scaffold-pinned dependency set is the current research baseline; unaligned repository heads must
  not be combined without signing-compatibility verification. Evidence anchor:
  [FCC version alignment](../wiki/fcc.md#version-alignment-is-a-hard-constraint).
- **R-FCC-012:** FCC operations must expose proxy/provider/TEE delays, transient statuses, result
  retention, duplicate/reordered delivery and safe re-query/recovery behavior.
- **R-FCC-013:** A confidential application may reuse the shared wallet, lifecycle, policy, receipt,
  widget and agent surfaces, but must supply a domain-specific request/result/settlement contract.
- **R-FCC-014:** The product must not claim FCC bounty fit until at least one operation requires
  private computation and consumes its bounded result in a meaningful onchain workflow.

### 16. Policy-constrained agents

- **R-AGENT-001:** Agent tools must be generated from or delegate to the same typed operation
  contracts used by headless and human-facing clients.
- **R-AGENT-002:** Read/discover tools require no signer by default and must return provenance,
  freshness and uncertainty.
- **R-AGENT-003:** Quote/plan/simulate tools must return unsigned, expiring artifacts. They must not
  imply execution permission.
- **R-AGENT-004:** Value-changing tools must pass a deterministic policy gate and either obtain
  interactive wallet confirmation or use a pre-granted, narrow, revocable session capability.
- **R-AGENT-005:** Policies must be able to constrain account, network, asset, cumulative/single
  amount, target, function/action, provider/route, slippage, fee, destination, time window,
  expiration, frequency and whether FCC/direct/relayed execution is allowed.
- **R-AGENT-006:** Policy evaluation must return a structured allow, deny or approval-required result
  with rule IDs and reasons; an LLM may not override it.
- **R-AGENT-007:** Material re-quote or plan changes must trigger policy re-evaluation and renewed
  human approval when the existing grant no longer covers the action.
- **R-AGENT-008:** Agent execution must be idempotent, auditable and linked to the originating natural
  language request only as context—not as the authority record.
- **R-AGENT-009:** External proofs, route data, API responses and XRPL fields must remain typed,
  validated inputs; they must not be trusted because an LLM interpreted them.
- **R-AGENT-010:** Raw unrestricted private keys must not be required by the production agent API.
  Server-held signing, if supported, requires authenticated tenants, scoped key policy, secret
  isolation, revocation, spend controls and separate operational acceptance.
- **R-AGENT-011:** Agents must be able to track, resume and present recovery options without receiving
  permission to choose a new value-moving recovery action outside policy.
- **R-AGENT-012:** Agent receipts must include policy/approval evidence, tool and schema version,
  operation ID and the same chain/provider evidence returned to human clients.
- **R-AGENT-013:** The agent surface must cover every capability family whose underlying operation is
  supported. A family may expose read/plan tools before write tools, but this limitation must be
  explicit rather than implemented through fake write actions.
- **R-AGENT-014:** Documentation skills and docs MCP remain read-only knowledge surfaces and must be
  distinguished from transaction tools.
- **R-AGENT-015:** Every delegated-signing mechanism must declare its enforcement class as
  cryptographically/onchain bound, wallet-session bound or service-policy bound. The class must be
  machine-readable in capability and policy descriptors and visible at grant time. Where the selected
  wallet, account module or network can bind the granted limits cryptographically, the product must
  prefer it. A service-policy-bound grant is permitted only when its declared bounds are enforced,
  revocable and audited; it must be labelled as service-enforced rather than cryptographically
  guaranteed.

### 17. Service and operator boundaries

Some complete journeys require continuous services. They are part of the product contract even when
the project does not operate a public managed instance.

- **R-SVC-001:** The kit must define self-hostable service contracts for operation persistence and
  reconciliation, FAsset/Smart Account execution, indexer access, gasless relaying, quote/provider
  proxying where credentials require it, policy/audit and FCC connectivity where used. In every FCC
  environment operated by the project, enclave-local signing, decrypt, result and configuration
  endpoints must be unreachable outside the measured boundary. Relay SSRF protection must remain
  enabled wherever the project operates a relay client.
- **R-SVC-002:** Each service must declare whether it is required, optional or replaceable for a
  capability and must expose health, version, network, backlog/lag and dependency status.
- **R-SVC-003:** A service that holds a funded or signing key must have explicit key role, target and
  spend policy, balance monitoring, rotation, pause, audit and incident recovery.
- **R-SVC-004:** Queue workers must be durable, idempotent and safe under at-least-once delivery.
  Dequeue/crash must not silently lose a money-moving job.
- **R-SVC-005:** Indexers must support replay/backfill and schema migration. Webhooks/watchers alone
  are insufficient sources of history.
- **R-SVC-006:** Public/managed deployments are optional product offerings, not a prerequisite for
  the self-hostable kit. If offered, they require separate published environments, quotas, retention,
  support and service-level objectives.
- **R-SVC-007:** The complete kit must work with host-supplied providers and storage; it must not lock
  core operation semantics to a proprietary backend.
- **R-SVC-008:** Operator/admin actions must use separate authentication and authorization from
  end-user wallet actions.

### 18. Persistence, reconciliation and recovery

- **R-REC-001:** Durable operation storage must be pluggable and versioned. Browser-local persistence
  may support a single-user embed; multi-user or agent/server operation requires an appropriate
  server-side store.
- **R-REC-002:** Persisted records must exclude wallet secrets and plaintext confidential inputs.
- **R-REC-003:** Resume must begin by revalidating network, account, capability/provider status,
  quote/approval expiry and canonical evidence before attempting the next step.
- **R-REC-004:** Every capability must publish a recovery matrix mapping error/state to safe actions,
  actions that would duplicate value and cases requiring support/escalation.
- **R-REC-005:** Recovery actions that sign or broadcast must follow the same approval and agent policy
  requirements as primary execution.
- **R-REC-006:** The system must retain the original plan and every attempt. Recovery must append
  evidence rather than erase the failed path.
- **R-REC-007:** When canonical state cannot yet distinguish delayed, dropped or failed, the operation
  must remain unknown/pending with diagnostic evidence.
- **R-REC-008:** Persisted operation records must carry a schema version. An unrecognized version must
  be quarantined and surfaced for support rather than misinterpreted. Every stable release must either
  migrate records written by supported prior versions or publish a documented, tested resume path
  that cannot duplicate a value-moving effect; the compatibility ledger must state the minimum
  resumable record version. Migration evidence is owed when the kit is published with a stability
  claim, not at a milestone with no prior records to migrate.

### 19. Security, privacy and trust communication

- **R-SEC-001:** Validate chain ID, contract/provider identity, code/deployment evidence, account,
  nonce, amount, deadline, destination and response schema at every signing boundary.
- **R-SEC-002:** Untrusted token metadata, XRPL memos, FDC/Web2 data, provider text and explorer data
  must not become executable instructions or unsanitized UI/LLM content.
- **R-SEC-003:** Session capabilities and agent policies must be inspectable and revocable. Allowances,
  relayer grants and executor pins must expose every restriction/revocation mechanism the underlying
  system provides and disclose any limit that cannot be revoked.
- **R-SEC-004:** The UI must distinguish protocol risk, provider risk, route/liquidity risk, wallet
  authority, smart-contract approval, delegated-signing enforcement class, TEE assumptions and
  project-operated service trust.
- **R-SEC-005:** Sensitive configuration must have documented client/server boundaries and secret
  redaction. Logs, analytics, traces and receipts must use an allowlist of safe fields.
- **R-SEC-006:** Security-sensitive actions must support pause/deny controls without corrupting
  already-submitted operation history.
- **R-SEC-007:** Dependency and adapter provenance must be recorded so an operation receipt can state
  which implementation/version produced it.
- **R-SEC-008:** Production claims require threat modelling and tests appropriate to the authority
  held; example-source provenance is not a security endorsement.

### 20. Observability, analytics and support

- **R-OBS-001:** Every operation and step must carry a stable correlation ID across browser, service,
  provider and chain logs.
- **R-OBS-002:** Structured logs/metrics must cover operation counts, state duration, queue depth,
  retries, failures, recoveries, provider health, indexer lag and policy decisions without exposing
  secrets.
- **R-OBS-003:** Support diagnostics must be exportable by the user/host and include versions,
  networks, identifiers, timestamps and redacted errors.
- **R-OBS-004:** Product analytics must distinguish viewed, quoted, approved, submitted, succeeded,
  partially succeeded, recovered and abandoned operations. Submission is not conversion.
- **R-OBS-005:** Telemetry must be host-configurable and consent-aware; core functionality must not
  require undisclosed third-party tracking.
- **R-OBS-006:** Health/degradation information must flow into capability discovery and widgets rather
  than remain only in operator dashboards.

### 21. Documentation, compatibility and release quality

- **R-DOC-001:** Every capability must have conceptual guidance, integration reference, lifecycle
  diagram/state table, errors/recovery, authority/trust boundaries, network/provider matrix, and at
  least one real example.
- **R-DOC-002:** The product must publish separate quickstarts for widget, React, headless and agent
  integration, all pointing to the same operation semantics.
- **R-DOC-003:** Machine-readable schemas and tool descriptions must be versioned alongside human
  documentation.
- **R-DOC-004:** Breaking changes, deprecated capabilities and provider/network qualification changes
  must be recorded in a compatibility/release ledger.
- **R-DOC-005:** Examples must label mocks, simulations, testnets, public endpoints, self-hosted
  services and real deployments precisely.
- **R-DOC-006:** Documentation must state what the project built versus which Flare/provider
  foundations it reuses.
- **R-DOC-007:** The product must publish versioned machine-readable documentation and agent skills
  for capability discovery, operation semantics, safety boundaries and recovery. Documentation
  skills must not silently grant transaction authority.
- **R-DOC-008:** Normative requirements that embed dynamic upstream enumerations, dates, counts,
  addresses or versions must include a dated evidence anchor to the relevant wiki or pinned source so
  later refreshes can distinguish adopted product policy from facts that require requalification.
- **R-QUAL-001:** Unit tests must cover domain validation, exact arithmetic, lifecycle transitions,
  idempotency, policy and adapter conformance.
- **R-QUAL-002:** Integration tests must cover duplicate/out-of-order events, reorg/backfill,
  disconnect/reload, provider timeout, stale quote, rejected signature, partial success and every
  supported recovery action.
- **R-QUAL-003:** Supported capability claims require an end-to-end test on the declared environment
  using real protocol/provider behavior; mocked execution may test components but may not qualify
  support.
- **R-QUAL-004:** Widget tests must cover loading/progress/error/recovery, keyboard operation,
  responsive layouts, theme contrast and localization boundaries.
- **R-QUAL-005:** Agent tests must prove policy denial, approval renewal, idempotency, scoped execution,
  revocation and equivalence with the human/headless receipt.

## Acceptance Criteria

Acceptance follows the three-layer model above: the specification defines the complete contract; the
hackathon build proves every capability it claims supported on its declared environment; and
production or operated-service claims activate their claim-specific evidence. A sequence milestone
may meet a subset, but it must not be described as the complete product.

### A. Specification acceptance

- **AC-SPEC-001:** Every integration family in the canonical decision maps to explicit requirements
  and observable completion criteria here.
- **AC-SPEC-002:** The primary user, product job, goals, non-goals, authority model, service boundary,
  network policy, operation model, FCC role and success evidence are unambiguous enough to drive user
  stories without reopening product selection.
- **AC-SPEC-003:** No requirement uses implementation order, deadline pressure or provider
  uncertainty to remove an accepted capability family.
- **AC-SPEC-004:** Research facts, adopted product decisions, dynamic implementation facts and open
  business/architecture choices remain distinguishable through explicit decision labels and dated
  evidence anchors for dynamic upstream facts.
- **AC-SPEC-005:** The participant explicitly accepts this artifact before user stories and the
  product-surface map become canonical.
- **AC-SPEC-006:** Acceptance explicitly confirms the application-developer/product-team primary user,
  the secondary-user set and the quality/evidence standard; none may be inherited silently by stories.

### B. Cross-surface operation acceptance

- **AC-CORE-001:** A supported operation created through headless TypeScript, React, a widget or an
  agent produces the same canonical plan, state transitions, errors, recovery actions and receipt.
- **AC-CORE-002:** Reloading or restarting during a long-running test restores the operation from
  durable state and reconciles canonical evidence without duplicating payment or execution.
- **AC-CORE-003:** A stale/materially changed quote invalidates approval and cannot execute until the
  new terms are approved.
- **AC-CORE-004:** Duplicate events and retries do not duplicate value-changing effects.
- **AC-CORE-005:** A submitted-but-incomplete operation is never rendered or reported as succeeded.
- **AC-CORE-006:** A partial/recoverable operation identifies the value already moved, the actor that
  must act and at least one safe recovery or honest escalation path.
- **AC-CORE-007:** A structured receipt contains all relevant chain/provider identifiers, actual
  amounts/fees, approval/policy evidence, warnings and finality status.
- **AC-CORE-008:** Capability and provider unavailability is machine-readable and has an honest
  loading/degraded/unavailable UI—not a mock success path.
- **AC-CORE-009:** Read/discovery operations deduplicate and cancel redundant work, honor freshness
  rules, remain interactive while resolving and progressively render multi-source results.

### C. Capability-family acceptance

| Family | Observable done condition |
| --- | --- |
| Wallet/onboarding | Qualified EVM and XRPL adapters connect, restore, reject, switch and disconnect correctly; account/chain mismatch blocks signing; no secret enters kit storage/logs. |
| FAssets/FXRP | Real direct mint, delayed reuse-safe recovery, exact transfer/approval, redemption and proof-backed state-changing default are tracked end-to-end with correlated receipts on supported environments. |
| Smart Accounts | Personal Account discovery, a built-in action, `0xFF`, `0xFE`, executor tracking and each supported recovery control are exercised with backfilled receipts and honest public-data disclosure. |
| FDC | Every family discovered as current and nondeprecated for the selected deployment follows the shared status model: supported families have a validated typed request/proof contract, project-unimplemented families remain `planned` until delivery and `unavailable` is reserved for evidenced upstream absence. Deprecated families remain labelled; real supported examples traverse fee, round finality, proof and verification/consumption. |
| FTSO/data | Block-latency, scaling/proof, history, custom trust class, incentive and secure-random surfaces expose correct metadata, freshness and security flags. |
| Swap/liquidity | Qualified venue adapters return comparable transparent quotes; approval, stale quote, execution, actual output and vault delayed-exit lifecycles are verified. |
| Bridge/OFT | A real FXRP OFT path and each qualified bridge adapter track source, message/provider and destination outcomes, including partial destination recovery; Redeem Composer continues to XRP settlement. |
| Gasless/relayer | Real USD₮0 authorization and qualified FXRP-forwarder flows enforce nonce/deadline/policy, survive duplicates and distinguish relay receipt from application outcome; sponsorship is reported per adapter/network. |
| Portfolio/activity/data | Balances, positions, pending operations and receipts reconcile across direct reads and qualified indexers; coverage/lag is visible; explorers resolve to the correct networks. |
| Governance/delegation/rewards | Proposal/vote, WNat/delegation and differentiated reward claims are exercised with snapshot/epoch/expiry semantics and receipts. |
| Staking | A supported C↔P stake/delegate lifecycle models transfers, lock, expiry and return/reward with hardware/external signing constraints where used. |
| FCC | At least one genuine confidential domain executes through the validated FCC lifecycle, demonstrates encrypted input and minimal bounded output, declares attestation/state/trust status and consumes a replay-safe onchain result; every production/hardware-attested claim proves its qualification controls, while simulation/test execution is labelled honestly. |
| Agents | Every supported family has read/plan tools and only policy-qualified write tools; delegated authority exposes its enforcement class; denial, renewal, revocation, idempotency and receipt equivalence are demonstrated. |
| Widgets | Every supported family has a coherent composed experience exposing all applicable input, approval, progress, partial, error, recovery and receipt states under WCAG 2.2 AA. A generic operation renderer may cover long-tail operations within the family but may not replace its composed experience. |
| Services/operators | Required self-hosted executors/indexers/relayers/policy/FCC connectors expose health, durable queues, replay/backfill and explicit key authority; managed availability is claimed only where operated. |

### D. Complete release acceptance

- **AC-REL-001:** The compatibility catalogue contains every accepted family and at least one honest
  supported environment for each operation that can currently be exercised with available upstream
  infrastructure.
- **AC-REL-002:** Where upstream infrastructure is evidenced unavailable, the product ships the
  complete domain contract with `unavailable` status; project work not yet implemented is `planned`.
  No mock satisfies a support claim, and neither status removes the family from product scope.
- **AC-REL-003:** The full conformance suite passes across headless, React, widget, service and agent
  surfaces for every supported operation.
- **AC-REL-004:** Security, accessibility, compatibility, deployment provenance and new-work evidence
  are published with the release.
- **AC-REL-005:** The release can be integrated without a project-operated proprietary service, except
  where the host explicitly chooses a managed offering or an underlying protocol inherently requires
  an operator role that the host/provider supplies.
- **AC-REL-006:** The product is not called complete while an accepted family is `planned` or exists
  only as an empty placeholder, marketing copy or mocked action.
- **AC-REL-007:** All four Flare-family networks appear in the compatibility matrix. Every relevant
  operation actually deployed and qualifiable on a network is implemented there before that network
  is claimed supported; unavailable upstream capability is recorded rather than omitted for schedule.

### E. Production and operated-service claim acceptance

- **AC-CLAIM-001:** A production, managed-service, custody, production-FCC or delegated-authority
  claim identifies the exact environment and authority and supplies the operational/security evidence
  required by the corresponding requirements.
- **AC-CLAIM-002:** A build that does not make a production or operated-service claim does not owe that
  claim's certification evidence and must not use its label; the underlying product requirement
  remains normative for the complete product.
- **AC-CLAIM-003:** Production/hardware-attested FCC evidence includes the controls in `R-FCC-010`;
  project-operated FCC and relay services also satisfy the isolation/SSRF boundary in `R-SVC-001`.
- **AC-CLAIM-004:** A delegated-authority claim discloses and verifies the enforcement class in
  `R-AGENT-015`; service-enforced policy must never be presented as cryptographic enforcement.

## Success Measures

These measures evaluate the product after implementation without changing its scope:

| Dimension | Measure |
| --- | --- |
| Integration usefulness | A new integrator completes a real widget, React and headless integration from published docs without editing protocol internals. |
| Cross-surface consistency | Equivalent intents across human and agent clients produce schema-compatible plans, policies, state and receipts. |
| Experience coherence | Widgets from different capability families compose into one recognizable design and interaction system; long waits explain stage, actor, expected range and safe user action. |
| Read performance | Multi-source discovery and portfolio views remain interactive, deduplicate work and progressively return fresh qualified results rather than block on the slowest provider. |
| Lifecycle honesty | Success rate is measured at final outcome; partial, recovered, expired and abandoned operations remain separately visible. |
| Recovery | Supported injected failures can be resumed without duplicated payment, signing or broadcast. |
| Coverage | Every accepted family has a catalogue entry, requirements, conformance tests and an evidenced `planned`/`experimental`/`supported`/`degraded`/`unavailable`/`deprecated` matrix. |
| Safety | Policy and approval tests block account/chain/amount/target/provider mismatches and stale material terms. |
| Accessibility | Kit-controlled widget surfaces pass automated and manual WCAG 2.2 AA checks for their declared interaction paths. |
| Operational clarity | Every required service reports health, lag/backlog, version and authority; public versus self-hosted versus managed status is unambiguous. |
| Flare dependence | Demonstrated outcomes materially use Flare protocols/assets/data/confidential compute rather than generic EVM wrappers. |
| Evidence | Every claim links to implementation version, environment, deployment/provider evidence and a reproducible test or receipt. |

Numeric adoption, latency, uptime and cost targets require a later quality profile and service/SLA
decision. They must not be invented in this specification.

## Constraints

### Protocol and network constraints

- FAssets, FDC, Smart Accounts, vault exits, bridge/OFT delivery, staking and FCC contain unavoidable
  asynchronous waits and external actors.
- Protocol addresses, settings, fees, limits, feed metadata, proposal state and routes are dynamic.
- Current public FAsset product evidence is FXRP-focused; other FAssets cannot be assumed live.
- Public FDC/DA endpoints are rate-limited; production use may require self-hosting.
- No public managed production Smart Account/FAsset executor or universal Flare route service was
  established by the research.
- Network/provider support is asymmetric. The four Flare-family networks and connected chains cannot
  share one hardcoded feature matrix.

### External-provider constraints

- External bridge, swap, wallet, custody, RPC, indexer, analytics, explorer and sponsorship support
  can change independently of the kit.
- Static Flare catalogue entries do not prove live routes, liquidity, schemas, quotas, health or SLA.
- Credentialed provider calls may require a host backend or proxy even when the rest of an operation
  is browser-based.

### Authority and custody constraints

- Wallet confirmation is controlled by wallet UX and cannot be silently completed by a widget.
- Server-held signers, relayers, executors and FCC components introduce operational authority that
  requires policies, authentication, funding, monitoring and recovery.
- Agent policy is not equivalent to wallet cryptographic enforcement unless the delegated signing
  mechanism actually binds the stated limits.

### FCC constraints

- FCC is beta/operationally heavy and its current cloned repository heads are not a single compatible
  release set.
- Public custom-extension access, canonical deployments, indexer credentials and production TEE
  availability may require organizer/provider coordination.
- Direct proxy execution bypasses the on-chain/provider instruction path.
- FCC does not automatically provide durable private state, universal nonces or secret public result
  calldata.

### Project constraints

- The 53 official source repositories are research inputs and must remain untouched.
- Once implementation is authorized, new product work must live separately from the 53 pinned research
  repositories so prior art and new work remain auditable. This is an inherited provenance constraint,
  not a decision about the product repository's internal topology.
- Specification acceptance precedes user stories; accepted user stories precede the product-surface
  map; those precede visual design, architecture and implementation planning.
- The deadline may influence engineering sequence and evidence planning, but may not reduce this
  product definition.

## Derived Story Groups

The [comprehensive user-story artifact](../stories/2026-08-03-flare-application-layer.md) expands these
actors and jobs without changing the specification:

1. Developer evaluates capability/network/provider support.
2. Developer installs headless, React or widget integration and configures adapters.
3. Host customizes theme, locale, telemetry, route policy and storage.
4. User connects EVM, XRPL or both wallets and resolves account/network problems.
5. User acquires FXRP, survives delayed minting and receives a cross-system receipt.
6. User transfers/redeems FXRP and completes non-payment/default recovery.
7. XRPL user runs and recovers a built-in or custom Smart Account action.
8. Developer requests, tracks, verifies and consumes each FDC attestation class.
9. User/developer reads FTSO data, history, scaling proofs and secure randomness safely.
10. User compares and executes swaps, liquidity/vault actions and delayed withdrawals.
11. User compares bridges/OFT routes, tracks destination delivery and recovers partial outcomes.
12. User sends through a qualified gasless/relayer/payment authorization flow.
13. User views unified portfolio, pending operations, activity and explorer evidence.
14. User discovers/votes/delegates, wraps, claims rewards and understands expiry.
15. User stakes/delegates through the full C↔P lock and return lifecycle.
16. Confidential-app developer defines, submits, tracks and consumes a genuine FCC operation.
17. End user verifies FCC identity/attestation/privacy boundaries and recovers from delayed results.
18. Agent discovers, plans, requests approval, executes within policy and returns the same receipt.
19. Operator deploys and maintains executor, indexer, relayer, policy and FCC services.
20. Support operator diagnoses and safely resumes a stuck multi-system operation.

These remain the canonical story groups. Their actors, preconditions, happy paths, failure paths and
acceptance tests are defined in the linked user-story artifact, which must be accepted before the
product-surface map begins.

## Open Questions

These choices do not reopen product scope. They belong to the named later gates:

| Question | Owning gate |
| --- | --- |
| ~~Final product name and package namespace~~ | **Resolved 2026-08-03: `flare-kit`, scope `@flare-kit/*`, domain `flare-kit.xyz`. See `decisions/2026-08-03-product-name-and-domains.md`.** |
| License and public/private package boundary | Project setup/architecture |
| Exact package/repository topology and stable API names | Architecture/design document |
| Initial qualified wallet, DEX, bridge, RPC, indexer, relayer and explorer adapters | Implementation research/architecture |
| Whether the project will operate managed executor, relayer, indexer, policy or route services in addition to self-hostable versions | Business/operations decision |
| Service retention, quotas, pricing, support and SLA | Quality profile/business decision |
| Exact telemetry defaults and data processor choices | Quality/privacy profile |
| Final accessibility browser/assistive-technology support matrix beyond WCAG 2.2 AA | Quality profile |
| Exact FCC product domain, organizer access and target deployment/release graph | FCC domain specification and live-readiness gate |
| Visual direction, component composition and screen hierarchy | Product-surface map and design ownership |
| Engineering sequence and release milestones | Implementation plan after architecture |

No open question above authorizes removing a capability family.

## Source References

### Current authority and product definition

- [Canonical full-kit decision](../decisions/2026-08-03-full-flare-application-layer-scope.md)
- [Application-layer definition](../wiki/application-layer.md)
- [Knowledge-base routing](../wiki/index.md)

### Capability and operational reality

- [Capability inventory](../wiki/capability-inventory.md)
- [Ecosystem tools and network/provider boundaries](../wiki/ecosystem-tools.md)
- [FAssets, FXRP and Smart Accounts](../wiki/interoperable-assets.md)
- [Flare Confidential Compute](../wiki/fcc.md)
- [Platform map](../wiki/platform-map.md)
- [Official reference products and security baselines](../wiki/reference-products.md)

### Dated research and provenance

- [Application-layer reality research](../research/2026-07-24-flare-application-layer-reality.md)
- [Ecosystem-completeness audit](../research/2026-07-24-flare-ecosystem-completeness-audit.md)
- [Application-layer source addendum](../raw/2026-07-24-flare-application-layer-sources.md)
- [Ecosystem-completeness source addendum](../raw/2026-07-24-flare-ecosystem-completeness-sources.md)
- [Base source manifest](../raw/2026-07-22-flare-source-manifest.md)

This specification adopts product requirements from the current decision and treats dated research
as factual support. Provider/network values that can change must be requalified before implementation
and recorded in the compatibility matrix; that refresh cannot silently narrow the product.
