# Stories: Flare Application Layer

Date: 2026-08-03  
Status: accepted comprehensive story set after the local story-gate audit and bounded revisions.  
Acceptance: explicitly accepted by the participant on 2026-08-03 with instruction to continue to product-surface mapping; no further Claude Opus review is required.  
Canonical specification: [Flare Application Layer](../specs/2026-08-03-flare-application-layer.md).  
Canonical decision: [Full Flare Application Layer scope](../decisions/2026-08-03-full-flare-application-layer-scope.md).

## Purpose And Boundary

These stories translate the accepted product contract into independently testable user and system
behavior. They do not choose implementation sequence, package topology, providers, visual direction,
the first FCC application domain or managed-service ownership. A story may be delivered in a later
release, but it remains part of the complete product and must stay `planned` until implemented rather
than disappearing from scope.

The whole-application [product-surface map](../design/2026-08-03-product-surface-map.md) is accepted.
Visual-design ownership is assigned to Claude Fable 5 through an external commission; visual
direction, architecture and implementation planning remain unresolved and must consume the accepted
map rather than infer screens or components directly from this story artifact.

## Actors

| Actor | Meaning in these stories |
| --- | --- |
| Application developer | The primary user integrating a Flare capability through headless TypeScript, React, widgets or agent tools. |
| Host product team | The team controlling brand, policies, providers, storage, telemetry and release claims. |
| End user | The XRP/Flare user connecting wallets, approving exact effects, tracking progress and recovering safely. |
| Wallet/custody integrator | The party supplying EVM/XRPL clients or signing authority through an adapter. |
| Provider integrator | A route, protocol, RPC, indexer, relayer, explorer, analytics or infrastructure provider exposing a qualified adapter. |
| Agent builder | The developer exposing read, plan and policy-constrained execution tools to an AI agent. |
| Infrastructure operator | The party self-hosting executors, indexers, relayers, policy/audit services or FCC components. |
| Support operator | The party diagnosing a durable operation and applying only documented safe recovery. |
| Release maintainer | The party qualifying support, publishing compatibility evidence and making release or operational claims. |

## Global Acceptance Rules

Every story inherits these rules:

1. A `supported` claim requires real end-to-end behavior on the declared environment. Mocks,
   simulations and placeholders may test components but may not qualify support.
2. Exact values use typed, non-floating-point representations. Submitted, pending, partial, failed,
   expired and recovered outcomes remain distinct.
3. Headless, React, widget, service and agent surfaces consume the same capability, plan, lifecycle,
   recovery and receipt semantics.
4. Project non-delivery is `planned`; `unavailable` requires dated evidence of upstream absence.
5. Signing or broadcasting against a *user's* account requires exact wallet approval or a narrow,
   revocable delegated grant. A quote, natural-language request or connected wallet is never
   authority over someone else's account by itself.
   Amended 2026-08-03: an agent may hold its own key and sign with it directly, bounded by that
   account's balance and configured limits. See
   `specs/2026-08-03-agent-cli-and-tool-surfaces.md` section A.
6. Long waits identify the stage, expected range, awaited actor and safe action available to the user.
7. Production, managed-service, custody, production-FCC and delegated-authority evidence is owed only
   when the release makes that exact claim. The underlying complete-product requirement remains.
8. No story authorizes edits to the 53 pinned research repositories, package scaffolding, deployment,
   credential creation, funding or value-moving activity.

## Traceability

The specification-acceptance gate represented by `AC-SPEC-001`, `AC-SPEC-002`, `AC-SPEC-003`,
`AC-SPEC-004`, `AC-SPEC-005` and `AC-SPEC-006` was satisfied before this artifact: the participant
explicitly accepted the reviewed specification and its user and quality model on 2026-08-03.

| Story group | Stories | Specification coverage |
| --- | --- | --- |
| Product discovery and integration | US-001–US-010, US-051 | Product catalogue, shared operation model, integration depths, discovery, wallet/provider foundations and cross-surface acceptance. |
| FAssets and Smart Accounts | US-011–US-020 | FXRP discovery/mint/transfer/redemption/default/operator behavior and XRPL-controlled account actions/recovery. |
| FDC, FTSO, swaps and liquidity | US-021–US-026 | External-data proofs, oracle data, swaps, vaults and delayed exits. |
| Bridges, gasless and payments | US-027–US-031 | Route comparison, FXRP OFT, partial delivery, relayers, sponsorship and x402 outcomes. |
| Portfolio and participation | US-032–US-038 | Portfolio/activity/indexers/explorers, governance, delegation, rewards, staking and historical FlareDrop. |
| Confidential compute | US-039–US-041 | FCC domain definition, private execution, attestation and production qualification. |
| Agents | US-042–US-044 | Shared read/plan tools, deterministic policy, delegated authority, recovery and receipt equivalence. |
| Services, support and release quality | US-045–US-050 | Self-hosting, durable operations, observability, documentation, conformance and claim qualification. |

## Product Discovery And Integration

## Story US-001: Evaluate capability and environment fit

As an application developer,  
I want to discover what the kit, selected network and configured providers actually support,  
so that I can choose a real integration without trusting stale marketing or losing unimplemented families.

### Preconditions

- The developer has selected a Flare-family or connected network context.
- The kit can load its capability, network and provider catalogues.

### Acceptance Criteria

- Every accepted family appears with operations, networks/assets, authority needs, providers,
  duration, fees, risk, recovery and integration-surface coverage.
- Each network/provider combination is labelled `planned`, `experimental`, `supported`, `degraded`,
  `unavailable` or `deprecated`, with reason and dated provenance.
- `planned` identifies project non-delivery; only evidenced upstream absence is `unavailable`.
- Current addresses and dynamic parameters are resolved and qualified for the selected environment;
  source/package/deployment/adapter/operated-service availability remain separate facts.
- Provider policies can filter choices without hiding identity, meaningful trust differences or the
  fact that only one route exists.

### Scenarios

**Scenario: project work is not mistaken for upstream absence**

Given a capability family is accepted but its adapter has not been implemented  
When the developer queries compatibility  
Then the family is returned as `planned` with project-delivery provenance  
And it is not omitted or reported as `unavailable`.

**Scenario: a stale deployment cannot authorize a write**

Given a recorded contract address does not match the selected chain or has no bytecode  
When the developer prepares a write  
Then preflight blocks the action and reports the failed deployment qualification.

### Traceability

`R-PROD-001`, `R-PROD-002`, `R-PROD-005`, `R-PROD-006`, `R-PROD-007`, `R-PROD-008`,
`R-PROD-009`, `R-DISC-001`, `R-DISC-002`, `R-DISC-003`, `R-DISC-004`, `R-DISC-005`,
`R-DISC-006`, `R-DISC-007`, `R-DISC-008`, `R-DISC-010`, `AC-CORE-008`, `AC-REL-001`,
`AC-REL-002`, `AC-REL-006`, `AC-REL-007`.

### Notes

The story selects no initial provider and defines no implementation priority.

## Story US-002: Integrate at the required depth

As an application developer,  
I want to add a capability through a widget, React primitives, headless TypeScript or agent tools,  
so that I can choose presentation depth without getting a different operation implementation.

### Preconditions

- The capability is present in the catalogue.
- Its surface coverage and browser/server compatibility are declared.

### Acceptance Criteria

- The headless contract exposes typed discover/read and applicable quote, plan, simulate, execute,
  resume, recover and receipt functions.
- React providers/hooks expose the same state without duplicate effects on rerender, remount or
  development-mode effect replay; SSR/hydration boundaries are documented.
- A supported family has explicit React and composed-widget coverage; a generic renderer may handle
  long-tail operations inside the family but may not replace its family experience.
- Widgets work as standalone embeds and composed host surfaces. Every value-changing widget exposes
  connect/input, preflight/quote, review, wallet approval, submitted/progress, success/receipt, error
  and recovery states, and the kit-controlled experience is responsive, keyboard-operable and WCAG
  2.2 AA.
- Hosts may replace presentation while preserving lifecycle and recovery behavior.
- Async progress is available through callbacks, subscriptions and resumable polling.

### Scenarios

**Scenario: equivalent surfaces produce one operation contract**

Given the same intent is prepared through headless TypeScript, a React hook and a widget  
When each reaches review  
Then each exposes schema-compatible plans, steps, approvals and expected receipts  
And no surface contains a private protocol implementation.

### Traceability

`R-PROD-003`, `R-PROD-004`, `R-HEAD-001`, `R-HEAD-002`, `R-HEAD-003`, `R-HEAD-004`,
`R-HEAD-005`, `R-REACT-001`, `R-REACT-002`, `R-REACT-003`, `R-REACT-004`, `R-REACT-005`,
`R-WIDGET-001`, `R-WIDGET-002`, `R-WIDGET-004`, `R-WIDGET-008`, `R-AGENT-001`, `R-DOC-002`,
`AC-CORE-001`, `AC-REL-003`.

### Notes

Package names and framework-specific APIs belong to architecture, not this story.

## Story US-003: Configure the host experience and boundaries

As a host product team,  
I want to configure theme, locale, providers, route policy, storage, telemetry and secret boundaries,  
so that the kit fits my product without forking protocol behavior or leaking sensitive data.

### Preconditions

- The host has chosen an integration depth.
- Required provider credentials and storage are supplied through appropriate boundaries.

### Acceptance Criteria

- Theme tokens, typography, spacing, radius, elevation and color mode are replaceable without
  changing operation logic; kit-controlled surfaces retain a coherent interaction vocabulary.
- Strings, dates, network names and assets are localizable while exact onchain values remain clear.
- Product events are documented and exclude secrets, unrestricted wallet data and confidential
  inputs; telemetry is consent-aware and optional to core operation.
