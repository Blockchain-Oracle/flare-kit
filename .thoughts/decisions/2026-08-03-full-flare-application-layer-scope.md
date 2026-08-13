# Context Reconciliation: Full Flare Application Layer Scope

Date: 2026-08-03  
Status: canonical current product-direction and quality-standard decision; comprehensive product specification, audited user stories and whole-application product-surface map accepted.  
Current specification: [Flare Application Layer](../specs/2026-08-03-flare-application-layer.md).

## Snapshot

- **Objective:** define and build a comprehensive Flare-native application layer that makes the ecosystem's capabilities reusable across applications, embeds and agents.
- **Canonical authority:** the participant's 2026-08-03 correction and the full-kit intent in the original attached request.
- **Already established:** Flare has strong low-level contracts, SDKs, encoders, examples and operator software, but lacks one coherent application layer for orchestration, durable lifecycle state, recovery, reusable UI and safely bounded agent actions.
- **Active decision:** the product is the full kit. Its integration families are first-class parts of the product rather than discarded alternatives competing for one MVP slot.
- **Quality standard:** make the product as good as reasonably possible across experience, performance, reliability, security, recovery, maintainability and integration depth. Hackathon context affects sequence and evidence, never the quality ceiling.
- **Design ownership and direction:** Claude Fable 5 owns visual and interaction design through an external commission. No visual direction has yet been returned or accepted; Abu retains taste authority.
- **Superseded/history:** earlier candidate rankings and the recommendation to reduce the product to one FXRP proof journey are historical analysis, not current scope authority.
- **Conflicts or drift:** the July 24 audit handoff and prompt still contain research-only gates; they are optional supplemental audit material and do not block specification.
- **Genuine unknowns:** the accepted specification establishes the operation, provider, network, authority, service, recovery, widget, FCC and quality contracts. Final naming, concrete package topology, provider selection, managed-service ownership, FCC application domain and implementation order remain later-gate choices.
- **Next authorized action:** deliver the [external designer commission](../design/2026-08-03-designer-commission.md) and [paste-ready prompt](../design/2026-08-03-designer-agent-prompt.md) to Claude Fable 5, then audit the first direction return before Abu's taste decision.
- **Mutation safety:** context maintenance and user-story authoring may proceed. Implementation must wait for the remaining accepted product/design/architecture artifacts and implementation plan. No deadline-based scope reduction is authorized.

## Authority And Chronology

1. The initial July 22 research mapped Flare protocols, reference products and several separate hackathon ideas.
2. The July 24 application-layer research established the stronger product category: shared headless, React/widget and agent surfaces above Flare's existing foundations.
3. The July 24 completeness audit expanded the source corpus and refined existing-package and operator-service boundaries; it did not choose product scope.
4. The July 24 Claude audit prompt was created for an optional second opinion. It was not executed and is not a prerequisite for product specification.
5. On 2026-08-03, the participant explicitly rejected deadline-driven narrowing and confirmed that the intended product is the complete kit with all researched integration families represented.

The fifth item is the current product authority. Research continues to govern factual claims, but older recommendations do not override the adopted product intent.

## Active Product Decision

The accepted product direction is:

> A Flare-native application layer that turns FAssets, Smart Accounts, data protocols and external routes into consistent, recoverable operations, exposed through headless TypeScript, React integrations, embeddable widgets and policy-constrained agent tools.

The product is not a collection of unrelated demos. All surfaces share one typed operation vocabulary, lifecycle model, receipt model, provider-adapter boundary and authority policy.

### Product surfaces

- Headless TypeScript libraries and SDK APIs.
- React hooks and framework integrations.
- Styled, embeddable widgets and composed journeys with complete loading, progress, error and recovery states.
- Provider adapters for routes, wallets, indexers, relayers and external services.
- Agent/AI tools that expose the same underlying operations with explicit read, quote, simulate, approve, execute, track/recover and receipt stages.
- Machine-readable documentation and skills for both developers and agents.

### Integration families in product scope

- FAssets and FXRP acquisition, minting, transfer, redemption, default and recovery.
- XRPL-controlled Flare Smart Accounts, execution, receipts and recovery instructions.
- FDC request/proof workflows and FTSO data, fees, history and risk context.
- Wallet connectivity and onboarding across supported EVM/XRPL environments.
- Swaps, liquidity and transparent venue aggregation.
- Bridges, FXRP OFT and other supported external asset routes.
- Gasless transfers, relayer boundaries and sponsorship where technically supported.
- Portfolio, balance, activity, analytics, explorer and indexer-backed state.
- Governance, delegation, staking and rewards where supported by the selected networks and packages.
- Policy-constrained agent discovery, planning, execution and recovery across the same capability set.
- FCC/confidential-compute integration where it creates a genuine private operation; FCC is not required merely for a second bounty label.

