# flare-kit

The developer toolkit for Flare: one operation lifecycle across headless
TypeScript, React hooks, embeddable widgets and agent tools. Community-built,
not an official Flare Networks product.

Read `SPEC.md` for the current milestone and `DESIGN.md` for the token
contract. `DESIGN.md` outranks every default, taste skill and component
library. Product requirements live in `.thoughts/specs/`; decisions in
`.thoughts/decisions/`.

## Surfaces

- `flare-kit.xyz` — landing plus documentation. A document: full width, the
  page scrolls.
- `app.flare-kit.xyz` — the application, built on the published packages. An
  object on a surface: fixed panel, scrolls internally. Not a demo.
- `@flare-kit/*` on npm — the packages themselves.

## Hard rules

**Quality is not negotiable against time.** A deadline never drives a quality
or architecture decision, and plans are never framed as "what's feasible in N
days." If something cannot be built to the bar, ship it declared unbuilt
rather than built badly.

**Never fake protocol reality.** No invented balances, transaction hashes,
proof results, executor outcomes, bridge delivery, provider health or
availability. `submitted` is never rendered as `succeeded`. An unknown outcome
is never rendered as failed. Mock mode is explicit, labelled, and never a
fallback triggered by a failure.

**Production source files stay under 300 lines.** Split before writing, not
after. Generated and vendored files are exempt.

**Reuse, do not re-code.** One shared component per pattern in the UI package.
Never build a card, badge, pill, chip or spine inline inside a screen.

**Delete dead code as you migrate.** When a flow is rebuilt, remove the old
implementation. Never keep two versions of the same screen.

**Network is configuration.** Testnet first, mainnet-capable, with no source
rewrite to switch. Addresses come from `@flare-kit/contracts` and are never
hardcoded anywhere else.

**Public values are constants, not environment variables.** RPC URLs, chain
IDs and contract addresses are exported constants. The only secrets are
signing keys, and they are never committed, logged, printed in `--json` output,
or included in receipts, support bundles or analytics.

**Operations are non-blocking and self-reconciling.** Submitting never locks
the UI. Every operation persists its state and evidence and reconciles against
the chain when the app opens. There is no Resume button.

**Exact values render in the mono face** with tabular numerals, always carrying
their asset and full precision. A number in the body face is a bug.

## Verification

Never claim UI is done from a typecheck. Drive it in a browser, screenshot it,
and look at the screenshot. Never claim anything passes without showing the
command and its output.

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

Every chain-touching milestone records the date, network, addresses,
transaction hashes and explorer links as evidence.

## Conventions

- pnpm workspaces plus Turborepo. `apps/*` deploy; `packages/*` publish.
- Packages ship dual ESM/CJS and must pass `publint`.
- React, wagmi, viem and query libraries are peer dependencies, never bundled.
- Theme is runtime CSS variables under `data-theme`, not build-time variants.
- Agents may sign with their own key. Read and plan tools need no key at all.
  See `.thoughts/decisions/2026-08-03-agent-facing-surfaces.md`.

## Review gate

Every two to three features, dispatch review subagents and fix anything
critical or important before continuing. After each phase, dispatch the
simplifier: correctness review will not catch unrequested configuration,
because it works.