- Provider credentials remain server-side or inside the appropriate wallet/service boundary and do
  not enter public records.
- Host-supplied providers and storage work without a proprietary project backend.
- External navigation and dependency on wallets, explorers, bridges or providers are visible.

### Scenarios

**Scenario: browser integration needs a secret-bearing provider**

Given a provider requires a private API credential  
When the host configures its adapter  
Then the kit requires an appropriate host proxy or server boundary  
And the credential never appears in browser telemetry, receipts or operation persistence.

### Traceability

`R-DISC-009`, `R-HEAD-002`, `R-HEAD-003`, `R-WIDGET-003`, `R-WIDGET-005`, `R-WIDGET-006`,
`R-WIDGET-007`, `R-WIDGET-009`, `R-DATA-009`, `R-OBS-005`, `R-SEC-005`, `R-SVC-007`,
`AC-REL-005`.

### Notes

Concrete visual direction and telemetry processors remain later-gate choices.

## Story US-004: Observe one canonical operation lifecycle

As an end user or consuming application,  
I want every multi-step action to expose the same exact operation language and honest state,  
so that I can understand what is happening across chains, providers and product surfaces.

### Preconditions

- A value-changing or multi-step intent has been created.

### Acceptance Criteria

- The operation contains exact intent, quote, immutable plan, approval, actor-owned steps, errors,
  recovery actions, receipt and provenance-bearing observations.
- Its stable operation ID is independent from transaction hashes and correlates all relevant chain,
  proof, message, provider and FCC identifiers.
- An application-supplied idempotency key prevents duplicate creation/submission within its authority
  domain.
- The canonical lifecycle vocabulary is preserved across surfaces, including distinct draft,
  discovery/quote/input/approval, execution/submission/confirmation, external wait, action-required,
  partial, success, failure, cancellation and expiry semantics.
- Headless, React, widget and agent clients expose the same state and step IDs.
- `submitted` is not shown as success; partial/action-required states explain what moved, what remains,
  the responsible actor and risk.

### Scenarios

**Scenario: a source transaction succeeds but the destination is pending**

Given the source effect is final and a provider or destination chain still must act  
When operation state is rendered  
Then it is `awaiting_external` or `partially_succeeded` as appropriate  
And it is never reported as `succeeded`.

### Traceability

`R-OP-001`, `R-OP-002`, `R-OP-003`, `R-OP-004`, `R-LIFE-001`, `R-LIFE-002`,
`R-LIFE-003`, `AC-CORE-001`, `AC-CORE-004`, `AC-CORE-005`.

### Notes

Simple reads may return observations directly, but still carry source and freshness.

## Story US-005: Review an exact action and renew changed consent

As an end user,  
I want to review the exact effect I am authorizing and be asked again when material terms change,  
so that a stale quote, wrong account or changed provider cannot use my earlier approval.

### Preconditions

- A canonical quote and plan exist.
- The selected wallet/account can inspect or approve the required action.

### Acceptance Criteria

- Review identifies account, chain, target/action, asset, exact or bounded amount, provider/route,
  fees, deadline, trust model, downstream effects and last reversible boundary.
- Wallet confirmation and agent approval payloads derive from the same decoded plan.
- A material change to output, total cost, slippage, target, provider, chain, asset, approval,
  deadline or trust invalidates prior approval.
- Account, chain or signer mismatch blocks execution instead of silently rebinding it.
- Cancellation is offered only when technically real and discloses residual funds or obligations.
- Available allowance, session, relayer and executor-grant revocation mechanisms are visible.

### Scenarios

**Scenario: quote changes after approval**

Given the user approved a plan  
And its output, fee or route changes materially  
When execution is attempted  
Then the operation returns to quote/review  
And a new approval is required before any value-changing action.

### Traceability

`R-OP-005`, `R-OP-006`, `R-OP-009`, `R-WALLET-005`, `R-WALLET-006`, `R-WALLET-007`,
`R-WALLET-008`, `R-SEC-001`, `R-SEC-003`, `R-SEC-004`, `AC-CORE-003`.

### Notes

Wallet-native confirmation presentation remains controlled by the wallet.

## Story US-006: Receive responsive reads and meaningful long-wait progress

As an end user,  
I want reads to resolve progressively and long operations to explain their wait,  
so that the product remains useful instead of freezing behind a spinner.

### Preconditions

- The view depends on one or more RPC, indexer, provider or protocol sources.

### Acceptance Criteria

- Reads batch compatible work, deduplicate concurrent requests, honor freshness rules and support
  cancellation.
- Multi-source results render progressively and interaction does not wait for the slowest source.
- Loading, degraded and unavailable sources remain distinguishable with provenance and staleness.
- A long wait shows the current stage, expected time range, awaited actor/system and what the user may
  safely do while waiting.
- An indeterminate indicator alone does not satisfy the supported experience.

### Scenarios

**Scenario: one portfolio provider is slow**

Given canonical balances and two indexer sources are requested  
And one indexer is delayed  
When the view resolves  
Then available qualified results render first with freshness  
And the slow provider remains a visible loading/degraded source without blocking interaction.

### Traceability

`R-HEAD-006`, `R-WIDGET-002`, `R-WIDGET-010`, `R-OBS-006`, `AC-CORE-008`, `AC-CORE-009`.

### Notes

Numeric latency and availability targets belong to the later quality profile.

## Story US-007: Restore and recover a durable operation safely

As an end user,  
I want a long-running operation to survive reloads, disconnects, duplicate events and restarts,  
so that recovery never asks me to repeat a payment whose outcome is merely unknown.

### Preconditions

- A durable store is configured for the selected client/service environment.
- The operation has at least one submitted or externally awaited step.

### Acceptance Criteria

- Reload/restart restores the original plan, every attempt and all correlation identifiers.
- Durable records exclude wallet secrets and plaintext confidential inputs.
- Resume revalidates network, account, capability/provider state, approval/quote expiry and canonical
  evidence before constructing another action.
- Duplicate/out-of-order events, reorgs, websocket loss and backfill do not duplicate value movement.
- Unknown delayed/dropped/failed outcomes remain pending with diagnostics until canonical evidence
  distinguishes them.
- Recovery matrices name safe actions, duplicate-value risks and support/escalation cases; any new
  signing/broadcast follows normal approval and policy.
- Unknown persisted schema versions are quarantined; stable releases migrate or safely resume the
  declared prior versions.

### Scenarios

**Scenario: the app reloads after payment but before proof execution**

Given the payment identifier is persisted and final execution is absent  
When the application restarts  
Then it backfills and reconciles the existing payment  
And it reuses eligible evidence or presents safe recovery  
And it never proposes a second payment by default.

### Traceability

`R-OP-007`, `R-OP-008`, `R-LIFE-004`, `R-LIFE-005`, `R-LIFE-006`, `R-REC-001`,
`R-REC-002`, `R-REC-003`, `R-REC-004`, `R-REC-005`, `R-REC-006`, `R-REC-007`, `R-REC-008`,
`AC-CORE-002`, `AC-CORE-004`, `AC-CORE-006`.

### Notes

Browser-local persistence is sufficient only for the single-user boundary declared by the host.

## Story US-008: Export a complete receipt and support bundle

As an end user or support operator,  
I want a human-readable and machine-readable record of what was requested and what actually happened,  
so that I can verify the outcome or diagnose it without exposing secrets.

### Preconditions

- An operation has reached any terminal, partial or support-relevant state.

### Acceptance Criteria

- The receipt reports requested versus actual outcome, fees, approvals/policies, timing, warnings,
  finality and every relevant chain/provider identifier.
- Receipt JSON is exportable and schema-versioned; human rendering preserves exact values.
- A redacted support bundle includes versions, networks, correlation IDs, timestamps and errors.
- Analytics distinguish viewed, quoted, approved, submitted, succeeded, partial, recovered and
  abandoned states; submission is not counted as conversion.
- Dependency/adapter provenance identifies the implementation version that produced the result.
- No wallet secret, private FCC input or hidden policy material enters the export.

### Scenarios

**Scenario: support investigates a partial cross-system operation**

Given the operation has one final source effect and one pending destination effect  
When the user exports diagnostics  
Then support receives both identifiers, actor ownership, versions and redacted errors  
And no sensitive input is present.

### Traceability

`R-OP-010`, `R-DATA-003`, `R-DATA-007`, `R-DATA-009`, `R-OBS-001`, `R-OBS-003`,
`R-OBS-004`, `R-SEC-005`, `R-SEC-007`, `AC-CORE-007`.

### Notes

This is a product receipt/support contract, not a promise that one universal explorer exists.

## Story US-009: Connect EVM and XRPL accounts

As an end user,  
I want to connect EVM, XRPL or both account contexts and recover from connection problems,  
so that cross-environment Flare journeys use the accounts I intended.

### Preconditions

- At least one qualified wallet adapter is configured for the selected environment.

### Acceptance Criteria

- The user can connect, reject, restore and disconnect EVM and XRPL sessions independently or
  together as the operation requires.
- Wrong network, unavailable wallet, account/chain change, hardware-wallet delay and session expiry
  are explicit recoverable states.
- A cross-environment operation shows which account controls each step.
- EVM account abstraction/Safe products are not confused with XRPL-controlled Flare Smart Accounts.
- Changing account or chain invalidates incompatible quotes, plans and approvals.

### Scenarios

**Scenario: account changes during a cross-chain plan**

Given an XRPL payment account and Flare recipient were included in an approved plan  
When either connected account changes  
Then execution is blocked  
And the operation requires revalidation and renewed approval.

### Traceability

`R-WALLET-001`, `R-WALLET-002`, `R-WALLET-008`, `R-WALLET-009`.