No family above is removed merely because implementation must be sequenced. Sequencing is an engineering and release-order decision, not a change to product scope.

## Quality And Evidence Standard

The product must be built to the highest relevant standard we can reasonably achieve: outstanding
user experience, strong performance, deep and real integrations, dependable behavior, excellent
recovery, clean maintainable code, proportionate security and credible durability.

“Hackathon” is context, not a quality cap, scope reduction, excuse, exemption list or permission for
middle-ground work. It does not permit shallow widgets, brittle demo paths, fake success, buggy
declared support, misleading status, duplicate payment, silent authority, dishonest confidentiality
or avoidable loss of user value.

The boundary is materiality rather than labels such as “hackathon,” “production” or “enterprise.” A
technique belongs when it materially improves working behavior, user experience, correctness, user
funds or authority, performance, recoverability, maintainability, the shared reusable architecture,
future extensibility or the truthfulness of a claim. Serious or enterprise-grade engineering is
welcome and required when it passes that test. Work that adds operational, certification,
compliance or infrastructure controls for authority, services, environments or claims the project
does not hold—and adds no material product value—must not become performative overengineering.

Quality and evidence are judged at three distinct layers:

1. **Specification acceptance:** the complete intended product contract is coherent, testable and
   free of scope leaks. It may include requirements whose implementation evidence comes later.
2. **Hackathon implementation evidence:** every capability claimed supported in the submitted build
   works end to end on its declared environment with polished UX, real integrations, honest state,
   proportionate safety and no mocked success. Unimplemented families remain explicit product scope.
3. **Production or operated-service claims:** production, managed-service, custody, production-FCC or
   delegated-authority claims activate the operational and security evidence that makes that exact
   claim true. A build that does not make such a claim does not owe its certification evidence and
   may not use the label.

Requirements remain normative because they belong to the complete product. The relevant evidence
gate states when each must be demonstrated; it never deletes or weakens the requirement.

## Conflicts Resolved

### Deadline versus quality and scope

The hackathon deadline is submission metadata, not permission to make the product mediocre or redefine it as a single shallow integration. Future plans may sequence delivery, but they must preserve the complete product architecture and intended integration coverage.

### Complete kit versus one proof journey

The earlier recommendation to make one FXRP journey the product's effective scope is superseded. Individual end-to-end demonstrations may still validate modules, but no single demo defines or limits the product.

### Bounty framing versus product identity

Bounty 1 is a strong external fit for the application layer, but the bounty does not define the whole product. Bounty 2 is claimed only when FCC supplies a structurally necessary private computation. Neither bounty may silently narrow the platform specification.

### Research audit versus specification gate

The prepared Claude independent audit remains available for factual delta checking. It is not a current gate and its “do not specify” language applies only while executing that optional audit task.

## Specification Questions And Current Resolution

The [accepted comprehensive specification](../specs/2026-08-03-flare-application-layer.md) defines
the shared operation/state/receipt model, logical integration depths, adapter and capability discovery
rules, network qualification, wallet and agent authority, self-hostable service boundary,
persistence/recovery contract, widget quality contract, FCC domain boundary and acceptance standards.

Final product/package naming, concrete repository/package topology, exact provider choices,
project-operated managed services, the first FCC application domain and engineering sequence remain
later-gate decisions. None is a reason to restart broad ecosystem research or remove an integration
family. Sequence must not be misrepresented as permanent scope removal.

## Routing Or Gate Repairs

- The wiki index must route first to this decision.
- The application-layer page must describe the full kit as accepted product direction rather than provisional optional scope.
- The July 22 hackathon candidate strategy must be marked historical.
- The July 24 independent-audit handoff and prompt must be marked optional/superseded as current routing.
- The research log must record this reconciliation.

## Next Authorized Action

The [product-surface map](../design/2026-08-03-product-surface-map.md) derived from the [accepted comprehensive user stories](../stories/2026-08-03-flare-application-layer.md) is accepted. Visual-design ownership is resolved through the [Claude Fable 5 external commission](2026-08-03-visual-design-ownership.md). Deliver the commission, audit the first direction return, obtain Abu's taste acceptance, then establish the project quality profile, produce the architecture/design document and create the implementation plan.

Do not begin package scaffolding or UI implementation before the remaining product-surface, design, architecture and implementation-plan gates are satisfied.

## Evidence

- [Flare application-layer research](../wiki/application-layer.md)
- [Capability inventory](../wiki/capability-inventory.md)
- [Ecosystem tools](../wiki/ecosystem-tools.md)
- [Application-layer reality report](../research/2026-07-24-flare-application-layer-reality.md)
- [Ecosystem-completeness audit](../research/2026-07-24-flare-ecosystem-completeness-audit.md)
- Participant's attached original direction: `/Users/abu/.codex/attachments/c8b158fe-5b39-4d3d-aff4-3e3d6589f983/pasted-text.txt`
