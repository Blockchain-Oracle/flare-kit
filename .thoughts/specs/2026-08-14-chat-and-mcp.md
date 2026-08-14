# Spec: the chat surface and the MCP delivery

Date: 2026-08-14
Status: **written, awaiting Abu's acceptance**. Depends on the tools package, which
is not built. Nothing here is buildable until it is.
Governing decision: `.thoughts/decisions/2026-08-03-agent-facing-surfaces.md`
Evidence base: `.thoughts/research/2026-08-14-app-and-chat-references.md`

## Provenance, stated honestly

**This spec invents no architecture.** The shape it describes was accepted on
2026-08-03: the kit ships **one shared tool definition with four deliveries** — a
tools package as single source of truth, an MCP server that is a transport wrapper
only, framework adapters generated from the same schemas (the Vercel AI SDK is
named explicitly), and a CLI. Each tool is
`{ id, version, class, description, input schema, output schema, invoke }` where
`class` is `read`, `plan` or `write`, and `read`/`plan` require no key.

Abu described the chat on 2026-08-14 as "two forms: a normal MCP server, and an
MCP server with tools that, with Vercel AI, we are able to do generative UI." That
maps onto deliveries 2 and 3 of the accepted decision. It is the same registry
twice, not two products.

**New here:** the generative-UI binding (R-CHAT-004 onward), and the app-specific
authority reading in R-CHAT-010.

## The one thing that makes this cheap

`stacks-frontend/components/message.tsx` is **2,441 lines** — one hand-written `if`
per tool, roughly forty of them. It needs that because each protocol it integrates
invented its own result shape.

flare-kit already normalised this. Every operation travels as `Observation<T>`
through one named-actor spine with seven outcome glyphs. So the binding from a tool
call to a rendered component is a **registry**, not a switch, and the components
already exist. This is "reuse, do not re-code" arriving at a surface built years
after the rule.

## Verified API (2026-08-14)

Checked against the npm registry and shipped type definitions, not against the
reference repos, all three of which are on older majors:

`ai@7.0.65` · `@ai-sdk/react@4.0.68` · `@ai-sdk/mcp@2.0.31` ·
`@modelcontextprotocol/sdk@1.30.0` · `next@16.3.1`

Tool part states, in order:
`input-streaming` → `input-available` → [`approval-requested` → `approval-responded`
| `output-denied`] → `output-available` (repeatable, `preliminary: true`) | `output-error`

Static tools arrive as `` `tool-${name}` ``; runtime-discovered MCP tools arrive as
`dynamic-tool` with a `toolName` field. Guards: `isToolUIPart`, `isDynamicToolUIPart`,
`getToolName`.

Renames that invalidate every reference chat route: `system:` → `instructions:`,
`onFinish:` → `onEnd:`, `fullStream` → `stream`, `experimental_createMCPClient` from
`ai` → `createMCPClient` from `@ai-sdk/mcp`, `tool({ needsApproval })` →
`streamText({ toolApproval })`.

## Requirements

### The registry

- **R-CHAT-001** Tools are defined **once**, in the tools package, against
  `@flarekit-dev/core`. No React, no transport, no framework import.
- **R-CHAT-002** The MCP server registers those tools via `registerTool` and
  contains no tool definitions and no protocol logic of its own.
- **R-CHAT-003** The AI SDK adapter maps the same definitions to `tool()`. A tool
  that exists in one delivery and not the other is a defect, and a test asserts the
  two registries have identical membership.

### Generative UI

- **R-CHAT-004** A `tool id → renderer` registry binds each tool to an **existing**
  kit component. Adding a tool with a renderer is a registry entry, never a new
  branch in a message component. A `message.tsx` that grows a per-tool conditional
  has failed this requirement.
- **R-CHAT-005** The two streaming states map onto the operation lifecycle:
  `input-available` renders the operation as **planned, not submitted** — the plan
  and its refusals; `output-available` renders the same component with the spine
  advanced to its real state. The chat therefore shows the same lifecycle the app
  shows, because it is the same component.
- **R-CHAT-006** A tool with no renderer degrades to a readable typed summary, never
  to a raw JSON dump and never to silence.
