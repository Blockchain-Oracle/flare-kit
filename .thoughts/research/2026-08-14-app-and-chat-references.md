# Research brief — `app.flare-kit.xyz` and its MCP-backed chat

**Date:** 2026-08-14
**Purpose:** evidence base for two specs — the Flare integration app, and its MCP-backed chat with generative UI.
**Status:** findings only. No spec decisions, no code.

## How to read this document

Every claim is tagged:

- **READ** — I opened the file in one of the four reference repos and quote it. It is true of that
  repo at the commit I have. It says nothing about whether the approach is still current.
- **VERIFIED** — I checked it today (2026-08-14) against the npm registry, the shipped `.d.ts` of the
  published package, or current vendor documentation. The source is named inline.
- **INFERENCE** — my reasoning on top of the above. Labelled every time.

Where a reference's approach is obsolete, there is an **OBSOLETE** callout naming what replaced it.

---

## 0. Version reality — the references are stale, but not uniformly

**VERIFIED** (`npm view <pkg> version`, run 2026-08-14):

| Package | Current | stacks-frontend | portaldot-mcp web | deepbookie web |
|---|---|---|---|---|
| `ai` | **7.0.65** | `5.0.0-beta.6` | `^6.0.191` | `^6.0.208` |
| `@ai-sdk/react` | **4.0.68** | `2.0.0-beta.6` | `^3.0.193` | `^3.0.210` |
| `@ai-sdk/anthropic` | **4.0.38** | — | `^3.0.80` | `^3.0.85` |
| `next` | **16.3.1** | `15.3.0-canary.31` | `^16.2.6` | `^15.3.9` |
| `@modelcontextprotocol/sdk` | **1.30.0** | — (no MCP server) | `^1.29.0` | `^1.29.0` |
| `zod` | 4.x current | `^3.25.68` | `^4.4.3` | `^4.4.3` |

`ai` maintains parallel dist-tags: `latest: 7.0.65`, `ai-v6: 6.0.255`, `ai-v5: 5.0.236`. So all three
web references are on *supported* but *older* majors.

**The correction to the brief I was given:** stacks-frontend is two majors behind and its patterns
should be treated as archaeology. But **portaldot-mcp and deepbookie are only one major behind (v6),
and their architecture is close to current.** deepbookie in particular is the strongest reference in
the set — closer to what flare-kit needs than the Vercel fork is.

**VERIFIED** — AI SDK 7 breaking changes that invalidate reference code
(https://vercel.com/changelog/ai-sdk-7):

- `system` option → **`instructions`**
- `onFinish` → **`onEnd`**
- `StreamTextResult.fullStream` → **`stream`**
- System messages inside `prompt`/`messages` now require `allowSystemMessages: true`
- `toUIMessageStreamResponse()` deprecated in favour of top-level helpers
- `needsApproval` on `tool()`/`dynamicTool()` deprecated → move to `toolApproval` on
  `streamText`/`generateText`/`ToolLoopAgent`
- Node 22 minimum; ESM only (no CJS `require`)
- Multi-step results accumulate across steps; final-step-only data moved to `finalStep`

Every reference file quoted below that uses `system:`, `onFinish:`, or `toUIMessageStreamResponse()`
is on the old spelling.

---

## A. Generative UI mechanism

### A1. How a tool call becomes a rendered React component — the current API

**VERIFIED** — from the shipped type definitions of `ai@7.0.65`
(`dist/index.d.ts`, extracted from the npm tarball today).

A tool call arrives on the client as a **part** of a `UIMessage`. `UIMessage` is generic in three
parameters (line 1818):

```ts
interface UIMessage<METADATA = unknown, DATA_PARTS extends UIDataTypes = UIDataTypes, TOOLS extends UITools = UITools> {
```

Tool parts are named `tool-${toolName}` (line 2096):

```ts
type ToolUIPart<TOOLS extends UITools = UITools> = ValueOf<{
    [NAME in keyof TOOLS & string]: {
        type: `tool-${NAME}`;
    } & UIToolInvocation<TOOLS[NAME]>;
}>;
```

`UIToolInvocation` is a **seven-way discriminated union on `state`** (line 2000ff). This is the
single most important shape for the spec:

```ts
type UIToolInvocation<TOOL extends UITool | Tool> = {
    toolCallId: string;
    title?: string;
    toolMetadata?: JSONObject;
    providerExecuted?: boolean;
} & (
  | { state: 'input-streaming';    input?: DeepPartial<...['input']> | undefined; approval?: never }
  | { state: 'input-available';    input: ...['input'];                           approval?: never }
  | { state: 'approval-requested'; input: ...['input'];
      approval: { id: string; approved?: never; reason?: never; isAutomatic?: boolean; signature?: string } }
  | { state: 'approval-responded'; input: ...['input'];
      approval: { id: string; approved: boolean; reason?: string; isAutomatic?: boolean; signature?: string } }
  | { state: 'output-available';   input: ...['input']; output: ...['output'];
      preliminary?: boolean;
      approval?: { id: string; approved: true; ... } }
  | { state: 'output-error';       input: ...['input'] | undefined; rawInput?: unknown; errorText: string; ... }
  | { state: 'output-denied';      input: ...['input'];
      approval: { id: string; approved: false; reason?: string; ... } }
);
```

Seven states, not three. **VERIFIED** against the same list published at
https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage:
`input-streaming`, `input-available`, `approval-requested`, `approval-responded`,
`output-available`, `output-error`, `output-denied`.

**VERIFIED** — typed-tool helpers exist and are exported from `ai@7.0.65`
(grep of `dist/index.d.ts` export list): `InferUITool`, `InferUITools`, `UITool`, `UITools`,
`UIToolInvocation`, `ToolUIPart`, plus runtime guards `isToolUIPart`, `isStaticToolUIPart`,
`isDynamicToolUIPart`, `getToolName`, `getStaticToolName`.

```ts
type InferUITools<TOOLS extends ToolSet> = {
    [NAME in keyof TOOLS & string]: InferUITool<TOOLS[NAME]>;
};
```

**INFERENCE:** `UIMessage<Metadata, DataParts, InferUITools<typeof tools>>` is the way to get a
`ToolUIPart` union that TypeScript can exhaustively check. None of the four references do this —
stacks-frontend explicitly *commented out* the tools generic
(`stacks-frontend/lib/types.ts:24-28`):

```ts
export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes
  // ChatTools
>;
```

…which is exactly why `message.tsx` is a 2441-line pile of `any` casts.

### A2. `stacks-frontend/components/message.tsx` — the anti-pattern, measured

**READ.** 2441 lines. **96** `type === "tool-…"` branches (`grep -c 'type === "tool-'`). One
hand-written `if` per tool, all inline in one component's `.map()` over `message.parts`.

The shape of every branch is identical (`message.tsx:335-356`):

```tsx
if (type.startsWith("tool-alex_execute_swap")) {
  if ("toolCallId" in part && "state" in part) {
    const { toolCallId, state } = part;
    if (state === "input-available") {
      return (<div key={toolCallId}><ToolCallLoader loadingMessage="Executing ALEX swap..." /></div>);
    }
    if (state === "output-available" && "output" in part) {
      const { output } = part;
      return (<SwapInfo key={toolCallId} data={output as any} isLoading={false} />);
    }
  }
}
```

Three facts about this file that a spec should treat as a specification of what not to do:

1. **Only two of seven states are handled.** `grep 'state === "…"'` over the whole file yields
   exactly `input-available` × 87 and `output-available` × 86. There is **no**
   `input-streaming`, **no** `output-error`, no approval states at all. A tool that errors renders
   *nothing* — the branch falls through and the part disappears from the transcript. **That is a
   silent failure, and under flare-kit's "an unknown outcome is never rendered as failed" rule it is
   the mirror-image bug: a failed outcome is rendered as nothing.**
2. **Duplicate branches that are provably dead, and that disagree.** `tool-charismaGetQuote` appears
   at line 478 **and** line 1922. The first wins. They render *different components*:
   line 478 → `<CharismaQuote data={output} />`; line 1922 → `<SwapInfo data={output} />`.
   Same for `tool-charismaListOrders` (524, 1945) and the six `tool-granitePrepare*` (595-710,
   1971-1973). Nobody can tell from reading the file which card actually renders.
3. **Every result is `output as any`.** No output typing anywhere.

Supporting cast, same repo: `components/icons.tsx` 1180 lines, `components/ui/sidebar.tsx` 771,
`components/suggested-actions.tsx` 647, `components/sidebar-history.tsx` 429.

### A3. What a registry-based alternative looks like — and who already built one

Two of the references already replaced the `if`-chain with a lookup. Neither is fully a registry, but
deepbookie is close and its structure is directly transferable.

**READ** — `deepbookie/apps/web/src/components/chat/MessagePart.tsx` (295 lines). One component,
one part. Three collaborating structures:

```ts
/** Predict writes + spot zero/fixed-input writes → the fixed ReceiptController (sign as proposed). */
const WRITE = new Set([
  'create_manager', 'mint', 'redeem', 'mint_range', 'redeem_range', 'supply', 'withdraw',
  'spot_create_balance_manager', 'spot_deposit', 'spot_withdraw', 'spot_cancel_order', 'spot_cancel_all_orders',
]);

/** Spot generative-input writes → bespoke cards (user edits the values, then signs). All share the
 *  same write-part props ({ part, addToolResult, onOutcome, onRetry }). */
const SPOT_INPUT: Record<string, (p: {
  part: WriteToolPart; addToolResult: AddToolResult; onOutcome?: OnSignOutcome; onRetry: () => void
}) => ReactNode> = {
  spot_swap_base_for_quote: SwapCard,
  spot_swap_quote_for_base: SwapCard,
  spot_place_limit_order: LimitOrderTicket,
  ...
};
```

`SPOT_INPUT` **is** a `tool name -> renderer` registry with a uniform renderer prop contract. The
reads are still a `switch` (lines 230-294), but a flat one at one indent level, with a uniform
`ready ? <Card data={out}/> : skeleton(h)` body.

**READ** — `portaldot-mcp/packages/web/components/app/chat-app.tsx:42-59` uses a name→label map plus
a switch:

```ts
const READ_LABELS: Record<string, string> = {
  "tool-portaldot_get_balance": "Balance",
  "tool-portaldot_get_block_info": "Block",
  ...
};
```

**INFERENCE — what a full registry buys flare-kit, given its existing constraints.**
flare-kit's operations already travel one spine with one state vocabulary, and CLAUDE.md forbids
building a card inline inside a screen. Those two facts make the registry not a refactor but the
only shape consistent with the rules. Concretely a registry would be:

- one `Record<ToolName, Renderer>` where `Renderer` has a **single** prop signature — deepbookie
  proves the uniform-props part is achievable (`{ part, addToolResult, onOutcome, onRetry }`);
- the seven `state` values mapped **once**, in the registry host, not in each renderer — deepbookie
  does exactly this centrally via `deriveReceiptState` (see A5);
- exhaustiveness checked by `InferUITools`, so adding a tool without a renderer fails typecheck
  rather than rendering nothing at 2 a.m.

The registry host would be well under 300 lines; each renderer is a shared component in the UI
package. Nothing above is speculative about the SDK — it is all supported by the verified types in
A1. What is inference is only that flare-kit *should* do it.

### A4. Streaming and partial tool inputs — what the UI shows while input is still arriving

**VERIFIED** (`ai@7.0.65` types, A1): during `state: 'input-streaming'`, `input` is
`DeepPartial<Input> | undefined`. It is not merely incomplete — it may be absent entirely.

**READ** — portaldot handles this explicitly
(`portaldot-mcp/packages/web/components/app/chat-app.tsx:224-228`):

```tsx
const raw = (tp.input ?? {}) as Partial<TransferInput>;
// Tool args stream in — don't render the preview until the recipient exists.
if (!raw.to || !raw.amount) {
  return <SkeletonCard key={tp.toolCallId} label="Transfer" />;
}
```

**READ** — deepbookie documents the sharper failure mode, which is the one worth carrying into the
spec (`MessagePart.tsx:152-160`):

> These cards seed editable fields from `part.input` via one-shot `useState` initializers, so we must
> wait until the tool input has finished streaming — mounting mid-stream would capture empty input
> and drop the agent's proposed values (the React key is stable, so there's no remount to re-seed).

