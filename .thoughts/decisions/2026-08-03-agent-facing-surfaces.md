# Decision: Agent-Facing Surfaces (MCP server, skills, CLI, tools package)

Date: 2026-08-03
Status: accepted by Abu in session on 2026-08-03 ("go for it"), pending the specification update
Supersedes: nothing. Additive to the canonical scope decision.

## Question

Does the Flare kit ship its own MCP server, and what else does it ship for
agent consumers?

Abu asked this directly after seeing `@flare-kit/mcp` on a design specimen and
correctly challenged whether it had ever been decided.

## Provenance, stated honestly

**Already accepted before this decision:**

- Agent tools are a first-class integration depth, not a bolt-on:
  `specs/2026-08-03-flare-application-layer.md` R-AGENT-001 through R-AGENT-015.
- Agent surfaces are mapped: `AG-01` tool catalogue, `AG-02` policy and grant
  builder, `AG-03` plan and policy result, `AG-04` run timeline, `AG-05` grant
  audit and revocation, `AG-06` receipt comparison; plus `DEV-08` agent tool
  explorer.
- Versioned machine-readable documentation and agent skills are required:
  R-DOC-007, surface `DEV-13` (machine documentation and agent-skill registry),
  artifact `ART-18`.
- Origin in the participant's own brief: "AI agent tool shouldn't be left out in
  the picture... AI agent should be able to also bridge, should be able to get,
  to swap, do all of those stuff."

**Not previously decided anywhere:**

- A product-owned MCP server. The only MCP referenced in the accepted artifacts
  is Flare's existing documentation MCP, which R-AGENT-014 pins as a read-only
  knowledge surface.
- A product-owned CLI. Every `CLI` mention in the accepted artifacts refers to
  Flare's existing tools.
- A shared tool-definition package.

`@flare-kit/mcp` appeared on the 2026-08-03 design specimen by analogy to
cdr-kit before this decision existed. That was an unrecorded invention; this
document is the correction.

## Decision

The kit ships **four agent-facing surfaces over one shared tool definition**:

1. **A tools package** is the single source of truth. Each tool is
   `{ id, version, class, description, input schema, output schema, invoke }`,
   where `class` is `read`, `plan` or `write`.
2. **An MCP server** exposes those tools over stdio to agent hosts. It is a
   transport wrapper only. It contains no protocol logic and no tool
   definitions of its own.
3. **Framework adapters** (Vercel AI SDK, OpenAI, LangChain and similar) expose
   the same definitions through each framework's tool shape, generated from the
   same schemas.
4. **A CLI** exposes the same operations to humans and to shell-driven agents,
   and can serve the MCP server as a subcommand.

Agent skills remain separate from all four. Skills are procedural knowledge
("how to compose a direct mint safely"); they are never transaction tools and
never imply signing authority. This preserves R-AGENT-014.

## Authority model

**Agents can sign.** Abu corrected this on 2026-08-03. The question was never
whether an agent may hold signing power; it is **whose key it holds and what
bounds that key**.

Correction of record: the inherited artifacts stated "discover and plan without
signing authority" (`design/2026-08-03-designer-commission.md:149`) and
"natural language is not authority" (`:381`, mirrored at `specs/...:166` and
`stories/...:48`). Those were written by the prior context-holding agent, not
by Abu, and they contradict both the original brief ("AI agent should be able
to also bridge, should be able to get, to swap, do all of those stuff") and the
reference implementation, whose agent holds its own funded wallet and signs
autonomously. A propose-only agent is not the product.

Three signing modes are supported. Which one applies is **host configuration,
not product law**:

1. **Agent-owned wallet.** The agent holds its own key and funds and signs
   directly, with no human in the loop. Bounded by that wallet's balance and
   whatever limits the host sets. This is the default for autonomous runs and
   is what makes the agent story demonstrable.
2. **Delegated session grant.** The user issues a bounded, inspectable,
   revocable grant against their own account. The agent signs within it without
   asking again.
3. **Per-action human approval.** The agent returns a plan and a human confirms
   it. Appropriate above a value threshold or when terms changed, and it is an
   option a host selects, never a mandatory gate on every action.

What stays true in all three modes, because it comes from the accepted
specification rather than from any assumption about agents:

- **The enforcement class is always visible** (onchain or cryptographic,
  wallet-session, or service-policy), so nobody is misled about what actually
  constrains the agent. Naming a service policy "onchain protected" is
  prohibited.
- **`submitted` is never rendered as `succeeded`**, and partial or unknown
  outcomes stay visible, for agent runs exactly as for human ones.
- **An agent-created operation lands on the same durable timeline and produces
  a receipt schema-compatible with the human path** (AG-04, AG-06).
- **The authorization record is the signature and the policy evaluation, not
  the prose.** The originating request is retained as context on the receipt.
  This is an evidence-recording rule, not a restriction on what agents may do.
- **`read` and `plan` tools require no key at all**, so discovery and quoting
  work with no wallet configured. This is a practical convenience, not a
  ceiling.
- **The documentation MCP and agent skills stay read-only knowledge surfaces**
  and ship separately from transaction tools, so a host can adopt the knowledge
  surface without adopting any action surface.
- **Each tool states its class in its description**, so an agent host that
  renders only names and descriptions still shows whether a tool moves value.

## Why MCP specifically

- It is the documented interoperable standard for exposing tools to agent
  hosts: tools carry `name`, `description` and a JSON Schema `inputSchema`;
  stdio is the recommended local transport; execution failures return
  `isError: true` with actionable text so a model can self-correct, while
  protocol failures use JSON-RPC errors.
- It costs very little when built as a transport over an existing tool package,
  which is how the reference implementation does it.
- It is the surface that makes the accepted agent story demonstrable rather
  than theoretical.

Known cost: an MCP server injects every tool schema into the host's context at
startup, which is materially more expensive than a skill. Therefore the exposed
tool surface stays deliberately small and composed, rather than one tool per
protocol call.

## Separation of concerns

- **MCP** connects an agent to this system's actions.
- **Skills** carry procedural knowledge about using it safely.
- **CLI** gives humans and shell agents the same surface deterministically.

One core, three deliveries. A capability may not exist in only one of them
without a recorded reason.

## What this decision does not authorize

- No package names, namespace, repository topology or public API names. Those
  remain open questions owned by the architecture gate.
- No package scaffolding or implementation. The canonical scope decision still
  blocks both.
- No claim that any tool, server or skill is deployed, published or qualified.
  The design specimen's package strip stays labelled `Illustrative`.

## Consequences

The specification needs a new requirement family covering the tools package,
MCP server, framework adapters, CLI and skill distribution, with the authority
model above written as testable requirements.

The specification, stories and designer commission must also be amended where
they assert that agents cannot sign. Affected lines: `specs/...:166`,
`stories/...:48` and `:1702`, `design/2026-08-03-designer-commission.md:149`
and `:381`. The kit ships an agent wallet path (key generation, funding,
storage location) as a first-class surface. The surface map needs the
corresponding surfaces or an explicit note that `DEV-08` and `DEV-13` already
cover them.

## Provenance

- Canonical scope: `decisions/2026-08-03-full-flare-application-layer-scope.md`
- Accepted specification: `specs/2026-08-03-flare-application-layer.md`
- Accepted surface map: `design/2026-08-03-product-surface-map.md`
- Reference implementation studied: cdr-kit (`packages/tools`, `packages/mcp`,
  `packages/cli`, `packages/plugin`)
