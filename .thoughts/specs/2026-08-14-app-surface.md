# Spec: `app.flare-kit.xyz` — the application surface

Date: 2026-08-14
Status: **written, awaiting Abu's acceptance**
Governing decision: `.thoughts/decisions/2026-08-04-build-everything-real-first.md`
Visual authority: `.thoughts/decisions/2026-08-09-uniswap-recut-direction.md`, `DESIGN.md`
Evidence base: `.thoughts/research/2026-08-14-app-and-chat-references.md`

## Provenance, stated honestly

**Decided by Abu on 2026-08-14, in this order:**

1. **Scope — build over what ships today, reserve seams.** The app integrates every
   surface through M12 (plus M13 once merged). The chat, FCC and the operator
   release/claim surface get designed-for slots that are **declared unbuilt**, never
   stubbed with fake UI. Abu was offered "merge M13 first" and "shell first, wiring
   second" and chose this.
2. **Frame — a persistent left rail, with the chat as a peer in it.** Abu was shown
   three mockups and rejected both Uniswap-faithful header-nav and portfolio-home.
   The rail scales to eleven capability families without submenus.
3. **Mock — one driveable mock kit, DOCS ONLY. The app is chain-only.** The app
   connects to a real network or shows nothing. It never offers mock mode, not even
   to a visitor with no wallet. Abu was offered a labelled "Mock" network in the
   app's network toggle and declined it.

**Already decided, inherited, not re-opened here:**

- The app is a **real integration, not a demo**. `2026-08-03-product-name-and-domains.md`.
- Interaction conventions follow Uniswap (primary) and Jupiter (secondary) on our
  own palette, type and lifecycle. Uniswap's web interface is **GPL-3.0**:
  read-and-learn only, never copied into a published package.
- Agent-facing surfaces are **one tool definition with four deliveries** (tools
  package, MCP server, framework adapters, CLI), tool `class` is `read | plan | write`,
  and `read`/`plan` need no key. `2026-08-03-agent-facing-surfaces.md`.
- `state.json` carried a rule that the app comes LAST because it consumes the
  packages. Abu overrode that on 2026-08-14. The cost is named in R-APP-014.

**New in this spec, and therefore Abu's to reject:** everything numbered below.

## What this is

One application, built on the published packages, that a person connects a real
wallet to and performs real Flare operations with, on testnet or mainnet. It is
not a showcase and not a gallery. The gallery already exists and is a different
artefact.

The app's job is to be the proof that the packages work when assembled by
someone who did not write them.

## Requirements

### The frame

- **R-APP-001** A persistent left rail lists the capability families and, below a
  divider, `Chat`. The rail is the primary navigation; there are no submenus.
- **R-APP-002** The main panel renders the active family. The rail persists across
  navigation and marks the current entry with `aria-current`.
- **R-APP-003** A family the current network does not support is **shown and
  disabled, with the reason stated**, never hidden. Hiding it would misrepresent
  the protocol's shape as the app's shape.
- **R-APP-004** The top bar carries exactly two controls: the network selector and
  the account control. Nothing else competes with them.
- **R-APP-005** The app is a fixed panel that scrolls internally, per `CLAUDE.md`'s
  surface contract. The page itself does not scroll. This is the opposite of the
  docs site and the difference is deliberate.

### Network