```tsx
if (tp.state === 'input-streaming' || !tp.input) return skeleton('h-40');
```

**Any renderer that seeds editable form state from `part.input` must not mount during
`input-streaming`.** Both conditions are needed: the state check *and* the presence check.

**VERIFIED — a mechanism no reference uses, and the one most relevant to flare-kit.**
From `@ai-sdk/provider-utils` (shipped `.d.ts`, line 1749):

```ts
type ToolExecuteFunction<INPUT, OUTPUT, CONTEXT> =
  (input: INPUT, options: ToolExecutionOptions<CONTEXT>) => AsyncIterable<OUTPUT> | PromiseLike<OUTPUT> | OUTPUT;
```

and (line 2543):

> - If the tool's `execute` function returns an `AsyncIterable`, each yielded value is emitted as
>   `{ type: "preliminary", output }`. After iteration completes, the last yielded value is emitted
>   again as `{ type: "final", output }`.

That surfaces on the client as `state: 'output-available'` with `preliminary?: boolean` set
(verified in the `UIToolInvocation` union, A1).

**INFERENCE:** this is how a *server-executed* long-running operation streams its lifecycle into one
tool part — successive preliminary outputs, then a final one — rather than the UI inventing progress.
For flare-kit this is the natural transport for an operation's real observed states. It cannot
manufacture certainty it does not have: each yielded value is whatever the operation actually
observed. Note it applies only to server-executed tools; client-signed tools resolve once, via
`addToolOutput`.

### A5. Human-in-the-loop — the model must never sign

There are two distinct mechanisms. The references use the first. The SDK now offers a second that no
reference uses.

#### Mechanism 1 (used by portaldot and deepbookie): a tool with **no `execute`**

**READ** — `portaldot-mcp/packages/web/app/api/chat/route.ts:16-19, 40-57`:

```ts
// The web surface exposes read tools (server-executed, no wallet) plus a single
// write tool — transfer — which has NO execute, so the browser handles it and the
// user signs with their injected wallet ("AI proposes, user signs"). Contract
// writes are demonstrated via the MCP server, not the web.
const SERVER_EXECUTED = new Set([ "portaldot_get_balance", ... ]);
const CLIENT_SIGNED = new Set(["portaldot_transfer"]);

tools[t.name] = SERVER_EXECUTED.has(t.name)
  ? tool({ description: t.description, inputSchema, execute: async (args) => { ... } })
  : tool({ description: t.description, inputSchema }); // client-signed
```

