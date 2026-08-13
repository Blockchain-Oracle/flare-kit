# Specification Addendum: Tool, Agent, MCP and CLI Surfaces

Date: 2026-08-03
Status: proposed addendum to the accepted specification
Amends: `specs/2026-08-03-flare-application-layer.md` section 16 (R-AGENT-*)
Decision of record: `decisions/2026-08-03-agent-facing-surfaces.md`

This addendum closes a gap the accepted artifacts never covered: how the kit is
consumed by agents and by humans at a terminal. It adds a tools package, an MCP
server, framework adapters, a CLI and a skill bundle, and it corrects the
inherited assumption that agents may not sign.

## A. Amendments to accepted requirements

**A-1. R-AGENT-004 is amended.** The accepted text permits only interactive
wallet confirmation or a pre-granted session capability. A third mode is added:

> An agent may hold its own key and sign directly with it. Value-changing tools
> executed under an agent-owned key require no per-action human confirmation.
> The bound on that authority is the balance and allowances of the agent's own
> account, plus any limits the host configures.

**A-2. R-AGENT-010 is clarified, not removed.** The prohibition applies to the
*user's* unrestricted key, not the agent's own. An agent-owned key generated
for and held by the agent is a supported, first-class mode. Requiring a human's
unrestricted private key in order to operate remains prohibited.

**A-3. R-AGENT-003 is narrowed.** Plan and quote artifacts remain unsigned and
expiring, because a plan is a quote and not a receipt. This is a statement
about what a plan *is*; it is not a restriction on the agent's ability to
execute one.

**A-4. Withdrawn framing.** The phrases "discover and plan without signing
authority" (`design/2026-08-03-designer-commission.md:149`) and "natural
language is not authority" as a capability restriction (`:381`,
`specs/...:166`, `stories/...:48`, `stories/...:1702`) are withdrawn. They were
authored by the prior context-holding agent and contradict the participant's
brief. What survives is narrower and true: the *authorization record* on a
receipt is the signature plus the policy evaluation, and the originating
request is retained as context. That is an evidence rule.

**A-5. Signing modes are host configuration.** Agent-owned key, delegated
session grant, and per-action human approval are all supported. Selecting among
them is configuration. No mode is mandatory.

## B. The tools package

- **R-TOOL-001:** One package is the single source of truth for every tool
  definition. The MCP server, every framework adapter and the CLI consume it.
  No surface may define a tool of its own.
- **R-TOOL-002:** A tool is
  `{ id, version, class, title, description, inputSchema, outputSchema, invoke }`.
  `class` is exactly one of `read`, `plan`, `write`.
- **R-TOOL-003:** Schemas are authored once in a runtime-validating schema
  library and emitted as JSON Schema for MCP and for framework adapters. Input
  is validated before `invoke` runs.
- **R-TOOL-004:** Every tool delegates to the same headless operation contract
  used by React, widgets and human clients. A tool may not reimplement protocol
  logic. (Preserves R-AGENT-001.)
- **R-TOOL-005:** `description` states the class and whether the tool moves
  value, so a host that renders only names and descriptions still shows it.
- **R-TOOL-006:** `read` and `plan` tools operate with no key configured.
- **R-TOOL-007:** Tool IDs follow `flare.<family>.<action>` and correspond
  one-to-one with a headless action name, so a developer reading either can
  predict the other.
- **R-TOOL-008:** The exposed surface stays composed. A tool represents a user
  intent, not a single contract call, because every schema is injected into an
  agent host's context at startup.

## C. Initial tool catalogue

`key` marks tools that require a configured signer.