### Notes

The exact initial wallet list remains an implementation-qualification decision.

## Story US-010: Supply signing authority without leaking custody

As a wallet or custody integrator,  
I want to supply signing through a stable disclosed adapter,  
so that the host can support different custody models without the kit silently holding keys.

### Preconditions

- The adapter declares custody, recovery, sponsorship and supported transaction inspection.

### Acceptance Criteria

- External user-controlled wallets are the default authority model.
- Embedded, passkey, MPC, custodial and account-abstraction adapters disclose their custody and
  recovery boundaries before use.
- Seed phrases and raw private keys never enter kit logs, transport or persistence.
- Unsigned transaction inspection is available where the underlying format/verifier permits it.
- Untrusted metadata, memos, provider text, proofs and explorer data are validated/sanitized and
  never become executable instructions.

### Scenarios

**Scenario: an adapter attempts to pass a raw private key through kit configuration**

Given a host supplies a raw unrestricted key to a client-facing adapter  
When configuration is validated  
Then the kit rejects the unsafe boundary or requires an explicitly qualified server-held signer
contract  
And the key is never logged or persisted.

### Traceability

`R-WALLET-003`, `R-WALLET-004`, `R-WALLET-006`, `R-SEC-002`, `R-REC-002`.

### Notes

Server-held signing is covered separately by the agent/operator and claim-qualification stories.

## FAssets And Smart Accounts

## Story US-011: Discover and qualify an FAsset lifecycle

As an application developer,  
I want to discover current FAsset contracts, limits, queues and supported asset paths,  
so that I build against live qualified behavior rather than sample configuration.

### Preconditions

- A Flare-family network and underlying asset environment are selected.

### Acceptance Criteria

- Discovery returns Asset Manager/Core Vault addresses, asset and underlying network, fees,
  minimums, limits, pause/emergency state, queues, routing and executor options with provenance.
- Current public FXRP support is distinct from conceptual or configuration references to other
  FAssets; a new asset becomes supported only after deployment and end-to-end qualification.
- Conventional collateral-reservation minting is exposed only where the selected deployment still
  supports it and is labelled legacy/current accurately. A qualified path covers agent/collateral
  selection, reservation, exact underlying payment reference, FDC proof, state-changing execution
  and correlated receipt rather than stopping at discovery.
- Indexer-backed lifecycle data declares backfill coverage and omissions instead of fabricating a
  complete history.

### Scenarios

**Scenario: documentation names an asset that is not deployed**

Given a source configuration references a possible FAsset  
But no qualified deployment and end-to-end path exist  
When the developer queries support  
Then the asset is not presented as supported  
And the family remains represented with its honest status and evidence.

### Traceability

`R-FASSET-001`, `R-FASSET-005`, `R-FASSET-011`, `R-FASSET-013`.

### Notes

This story does not select a non-FXRP asset for implementation.

## Story US-012: Mint FXRP directly from XRP

As an XRP holder,  
I want to send one exact XRPL payment and follow it through proof and Flare execution,  
so that I receive FXRP with a complete cross-system receipt.

### Preconditions

- The direct-mint capability is supported for the selected networks.
- Current fees, limits, recipient and executor routing have passed preflight.

### Acceptance Criteria

- The plan shows the exact XRPL destination, amount, memo/tag, recipient, executor and applicable
  fees before wallet approval.
- The operation tracks XRPL submission/finality, FDC request/round/proof, executor/Flare execution,
  recipient credit and finality as separate steps.
- Minting Tag discovery/reservation/ownership and optional executor binding are supported where used;
  transfer/cooldown rules disclose that transfer changes recipient and clears executor.
- The final receipt correlates XRPL, FDC, Asset Manager, executor and recipient/Personal Account
  evidence.

### Scenarios

**Scenario: direct mint completes normally**

Given the user approves one valid XRPL payment  
When XRPL finality, FDC proof and Flare execution complete  
Then the operation becomes `succeeded` only after FXRP is credited under the declared finality rule  
And the receipt contains every cross-system identifier.

### Traceability

`R-FASSET-002`, `R-FASSET-004`, `R-FASSET-010`.

### Notes

A transaction hash alone is not the mint outcome.

## Story US-013: Recover a delayed direct mint without paying twice

As an XRP holder,  
I want a delayed direct mint to explain and reuse my existing payment/proof where possible,  
so that I do not send XRP twice while an executor or proof step is late.

### Preconditions

- The XRPL payment was submitted or finalized.
- FXRP credit is not yet canonically complete.

### Acceptance Criteria

- The operation remains `awaiting_external`, `action_required` or honestly unknown rather than
  failed/succeeded without evidence.
- The UI identifies whether FDC, an executor, Flare finality or another actor is awaited.
- Eligible recovery reuses the same XRPL payment and proof; the kit explicitly warns against a new
  payment.
- Any recovery transaction has exact preconditions, requires approval and appends to the original
  operation history.

### Scenarios

**Scenario: executor misses the normal mint window**

Given the payment and proof are valid but executor completion is delayed  
When the user resumes the operation  
Then the kit discovers the existing evidence and offers the protocol-valid delayed path  
And a second XRPL payment action is blocked.

### Traceability

`R-FASSET-003`, `R-OP-008`, `R-REC-003`, `R-REC-004`, `AC-CORE-006`.

### Notes

The story intentionally treats uncertainty as a state, not an error-copy shortcut.

## Story US-014: Transfer and approve FXRP exactly

As an FXRP holder,  
I want to inspect balances and make exact transfers or approvals,  
so that pause, balance and allowance conditions are clear before signing.

### Preconditions

- FXRP is supported on the selected network.
- The user's Flare account is connected.

### Acceptance Criteria

- Balance, pause state, recipient, exact amount, existing allowance and required approval are shown
  with current provenance.
- Insufficient balance/allowance and emergency pause block execution with typed recoverable errors.
- Approval defaults to the exact or bounded amount; any unlimited approval is a separate warned
  choice.
- Transfer and approval receipts report requested/actual values and transaction evidence.

### Scenarios

**Scenario: allowance is smaller than the requested downstream amount**

Given the user prepares an FXRP action that needs allowance  
When preflight finds insufficient allowance  
Then the plan inserts an exact approval step  
And it does not silently request unlimited approval.

### Traceability

`R-FASSET-006`, `R-SWAP-004`, `R-WALLET-005`.

### Notes

Downstream swap/bridge-specific terms remain in their own stories.

## Story US-015: Redeem FXRP to native XRP

As an FXRP holder,  
I want to redeem to an exact XRPL destination and track every agent obligation,  
so that completion means the XRP payments actually arrived.

### Preconditions

- Redemption preflight confirms minimums, queue state and destination encoding.
- The selected XRPL destination/tag is valid.

### Acceptance Criteria

- Review shows exact burn/request amount, XRP destination/tag, fees, timing and expected one-or-many
  agent obligations.
- The operation tracks request/burn, obligation creation, each XRP payment and final protocol
  completion independently.
- Partial payment does not become success; obligation-level status and evidence remain visible.
- The final receipt correlates the Flare request and every applicable XRPL payment.

### Scenarios

**Scenario: two agents owe redemption payments and one is late**

Given one obligation is paid and one remains outstanding  
When status is rendered  
Then the operation is partial/awaiting external with both obligations visible  
And it does not claim full XRP settlement.

### Traceability

`R-FASSET-007`, `R-FASSET-010`, `R-LIFE-003`.

### Notes

Redemption is complete only under the Asset Manager's declared lifecycle, not at burn submission.

## Story US-016: Complete proof-backed redemption default

As an FXRP redeemer,  
I want a non-payment path to prove absence and invoke the real default action,  
so that I receive the protocol-defined collateral compensation rather than a fake success message.

### Preconditions

- The relevant obligation and non-payment threshold/window are known.
- The required FDC nonexistence family is supported for the selected environment.

### Acceptance Criteria

- Recovery waits for the correct thresholds and builds the correct obligation-specific FDC request.
- A valid nonexistence proof is retrieved and verified under its proof-owner/consumption rules.
- The state-changing Asset Manager default/compensation path is invoked and canonically reconciled.
- Read-only proof verification is never presented as default or compensation.
- Collateral compensation and every proof/transaction identifier appear in the receipt.

### Scenarios

**Scenario: proof verifies but the default transaction has not run**

Given a valid non-payment proof exists  
When the verifier read succeeds  
Then the operation remains ready/action-required for the state-changing default  
And no compensation is reported until canonical state confirms it.

### Traceability

`R-FASSET-008`, `R-FASSET-009`, `R-FASSET-010`, `R-FDC-005`.

### Notes

This is the accepted correction to the misleading read-only default pattern found in prior examples.

## Story US-017: Operate FAsset infrastructure under separate authority

As an infrastructure operator,  
I want to expose agent-vault, collateral, Core Vault, liquidation, challenge, keeper and executor state through explicit adapters,  
so that consumer applications can observe operator health without receiving operator write authority.

### Preconditions

- The host has configured an operator adapter and separate operator authentication.

### Acceptance Criteria

- Operator state identifies role, network, contracts, health, balances, lag and provenance.
- Agent-vault, collateral, Core Vault, reward, liquidation, challenge, keeper and executor state and
  available operator actions remain distinct rather than collapsing into one generic health card.
- Operator writes require a separate authority profile and cannot be enabled by a consumer wallet
  session.
- Funded/signing roles have target/spend policy, monitoring, rotation, pause, audit and recovery.
- Public managed operation is not claimed unless the project actually operates and documents it.

### Scenarios

**Scenario: a consumer session requests an operator write**