**READ** — deepbookie states the same rule as a package-level architecture, not a special case
(`deepbookie/apps/web/src/lib/ai/tools.ts:26-32`):

> Read tools get an `execute` (run server-side, streamed back as widgets); write tools have NO
> execute — the call is forwarded to the browser, which builds the unsigned tx, signs it, and submits
> the result. `walletAddress` (from the request body) is used only as the devInspect quote sender —
> never for authorization.

```ts
: tool({
    description: t.description,
    inputSchema: t.inputSchema,
    // no execute → client builds + signs, then submits the tool result
  });
```

The client then resolves the call. **READ** —
`portaldot-mcp/packages/web/components/app/chat-app.tsx:90-93, 133-149`:

```tsx
const { messages, setMessages, sendMessage, addToolOutput, status } = useChat({
  transport,
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
});

async function onSignTransfer(toolCallId: string, inp: TransferInput) {
  if (!account) return;
  setSigning((s) => ({ ...s, [toolCallId]: true }));
  try {
    const result = await signAndSendTransfer(account.address, inp.to, inp.amount);
    addToolOutput({ tool: "portaldot_transfer", toolCallId, output: result });
  } catch (e) { setTxError(...); } finally { setSigning(...); }
}

function onCancelTransfer(toolCallId: string) {
  addToolOutput({ tool: "portaldot_transfer", toolCallId, output: { cancelled: true } });
}
```

`sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` is what resumes the model turn
once every proposed write has a result. **VERIFIED**: both
`lastAssistantMessageIsCompleteWithToolCalls` and `lastAssistantMessageIsCompleteWithApprovalResponses`
are exported from `ai@7.0.65`.

**VERIFIED — the constraint that bites here.** From `@ai-sdk/provider-utils` `.d.ts` (line 1781ff),
`ToolOutputProperties` is a union: either you supply `execute` and `outputSchema` is optional, or:

```ts
| {
    /** The schema of the output that the tool produces.
     *  Required when no execute function is provided. */
    outputSchema: FlexibleSchema<OUTPUT>;
    execute?: never;
  }
```

**`outputSchema` is required for every client-signed tool.** Neither portaldot nor deepbookie supplies
one — they are on `ai` v6, where it was not enforced. **INFERENCE:** porting either pattern to
`ai@7` requires adding an `outputSchema` to every no-`execute` tool. For flare-kit this is a feature,
not a tax: it forces the receipt shape (hash, status, evidence) to be declared once and typed.

#### Mechanism 2 (new; no reference uses it): first-class **tool approval**

**VERIFIED** — https://ai-sdk.dev/docs/agents/tool-approvals and the `ai@7.0.65` types.
Configured on `streamText`/`generateText`/`ToolLoopAgent` via `toolApproval`:

```js
// per-tool static
toolApproval: { runCommand: 'user-approval' }

// per-tool dynamic
toolApproval: {
  processPayment: async ({ amount }, { runtimeContext }) => {
    if (runtimeContext.role !== 'admin') return { type: 'denied', reason: 'Only admins can send payments' };
    return amount > 1000 ? 'user-approval' : undefined;
  },
}

// generic policy across all tools
toolApproval: ({ toolCall }) => {
  if (toolCall.dynamic) return 'user-approval';
  if (toolCall.toolName === 'deleteFile') return 'user-approval';
  return undefined;
}
```

Statuses: `'not-applicable'` (default), `'approved'`, `'denied'`, `'user-approval'` — each a string
or `{ type, reason }`. The client responds via `useChat`:

```js
addToolApprovalResponse({ id: part.approval.id, approved: true })
```

**VERIFIED** signature (`useChat` reference):
`(options: { id: string; approved: boolean; reason?: string }) => void | PromiseLike<void>`.

There is also `experimental_toolApprovalSecret: process.env.TOOL_APPROVAL_SECRET`, which HMAC-signs
approvals so a tool input is cryptographically bound to the approval token (the `signature` field on
`part.approval`, verified present in the types).

**The distinction that matters for the spec (INFERENCE, resting on verified facts above):**

| | no-`execute` (Mechanism 1) | `toolApproval` (Mechanism 2) |
|---|---|---|
| Who performs the action | the **browser** — model never has the capability | the **server**, after the user says yes |
| Can the model sign? | structurally impossible | possible if the key is server-side |
| Suits | user-wallet signing | agent-key operations, spend caps, policy gates |
| Result path | `addToolOutput` | `addToolApprovalResponse` → `execute` runs |
| Denial | app-defined output (`{cancelled:true}`) | `state: 'output-denied'`, first-class |

flare-kit has *both* audiences — a browser wallet user, and (per
`.thoughts/decisions/2026-08-03-agent-facing-surfaces.md`) agents that may sign with their own key.
Mechanism 1 is the honest answer for the wallet path: the model cannot sign because it never holds
the capability, not because a policy says no. Mechanism 2 is the answer for the agent-key path.
`output-denied` also gives a real state for "the user said no", which today's references encode
as an ad-hoc `output: { cancelled: true }`.

### A6. The shared spine — deepbookie's `ReceiptController` is the closest existing analogue

**READ** — `deepbookie/apps/web/src/components/widgets/receiptState.ts` (25 lines, the whole file):

```ts
/**
 * Shared terminal-vs-transient receipt-state derivation, used by BOTH the Predict ReceiptController
 * and the spot write cards (useSpotWriteCard). Terminal part states win over the transient local
 * 'signing' flag, so a reload/remount renders the right thing; cancellation is encoded in part.output
 * (not local state) so it survives a remount too.
 */
export function deriveReceiptState(
  part: { state?: string; output?: { status?: string } },
  localSigning: boolean,
): ReceiptState {
  const cancelled = part.state === 'output-available' && part.output?.status === 'cancelled';
  return cancelled ? 'cancelled'
    : part.state === 'output-available' ? 'signed'
    : part.state === 'output-error' ? 'failed'
    : localSigning ? 'signing'
    : part.state === 'input-streaming' ? 'loading'
    : 'proposed';
}
```

One function maps SDK part state → one product state vocabulary
(`proposed | loading | signing | signed | cancelled | failed`), and **terminal part state beats
transient local UI state** so a remount reconstructs the truth rather than the last render.

**READ** — `ReceiptController.tsx:90-121` shows the discipline around resolution:

```tsx
const onAuthorize = async () => {
  if (inFlight.current) return; // synchronous re-entry / double-submit guard
  inFlight.current = true;
  setLocal('signing');
  try {
    const digest = await submit(toolName, input, {...});
    addToolResult({ tool: toolName, toolCallId: part.toolCallId, output: { digest } });
    onOutcome?.({ toolCallId: part.toolCallId, toolName, status: 'signed', digest });
  } catch (e) {
    // A wallet decline is a cancellation, not a failure — render the void receipt + log it as cancelled.
    if (isUserRejection(e)) {
      addToolResult({ tool: toolName, toolCallId: part.toolCallId, output: { status: 'cancelled' } });
      onOutcome?.({ toolCallId: part.toolCallId, toolName, status: 'cancelled' });
    } else {
      addToolResult({ tool: toolName, toolCallId: part.toolCallId, state: 'output-error', errorText: reasonFor(e) });
      onOutcome?.({ toolCallId: part.toolCallId, toolName, status: 'failed' });
    }
    setLocal('idle'); // allow retry after a failure
  } finally { inFlight.current = false; }
};
```