| Tool ID | Class | Key | What it does |
| --- | --- | --- | --- |
| `flare.capabilities.list` | read | no | Families, actions, availability, networks |
| `flare.capabilities.get` | read | no | One capability: authority, providers, duration, recovery matrix |
| `flare.compatibility.check` | read | no | Whether a capability/network/asset/provider combination is supported, with evidence date |
| `flare.portfolio.get` | read | no | Balances and positions across supplied EVM and XRPL identities |
| `flare.operations.list` | read | no | Durable operations with filters |
| `flare.operations.get` | read | no | One operation: state, steps, actors, evidence |
| `flare.receipt.get` | read | no | Receipt for a terminal or partial operation |
| `flare.feeds.get` | read | no | FTSO feed value with decimals, round, freshness, trust class |
| `flare.random.get` | read | no | Secure random with `isSecure` |
| `flare.sources.get` | read | no | Data-source coverage, lag and known omissions |
| `flare.quote` | plan | no | Priced quote for an intent in any supported family |
| `flare.routes.compare` | plan | no | Qualified routes for swap or bridge, with fees, ETA, trust and recovery |
| `flare.plan` | plan | no | Immutable, expiring unsigned plan from an intent |
| `flare.simulate` | plan | no | Dry run with decoded effects and warnings |
| `flare.execute` | write | yes | Execute a previously returned plan by ID |
| `flare.recover` | write | yes | Apply a named recovery action to an operation |
| `flare.fassets.mint` | write | yes | FXRP direct mint from an XRP payment |
| `flare.fassets.redeem` | write | yes | Burn FXRP and settle XRP to an exact destination |
| `flare.transfer` | write | yes | Transfer an asset, selecting a gasless path where qualified |
| `flare.approve` | write | yes | Exact allowance, never unlimited by default |
| `flare.swap` | write | yes | Execute a swap on a selected qualified venue |
| `flare.bridge` | write | yes | Send across a qualified bridge or OFT route |
| `flare.vault.deposit` | write | yes | Deposit into a qualified vault |
| `flare.vault.withdraw` | write | yes | Request withdrawal, honouring epoch semantics |
| `flare.vault.claim` | write | yes | Claim a matured withdrawal |
| `flare.stake` | write | yes | C to P movement and validator delegation |
| `flare.delegate` | write | yes | Wrap and delegate vote power |
| `flare.vote` | write | yes | Cast an exact governance choice |
| `flare.rewards.claim` | write | yes | Claim a specified reward group |
| `flare.smartaccount.execute` | write | yes | XRPL-controlled batch through a Personal Account |
| `flare.attestation.request` | write | yes | Submit an FDC attestation request |
| `flare.proof.consume` | write | yes | Consume a retrieved proof at a qualified consumer |
| `flare.payment.request` | plan | no | Create an exact payment request and its shareable pay link |
| `flare.payment.settlements` | read | no | Received versus requested, with variance and finality |
| `flare.liquidity.add` | write | yes | Supply one or both assets into a qualified venue pool |
| `flare.liquidity.remove` | write | yes | Remove some or all of a position and claim earned fees |

- **R-TOOL-009:** Family write tools are thin conveniences over `flare.plan`
  plus `flare.execute`. Both paths produce the same operation and receipt.
- **R-TOOL-010:** A family may ship `read` and `plan` tools before `write`
  tools. The gap must be declared in the catalogue, never simulated.
- **R-TOOL-011:** FCC tools are deferred until the FCC application domain is
  resolved. Their absence is declared, not hidden.

## D. MCP server

- **R-MCP-001:** The server is a transport over the tools package. It contains
  no protocol logic and defines no tools of its own.
- **R-MCP-002:** Tools are exposed with `name`, `description` and a JSON Schema
  `inputSchema`, per the Model Context Protocol specification.
- **R-MCP-003:** Stdio is the supported transport for local hosts. Any remote
  transport requires authentication and separate operational acceptance.
- **R-MCP-004:** Execution failures return `isError: true` with actionable text
  so a model can self-correct. Protocol failures use JSON-RPC errors.
- **R-MCP-005:** `--version` and `--help` must succeed with no wallet, no
  network and no key configured.
- **R-MCP-006:** The server reads its network, RPC and key configuration from
  environment variables and never writes a secret to disk or to logs.
