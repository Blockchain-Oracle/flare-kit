# Specification Addendum: Package, Docs and Distribution Surfaces

Date: 2026-08-03
Status: proposed addendum to the accepted specification
Companion: `specs/2026-08-03-agent-cli-and-tool-surfaces.md`

The accepted specification defines what the kit does but never defines how a
developer obtains it. The word `npm` appears nowhere in the accepted decision,
specification, stories, surface map or designer commission. This addendum
closes that gap. Every rule below follows a documented external standard rather
than an invented convention; sources are named in section H.

## A. Package topology

- **R-PKG-001:** The kit ships as multiple packages in one repository, layered
  so that a consumer installs only the depth they use.
- **R-PKG-002:** The layering is fixed even though names are not yet chosen:

```
contracts ──▶ core ──┬──▶ react ──▶ react-ui
                     │         └──▶ (feature packages)
                     └──▶ agent ──▶ tools ──┬──▶ framework adapters
                                            └──▶ cli ──▶ mcp
```

| Layer | Contains |
| --- | --- |
| contracts | Typed ABIs, the address registry, generated bindings |
| core | Headless operations, lifecycle engine, typed errors, mock mode |
| react | Providers and hooks, headless, dependency-light |
| react-ui | Styled widgets and composed journeys |
| agent | Agent client over core |
| tools | Tool definitions and schemas |
| cli / mcp | Human and agent transports |
| adapters | Wallet, provider and agent-framework adapters |
| scaffolder | `create-*` project generator |

- **R-PKG-003:** One source of truth for addresses lives in the contracts
  package. No other package or document hardcodes an address.
- **R-PKG-004:** The headless core stays dependency-light. Styled and premium
  visual treatment lives in the UI layer and is never pushed down into core or
  react.
- **R-PKG-005:** A headless action and its React hook correspond one-to-one by
  name, so a developer who knows one can predict the other. This mirrors the
  documented wagmi core-to-binding relationship.

## B. Package manifests

- **R-DIST-001:** Every package publishes dual ESM and CJS with an `exports`
  map whose `types` condition comes first and `default` comes last, and which
  includes `"./package.json"`.
- **R-DIST-002:** TypeScript 5 resolution requires separate declaration files
  per format. Every package passes `publint` and "Are the types wrong?" across
  node10, node16-cjs, node16-esm and bundler resolutions.
- **R-DIST-003:** Framework and chain libraries are peer dependencies, never
  bundled. Optional peers are marked optional so consumers who do not use them
  see no warning.
- **R-DIST-004:** Packages declare `files`, `engines.node`, and `sideEffects`.
  Packages that ship CSS declare CSS as their only side effect.
- **R-DIST-005:** Client-only React entry points carry the `"use client"`
  directive, and the build is configured to preserve it rather than strip it.
- **R-DIST-006:** Styling is restyleable through CSS custom properties under a
  single documented prefix. A host may rebrand without forking components.
- **R-DIST-007:** Each package ships its own README with a consistent skeleton:
  what it is, install, one complete runnable example, and links. The required
  peers are documented *by appearing in the install command*, not in a section
  of their own. Optional peers are omitted from the install line. Mermaid,
  GitHub alerts, task lists and in-README anchors appear only in the repository
  README — npm renders none of them. Logos are theme-neutral: `<picture>`
  dark-mode switching is structurally broken on npm. Amended 2026-08-13; see
  [README and the npm-rendered surface](../decisions/2026-08-13-readme-and-npm-surface.md).

## C. Repository and build

- **R-REPO-001:** A pnpm workspace with a task orchestrator that builds
  dependencies before dependents and caches unchanged packages.
- **R-REPO-002:** Internal dependencies use the workspace protocol and are
  rewritten to real version ranges at publish time.
- **R-REPO-003:** One command each for build, test, lint and typecheck across
  the workspace. All four pass before any release.