Given a user wallet is connected to an FAsset widget  
When it attempts an agent-vault or keeper administrative action  
Then authorization is denied before signing  
And the operation identifies the missing operator authority class.

### Traceability

`R-FASSET-012`, `R-SVC-003`, `R-SVC-008`, `R-SEC-006`.

### Notes

This story defines an adapter/authority boundary, not a decision to operate a managed FAsset service.

## Story US-018: Discover and run a Smart Account built-in action

As an XRPL user,  
I want to discover my Personal Account and current built-in actions,  
so that I can use Flare capabilities without assuming a stale instruction list.

### Preconditions

- XRPL and selected Flare contexts are connected.
- The Smart Account deployment is qualified.

### Acceptance Criteria

- Discovery returns deterministic Personal Account address, activation/deployment state, balances,
  controller, memo nonce, executor pin and fee settings.
- Built-in instructions are discovered from the current deployment and may include qualified FXRP,
  Firelight and Upshift actions without hardcoding permanent availability.
- Executor options show availability, fee and trust status before selection/pinning.
- The plan shows XRPL payment, executor compensation, FDC/data delivery, Flare execution and
  downstream effect before approval.

### Scenarios

**Scenario: a documented built-in is absent from the selected deployment**

Given an older source mentions an instruction  
When runtime discovery does not qualify it  
Then the action is not offered as supported  
And the family/status record explains the deployment-specific result.

### Traceability

`R-SA-001`, `R-SA-002`, `R-SA-004`, `R-SA-006`.

### Notes

Built-in action selection does not define the implementation sequence.

## Story US-019: Execute a Smart Account custom batch honestly

As an XRPL user,  
I want to review and execute an atomic custom Flare batch through `0xFF` or `0xFE`,  
so that I understand its data-delivery and public-call consequences before paying on XRPL.

### Preconditions

- Arbitrary batched calls and the selected delivery mode are qualified.
- Every downstream call has passed target/effect validation.

### Acceptance Criteria

- The plan decodes every downstream call, exact XRPL payment, executor compensation, nonce, delivery
  mode, FDC step and expected Flare effect.
- `0xFF` inline and `0xFE` hash-only modes remain distinct.
- `0xFE` is described as off-XRPL payload delivery, not confidential compute; eventual public Flare
  calldata is disclosed.
- The receipt correlates XRPL payment, user-operation hash/data mode, FDC evidence, executor and all
  controller/Personal Account/downstream events.

### Scenarios

**Scenario: user selects `0xFE`**

Given a custom call payload uses hash-only XRPL delivery  
When the operation is reviewed  
Then the UI explains where the full payload is supplied  
And warns that eventual Flare calldata is public  
And never displays a confidentiality claim.

### Traceability

`R-SA-003`, `R-SA-004`, `R-SA-005`, `R-SA-010`.

### Notes

FCC is a separate domain and cannot be inferred from the delivery mode.

## Story US-020: Recover a stuck Smart Account instruction

As an XRPL user,  
I want a failed or delayed Smart Account action to show where my XRP is and which recovery is valid,  
so that I can restore progress without repeating payment or corrupting the memo nonce.

### Preconditions

- An XRPL payment/instruction was submitted.
- The expected Flare outcome is absent or failed.

### Acceptance Criteria

- Watchers backfill from a safe historical boundary and use explicit timeouts before classifying the
  operation.
- The product exposes qualified recovery instructions to ignore a failed memo, advance nonce,
  replace executor fee and pin/unpin executor with exact effects/preconditions.
- If XRP reached the Core Vault, its actual state is shown and duplicate payment is blocked.
- Recovery reuses the original correlated operation and requires normal approval.

### Scenarios

**Scenario: the event listener starts after the payment**

Given the XRPL payment predates the current watcher session  
When the user resumes the operation  
Then the watcher backfills from the safe boundary and finds existing evidence  
And it does not infer failure solely from a missing live event.

### Traceability

`R-SA-007`, `R-SA-008`, `R-SA-009`, `R-SA-010`.

### Notes

Recovery choices are protocol controls, not generic retry buttons.

## Data Protocols, Swaps And Liquidity

## Story US-021: Discover and complete an FDC attestation

As an application developer,  
I want to discover current FDC families and run a typed request through proof or consumption,  
so that external facts enter my product without a bespoke state machine or frozen family list.

### Preconditions

- A selected deployment, verifier and DA/proof provider are configured.
- The request source/body and proof owner are known.

### Acceptance Criteria

- Current nondeprecated attestation families are discovered/requalified from deployment documentation
  and verifier behavior; deprecated families remain labelled for compatibility.
- Project-unimplemented builders are `planned`; upstream absence alone may be `unavailable` with
  dated evidence; SDK convenience coverage is not treated as the full catalogue.
- The operation validates request/source, obtains fee, submits, waits for round/Relay finality,
  retrieves proof, verifies it and optionally consumes it.
- Request/response hashes, round, fee, proof owner, source, verifier/DA provider, finality and
  consumption transaction are exposed.
- FAssets, Smart Accounts and other domains reuse this lifecycle rather than copy it.

### Scenarios

**Scenario: the documented overview and attestation tree disagree**

Given deployment sources expose a different current family set than a dated overview  
When capability discovery runs  
Then the compatibility matrix records and resolves the discrepancy  
And the runtime-qualified set controls support.

### Traceability

`R-FDC-001`, `R-FDC-002`, `R-FDC-003`, `R-FDC-004`, `R-FDC-005`, `R-FDC-008`.

### Notes

The pinned nine-family list is provenance, not permanent product truth.

## Story US-022: Handle FDC quota, timeout and no-proof outcomes honestly

As an application developer or end user,  
I want FDC waits and provider limits to remain visible and recoverable,  
so that timeout or nondeterminism is not fabricated into a negative fact.

### Preconditions

- An FDC request is prepared or submitted.

### Acceptance Criteria

- Public endpoint quota, provider identity and expected finalization range are visible before submit.
- Provider adapters and self-hosted endpoints preserve the same operation model.
- Timeout, consensus failure or nondeterministic Web2Json input produces no-proof/unknown state with
  diagnostics, not a false negative attestation.
- Requery/recovery does not duplicate fees or onchain consumption without explicit safe semantics.

### Scenarios

**Scenario: Web2Json voters cannot reach a deterministic result**

Given the request was accepted but consensus does not finalize a proof  
When the operation reaches its observation timeout  
Then it remains no-proof/unknown with provider and round evidence  
And downstream code cannot treat the absence as a verified false statement.

### Traceability

`R-FDC-006`, `R-FDC-007`, `R-LIFE-006`.

### Notes

Provider outage and protocol-level no-proof remain distinct causes.

## Story US-023: Read qualified FTSO feeds, history and proofs

As an application developer or end user,  
I want current and historical FTSO observations with metadata and trust context,  
so that prices and risk inputs are usable without losing source, decimals or freshness.

### Preconditions

- The selected network and feed/provider catalogue are available.

### Acceptance Criteria

- Discovery identifies block-latency and scaling feeds with feed IDs, decimals, timestamps/rounds,
  source and staleness.
- Historical queries disclose provider retention and missing ranges.
- Scaling proof retrieval/verification is distinguishable from direct block-latency reads.
- Feed adapters are discovered/configured without implying the kit maintains or auto-refreshes an
  upstream release-candidate adapter.
- Custom feeds identify their updater, availability and distinct trust class.
- Qualified custom-feed configuration exposes the feed ID/metadata, updater authority, update
  source/frequency, selected environment and availability/trust warning before activation.
- Every price/risk observation delivered to quotes, widgets or agents preserves units, confidence
  and security metadata.

### Scenarios

**Scenario: history provider lacks an old range**

Given the user requests a time range outside provider retention  
When results are returned  
Then the missing interval and provider boundary are explicit  
And the product does not interpolate or claim complete history.

### Traceability

`R-FTSO-001`, `R-FTSO-002`, `R-FTSO-003`, `R-FTSO-004`, `R-FTSO-005`, `R-FTSO-008`.

### Notes

This story defines data semantics, not a trading recommendation.

## Story US-024: Use Fast Update incentives and secure randomness

As an application developer or policy-constrained agent,  
I want to inspect Fast Update incentives and require secure randomness,  
so that specialized FTSO actions preserve their limited effect and security flag.

### Preconditions

- The selected deployment exposes the relevant FTSO capabilities.

### Acceptance Criteria

- Fast Update incentive discovery reports fee, eligible feed/effect, submission requirements and
  limited duration before approval.
- Incentive submission is tracked to canonical outcome with a receipt.
- Secure random reads expose value, timestamp and `isSecure`.
- Host/agent policy can reject a random observation unless `isSecure == true`.

### Scenarios

**Scenario: policy requires secure randomness**

Given an application policy requires `isSecure == true`  
When a random observation returns `false`  
Then the value is returned with provenance but is rejected for the protected action  
And the policy result explains the failed security condition.

### Traceability

`R-FTSO-006`, `R-FTSO-007`, `R-AGENT-006`.

### Notes

The story does not infer security from value presence alone.

## Story US-025: Compare, approve and execute a swap

As an end user,  
I want to compare qualified Flare swap routes and approve one transparent plan,  
so that I understand venue, price impact, allowance and actual outcome.

### Preconditions

- At least one live venue adapter is qualified for the asset pair/network.

### Acceptance Criteria

- Quotes expose exact-in/exact-out semantics, venue/path/pool, output, fees, gas, price impact,
  slippage, deadline, allowance, freshness and provider identity.
- Multiple routes are compared deterministically under host/user policy; a single route is labelled
  as such and no guaranteed-best claim is made with incomplete coverage.