- **R-CHAT-007** `input-streaming` renders the component's own pending state. It does
  not render a spinner standing in for a component.

### Authority — the model never signs

- **R-CHAT-008** `write` tools in the app are defined **without `execute`**, which
  makes `outputSchema` mandatory. The model composes an unsigned plan; the rendered
  component carries the confirm affordance; the **user's own wallet signs**; the
  client returns the outcome via `addToolOutput`. There is no server-side signing
  path because the app holds no key (R-APP-012).
- **R-CHAT-009** `read` and `plan` tools execute server-side and need no key, per the
  accepted decision. They are the majority of the surface.
- **R-CHAT-010** `toolApproval` is **not** the app's mechanism and is not used there.
  The accepted decision's three signing modes are *host configuration*: the
  agent-owned wallet and delegated-grant modes belong to the MCP and CLI deliveries,
  where a host may hold a key. In the app there is no key to bound, so the absence of
  `execute` is a stronger guarantee than an approval prompt — the capability does not
  exist rather than being gated. (Closes open question 3 of the research brief.)
- **R-CHAT-011** Every tool states its `class` in its description, so a host that
  renders only names and descriptions still shows whether a tool moves value.
- **R-CHAT-012** A chat-originated operation lands on the **same durable timeline**
  and produces a receipt schema-compatible with the human path. The authorization
  record is the signature and the policy evaluation; the originating prose is
  retained as context, never as authority.

### Honesty

- **R-CHAT-013** The model may not assert a protocol outcome in prose. Outcomes are
  rendered by components from real data. A message claiming a swap succeeded, where
  the component says `submitted`, is the worst failure this product can have.
- **R-CHAT-014** `instructions` state that the assistant composes and explains, and
  that it never confirms an outcome the spine has not reached.
- **R-CHAT-015** Tool errors surface as `output-error` with actionable text, not as a
  cheerful retry or a silent swallow.

### Transport

- **R-CHAT-016** MCP production transport is **HTTP**. `stdio` is local-only, per the
  SDK's own guidance, and is what an agent host uses on a developer's machine.
- **R-CHAT-017** MCP retries stay **off** for non-idempotent tools. Enabling them on a
  `write` tool duplicates side effects that move value.
- **R-CHAT-018** The exposed tool surface stays deliberately small and composed. An
  MCP server injects every schema into the host's context at startup; one tool per
  protocol call is a context tax with no benefit.

## What it will not do

- It will not sign, hold a key, or acquire one.
- It will not render a protocol outcome the chain has not returned.
- It will not grow a per-tool conditional in a message renderer.
- It will not ship the AI SDK inside a published package (R-APP-019).
- It will not treat natural language as authorization.

## Acceptance criteria

- **AC1** One tool definition; a test proves the MCP and AI SDK registries have
  identical membership.
- **AC2** A `write` tool driven from chat: composed by the model, signed in the
  user's wallet, landing on the same timeline as the same operation performed in the
  app, with schema-compatible receipts. Both compared side by side as evidence.
- **AC3** The MCP server driven from a real agent host against Coston2, with the
  session recorded.
- **AC4** A tool whose renderer is missing degrades to a typed summary — verified,
  not asserted.
- **AC5** No per-tool conditional in any message renderer; the binding file stays
  under 300 lines.

## Unresolved, and honestly so

- **Whether `preliminary` outputs survive persistence and reload.** The types carry
  `preliminary?: boolean`; no documentation states what a persisted transcript
  retains. For self-reconciling operations this matters. **It needs an experiment
  before it is designed around.**
- **`resumable-stream` on `ai@7`.** `resumeStream()` still exists and
  `PrepareReconnectToStreamRequest` is exported, but the current server recipe was
  not verified.
- **MCP Apps** (`experimental_MCPAppRenderer`) is experimental with no shipped
  example. Not planned around.

## Provenance links

- [Agent-facing surfaces](../decisions/2026-08-03-agent-facing-surfaces.md)
- [App surface spec](2026-08-14-app-surface.md)
- [Reference research](../research/2026-08-14-app-and-chat-references.md)