- **R-APP-006** The network selector offers **Coston2 and Flare mainnet only**.
  There is no Mock entry (Abu's decision 3).
- **R-APP-007** Network is configuration. Addresses come from
  `@flarekit-dev/contracts`; no address is ever literal in this app.
- **R-APP-008** Every capability renders its own **verified flag** for the selected
  network. A capability whose flag is false is a read lens: it renders reads and
  refuses to compose a signable plan, stating why. Flare mainnet governance is the
  worked example — `governanceVerified` is false there and never flips from a read.
- **R-APP-009** Switching network never silently reinterprets an in-flight
  operation. Operations are scoped to the network they were created on.

### Connection

- **R-APP-010** EVM wallets are detected via EIP-6963 with Detected/Recent badges.
  The connect modal **names both chains**: an FAssets mint or redeem also links an
  XRPL wallet. This is the deliberate departure from Uniswap recorded in the re-cut
  decision.
- **R-APP-011** Disconnected is a **first-class state, not an error**. Every family
  renders its read-only view with no wallet, because `read` and `plan` need no key.
  A visitor with no wallet sees a working, honest, empty-of-their-own-data app.
- **R-APP-012** The app holds **no signing key, ever**. It composes plans; the
  user's own wallet signs. There is no server-side key and no server-side signing
  path. This is what makes R-CHAT's "the model never signs" enforceable rather than
  aspirational.

### Operations

- **R-APP-013** Every operation renders on the shared named-actor spine with the
  seven outcome glyphs. The app assembles existing components; it defines no card,
  badge, pill, chip or spine of its own. A pattern the app needs and the UI package
  lacks is added to the UI package.
- **R-APP-014** Operations are non-blocking and self-reconciling. Submitting never
  locks the UI, every operation persists its state and evidence, and the app
  reconciles against the chain on open. There is no Resume button.
- **R-APP-015** `submitted` is never rendered as `succeeded`; an unknown outcome is
  never rendered as failed. This is the whole product and it is restated here
  because an app is where the temptation to smooth it over is strongest.
- **R-APP-016** Exact values render in the mono face with tabular numerals,
  carrying their asset and full precision.

### Reserved seams

- **R-APP-017** `Chat`, FCC and the operator release/claim surface appear in the
  rail as **declared unbuilt**: named, reachable, and stating plainly that they are
  not built yet, with no fabricated preview. Each fills its slot in a later
  milestone **without a re-layout**.
- **R-APP-018** A declared-unbuilt entry states what it will do and what milestone
  owns it. "Coming soon" with no content is not acceptable.

### Boundaries

- **R-APP-019** `ai@7` is ESM-only and requires Node 22. Published packages must
  ship dual ESM/CJS and pass `publint`. **Therefore the AI SDK is a dependency of
  this app only, never of a published package.** A published framework adapter, if
  one ships, imports `ai` for **types only** and declares it a peer dependency, the
  way React, wagmi and viem already are. (Closes open question 1 of the research
  brief.)
- **R-APP-020** The app **imports the tools package directly** and does not consume
  its own MCP server over the wire. A network hop would cost the types, add a retry
  hazard on non-idempotent tools, and prove nothing the MCP server's own evidence
  does not already prove. The MCP server is dogfooded by running it against a real
  agent host and recording that as evidence. (Closes open question 2.)

## What it will not do

- It will not offer mock mode. Not as a toggle, not as a fallback, not on failure.
- It will not fabricate a balance, quote, proof, outcome, provider health or
  delivery. An unread value renders as `—`.
- It will not hide an unsupported capability to look more complete.
- It will not hold a key.
- It will not present itself as an official Flare Networks product.

## Acceptance criteria

- **AC1** Both networks selectable; every family renders its correct verified flag;
  a read-lens family refuses to compose and says why. Screenshot both networks.
- **AC2** With no wallet connected, every family renders a working read-only view.
  No error state, no empty shell.
- **AC3** One real operation performed end to end on Coston2 through the app,
  recorded with date, network, addresses, transaction hashes and explorer links.
- **AC4** An operation left in flight is reconciled correctly after a full page
  reload, with no Resume affordance.
- **AC5** The three reserved seams render as declared-unbuilt with their owning
  milestone named.
- **AC6** Both themes, browser-verified, screenshots read — not inferred from a
  typecheck.
- **AC7** No production source file over 300 lines. No card, badge, pill, chip or
  spine defined inside a screen.

## Open choices — Abu's, not mine

1. **Rail grouping.** Eleven families is a long rail. They can sit flat in one
   list, or under two or three unlabelled groups separated by rules. I lean flat
   until it demonstrably hurts, but this is taste.
2. **What the app opens on.** A portfolio home, or the first family in the rail.
   Abu rejected portfolio-*home* as the frame; that does not settle what the
   landing route is.
3. **Whether previews centre.** Carried from the docs work — a narrow card in a
   wide stage. Same question will arise in the app's panel.

## Provenance links

- [Uniswap re-cut direction](../decisions/2026-08-09-uniswap-recut-direction.md)
- [Agent-facing surfaces](../decisions/2026-08-03-agent-facing-surfaces.md)
- [Build everything real first](../decisions/2026-08-04-build-everything-real-first.md)
- [Reference research](../research/2026-08-14-app-and-chat-references.md)