- Balance, allowance and simulation checks run before signing where supported.
- Exact/bounded approval is default; stale quote or material state change returns to approval.
- Receipt reports quoted versus actual amounts, fees, slippage, venue/path, approvals and transaction
  evidence.

### Scenarios

**Scenario: a quote expires at the wallet step**

Given the selected route expires before signature  
When the wallet returns control  
Then execution is blocked and the operation returns to quoting  
And changed terms require renewed approval.

### Traceability

`R-SWAP-001`, `R-SWAP-002`, `R-SWAP-003`, `R-SWAP-004`, `R-SWAP-005`, `R-SWAP-006`,
`R-LIQ-003`.

### Notes

Route aggregation never erases venue-specific trust or recovery.

## Story US-026: Enter and exit a liquidity or vault position

As an end user,  
I want to understand deposit, shares, locks and delayed withdrawal stages for a selected vault,  
so that an asynchronous exit is not represented as an instant ERC-4626 withdrawal.

### Preconditions

- A Firelight, Upshift or other qualified vault adapter is configured.

### Acceptance Criteria

- Preflight exposes deposit asset, expected shares/position, fees, locks/epochs, withdrawal liquidity
  and protocol-specific trust.
- Deposit, position, withdrawal request, waiting period and claim are distinct durable steps.
- Firelight, Upshift and future vaults use explicit adapters; normalized share semantics do not erase
  delayed-exit behavior.
- Failures and recovery identify whether the position, withdrawal request or claim already exists.

### Scenarios

**Scenario: withdrawal requires a later claim**

Given the user submits a valid withdrawal request  
When the protocol enters its waiting epoch  
Then the operation becomes `awaiting_external` with expected range and claim conditions  
And it is not reported as withdrawn until assets are canonically received.

### Traceability

`R-LIQ-001`, `R-LIQ-002`, `R-LIQ-003`, `R-WIDGET-010`.

### Notes

The specific first vault adapters remain an implementation decision.

## Bridges, Gasless Execution And Payments

## Story US-027: Compare a qualified bridge route

As an end user,  
I want to compare qualified routes across networks and asset representations,  
so that I can choose with visibility into fees, security and recovery.

### Preconditions

- Source/destination networks and asset representations are selected.

### Acceptance Criteria

- Quotes show provider, mode, source/destination representation, amount received, fee/gas currencies,
  approvals, ETA/range, security configuration and recoverability.
- Static catalogue presence never qualifies a route; live assets, peers and provider behavior must
  pass current checks.
- OFT movement and liquidity-based bridging remain visibly distinct.
- Destination gas, compose needs, refund address, provider mode and expiry are visible before
  approval.

### Scenarios

**Scenario: a catalogue route has no live asset path**

Given a bridge is listed in ecosystem metadata  
But current qualification finds no valid asset route  
When quotes are requested  
Then no supported quote is fabricated  
And the provider/network result reports its honest status and evidence.

### Traceability

`R-BRIDGE-001`, `R-BRIDGE-003`, `R-BRIDGE-004`, `R-BRIDGE-005`.

### Notes

The story makes no universal-best-bridge claim.

## Story US-028: Move FXRP through OFT and recover destination failure

As an FXRP holder,  
I want to track an OFT movement from source approval through destination/compose outcome,  
so that source finality is never mistaken for destination completion.

### Preconditions

- The FXRP OFT peer/route and messaging security configuration are qualified.

### Acceptance Criteria

- The operation validates peer/route, quotes native fee, handles approval/send and records the
  LayerZero GUID, DVN/executor state, destination delivery and compose result.
- Source-final/destination-pending is partial or awaiting external with provider-valid recovery or
  escalation only.
- Refund/retry actions bind the original message and cannot duplicate source transfer.
- A Redeem Composer route continues into normal FXRP redemption; destination bridge delivery is not
  final native-XRP settlement.

### Scenarios

**Scenario: message is delivered but compose fails**

Given the OFT arrives on the destination and compose does not complete  
When status reconciles  
Then the receipt preserves source hash, GUID, destination evidence and compose error  
And offers only the messaging/provider's valid recovery path.

### Traceability

`R-BRIDGE-002`, `R-BRIDGE-006`, `R-BRIDGE-007`, `AC-CORE-006`.

### Notes

Messaging finality, compose outcome and XRP settlement are three different outcomes.

## Story US-029: Relay a USD₮0 authorization safely

As an end user without the native gas currency,  
I want to authorize a qualified USD₮0 action and track relay plus application outcome,  
so that replay protection and final result remain visible.

### Preconditions

- USD₮0 EIP-3009 is deployed and qualified for the selected network/action.
- A relayer capability with identity, policy, fees and quota is available.

### Acceptance Criteria

- The typed authorization binds domain, account, target/action, exact amount, nonce and deadline.
- Simulation and relayer policy run before signing.
- Duplicate relay requests are idempotent and cannot reuse the authorization for another effect.
- Relay acceptance and canonical downstream transaction/application outcome remain separate states
  and identifiers.

### Scenarios

**Scenario: the same authorization is submitted twice**

Given one valid authorization has already been accepted  
When a duplicate request reaches the relayer  
Then policy/idempotency returns the existing outcome or rejects replay  
And no duplicate value transfer occurs.

### Traceability

`R-GAS-001`, `R-GAS-002`, `R-GAS-006`, `R-GAS-008`.

### Notes

Relayer success is not application success.

## Story US-030: Use a qualified FXRP gasless path

As an FXRP holder without FLR,  
I want to understand and use an explicit forwarder/relayer path,  
so that the product does not pretend FXRP has native one-step EIP-3009 support.

### Preconditions

- A custom forwarder/relayer is deployed and qualified for the exact network/action.

### Acceptance Criteria

- The flow discloses the custom trust model, one-time allowance, signed request, allowlisted relay,
  fee/quota and target/function/asset/amount policy.
- The required approval is a separate visible step and cannot be hidden as native FXRP behavior.
- Account-abstraction sponsorship appears only for currently qualified wallet/provider/network
  combinations.
- Duplicate requests are replay-safe and receipts separate approval, relay and application outcome.

### Scenarios

**Scenario: no prior forwarder allowance exists**

Given the user has FXRP but no qualified allowance  
When gasless transfer is planned  
Then the operation shows the required approval and its gas/authority implication  
And it does not advertise a one-step gasless transfer.

### Traceability

`R-GAS-003`, `R-GAS-004`, `R-GAS-005`, `R-GAS-006`.

### Notes

The first forwarder/relayer implementation is not selected here.

## Story US-031: Complete an HTTP payment and resource outcome

As an application developer or end user,  
I want an x402/payment-facilitator journey to separate challenge, authorization, settlement and resource delivery,  
so that payment submission is not misreported as receiving the purchased result.

### Preconditions

- A qualified payment-facilitator adapter and resource endpoint are configured.

### Acceptance Criteria

- HTTP challenge, authorization terms, settlement submission, canonical payment outcome and resource
  outcome are separate correlated steps.
- Demo facilitators, mock tokens and test resources are labelled precisely.
- A settled payment with failed resource delivery becomes partial/action-required with provider-valid
  recovery or support evidence.
- The receipt includes both payment and resource identifiers/outcomes.

### Scenarios

**Scenario: settlement succeeds but the resource request fails**

Given payment is canonically settled  
When the resource endpoint returns an error  
Then the operation is not marked fully succeeded  
And it identifies the paid amount, failed resource outcome and valid retry/support path.

### Traceability

`R-GAS-007`, `R-GAS-008`, `R-LIFE-003`.

### Notes

The kit does not infer batch settlement or resource delivery from a facilitator acknowledgment.

## Portfolio And Network Participation

## Story US-032: View a unified but provenance-preserving portfolio

As an end user,  
I want one view of my EVM/XRPL assets, positions and pending operations,  
so that I can understand my Flare activity without losing account, network or freshness context.

### Preconditions

- One or more EVM/XRPL identities are connected or supplied read-only.

### Acceptance Criteria

- Portfolio entries keep account, network, asset representation, source and freshness explicit.
- Qualified coverage includes native/token balances, FXRP mint/redemption, Smart Accounts, bridge
  messages, vault positions, governance/delegation/staking/rewards and pending operations.
- Multiple sources resolve progressively and identify unavailable/lagging coverage.
- Export excludes wallet secrets, plaintext confidential data and hidden policies.

### Scenarios

**Scenario: an indexer lags behind a direct balance read**

Given direct canonical state and indexed portfolio state disagree due to lag  
When the view renders  
Then both sources and timestamps are visible  
And the product does not overwrite the canonical result with stale indexed state.

### Traceability

`R-DATA-001`, `R-DATA-002`, `R-DATA-009`, `R-HEAD-006`.

### Notes

Unified presentation does not merge distinct account or asset authorities.

## Story US-033: Inspect operation-centric activity and evidence

As an end user or support operator,  
I want activity grouped by product operation with its underlying chain/provider events,  
so that a multi-transaction journey is explainable and verifiable.

### Preconditions

- Direct reads and/or qualified data adapters are configured.

### Acceptance Criteria

- Activity groups hashes, messages, proofs and provider jobs under a durable operation without
  flattening them into one unexplained transaction.
- Indexer adapters disclose covered events/blocks, confirmation, backfill/replay, lag, schema and
  known omissions.
- Direct RPC/contract, self-hosted indexer, managed indexer, dashboard/analytics and explorer sources
  remain distinct classes.
- Analytics/dashboard presence is not treated as a runtime API without schema/auth/quota/freshness
  qualification.
- Explorer links resolve from the actual C/P/X/XRPL/provider identifier and network.
- Finality is reconciled against canonical evidence rather than indexer status alone.

### Scenarios

**Scenario: a managed indexer says complete before destination evidence exists**