- **R-MCP-007:** The documentation knowledge surface ships separately from the
  transaction tool surface, so a host may adopt one without the other.
  (Preserves R-AGENT-014.)

## E. Framework adapters

- **R-ADAPT-001:** Adapters for the common agent frameworks expose the same
  tool definitions in each framework's native shape, generated from the shared
  schemas.
- **R-ADAPT-002:** An adapter adds no capability and no authority of its own.
- **R-ADAPT-003:** Each adapter declares which framework versions it supports.

## F. CLI

**Yes, the CLI performs transactions.** It is a first-class operator of the
same tools, not a read-only helper.

- **R-CLI-001:** Every tool in the catalogue has a corresponding command. Read
  and plan commands run with no key; write commands require a configured
  signer.
- **R-CLI-002:** A global `--json` mode emits machine-readable output for
  scripting and for shell-driven agents, with errors on the same contract.
- **R-CLI-003:** A global `--network` selects the environment. There is no
  implicit mainnet default.
- **R-CLI-004:** Write commands print the exact effect, amounts, fees, provider
  and irreversible boundary before executing, and support a
  non-interactive confirmation flag for automation.
- **R-CLI-005:** Long-running operations stream stage, expected range, awaited
  actor and safe action, and can be detached and resumed by operation ID.
- **R-CLI-006:** The CLI can serve the MCP server as a subcommand.
- **R-CLI-007:** The CLI installs the agent skill bundle.
- **R-CLI-008:** A doctor command reports environment, network reachability,
  wallet status, funding and version compatibility.

Command groups: `wallet`, `capabilities`, `portfolio`, `quote`, `plan`,
`execute`, `op` (status, list, recover), `receipt`, `fassets` (mint, redeem),
`transfer`, `approve`, `swap`, `bridge`, `vault`, `stake`, `governance`,
`smartaccount`, `fdc`, `feeds`, `mcp`, `skill`, `config`, `doctor`.

## G. Agent wallet and key handling

- **R-KEY-001:** The kit can generate an agent-owned key and store it under the
  user's configuration directory with restrictive permissions.
- **R-KEY-002:** An environment variable overrides the stored key. A key is
  never committed, logged, printed in `--json` output, or included in receipts,
  support bundles or analytics.
- **R-KEY-003:** A funding command points at the correct faucet or funding path
  for the selected test network, and reports the balance.
- **R-KEY-004:** Key export exists only in the CLI, requires explicit
  confirmation, and is never exposed as a tool or over MCP.
- **R-KEY-005:** The kit reports the agent account's balance and configured
  limits before any first write, so the operator can see the blast radius.
- **R-KEY-006:** Requiring a human user's unrestricted private key remains
  prohibited. (Preserves R-AGENT-010.)

## H. Skills

- **R-SKILL-001:** Skills carry procedural knowledge, never transaction
  authority, and are published separately from tools.
- **R-SKILL-002:** Each skill declares name, description and license, and
  states explicitly that it cannot sign.
- **R-SKILL-003:** Skills are installable through the CLI and through a plugin
  marketplace entry, from one source of truth with no duplicated content.

## I. Out of scope for this addendum

- Package names, namespace and repository topology. Owned by the architecture
  gate and by the companion distribution addendum.
- Implementation, scaffolding and deployment. Still blocked by the canonical
  scope decision.
- Remote or multi-tenant hosted MCP, server-held signing for third parties, and
  any managed-service claim.
- FCC tools, pending the domain decision.

## J. Verification

One end-to-end sequence proves this addendum:

1. With no key configured, list capabilities, read the portfolio for a supplied
   identity, and produce a quote and an unsigned plan for an FXRP direct mint.
2. Generate and fund an agent wallet through the CLI.
3. Execute that plan through the CLI, then again through the MCP server from an
   agent host, confirming both produce the same operation shape and a
   schema-compatible receipt.
4. Interrupt the run, resume by operation ID, and apply a recovery action that
   reuses the prior payment and proof without creating a second payment.