- **R-REPO-004:** Contract bindings are generated, not hand-written, and the
  generated file is exempt from the file-length rule.

## D. Versioning and release

- **R-REL-001:** Releases are driven by changesets: a change file per user
  visible change, then a version step, then publish.
- **R-REL-002:** Scoped packages publish with public access declared in
  configuration.
- **R-REL-003:** Publishing uses npm trusted publishing over OIDC from CI, with
  `id-token: write` permission and no long-lived npm token. Provenance is
  attached so the registry shows the verified build.
- **R-REL-004:** Every published package carries a generated changelog.
- **R-REL-005:** Breaking changes, deprecations and minimum resumable record
  versions are published in a migration ledger. (Extends R-DOC-004.)

## E. Scaffolder

- **R-SCAF-001:** `npm create <kit>` resolves to the scaffolder package by the
  documented npm naming convention.
- **R-SCAF-002:** The scaffolder refuses to overwrite a non-empty target.
- **R-SCAF-003:** Templates cover at minimum: a headless script, a React
  application, an embedded widget host, an MCP server, and an agent using a
  framework adapter.
- **R-SCAF-004:** Scaffolded projects are wired to a real network by default
  and pin the kit version they were generated against. Documentation examples
  run against the mock; generated projects run live. That split is stated in
  each generated README.

## F. Mock mode

Mock mode is a product feature, not a testing convenience. It is what makes a
protocol with multi-minute waits demonstrable.

- **R-MOCK-001:** Core exports an in-memory implementation reproducing the real
  state machine, including progress through long waits, typed errors and
  partial outcomes, with no wallet, no key and no network.
- **R-MOCK-002:** Mock timings are configurable so a documentation example
  completes in seconds while exercising the same transitions.
- **R-MOCK-003:** The React provider accepts a mock instance and skips all
  network initialisation when one is supplied.
- **R-MOCK-004:** Mock surfaces are labelled in the interface. A mock result is
  never presented as a live protocol outcome, and mock mode is never a fallback
  triggered by a failure.
- **R-MOCK-005:** The component gallery and the test suite both run on the
  mock, so every documented state is a state the product can actually reach.

## G. Documentation site

- **R-SITE-001:** The root of the site is a product landing page. Documentation
  lives beneath it. Neither is the end-user application.
- **R-SITE-002:** Documentation is grouped by consumption depth: getting
  started, components, hooks, headless reference, agent kit, contracts, CLI,
  scaffolder.
- **R-SITE-003:** Every component and hook page follows one fixed section
  order: import line, live preview, usage, parameters, return type, states,
  and mock-to-live swap. Consistency across pages is a requirement, not a
  preference.
- **R-SITE-004:** Component pages carry an interactive preview with a code tab,
  running against the mock so a visitor needs no wallet, no chain and no test
  funds. Previews are labelled as mock.
- **R-SITE-005:** Every documented state from the universal state contract is
  reachable in the gallery, including loading, empty, degraded, partial, error
  and recovery.
- **R-SITE-006:** The site publishes `/llms.txt` and `/llms-full.txt` per the
  llms.txt convention, and offers per-page markdown copy, so agents can consume
  the documentation without scraping rendered HTML.
- **R-SITE-007:** Search is a build-time static index requiring no server.
- **R-SITE-008:** Documentation is versioned, and a version selector exposes
  prior releases. Migration guides live alongside the docs.
- **R-SITE-009:** The site depends on the published packages rather than
  workspace sources, so it dogfoods what consumers actually install.
- **R-SITE-010:** Availability, provider identity, qualification dates and
  claim status appear in the docs exactly as they do in the product. A
  capability that is planned is labelled planned.

## G2. Live demo application

The documentation site proves the kit *reads* well. It cannot prove the kit
*works*, because every preview runs on the mock. A separate deployed
application closes that gap: a visitor connects a real wallet and completes a
real operation on a test network, without installing anything.