Given indexed activity reports a completed bridge  
But canonical destination state is absent  
When reconciliation runs  
Then the operation remains pending/partial  
And the indexed observation is retained with lag/provenance rather than treated as finality.

### Traceability

`R-DATA-003`, `R-DATA-004`, `R-DATA-005`, `R-DATA-006`, `R-DATA-007`, `R-DATA-008`.

### Notes

This story does not require one universal indexer.

## Story US-034: Discover and vote on governance proposals

As a Flare participant,  
I want to inspect proposal state and cast an exact vote,  
so that snapshot context, choices and transaction effect are clear.

### Preconditions

- A governance deployment and account are qualified for the selected network.

### Acceptance Criteria

- Proposal discovery exposes type, state, choices, vote-power/snapshot context, quorum/result and
  delegation where available.
- Historical reads disclose archive/indexer requirements and unknown ranges.
- Vote review binds proposal, network, choice, voting-power context, delegatee changes and exact
  transaction effect.
- Expired/closed proposals block voting with their canonical state rather than a generic failure.

### Scenarios

**Scenario: historical proposal data is incomplete**

Given the configured provider lacks the proposal's snapshot range  
When the user opens its history  
Then unknown data and archive requirements are shown  
And the product does not render an inferred complete result.

### Traceability

`R-GOV-001`, `R-GOV-002`, `R-GOV-003`.

### Notes

Governance provider selection remains implementation-specific.

## Story US-035: Wrap and delegate vote power

As a Flare participant,  
I want to wrap or unwrap native value and manage FTSO delegation exactly,  
so that my current delegate state and changed vote power are visible.

### Preconditions

- WNat and delegation contracts are qualified on the selected network.

### Acceptance Criteria

- The user can inspect native/WNat balances, current delegate state and exact delegated amounts or
  percentages.
- Wrap, unwrap, delegate and undelegate plans show resulting balances/authority before approval.
- Material state change invalidates stale delegation plans.
- Receipts distinguish wrapping from delegation effects and include canonical evidence.

### Scenarios

**Scenario: delegate state changes before signing**

Given the user reviewed an undelegation plan  
And canonical delegate state changes  
When execution is attempted  
Then preflight invalidates the stale plan and requires refreshed review.

### Traceability

`R-DEL-001`, `R-OP-006`, `R-OP-010`.

### Notes

The story does not collapse token wrapping and vote-power delegation into one action.

## Story US-036: Discover and claim differentiated rewards

As a Flare participant,  
I want reward claims to preserve type, epoch, expiry and lock semantics,  
so that I know what can expire and what state the claim produces.

### Preconditions

- A qualified reward source/proof and eligible recipient are available.

### Acceptance Criteria

- Discovery reports reward type, epoch, proof/source, recipient, fees, expiry and current eligibility.
- Delegation-reward expiry, non-expiring staking rewards and rNat locked/unlocked/penalty semantics
  remain distinct.
- Claim review shows exact recipient and effect before approval.
- Receipt records claimed amount/type/epoch, fees and canonical finality.

### Scenarios

**Scenario: one reward expires while another does not**

Given a user has an expired delegation reward and an eligible staking reward  
When claims are displayed  
Then the first is labelled expired with its rule  
And the second remains claimable without inheriting the expiry state.

### Traceability

`R-REWARD-001`, `R-REWARD-002`.

### Notes

Reward families share operation semantics, not one generic lifecycle.

## Story US-037: Stake or delegate through the C↔P-chain lifecycle

As a Flare participant,  
I want one durable stake/delegation journey across C and P chains,  
so that transfers, lock, expiry and return are understandable before I commit value.

### Preconditions

- A validator and stake/delegate capability are qualified.
- Required hardware/external signing is available.

### Acceptance Criteria

- Preflight exposes validator state, minimums, start/end bounds, lock duration, irreversible
  boundary, signing requirements and return path.
- The operation tracks C→P export/import, stake/delegate lock, expiry and P→C return/reward with all
  transaction identifiers.
- A submitted stake remains confirming/locked as appropriate; it is not shown as fully returned.
- Resume survives long lock duration and reconciles chain-specific evidence.

### Scenarios

**Scenario: user reloads during the lock period**

Given stake activation is final and expiry is in the future  
When the product is reopened  
Then it restores the operation as locked/awaiting external with return conditions  
And it does not propose another stake transaction.

### Traceability

`R-STAKE-001`, `R-STAKE-002`, `R-STAKE-003`, `R-LIFE-004`.

### Notes

P-chain signing constraints are not abstracted into a generic EVM transaction.

## Story US-038: Present FlareDrop only as historical capability

As a Flare user,  
I want any FlareDrop surface to state its concluded distribution status,  
so that historical entitlement is not marketed as an accruing reward.

### Preconditions

- A live unclaimed historical entitlement can be proven for the selected account/environment.

### Acceptance Criteria

- The product states that new FlareDrop distributions ended on 2026-01-30.
- A claim action appears only when a live entitlement and supported claim path exist.
- No copy implies continuing accrual or a new distribution.
- Unsupported/historical reads remain labelled with dated evidence.

### Scenarios

**Scenario: user has no live unclaimed entitlement**

Given the distribution has concluded and no entitlement remains  
When the user views rewards  
Then no active FlareDrop claim is offered  
And historical information is clearly distinguished from current rewards.

### Traceability

`R-LEGACY-001`, `R-PROD-008`.

### Notes

This story preserves historical accuracy; it does not revive the programme.

## Confidential Compute

## Story US-039: Define and qualify a genuine FCC domain

As a confidential-application developer,  
I want to define a domain-specific private computation and qualify its FCC deployment,  
so that confidential compute is structurally necessary rather than added for a label.

### Preconditions

- A candidate operation genuinely requires a secret input or private computation.
- The domain defines a bounded public outcome and settlement contract.

### Acceptance Criteria

- The capability descriptor identifies chain, extension, operations, instruction sender, verifier,
  compatible code hashes/platforms, machine identity, status, proxy path, retention and release graph.
- Onchain instruction and direct proxy paths remain distinct with visible authority/consensus tradeoffs.
- Settlement-affecting outcomes use the provider/onchain-authorized path unless a later accepted
  domain specification proves equal bounds.
- The operation declares stateless, sealed/persisted, event-reconstructible or replicated state and
  specifies restart/machine replacement before it controls value.
- Shared wallet, lifecycle, policy, receipt, widget and agent surfaces are reused, while the domain
  supplies its own request/result/settlement contract.
- FCC bounty fit is claimed only when private computation is meaningful and its bounded result is
  consumed onchain.

### Scenarios

**Scenario: candidate operation merely hides data before publishing it unchanged**

Given a proposed FCC flow copies the full secret into public settlement calldata  
When domain qualification is reviewed  
Then it fails the private-computation/product-fit criterion  
And the application cannot claim meaningful FCC use.

### Traceability

`R-FCC-001`, `R-FCC-002`, `R-FCC-003`, `R-FCC-009`, `R-FCC-011`, `R-FCC-013`,
`R-FCC-014`.

### Notes

The exact FCC product domain remains a later accepted domain-specification choice.

## Story US-040: Execute and consume a bounded confidential result

As an end user of a confidential application,  
I want my secret input encrypted to a qualified TEE and only a minimal bound result consumed onchain,  
so that transport access is not mistaken for identity and public settlement does not reveal the secret.

### Preconditions

- The FCC domain and deployment status are qualified.
- The user/application has an authenticated authority path independent of a shared proxy API key.

### Acceptance Criteria

- Sensitive inputs are encrypted client-side to the qualified machine/TEE identity before crossing
  public or untrusted transport.
- Direct requests authenticate the user/application independently of API transport access.
- Result tracking preserves action ID, tag, command, status, domain, signatures and retention deadline.
- Onchain consumption independently binds action/instruction, chain/application/contract, semantics,
  beneficiary, asset/amount bound, deadline, policy/evidence commitment and one-use replay state.
- Public output contains only the minimum bounded decision required for settlement.
- Delays, transient statuses, duplicate/reordered delivery and retention expiry have safe requery or
  recovery behavior.

### Scenarios

**Scenario: the same signed result is submitted twice**

Given one bounded FCC result has already been consumed  
When an identical action/result is submitted again  
Then one-use replay state rejects the second settlement  
And the original operation remains the canonical receipt.

### Traceability

`R-FCC-004`, `R-FCC-005`, `R-FCC-006`, `R-FCC-007`, `R-FCC-008`, `R-FCC-012`.

### Notes

Encryption does not hide calldata that the settlement intentionally publishes.

## Story US-041: Verify FCC status without overstating production

As an end user or release maintainer,  
I want FCC simulation, test attestation and production hardware status to be visibly distinct,  
so that I can understand what trust claim the current environment actually supports.

### Preconditions

- An FCC build/deployment is available for qualification.

### Acceptance Criteria

- Simulation/local TEE, Coston2-connected simulation, test attestation and production
  hardware-attested execution use distinct capability statuses and labels.
- A production/hardware claim proves `MODE=0`, bootstrap attestation verification, pinned code hash,
  platform, debug state, secure boot, freshness and registered hash/image match.
- Project-operated FCC environments keep enclave-local signing/decrypt/result/config endpoints inside
  the measured boundary; operated relay clients preserve SSRF protection.
- Honestly labelled simulation/test execution does not owe production certification evidence and
  cannot use the production label.

### Scenarios

**Scenario: test attestation succeeds without production controls**

Given an attested test environment lacks one or more production qualification controls  
When its capability is published  
Then it remains test-attested with the exact missing controls visible  
And it is not promoted to production.

### Traceability