Three details worth lifting verbatim into a spec:

1. **A wallet decline is a cancellation, not a failure.** Directly aligned with flare-kit's
   "an unknown outcome is never rendered as failed".
2. **A `useRef` re-entry guard**, because `useState` flips next render and a fast double-click queues
   two wallet prompts.
3. **The outcome is reported to a separate ledger** (`onOutcome`) at the instant it resolves —
   independent of the transcript. Comment at `ReceiptController.tsx:43`:
   *"Reported the instant a write resolves — persisted independently of the transcript (the ledger)."*
   **INFERENCE:** that is the same idea as flare-kit's "every operation persists its state and
   evidence" — the chat transcript is a view, not the record of record.

`ReceiptController.tsx` is 190 lines; `SignReceipt` is the one shared presentational component both
it and the bespoke spot cards render into.

---

## B. MCP server shape

### B1. Both MCP servers are thin shims over a shared `core`

**READ** — `portaldot-mcp/packages/mcp/src/index.ts` is the **entire** MCP package: **30 lines**.

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { allTools, logger } from "@portaldot-mcp/core";

async function main(): Promise<void> {
  const server = new McpServer({ name: "portaldot-mcp", version: "0.1.0" });
  for (const t of allTools) {
    server.registerTool(
      t.name,
      { description: t.description, inputSchema: t.inputShape },
      async (args) => {
        const res = await t.handler(args as Record<string, unknown>);
        if (res.ok) return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
        return { content: [{ type: "text", text: res.error }], isError: true };
      },
    );
  }
  await server.connect(new StdioServerTransport());
}
```

`deepbookie/packages/mcp/src/index.ts` is **81 lines** and the same shape, plus signing.

**All 34 (portaldot) / ~30 (deepbookie) tools live in `packages/core`.** The MCP package contains no
tool logic at all.

### B2. The tool definition — portaldot's uniform `ToolDef`

**READ** — `portaldot-mcp/packages/core/src/lib/tool.ts` (23 lines, whole file):

```ts
/**
 * Define a tool with a type-safe handler. The handler receives input already
 * parsed/validated against `inputShape`. The returned `ToolDef` is uniform so
 * `mcp` and `web` can register it without knowing the concrete shape.
 */
export function defineTool<Shape extends RawShape>(def: {
  name: string;
  description: string;
  inputShape: Shape;
  handler: (input: z.infer<z.ZodObject<Shape>>) => Promise<Result<unknown>>;
}): ToolDef {
  const schema = z.object(def.inputShape);
  return { name: def.name, description: def.description, inputShape: def.inputShape,
           handler: (input) => def.handler(schema.parse(input)) };
}
```

`packages/core/src/registry.ts` is a flat `export const allTools: ToolDef[] = [...]` of 32 entries.

### B3. deepbookie's `read | write` split — the better model for a chain toolkit

**READ** — `deepbookie/packages/core/src/tool.ts` (38 lines, whole file):

```ts
/** Which DeepBook primitive a tool belongs to (lets adapters filter, e.g. demo = predict-only). */
export type Surface = 'predict' | 'spot' | 'margin';