- **R-DEMO-001:** The demo is a **deployable application, not a published
  package.** Nobody installs a demo from a registry. It lives in the same
  repository under the applications directory and deploys on its own
  subdomain, separate from the documentation site.
- **R-DEMO-002:** It depends on the **published** packages, not workspace
  sources. That is what makes it evidence rather than a bespoke app.
- **R-DEMO-003:** It exposes exactly three modes, always visible and switchable
  in the interface:

| Mode | Wallet | Chain | Purpose |
| --- | --- | --- | --- |
| Mock | none | none | Always works. Full state machine, seconds not minutes. |
| Read-only | supplied address | real reads | Watch a real account and real operations. No signing. |
| Live | connected | real writes | Complete a real operation on a test network. |

- **R-DEMO-004:** The demo never renders a blank or broken page. If the network,
  an RPC, an indexer or an executor is unavailable, it falls back to read-only
  or mock **with the reason stated**, and the mode indicator changes. A
  degraded dependency is displayed, never hidden.
- **R-DEMO-005:** Live mode guides funding: it detects a missing balance on
  either chain and links the correct faucet, showing exactly what is needed
  before an action can be attempted.
- **R-DEMO-006:** The demo deliberately shows the honest states the product is
  built for, including a delayed mint, a partial bridge outcome and a recovery
  that reuses prior evidence. A demo that only walks the happy path contradicts
  the product thesis.
- **R-DEMO-007:** Deep links land on a real operation by ID, so an evaluator can
  be shown a completed run without performing one.
- **R-DEMO-008:** The environment is labelled on every screen. Test-network
  activity is never presented as production, and nothing on the demo asserts a
  managed-service, custody or availability claim.
- **R-DEMO-009:** The demo deploys and fails independently of the documentation
  site. A testnet outage must never take the docs down.
- **R-DEMO-010:** The demo carries no analytics beyond the consented product
  events already specified, and never records a connected address in a way that
  contradicts the privacy rules.

Naming note: `demo.<kit-domain>` is the plainest label for wallet-connecting
live software. `playground.` is the established alternative and is used by at
least one major kit for exactly this split. Either is acceptable; the domain
itself remains an open question alongside the product name.

## H. Sources

- Node.js packages documentation for `exports` conditions and ordering;
  `publint` rule set; "Are the types wrong?" problem categories.
- React documentation for `"use client"`; bundler directive-preservation
  guidance.
- pnpm workspaces and the workspace protocol; Turborepo task orchestration.
- Changesets workflow and configuration; npm trusted publishing with OIDC and
  provenance.
- npm `create-*` naming convention.
- Model Context Protocol specification; llms.txt convention.
- wagmi for the core-to-binding correspondence and typed-error taxonomy;
  shadcn for CSS-variable theming; the reference implementation (cdr-kit) for
  the proven end-to-end shape.

## I. Out of scope

- Choice of documentation framework and hosting provider.

**License: MIT**, decided 2026-08-03. It is what the reference implementation
ships, it is the default expectation for ecosystem SDKs, and a permissive
licence is the only sensible choice for a kit whose entire value is being
adopted by other people's products. Every package declares it; the repository
carries one `LICENSE` file. Reopen only if a dependency forces otherwise.

Resolved 2026-08-03 and no longer open: the product is **flare-kit**, the npm
scope is `@flare-kit/*`, the scaffolder is `create-flare-kit-app`, the primary
domain is `flare-kit.xyz`, docs live at `flare-kit.xyz/docs` and the live demo
at `demo.flare-kit.xyz`. See
`decisions/2026-08-03-product-name-and-domains.md`. Every published surface
must carry a statement that the project is community-built and not an official
Flare Networks product.
- Which providers, wallets, venues and networks are qualified at first release.
- Any managed-service or production claim.

## J. Verification

Install the scaffolder from a clean machine, generate the React template, run
it against the mock with no wallet configured, then point the same project at a
test network and complete one real operation. The documented state gallery and
the generated project must show the same component in the same states.