`R-FCC-010`, `R-SVC-001`, `AC-CLAIM-002`, `AC-CLAIM-003`.

### Notes

The requirement protects claim truthfulness without forcing production claims onto the hackathon build.

## Policy-Constrained Agents

## Story US-042: Let an agent discover and plan without signing authority

Scope note, added 2026-08-03: this story covers the **signer-free** path only, in which read,
discovery, quote, plan and simulation tools work with no key configured. It is one supported mode,
not a ceiling. An agent holding its own key executes directly; see
`specs/2026-08-03-agent-cli-and-tool-surfaces.md` section A and the companion tool catalogue.

As an agent builder,  
I want read, discovery, quote, plan and simulation tools over the shared operation contracts,  
so that an agent can reason about Flare before any key is configured.

### Preconditions

- One or more capability families expose agent-surface coverage.

### Acceptance Criteria

- Agent tools delegate to the same typed domain operations as human/headless clients.
- Read/discover tools require no signer by default and return provenance, freshness and uncertainty.
- Quote/plan/simulate results are unsigned, expiring artifacts and never imply execution permission.
- External proofs, route data, APIs and XRPL fields remain typed validated inputs rather than trusted
  natural-language context.
- Every supported family has declared read/plan coverage; limitations remain explicit.
- Documentation skills/docs MCP are visibly read-only and distinct from transaction tools.

### Scenarios

**Scenario: an LLM asks a documentation tool to transfer value**

Given the tool is declared read-only documentation  
When an agent supplies a value-changing instruction  
Then no operation is signed or broadcast  
And the response directs the agent to the separate policy/approval tool boundary.

### Traceability

`R-AGENT-001`, `R-AGENT-002`, `R-AGENT-003`, `R-AGENT-009`, `R-AGENT-013`,
`R-AGENT-014`.

### Notes

Natural language provides context, never the authority record. Amended 2026-08-03: this is an
evidence-recording rule about what a receipt attributes authorization to, namely the signature and
the policy evaluation. It is not a restriction on what an agent may execute.

## Story US-043: Execute an agent action within deterministic policy

As an end user or host product team,  
I want agent execution constrained by inspectable policy and exact approval,  
so that an LLM cannot expand account, amount, route or action authority.

### Preconditions

- A canonical plan exists.
- A deterministic policy engine and wallet or delegated session mechanism are configured.

### Acceptance Criteria

- Policy can constrain account, network, asset, single/cumulative amount, target/action, provider,
  slippage, fee, destination, time, expiration, frequency and FCC/direct/relayed execution.
- Evaluation returns structured allow, deny or approval-required with rule IDs/reasons; the LLM cannot
  override it.
- A value-changing action receives interactive wallet confirmation or a narrow, revocable grant.
- Material re-quote/plan change reruns policy and obtains renewed approval when outside the grant.
- Execution is idempotent and audit-linked to the originating request as context only.
- Production agent APIs do not require raw unrestricted private keys; any server signer meets its
  separate operational acceptance with authenticated tenants, scoped key/target/spend policy, secret
  isolation, revocation and audit.

### Scenarios

**Scenario: route changes outside an agent grant**

Given a grant allows one provider and bounded fee  
When re-quoting selects another provider or exceeds the fee bound  
Then policy returns deny or approval-required  
And the agent cannot execute using the earlier grant.

### Traceability

`R-AGENT-004`, `R-AGENT-005`, `R-AGENT-006`, `R-AGENT-007`, `R-AGENT-008`,
`R-AGENT-010`, `R-SEC-001`, `R-SEC-003`.

### Notes

The policy engine is deterministic even when an LLM proposed the intent.

## Story US-044: Disclose delegated enforcement and return equivalent recovery

As an end user,  
I want to know how an agent grant is enforced and receive the same tracking, recovery and receipt as a human client,  
so that service policy is not presented as cryptographic protection.

### Preconditions

- A delegated-signing mechanism or interactive approval path is selected.

### Acceptance Criteria

- Grant-time UI and machine-readable descriptors classify enforcement as cryptographic/onchain,
  wallet-session or service-policy bound.
- The kit prefers cryptographic binding where the wallet/module/network supports the stated limits.
- Service-policy grants are enforced, revocable, audited and labelled service-enforced rather than
  cryptographically guaranteed.
- Agents can track/resume and present recovery, but cannot choose a new value-moving recovery outside
  policy.
- Agent receipts include policy/approval evidence, tool/schema version, operation ID and the same
  chain/provider evidence as human/headless clients.

### Scenarios

**Scenario: a service-enforced grant is displayed**

Given limits are checked only by a project/host policy service  
When the user reviews the grant  
Then the enforcement class is `service-policy bound`  
And the interface does not use language implying onchain or cryptographic guarantees.

### Traceability

`R-AGENT-011`, `R-AGENT-012`, `R-AGENT-015`, `R-SEC-004`, `AC-CLAIM-004`.

### Notes

Agent receipt equivalence is behavior equivalence, not identical presentation.

## Services, Support And Release Quality

## Story US-045: Self-host the services a capability requires

As an infrastructure operator,  
I want explicit self-hostable service contracts and health signals,  
so that the complete kit does not depend on an undisclosed proprietary backend.

### Preconditions

- A capability declares one or more continuous-service dependencies.

### Acceptance Criteria

- Contracts exist for applicable persistence/reconciliation, FAsset/Smart Account execution,
  indexer, relayer, credential proxy, policy/audit and FCC connectivity roles.
- Each service declares required/optional/replaceable status, health, version, network, backlog/lag
  and dependency state.
- Host-supplied providers/storage are supported without changing core operation semantics.
- Operator/admin authentication is distinct from end-user wallet authority.
- Managed public availability remains an optional offering and is claimed only with published
  environment, quota, retention, support and service-level evidence.

### Scenarios

**Scenario: host replaces the default operation store**

Given a compatible host storage adapter is configured  
When operations are created and resumed  
Then lifecycle semantics and receipts remain schema-compatible  
And no project-operated backend is required solely for persistence.

### Traceability

`R-SVC-001`, `R-SVC-002`, `R-SVC-006`, `R-SVC-007`, `R-SVC-008`, `AC-REL-005`.

### Notes

This story defines self-hostability, not a managed-service business decision.

## Story US-046: Run durable keyed services without losing or duplicating work

As an infrastructure operator,  
I want durable queues, replayable indexers and explicit key authority,  
so that crashes and at-least-once delivery do not lose or duplicate money-moving jobs.

### Preconditions

- The service holds a queue, index or funded/signing role.

### Acceptance Criteria

- Funded/signing services declare key role, allowed targets, spend policy, balance monitoring,
  rotation, pause, audit and incident recovery.
- Queue workers are durable/idempotent under at-least-once delivery; dequeue/crash cannot silently
  lose a job.
- Indexers support historical replay/backfill and schema migration; watchers/webhooks are not treated
  as full history.
- Metrics expose queue depth, retries, failures, provider health and indexer lag without secrets.

### Scenarios

**Scenario: worker crashes after submission but before acknowledgment**

Given a value-changing request was submitted and the worker crashes before queue acknowledgment  
When the message is delivered again  
Then idempotency reconciles the existing submission  
And no duplicate transaction or payment is created.

### Traceability

`R-SVC-003`, `R-SVC-004`, `R-SVC-005`, `R-OBS-002`.

### Notes

Specific queue, database and key-management technologies belong to architecture.

## Story US-047: Diagnose and safely resume a stuck operation

As a support operator,  
I want to find an operation from any known correlation identifier and see only valid recovery actions,  
so that support can help without guessing, erasing evidence or obtaining the user's authority.

### Preconditions

- The user/host supplies an operation ID, transaction hash, proof/message/provider ID or redacted
  support bundle.

### Acceptance Criteria

- Search resolves the durable operation and actor-owned steps across browser/service/provider/chain
  evidence.
- Diagnostics show versions, networks, timestamps, provider health, indexer lag, canonical evidence,
  attempts and redacted typed errors.
- Recovery options state preconditions, whether value moved, whether signing is required, duplicate
  risk and next expected state.
- Support cannot execute a user value-changing recovery without normal wallet/policy approval.
- Prior failed paths remain append-only evidence.

### Scenarios

**Scenario: support has only a LayerZero GUID**

Given the user supplies a GUID from a partial bridge  
When support searches diagnostics  
Then the corresponding operation, source and destination steps are returned  
And only provider-valid recovery/escalation is offered.

### Traceability

`R-OBS-001`, `R-OBS-003`, `R-OBS-006`, `R-REC-004`, `R-REC-005`, `R-REC-006`,
`R-SEC-006`.

### Notes

Support visibility is not signing authority.

## Story US-048: Publish privacy-aware observability and trust state

As a host product team,  
I want operational analytics and risk/degradation signals without secret leakage,  
so that reliability can improve while users understand the authorities they rely on.

### Preconditions

- Host telemetry and health adapters are configured.

### Acceptance Criteria

- Structured logs/metrics cover operation state duration, retries, recoveries, queue/provider/indexer
  health and policy decisions using an allowlist of safe fields.
- Health/degradation flows into discovery and widgets, not only operator dashboards.
- UI distinguishes protocol, provider, route/liquidity, wallet, approval, delegated-enforcement, TEE
  and project-operated-service trust.
- Telemetry is configurable and consent-aware; core operation does not depend on hidden tracking.
- Security-sensitive pause/deny preserves already-submitted history and recovery evidence.

### Scenarios

**Scenario: a provider degrades during quote discovery**

Given provider health crosses the configured degradation threshold  
When users request routes  
Then the provider is labelled degraded in discovery/UX with provenance  
And existing submitted operations retain their history and valid recovery.

### Traceability