/** A read tool runs server-side (indexer / devInspect) and returns JSON. No wallet, no signing. */
export interface ReadTool<S extends AnyObject = AnyObject> extends Base<S> {
  kind: 'read';
  read: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

/** A write tool BUILDS an unsigned Sui transaction. Signing happens at the edge (local key or wallet). */
export interface WriteTool<S extends AnyObject = AnyObject> extends Base<S> {
  kind: 'write';
  build: (args: z.infer<S>, ctx: ToolContext) => Promise<Transaction>;
}

export type ToolDef = ReadTool | WriteTool;
export function defineRead<S>(def: Omit<ReadTool<S>, 'kind'>): ReadTool<S> { return { ...def, kind: 'read' }; }
export function defineWrite<S>(def: Omit<WriteTool<S>, 'kind'>): WriteTool<S> { return { ...def, kind: 'write' }; }
```

**READ** — `deepbookie/packages/core/src/adapter.ts` (39 lines, whole file):

```ts
/**
 * Transport-free view of the registry — every adapter (MCP, CLI, web) consumes this same shape.
 * Reads run server-side; writes return an UNSIGNED transaction the caller signs at the edge.
 */
export function getToolsForAdapter(tools: ToolDef[], ctx: ToolContext) {
  const byName = new Map(tools.map((t) => [t.name, t]));
  return {
    list: (): ToolInfo[] => tools.map((t) => ({ name: t.name, description: t.description, surface: t.surface, kind: t.kind })),
    schema: (name: string) => byName.get(name)?.inputSchema,
    read: async (name, args) => { const t = byName.get(name); if (!t || t.kind !== 'read') throw new Error(...); return t.read(t.inputSchema.parse(args), ctx); },
    build: async (name, args) => { const t = byName.get(name); if (!t || t.kind !== 'write') throw new Error(...); return t.build(t.inputSchema.parse(args), ctx); },
  };
}
```

**The key architectural property: a write tool never signs.** It returns an unsigned transaction. The
*adapter* decides who signs:

- MCP (`packages/mcp/src/index.ts:47-48`): `const tx = await api.build(tool.name, args);
  const res = await signAndExecute(ctx.client, tx, kp);` — local key.
- CLI (`packages/cli/src/cli.ts`): same local key, via `ctxApi()`.
- Web (`apps/web/src/lib/ai/tools.ts`): no `execute` at all — the browser wallet signs.

**INFERENCE:** this is the exact shape flare-kit needs. It makes "read and plan tools need no key at
all" (CLAUDE.md) a *type-level* fact, not a convention. And `Surface` generalises directly to
flare-kit's operation families.

### B4. Defining a tool once, exposing it to both MCP and the AI SDK

Three adapters exist across the references, all off one registry.

**MCP registration** — **VERIFIED** against the shipped `@modelcontextprotocol/sdk@1.30.0`
`dist/esm/server/mcp.d.ts` (line 150):

```ts
registerTool<OutputArgs extends ZodRawShapeCompat | AnySchema,
             InputArgs extends undefined | ZodRawShapeCompat | AnySchema = undefined>(
  name: string,
  config: {
    title?: string;
    description?: string;
    inputSchema?: InputArgs;
    outputSchema?: OutputArgs;
    annotations?: ToolAnnotations;
    _meta?: Record<string, unknown>;
  },
  cb: ToolCallback<InputArgs>,
): RegisteredTool;
```

**VERIFIED** — `dist/esm/server/zod-compat.d.ts` shows `inputSchema` accepts *either* a raw shape
(`Record<string, AnySchema>`) *or* a whole Zod object, and supports zod v3 and v4 side by side:

```ts
export type AnySchema = z3.ZodTypeAny | z4.$ZodType;
export type ZodRawShapeCompat = Record<string, AnySchema>;
```

So portaldot's `inputSchema: t.inputShape` (raw shape) and deepbookie's `inputSchema: tool.inputSchema.shape`
both still typecheck on 1.30.0. This is a backwards-compatible widening
(https://github.com/modelcontextprotocol/typescript-sdk/pull/816), not a break.

**AI SDK registration from the same registry** — **READ**, `portaldot-mcp/packages/web/app/api/chat/route.ts:40-57`
and `deepbookie/apps/web/src/lib/ai/tools.ts:47-79` (both quoted in A5).

**VERIFIED — the third path, which no reference takes: consume your own MCP server over MCP.**
`createMCPClient` now lives in a dedicated package, **`@ai-sdk/mcp`** (npm: **2.0.31**, verified
today), not in `ai` and no longer `experimental_`-prefixed:

```ts
import { createMCPClient } from '@ai-sdk/mcp';
const mcpClient = await createMCPClient({ transport: { type: 'http', url: 'https://your-server.com/mcp', headers: {...} } });
const tools = await mcpClient.tools();               // schema discovery — no TS types
const typed = await mcpClient.tools({ schemas: {     // explicit — typed
  'get-weather': { inputSchema: z.object({ location: z.string() }),
                   outputSchema: z.object({ temperature: z.number(), conditions: z.string() }) },
}});
```

**OBSOLETE:** `experimental_createMCPClient` imported from `ai`. Replaced by `createMCPClient` from
`@ai-sdk/mcp`.

**VERIFIED pitfalls**, from https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools:

- **stdio "should only be used for local servers"** — cannot deploy to production. HTTP is the
  production transport.
- **Retries are off by default**; enabling them on non-idempotent tools duplicates side effects.
  For a chain write tool this is a correctness hazard, not a performance note.
- **Schema discovery loses type safety** — `mcpClient.tools()` returns untyped tools. You must pass
  explicit `schemas` to get types, which means writing the schema twice.
- Client must be closed: `onEnd: async () => { await mcpClient.close(); }`.
- `fingerprintTools` / `detectToolDrift` exist to detect a server mutating its tool definitions
  (both **VERIFIED** as exports of `ai@7.0.65`).

**INFERENCE — the pitfall that decides the architecture.** Going app → MCP → core adds a network
hop, loses static types (or forces duplicate schemas), and inherits the retry hazard, all to reach
code that is already a workspace import away. Every reference that ships both an MCP server and a
web app imports `core` directly in the app and registers the *same registry* twice. That is one
definition and two adapters, not one definition and a proxy. **The only reason to have the app speak
MCP to its own server would be to dogfood the wire protocol** — which is a testing goal, not an
architecture.

**VERIFIED transports on the server side** (`@modelcontextprotocol/sdk@1.30.0`, `dist/esm/server/`):
`stdio.js`, `streamableHttp.js`, `webStandardStreamableHttp.js`, `sse.js`, plus `express.js` and a
`middleware/` directory. **SSE is deprecated** — `sse.d.ts:35`:

> `@deprecated SSEServerTransport is deprecated. Use StreamableHTTPServerTransport instead.`

Both references use stdio only. **INFERENCE:** a hosted flare-kit MCP endpoint would use
`StreamableHTTPServerTransport` (or the web-standard variant, which suits an edge runtime); stdio
remains right for the locally-installed `npx` server.

**VERIFIED — MCP Apps (new in AI SDK 7, relevant to generative UI over MCP).** From
https://ai-sdk.dev/docs/ai-sdk-core/mcp-apps: an MCP server can declare a `ui://` resource containing
HTML that the client renders **in a sandboxed iframe** via `experimental_MCPAppRenderer` from
`@ai-sdk/react`. Tools carry `_meta.ui.visibility` marking them model-visible, app-only, or both;
`splitMCPAppTools()` filters, `readMCPAppResource()` fetches, `mcpAppClientCapabilities` advertises
support. **INFERENCE:** this is generative UI *shipped by the server* rather than by the app. It is
the opposite trade from flare-kit's: an iframe of server HTML cannot honour `DESIGN.md`'s token
contract or the mono-face rule. Worth knowing it exists; I would not build the primary surface on it.

### B5. Build and publish

**READ** — `portaldot-mcp/packages/mcp/tsup.config.ts`, and its comment is the whole lesson:

```ts
export default defineConfig({
  entry: ["src/index.ts"], format: ["esm"], dts: false, clean: true, sourcemap: true, target: "es2022",
  // Bundle our own @portaldot-mcp/core source in so the published `portaldot-mcp` is
  // self-contained (no workspace dep to resolve on npm). Keep @polkadot/*, pino, and the MCP SDK
  // external — they're declared as runtime dependencies and bundling CJS deps like pino into an
  // ESM bundle breaks their dynamic require()s.
  noExternal: ["@portaldot-mcp/core"],
  banner: { js: "#!/usr/bin/env node" },
});
```

`packages/core` is `"private": true` and gets **bundled into** the published `portaldot-mcp`.
deepbookie instead publishes `@deepbookie/core` and declares `"@deepbookie/core": "workspace:*"` as a
real dependency of `@deepbookie/mcp`.

**INFERENCE:** flare-kit publishes `@flarekit-dev/*` as real packages, so deepbookie's model
(workspace dep → published dep) is the fit. portaldot's bundling trick is what you do when core is
private.

Both MCP packages: `"bin": { "<name>": "./dist/index.js" }`, `"files": ["dist"]`, `type: module`,
`engines.node >= 20`, `prepublishOnly: tsup`.

### B6. `skills/` — what they are and how they relate to the MCP server

**READ.** Both repos ship exactly one skill, and it is **documentation, not code**:

- `portaldot-mcp/packages/skills/portaldot/` — `SKILL.md` + `package.json`, nothing else.
- `deepbookie/skills/deepbookie/` — `SKILL.md` + `package.json` (`"private": true`), nothing else.

`SKILL.md` is YAML frontmatter (`name`, `description`, `version`) plus prose: when to use, when
**not** to use, first-time setup, an intent→tool→args table, a typical flow, and the surfaces.
Portaldot's `description` is a single long trigger sentence listing every noun that should fire it.

**READ** — deepbookie's `SKILL.md` states the security model in one line, in the place an agent will
actually read it:

> Every tool builds an **unsigned** transaction; your wallet signs it — the agent holds no key.

and closes with:

> **CLI:** `deepbookie call <tool> '<json-args>'` … **MCP:** run `deepbookie-mcp` (stdio) and add it
> to any MCP client; all tools above are exposed.

**Relationship to the MCP server:** none mechanically. Nothing generates the skill from the registry,
and nothing validates that the tool names in the table still exist. It is a hand-maintained playbook
that tells an agent *when* to reach for the tools the MCP server exposes. **INFERENCE:** the drift
risk is obvious and real (a renamed tool silently breaks the playbook); generating the intent table
from `allTools` would fix it, and no reference does so.

---

## C. App shell

### C1. Sidebar with chat as a peer — three different answers

**portaldot (READ)** — chat *is* the app; the sidebar is a prompt launcher, not navigation.
`packages/web/components/app/app-sidebar.tsx:20-25`:

> The sidebar's *only* job is launching prompts. Don't dress that up with a generic icon list — show
> the prompts themselves. Each card is a starter the user can fire as-is: a short title + the full
> prompt text, filterable via a small input at the top.

Starters are a typed array grouped `"you" | "chain"`. Routing: `/` landing, `/app` chat, `/docs/*`.
The hero passes `?prompt=` into `/app`, consumed once after wallet connect then stripped via
`router.replace('/app', { scroll: false })` (`chat-app.tsx:110-124`). Layout is shadcn
`SidebarProvider` / `AppSidebar` / `SidebarInset` with a sticky `h-14` header.

**Chat history: none.** "New chat" is `setMessages([])` (`chat-app.tsx:126-131`). No persistence, no
list, no URL per conversation.

**deepbookie (READ)** — chat is one destination among peers.
`apps/web/src/components/shell/AppShell.tsx` (24 lines, whole file):

```tsx
/** Responsive app shell: top bar + desktop left-nav / mobile bottom-tab-bar around one content surface. */
export function AppShell({ children }: { children: ReactNode }) {
  // h-[100dvh] (dynamic viewport) — on iOS Safari 100vh overflows the visible area, so the inner
  // scroll container could never reach its bottom content under the browser chrome. dvh fixes that.
  return (
    <div className="flex h-[100dvh] flex-col bg-canvas">
      <TopBar />
      <NetworkGuard />
      <div className="flex min-h-0 flex-1">
        <DesktopNav />
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <MobileTabBar />
    </div>
  );
}
```

Routes under one `(app)` group: `/chat`, `/markets`, `/markets/[id]`, `/positions`, `/vault`,
`/history`, `/tools`. `NetworkGuard` sits at shell level, above the content — a wrong-network banner
is chrome, not a per-page concern. **The `min-h-0` + `overflow-hidden` + `100dvh` combination is
precisely the "fixed panel, scrolls internally" behaviour flare-kit's CLAUDE.md specifies for
`app.flare-kit.xyz`.**

Chat history is real: `chatId = crypto.randomUUID()` per session, persisted server-side in
`toUIMessageStreamResponse({ onFinish })` **and** client-side by a debounced `PATCH /api/chats/:id`
(`Chat.tsx:66-84`), whose comment explains why both exist:

> Belt-and-suspenders client save: PATCH the transcript ~after each settled turn so a tab closed
> mid-stream never loses a signed session … The server `onFinish` covers the normal case; this closes
> the tab-close gap.

Plus a rule no other reference has (`Chat.tsx:13-16`):

> A chat auto-archives after this much inactivity → read-only (no sending, no live/clickable cards).
> 30 min: long enough to step away briefly, short enough a stale tab can't sign a stale proposal.

An archived chat renders every tool part statically (`MessagePart.tsx:120-150`) — no Sign buttons on
a finished conversation, and no hook-firing read widgets that would poll the network forever.

**stacks-frontend (READ)** — the Vercel `ai-chatbot` shape: `app/chat/layout.tsx` wraps
`SidebarProvider` + `AppSidebar` + `SidebarInset`, reading `sidebar:state` from a cookie for SSR;
`app/chat/[id]/page.tsx` is the per-conversation route; `components/sidebar-history.tsx` (429 lines)
paginates via `useSWRInfinite` and buckets by `today / yesterday / lastWeek / lastMonth / older`.
Messages are stored in Postgres via Drizzle with `parts` as serialised JSON
(`app/api/chat/route.ts:142-153, 188-199`). Resumable streams via `resumable-stream` + Redis, with a
graceful disable when `REDIS_URL` is absent (`route.ts:43-61`).

**VERIFIED persistence API in `ai@7.0.65`** (https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence):
persist in **`onEnd`** (not `onFinish`), generate stable ids with
`generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 })`, and call `result.consumeStream()`
without awaiting so the result is stored even if the client disconnects. stacks-frontend already does
the `consumeStream()` part (`route.ts:179`) on the old spelling.

### C2. Multi-step flows — stellar-zk-wallet

**READ.** `apps/web/src/wallet/screens.ts` is one line — the entire navigation vocabulary:

```ts
export type WalletScreen = 'home' | 'activity' | 'receive' | 'shield' | 'send' | 'unshield' | 'bridge' | 'discover' | 'disclosure' | 'confidential' | 'settings' | 'tools'
```

`WalletShell.tsx` (169 lines) holds `useState<WalletScreen>('home')`, renders a fixed 236px `<aside>`
from a `NAV` array, and a `<main>` that is the only scroll container
(`style={{ flex: 1, minWidth: 0, height: '100%', overflowY: 'auto' }}`). Screen selection is a flat
list of `{screen === 'x' ? <XScreen … /> : null}`. Expensive shared state is hoisted deliberately
(`WalletShell.tsx:80-83`):

> Loaded once for the whole shell so the expensive prover note-load is shared across Home + Activity
> instead of re-running on every tab switch.

`flowChrome.tsx` (64 lines) is the reusable interaction model and the most transferable piece:

- `FlowHeader({ title, onBack, badge })` — back affordance, title, optional boundary badge.
- `FlowStepRail({ title, steps, current, note })` — a 200px left rail of numbered steps where each
  step is `done` (✓, green), `active` (accent fill), or pending (outline), joined by 1px connectors,
  with a persistent note pinned to the bottom.

`stepDotStyle(done, active)` is the whole state vocabulary of the rail, in 5 lines. **INFERENCE:** a
step rail whose steps are *observed* states maps cleanly onto flare-kit's operation lifecycle — and
critically, it can render "step 3 reached, step 4 unknown" without claiming step 4 failed.

**READ** — `packages/ui` (16 files, 1664 lines total, every file under 250) is a real
one-component-per-pattern library:

- `primitives.tsx` (249) — `StatusPill` over `type TxStatus = 'proving' | 'confirmed' | 'spendable' | 'bridging' | 'pending'`,
  `BoundaryBadge`, `Card`, `Callout` (`'info' | 'warn' | 'public' | 'danger' | 'shielded'`),
  `NetworkPill`, `Chip`, `Pill` (`'pos' | 'warn' | 'ac' | 'neutral'`).
- `proving.tsx` (200) — `Spinner`, `ProvingRing`, `ProofStepList`, `EventStepTracker`.
- `review.tsx` (44) — `ReviewRow({ label, value, mono })` + `ReviewCard({ rows })`. **The `mono` flag
  on a row is the same idea as flare-kit's "exact values render in the mono face".**
- `cards.tsx` (97) — `ShieldedCard` / `PublicCard`, one per trust boundary.

Every status vocabulary is a `type` union in the package, used by pills and rails alike. Theming is
CSS variables (`var(--ac)`, `var(--tx2)`, `var(--bd)`) — a runtime contract, matching flare-kit's
`data-theme` approach.

**Caveat (READ):** it is Vite + React with **inline `style={{}}` objects everywhere**, not Tailwind
and not CSS modules. The *vocabulary* transfers; the styling mechanism does not. Screen files are
also large — `BridgeScreen.tsx` 16.3 KB, `ShieldScreen.tsx` 16.4 KB, `ConfidentialScreen.tsx` 17.7 KB.

### C3. Wallet connection, network switching, read-only vs connected

**portaldot (READ)** — `lib/wallet.tsx` is a React context with an explicit, ordered registry of
supported wallets rather than a generic connector:

```ts
export const KNOWN_WALLETS: KnownWallet[] = [
  { id: "subwallet-js", name: "SubWallet", install: "…", tag: "Recommended" },
  { id: "talisman", … }, { id: "polkadot-js", … }, { id: "nova", …, tag: "Mobile" },
];
```

`detectWallets()` reads `window.injectedWeb3` and returns `{ ...known, installed }`, so the picker can
show install links for absent wallets. Read-only is **hard-gated**: `<WalletGate />` replaces the
whole chat when `!account`, the composer placeholder becomes `"Connect your wallet to chat"`, and
`send()` early-returns `if (!t || !account) return`. **No network switching** — one chain.

**deepbookie (READ)** — `@mysten/dapp-kit`; `NetworkGuard` is shell-level chrome; wallet address is
resolved client-side and cached in React Query, then passed to the route. The security note is stated
twice, identically, in the route and the tool builder: `walletAddress` is *"the quote sender only,
never an authorization signal"*. **Read-only is soft** — pre-wallet reads work
(`apps/web/src/app/api/chat/route.ts:109-110`: *"walletAddress is optional (launcher-first reads run
pre-wallet)"*), and only writes require a wallet. **INFERENCE:** the soft gate is the better fit for
flare-kit, whose read and plan tools need no key at all.

**stacks-frontend (READ)** — the wallet address **is** the auth identity:
`POST /api/chat` rejects with `unauthorized:api` if no `walletAddress` in body or `x-wallet-address`
header, then `authenticateWallet(walletAddress)` creates or fetches a user
(`app/api/chat/route.ts:87-109`). An unsigned, client-supplied address is trusted as identity, and
`DELETE` accepts it from a **query string** (`route.ts:230`). This is an authentication bypass by
construction. Do not copy it.

---

## D. What NOT to copy

### D1. Licences

| Repo | Licence | Implication |
|---|---|---|
| `stacks-frontend` | **Apache-2.0**, "Copyright 2024 Vercel, Inc." (fork of `ai-chatbot`) | Permissive. Copying source into a published package requires preserving the notice and attributing. |
| `portaldot-mcp` | **MIT**, "Copyright (c) 2026 Blockchain-Oracle" | Permissive; preserve the notice. |
| `deepbookie` | **No root `LICENSE` file.** Each `packages/*/package.json` declares `"license": "MIT"`. | The declaration is there but the text is missing. **INFERENCE:** treat as MIT-intended but note the gap if lifting code verbatim. |
| `stellar-zk-wallet` | **No `LICENSE` file at all.** | Abu's own repo, so not a third-party hazard — but nothing is licensed to anyone else either. |

**Uniswap's interface is GPL-3.0** — as instructed: read-and-learn only, never copy source into a
published package. I found no Uniswap code in any of the four repos (grep for `uniswap`/`GPL` in
stacks-frontend's manifest and README: no hits). The hazard is prospective, not present.

Vendored-UI note: `portaldot-mcp/packages/web/components/ui/` contains shadcn/Radix components plus
several clearly third-party-sourced ones (`prisma-hero.tsx`, `spotlight-card.tsx`, `header-1.tsx`,
`floating-nav.tsx`) with no per-file attribution. shadcn is MIT and copy-in-by-design, but
provenance for the decorative ones is not recorded in the repo. **INFERENCE:** if any of those come
from a registry with different terms, the record does not exist to prove it.

### D2. Anti-patterns, with the rule each one violates

| # | Anti-pattern | Evidence | flare-kit rule broken |
|---|---|---|---|
| 1 | **Mock data as a production fallback.** | `stacks-frontend/app/api/mcp/[tool]/route.ts` ships a `mockResponses` map of invented balances, reserves, vault collateralisation and liquidation prices, returned whenever `NODE_ENV === "development"` **or** `MCP_SERVER_TOKEN` is unset — i.e. **a missing credential silently serves fake protocol state**. The real call is a `// TODO: Implement actual MCP server connection`. | "Never fake protocol reality"; "Mock mode is explicit, labelled, and never a fallback triggered by a failure." The single worst thing in the reference set. |
| 2 | **2441-line renderer, 96 inline branches.** | `stacks-frontend/components/message.tsx` (A2). | "Production source files stay under 300 lines"; "Never build a card, badge, pill, chip or spine inline inside a screen." |
| 3 | **Dead duplicate branches that disagree.** | `tool-charismaGetQuote` at lines 478 and 1922 render `CharismaQuote` vs `SwapInfo`; also `charismaListOrders`, six `granitePrepare*`. | "Delete dead code as you migrate. Never keep two versions of the same screen." |
| 4 | **Errors render as nothing.** | Only `input-available` and `output-available` handled in all 96 branches; `output-error` absent entirely (A2). | "An unknown outcome is never rendered as failed" — and its converse: a failure must not vanish. |
| 5 | **`output as any` on every tool result.** | `message.tsx`, all 86 output branches. Root cause: the tools generic is commented out in `lib/types.ts:24-28`. | `InferUITools` exists (**VERIFIED**, A1); there is no reason to be untyped. |
| 6 | **Client-supplied wallet address as authentication.** | `stacks-frontend/app/api/chat/route.ts:87-109`; `DELETE` takes it from a query string (line 230). | Contrast deepbookie, which says twice that `walletAddress` is *"never an authorization signal"*. |
| 7 | **`console.log` of every tool part on every render.** | `message.tsx:246-254` logs `{ type, state, hasOutput, part }` — the whole part, including inputs — for each tool part, each render. | "The only secrets are signing keys, and they are never … logged". A transaction preview is not a secret, but wholesale part logging is the habit that leaks one. |
| 8 | **Committed build artefacts.** | `stacks-frontend/tsconfig.tsbuildinfo` is checked in; `package.json` depends on stray packages `add`, `dlx`, `badge`, and on `pnpm` itself as a dependency. | Hygiene. Signals the manifest is not curated. |
| 9 | **Duplicated result shapes across cards.** | portaldot's every card takes `{ data }: { data: Record<string, unknown> }` (`tools.tsx`, 20+ exports) — each card re-reads and re-validates untyped keys. | "One shared component per pattern" is satisfied; the *type* contract is not. deepbookie does better: typed `Market`, `Odds`, `Quote`, `Portfolio` from `lib/bff/types`. |
| 10 | **Oversized components in the "good" references too.** | `portaldot/components/tools.tsx` **831 lines** (21 card components in one file); `portaldot/components/app/chat-app.tsx` **325 lines**. | 300-line limit. `tools.tsx` needs to be one file per card. |

**Files that would pass a 300-line limit today:** deepbookie's `MessagePart.tsx` (295),
`ReceiptController.tsx` (190), `receiptState.ts` (25), `adapter.ts` (39), `tool.ts` (38);
portaldot's `mcp/src/index.ts` (30), `core/lib/tool.ts` (23), `registry.ts` (63); stellar's entire
`packages/ui` (every file ≤ 249) and `flowChrome.tsx` (64).

---

## E. Current API, verified today (2026-08-14)

Consolidated reference. Everything in this section was checked today against the npm registry, a
published package's shipped `.d.ts`, or current vendor docs. Nothing here is from a reference repo.

### E.1 Versions

`ai@7.0.65` · `@ai-sdk/react@4.0.68` · `@ai-sdk/anthropic@4.0.38` · `@ai-sdk/mcp@2.0.31` ·
`@modelcontextprotocol/sdk@1.30.0` · `next@16.3.1`.
Legacy lines stay published: `ai@ai-v6 → 6.0.255`, `ai@ai-v5 → 5.0.236`.

### E.2 AI SDK 7 renames that break all three reference chat routes

| Old | New |
|---|---|
| `system:` | **`instructions:`** |
| `onFinish:` | **`onEnd:`** |
| `StreamTextResult.fullStream` | **`.stream`** |
| `result.toUIMessageStreamResponse()` | deprecated → top-level helpers |
| `tool({ needsApproval })` | **`streamText({ toolApproval })`** |
| `experimental_createMCPClient` from `ai` | **`createMCPClient` from `@ai-sdk/mcp`** |
| system message inside `messages` | requires **`allowSystemMessages: true`** |

Also: Node 22 minimum; ESM only.

### E.3 Tool part states (7)

`input-streaming` → `input-available` → [`approval-requested` → `approval-responded` |
`output-denied`] → `output-available` (possibly repeatedly, with `preliminary: true`) | `output-error`.

Part naming: `` `tool-${toolName}` ``. Dynamic (runtime-discovered, e.g. MCP) tools arrive as
`type: 'dynamic-tool'` with a `toolName` field instead. Guards: `isToolUIPart`,
`isStaticToolUIPart`, `isDynamicToolUIPart`, `getToolName`, `getStaticToolName`.

### E.4 `useChat` — current surface

Returns: `id`, `messages`, `status` (`'submitted' | 'streaming' | 'ready' | 'error'`), `error`,
`sendMessage`, `regenerate`, `stop`, `clearError`, `resumeStream`, `setMessages`,
**`addToolOutput`**, **`addToolApprovalResponse`**.

```ts
addToolOutput({ tool: string, toolCallId: string, output: unknown })
addToolOutput({ tool: string, toolCallId: string, state: 'output-error', errorText: string })
addToolApprovalResponse({ id: string, approved: boolean, reason?: string })
```

Options: `transport` (`DefaultChatTransport`), `onToolCall`, `onData`, `onFinish`,
`sendAutomaticallyWhen` — with the two supplied predicates
`lastAssistantMessageIsCompleteWithToolCalls` and `lastAssistantMessageIsCompleteWithApprovalResponses`.

> **Naming note:** deepbookie calls it `addToolResult`, portaldot calls it `addToolOutput`. On
> `ai@7` it is **`addToolOutput`**. deepbookie's own alias type is honest about this:
> *"Mirrors the AI SDK's discriminated tool-result contract (success xor error)."*

### E.5 Tool definition

```ts
tool({ description, inputSchema, outputSchema?, execute?, strict?, toModelOutput? })
```

- `execute` may return `OUTPUT`, `PromiseLike<OUTPUT>`, or **`AsyncIterable<OUTPUT>`** (each yielded
  value → a `preliminary` output part; the last is re-emitted as final).
- **`outputSchema` is REQUIRED when `execute` is omitted** (the client-signed / HITL case).
- `needsApproval` is deprecated in favour of `toolApproval` on the call.

### E.6 Tool approval

```ts
streamText({
  toolApproval: { transfer: 'user-approval' },              // static
  // or: { transfer: async (input, { runtimeContext }) => 'user-approval' | { type:'denied', reason } | undefined }
  // or: ({ toolCall }) => 'user-approval' | undefined      // generic policy
  experimental_toolApprovalSecret: process.env.TOOL_APPROVAL_SECRET,  // HMAC-binds input to approval
})
```

Statuses: `'not-applicable'` | `'approved'` | `'denied'` | `'user-approval'`, string or
`{ type, reason }`. `part.approval.isAutomatic` distinguishes a policy decision from a human one.

### E.7 MCP client (`@ai-sdk/mcp@2.0.31`)

```ts
const client = await createMCPClient({ transport: { type: 'http', url, headers, authProvider }, maxRetries: 2 });
const tools = await client.tools();                       // discovery, untyped
const tools = await client.tools({ schemas: { 'x': { inputSchema, outputSchema } } });  // typed
await client.close();
```

Transports: `http` (production), `sse`, `StdioClientTransport` (**local only**).
Retries default off — enable only for idempotent tools. `fingerprintTools` / `detectToolDrift`
guard against a server silently changing tool definitions.

### E.8 MCP server (`@modelcontextprotocol/sdk@1.30.0`)

```ts
new McpServer({ name, version })
server.registerTool(name, { title?, description?, inputSchema?, outputSchema?, annotations?, _meta? }, cb)
```

`inputSchema`/`outputSchema` accept a raw shape **or** a full Zod object; zod v3 and v4 both supported
via `zod-compat`. `.tool()` / `.prompt()` / `.resource()` are **deprecated** in favour of
`registerTool` / `registerPrompt` / `registerResource`.

Transports shipped: `StdioServerTransport`, `StreamableHTTPServerTransport`,
`WebStandardStreamableHTTP…`, plus Express/Node/Fastify/Hono middleware.
**`SSEServerTransport` is deprecated — use Streamable HTTP.**

### E.9 Persistence

Persist in **`onEnd`**. Stable ids via `generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 })`.
Call `result.consumeStream()` **without awaiting** so the result is stored even if the client
disconnects. Load history through `useChat({ id, messages: initialMessages })`.

---

## F. Open questions and what I could not determine

1. **Which flare-kit surface owns the AI SDK dependency.** `ai@7` is ESM-only and Node-22-minimum.
   CLAUDE.md requires published packages to ship **dual ESM/CJS** and pass `publint`. Those are
   compatible only if `ai` stays a dependency of the *app*, never of a published package. I did not
   find anything in the repo stating that boundary, so it is an open decision, not a finding.

2. **Whether `app.flare-kit.xyz` should consume its own MCP server over the wire.** I laid out the
   costs in B4 (network hop, lost types or duplicated schemas, retry hazard) and noted that no
   reference does it. The counter-argument — dogfooding the protocol the toolkit publishes — is real
   and I cannot weigh it without knowing whether the MCP server is a demo artefact or a first-class
   product surface.

3. **Whether flare-kit needs `toolApproval` at all, or only no-`execute` tools.** Depends entirely on
   whether the app ever holds a signing key server-side. `.thoughts/decisions/2026-08-03-agent-facing-surfaces.md`
   says agents may sign with their own key — I did **not** read that decision file (it is outside the
   scope I was given) and have not verified what it implies for the web app. Someone should.

4. **Whether `preliminary` outputs survive persistence and reload.** The types show `preliminary?: boolean`
   on `output-available`, and the docs describe the streaming semantics, but I found **no**
   documentation of what a persisted transcript contains after preliminary outputs — whether only the
   final output is stored, or the intermediate ones too. For flare-kit's self-reconciling operations
   this matters and I could not determine it from docs or types. It needs an experiment.

5. **What `resumable-stream` looks like on `ai@7`.** stacks-frontend uses `resumable-stream@2` +
   Redis with `createResumableStreamContext`. `resumeStream()` is still on `useChat` (**VERIFIED**),
   and `PrepareReconnectToStreamRequest` is exported from `ai@7.0.65` — but I did not verify the
   current server-side recipe.

6. **MCP Apps' practical maturity.** `experimental_MCPAppRenderer` is prefixed experimental. I read
   the docs page (B4) but found no shipped example and did not test it. I would not plan around it.

7. **`@deepbookie/core`'s actual publish state.** The manifests declare MIT and
   `publishConfig.access: public`, but the repo has no root `LICENSE`, and I did not check npm for
   whether these packages are actually published. Relevant only if code is lifted verbatim.

8. **Motion vocabulary specifics.** I catalogued stellar-zk-wallet's *component* vocabulary
   (`StatusPill`, `ProvingRing`, `FlowStepRail`, `EventStepTracker`) and its CSS-variable theming,
   but its animations are inline styles inside files I read only in part
   (`proving.tsx`'s `ProvingRing` is the interesting one, 41-153). I did not extract timing curves or
   durations. If the spec needs a motion contract rather than a component vocabulary, that file needs
   a closer read than I gave it.

9. **stacks-frontend's `components/sections/`, `hooks/`, and `lib/db/queries.ts`.** I did not open
   them. Given items D2.1–D2.8, I judged further excavation of that repo low-value relative to
   deepbookie, but that is a judgement call and it may have missed something.