`R-OBS-002`, `R-OBS-005`, `R-OBS-006`, `R-SEC-004`, `R-SEC-005`, `R-SEC-006`.

### Notes

Exact telemetry defaults and processors belong to the quality/privacy profile.

## Story US-049: Integrate from truthful versioned documentation

As an application developer or agent builder,  
I want human and machine-readable documentation for every capability and integration depth,  
so that I can build and recover without relying on hidden project knowledge.

### Preconditions

- A capability is included in a release catalogue.

### Acceptance Criteria

- Each capability documents concepts, integration reference, lifecycle/state, errors/recovery,
  authority/trust, network/provider matrix and a real example.
- Widget, React, headless and agent quickstarts point to the same operation semantics.
- Machine schemas/tool descriptions and agent skills are versioned with human documentation and do
  not grant transaction authority.
- Compatibility ledger records breaking/deprecated/provider/network changes.
- Examples label mock, simulation, testnet, public endpoint, self-hosted and real deployment status.
- Documentation distinguishes project-built work from reused Flare/provider foundations.
- Dynamic upstream facts carry dated evidence anchors.

### Scenarios

**Scenario: an example uses simulated execution**

Given an example completes against a simulator  
When it is published  
Then its environment and non-support-qualifying status are explicit  
And it is not presented as a real supported deployment.

### Traceability

`R-DOC-001`, `R-DOC-002`, `R-DOC-003`, `R-DOC-004`, `R-DOC-005`, `R-DOC-006`,
`R-DOC-007`, `R-DOC-008`.

### Notes

Documentation is part of product completeness, not post-release polish.

## Story US-050: Qualify a release and every public claim

As a release maintainer,  
I want conformance evidence tied to exact environments and authority claims,  
so that the product can be ambitious without calling mocks, partial coverage or test controls complete.

### Preconditions

- A release candidate, catalogue and declared claim set exist.

### Acceptance Criteria

- Unit tests cover validation, exact arithmetic, lifecycle, idempotency, policy and adapter contracts.
- Integration tests cover duplicate/out-of-order/reorg/backfill, disconnect/reload, provider timeout,
  stale quote, rejected signature, partial success and every supported recovery.
- Every supported operation passes real end-to-end qualification on its declared environment across
  applicable headless, React, widget, service and agent surfaces.
- Widget tests cover all lifecycle states, keyboard, responsive layout, theme contrast and locale;
  kit-controlled UI meets WCAG 2.2 AA.
- Agent tests prove denial, renewed approval, idempotency, scope, revocation and receipt equivalence.
- Every production claim includes a threat model and tests proportionate to the exact authority held;
  example-source provenance is never treated as a security endorsement.
- The complete release contains every family, no `planned` family/placeholder/mock, and published
  security/accessibility/compatibility/deployment/new-work evidence.
- Production/managed/custody/FCC/delegated claims identify exact environment/authority and supply
  corresponding evidence; a non-claiming build neither owes nor uses that label.

### Scenarios

**Scenario: one accepted family remains planned**

Given every implemented capability passes its tests  
But one accepted family remains `planned`  
When release claims are evaluated  
Then the milestone may describe its supported subset honestly  
And it may not call itself the complete product.

**Scenario: release makes a managed-service claim**

Given the project publicly claims to operate a managed relayer  
When claim acceptance runs  
Then the exact environment, authority, quota, retention, support, monitoring and relevant security
evidence are required.

### Traceability

`R-QUAL-001`, `R-QUAL-002`, `R-QUAL-003`, `R-QUAL-004`, `R-QUAL-005`, `R-WIDGET-004`, `R-SEC-008`,
`AC-REL-003`, `AC-REL-004`, `AC-CLAIM-001`, `AC-CLAIM-002`, `AC-CLAIM-003`,
`AC-CLAIM-004`.

### Notes

This story applies the three-layer acceptance model. It does not impose certification for claims the
release does not make, and it does not weaken any supported-behavior requirement.

## Story US-051: Expose a provider adapter without losing provider truth

As a provider integrator,  
I want to expose my route, protocol or infrastructure through a stable conformance contract,  
so that hosts can integrate it while my identity, availability, risk and recovery semantics remain visible.

### Preconditions

- The provider has a real supported job and one or more candidate network/asset combinations.
- Any credential-bearing calls have an appropriate server or operator boundary.

### Acceptance Criteria

- The adapter declares provider identity, supported jobs, networks/assets, maturity, authentication
  location, quote/status support, timeout/retry semantics, health and dated provenance.
- Quotes and normalized operations preserve provider-specific fees, steps, trust, expiry, quotas,
  failure and recovery rather than flattening them into generic success/failure.
- The compatibility matrix qualifies each provider/network/asset combination independently and
  distinguishes configured adapter availability from live upstream and project-operated service
  availability.
- Credentials never enter public operation records or telemetry.
- Adapter conformance tests cover schema validation, stale/changed responses, timeout, duplicate
  status delivery, degradation and recovery; a catalogue listing alone cannot qualify support.

### Scenarios

**Scenario: provider response changes incompatibly**

Given a previously qualified provider returns a response that fails the versioned adapter schema  
When discovery or quote normalization runs  
Then the combination becomes degraded or unavailable according to current evidence  
And the invalid response cannot authorize a plan or be reported as supported success.

### Traceability

`R-PROD-002`, `R-PROD-009`, `R-DISC-002`, `R-DISC-005`, `R-DISC-006`, `R-DISC-007`,
`R-DISC-008`, `R-DISC-009`, `R-DISC-010`, `R-QUAL-001`, `R-QUAL-002`, `R-QUAL-003`.

### Notes

This story defines provider conformance and truthfulness. It does not promise identical SLAs or
select the first providers to implement.

## Cross-Story Acceptance Paths

These paths verify that the stories form one application layer rather than isolated features.

### Path P-001: Human and agent equivalence

Given a supported operation can be created by a widget and an agent  
When both use equivalent intents and the same qualified environment  
Then their plans, policy effects, lifecycle states, recovery choices and receipts are schema-compatible  
And only their presentation/approval channel differs.

Traceability: `AC-CORE-001`, `AC-REL-003`.

### Path P-002: Reload during a multi-system wait

Given a value-changing source step is final and an external actor remains  
When the browser and reconciliation service restart  
Then the operation restores from durable state, backfills canonical evidence and continues without
duplicating payment, signature or broadcast.

Traceability: `AC-CORE-002`, `AC-CORE-004`, `AC-CORE-006`.

### Path P-003: Honest capability degradation

Given a supported provider becomes unhealthy while another source remains available  
When discovery and a composed widget refresh  
Then health flows into the compatibility state and UX, qualified results render progressively and
no planned/upstream-unavailable status is fabricated.

Traceability: `AC-CORE-008`, `AC-CORE-009`, `AC-REL-002`.

### Path P-004: Complete evidence from request to receipt

Given an operation crosses multiple chains or providers  
When it reaches final, partial or failed outcome  
Then the exported receipt contains actual amounts/fees, approval/policy evidence, warnings, finality,
all identifiers and implementation provenance without secrets.

Traceability: `AC-CORE-007`, `AC-REL-004`.

## Edge Cases Required Across Applicable Stories

- Wallet rejection, unavailable wallet, wrong chain/account, session expiry and hardware delay.
- Empty/invalid deployment, stale parameters, provider quota/rate limit, degraded provider and no
  qualified route.
- Quote expiry, material re-quote, insufficient balance/allowance, emergency pause and rejected
  signature.
- Duplicate/out-of-order events, reorg, websocket loss, process crash, historical backfill and
  persisted-schema mismatch.
- Source success with destination/provider/executor/TEE delay; partial irreversible value movement;
  result retention expiry; no canonical evidence yet.
- Recovery that reuses prior value versus recovery that would create a new payment/signature/broadcast.
- Untrusted metadata/proof/provider text, secret redaction, consent-disabled telemetry and hostile
  external links/content.
- Simulation/test/deprecated/planned/degraded/unavailable status and every production/operated claim
  boundary.
- Responsive, keyboard, contrast, localization and long-wait behavior for every kit-controlled
  family experience.

## Open Questions

The following specification-owned questions remain deliberately unanswered by the stories:

| Question | Owning later gate |
| --- | --- |
| Final name, package namespace and license | Product naming/project setup |
| Repository/package topology and stable APIs | Architecture/design document |
| Initial qualified wallet/provider/DEX/bridge/indexer/relayer/explorer adapters | Implementation research/architecture |
| Managed-service ownership, pricing, quota, retention and SLA | Business/operations and quality profile |
| Numeric performance/availability targets and telemetry defaults | Quality/privacy profile |
| Final browser and assistive-technology support matrix beyond WCAG 2.2 AA | Quality profile |
| Exact FCC product domain, deployment access and release graph | FCC domain specification/live-readiness |
| Screen hierarchy, component composition and visual direction | Product-surface map and design ownership |
| Engineering sequence and release milestones | Implementation plan after architecture |

None of these choices may remove an accepted family, weaken a story's supported behavior or turn a
mock into implementation evidence.

## Acceptance Gate

The participant accepted this artifact on 2026-08-03, confirming that:

1. it preserves the accepted primary and secondary actors;
2. all 20 story groups from the specification are represented by testable stories;
3. happy, failure, partial and recovery paths are sufficient to drive the product-surface map;
4. later-gate choices remain open without becoming scope loopholes; and
5. the quality/evidence boundary remains the one accepted in the specification.

The [product-surface map](../design/2026-08-03-product-surface-map.md) was subsequently accepted.
The Claude Fable 5 external direction return and Abu's taste decision are the current gate; story
and surface acceptance do not authorize architecture, implementation, deployment or value-moving
actions.
