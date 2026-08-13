# Spec: flare-kit milestone 8 — cross-chain (LayerZero V2 OFT bridge + Composer messaging), real (RouteCatalogue + BridgeCard)

> Governed by `.thoughts/decisions/2026-08-04-build-everything-real-first.md`
> (the next row after the "Swaps, liquidity, vaults" bucket closed: **"Bridges,
> messaging, OFTs"**). One venue — **LayerZero V2** — real-first on the live
> **Coston2 ↔ Sepolia** route. Reconciles the cross-chain surfaces in
> `.thoughts/specs/2026-08-03-merchant-and-liquidity-surfaces.md` and the product
> surface map (`.thoughts/design/2026-08-03-product-surface-map.md`). Venue,
> addresses and route grounded from the vendored LayerZero starter
> (`sources/flare-foundation/flare-viem-starter/src/layer-zero/*`) and the OFT docs
> (`developer-hub/docs/fxrp/oft/*`, `developer-hub/docs/smart-accounts/guides/typescript-viem/04-06-*`).
> Scope, route and the compose-messaging depth decided with Abu on 2026-08-11:
> **OFT bridge + cross-chain redeem committed**; **Coston2 ↔ Sepolia** the
> live-verified route; **cross-chain mint** ships declared-unbuilt unless the live
> redeem lands with room; **M6/M7-precedent verified-flag gating** for unverified
> routes.

## Objective

After this milestone a developer can install the kit and drop a working
**route catalogue** and a **bridge** card into their own React app, and a person
can move real FXRP **across chains** — testnet first, Coston2 → Sepolia — through
the token's **actual LayerZero OFT lifecycle**, seeing the **real cross-chain
fee** quoted before signing, the **exact amount that will land** on the far side,
and — critically — the operation held honestly in flight until the **destination
chain itself** confirms receipt, never a source-side send dressed up as a
delivery. They can also drive the **compose-messaging** path: bridge FXRP back to
Flare carrying a message that triggers an **FAssets redemption to native XRP**.
Cross-chain is the first capability whose outcome lives on a **different chain
than the signature**, and it reuses the durable, self-reconciling operation
lifecycle M1 forced into being and the surface anatomy M5/M6/M7 established —
extending "network is configuration" from one network to a **source/destination
pair**.

## The venue — LayerZero V2 OFT, live on Coston2 ↔ Sepolia

FXRP is deployed as a LayerZero V2 **Omnichain Fungible Token**. On Flare it uses
an **OFT Adapter** that **locks** FXRP when bridging out; destination chains run a
native OFT that **mints/burns** on receipt (`developer-hub/docs/fxrp/oft/index.mdx:20`).
The relevant live deployments (addresses live in `@flare-kit/contracts`, never
hardcoded elsewhere):

- **Coston2 OFT Adapter** `0xCd3d2127935Ae82Af54Fc31cCD9D3440dbF46639` — the
  IOFT surface (`token()`, `quoteOFT`, `quoteSend`, `send`) the kit drives
  (`config.ts:10`, `index.mdx:74`). Locks **FTestXRP**
  `0x0b6A3645c240605887a5532109323A3E12273dc7` (6 dp — the FAsset the DEX config
  already carries).
- **Sepolia FXRP OFT** `0x81672c5d42f3573ad95a0bdfbe824faac547d4e6` (EID **40161**,
  `SEPOLIA_V2_TESTNET`) — the destination peer that mints on receipt and the
  contract the kit **reads to confirm delivery** (`fassets-autoredeem.mdx:995,1007`,
  `05-cross-chain-redeem.mdx:296`). A real Coston2 → Sepolia delivery is evidenced
  in `04-cross-chain-mint.mdx:551`.
- **Coston2 FAssetRedeemComposer** `0xa10569DFb38FE7Be211aCe4E4A566Cea387023b0` —
  the LayerZero **Composer**: it receives a bridged OFT plus a compose message on
  Coston2 and triggers an **FAssets redeem to native XRP** (`config.ts:12`,
  `index.mdx:75`, `fassets-autoredeem.mdx:36`).
- **Coston2 FxrpLzBridgeShim** `0x525CCe1C6d053B0e7f41A2011B536aA992200Be0` — the
  memo-field **mint + bridge** shim (`config.ts:14`); carried for the
  **declared-unbuilt** cross-chain-mint surface.

The `send`/`quoteSend` shape is **standard IOFT** — `SendParam{dstEid, to(bytes32),
amountLD, minAmountLD, extraOptions, composeMsg, oftCmd}`, `quoteSend(param,false)
→ {nativeFee, lzTokenFee}`, `send(param, {nativeFee, lzTokenFee:0}, refund)`
payable with `value = nativeFee`, gated by an ERC-20 `approve` of FXRP to the
adapter (`bridge-fxrp.ts:44-82`). Unlike M5's BlazeSwap `addLiquidity`, there is
**no non-standard selector** here; the trap this milestone guards is a different
one (below). A read-only **probe** confirms the on-chain peer wiring, quotes and
funding before any build (see Verification) — the M7-probe precedent; nothing here
is assumed live without a read.

## The cross-chain model, and the honesty it forces

A LayerZero send is **asynchronous and cross-chain**: the source `send` confirms
on Coston2, a **DVN** set verifies the message, an **executor** delivers it on the
destination, and only then do tokens mint on the far side (`index.mdx:27-39`,
`bridge-fxrp.ts:88` — "It may take a few minutes to arrive on Sepolia"). This
makes delivery the load-bearing honesty surface of the milestone:

1. **A confirmed send is `submitted`, not `delivered`.** The source receipt proves
   the message was *sent*, not that FXRP *arrived*. Rendering a confirmed Coston2
   `send` as "bridged" is exactly the `submitted`-as-`succeeded` failure and the
   invented-bridge-delivery the hard rules forbid. The op sits in the existing
   canonical **`awaiting_external`** state (DVN verify + executor) and reaches
   **`succeeded`** only when the kit **reads the destination chain** — the Sepolia
   OFT balance delta / `OFTReceived` correlated by the message **`guid`**. The
   truth is the destination read; LayerZeroScan is an **evidence link**, never the
   source of truth. No new operation state — the same shape as the M3 FDC proof
   wait and the M7 vault delayed claim.

2. **Delivery is self-reconciling.** A bridge in flight when the app closes
   reconciles on open by re-reading the destination for the pending `guid`; states
   are chain state, not session state. There is no Resume button.

3. **The amount that lands is the amount rendered.** The "you receive" leg is the
   OFT's own **`amountReceivedLD`** (from `quoteOFT` / the send receipt), which
   equals `amountSentLD` **unless** the OFT removes sub-shared-decimal **dust** —
   in which case the smaller delivered amount is what is shown, never the input.
   An unknown value renders as `—`, never `0`.

4. **The fee is real and quoted before signing.** `quoteSend` returns the actual
   `nativeFee` in C2FLR (18 dp), rendered in the mono face with its asset and full
   precision; the plan carries it as the `value` the send must pay. Never
   estimated.

5. **Network is configuration — now a source/destination pair.** One code path
   serves every route; only the registry changes. A route's `dstEid`, destination
   peer OFT, composer, and per-route **executor gas** (`EXECUTOR_GAS` 200k for a
   plain send; `REDEEM_EXECUTOR_GAS` / `COMPOSE_GAS` 1M for the compose path,
   `config.ts:18-21`) are constants in `@flare-kit/contracts`, never in a surface.
   Under-gassing the executor option strands a message mid-flight — the kit sets
   it from the route config, not a guess.

6. **An unverified route never signs.** `bridgeVerified` (per route) is the M8
   analog of M7's `withdrawVerified` / M6's `addLiquidityVerified`:
   `buildBridgePlan` refuses a route whose destination peer is not live-verified —
   without reading, approving, or paying a fee on a message that cannot deliver.
   Coston2 → Sepolia is `true` after the M8 live run; every other route is `false`
   until its own run.

7. **The redeem path is two async legs, not one.** Cross-chain redeem = bridge
   FXRP Sepolia → Coston2 with a compose message to the Composer, which then files
   an **FAssets redemption**; native XRP settles on **XRPL** after the FAssets
   agent fulfils. Both legs are `awaiting_external` and distinct: LZ **delivery**
   to the Composer, then **FAssets redemption / XRPL settlement**. Neither is
   rendered as the other, and "XRP received" is asserted only from settlement
   evidence.

## Requirements

- **M8-R1 — `@flare-kit/contracts` gains the cross-chain route registry; addresses
  from the registry only.** A network-keyed registry (`bridge.ts`) carries, per
  **route** (source network → destination), the source OFT adapter, the `dstEid`,
  the destination peer OFT (for delivery reads), the composer (where the route
  supports compose messaging), the per-route executor/compose gas, the FXRP asset
  key, and a **`bridgeVerified`** flag (Coston2 → Sepolia `true` after the M8 live
  run; any route without a live run `false`). Coston2 → Sepolia addresses are those
  the probe verifies. No address, EID or gas constant is hardcoded outside the
  registry.

- **M8-R2 — `@flare-kit/core` bridge + redeem operations over one adapter.**
  Immutable intents — `BridgeIntent` (route, amount, recipient on the destination,
  minAmountLD from slippage, deadline) and `RedeemIntent` (route back to Flare,
  amount, the XRPL destination for the native-XRP payout, compose params) — resolve
  through a `CrossChainAdapter` to an **unsigned plan** (an `approve` of FXRP to the
  adapter — or, for the compose route, the composer — **only** when the allowance is
  short, then `send`) → **execution** → canonical states, with typed errors distinct
  for **route-unverified/no-peer**, **insufficient-balance**, **insufficient-fee**,
  **dust-below-min** (delivered amount would breach `minAmountLD`), and
  **expired-deadline**. It reuses the M1 lifecycle engine and **walks the
  `states.ts` table** (a reconciler never jumps states — the `applyTransition`
  silent-drop hazard).

- **M8-R3 — the delivery lifecycle is durable and self-reconciling against the
  destination.** A send persists its evidence (route, amount, recipient, the
  message **`guid`**, the source tx, the destination peer to read) and on app open
  **reconciles against the destination chain** — the Sepolia OFT balance delta /
  `OFTReceived` for the plain bridge; the Composer delivery **then** the FAssets
  redemption / XRPL settlement for the redeem — never from a source receipt, never
  by scraping LayerZeroScan. The lifecycle is **PRE-PLAN → (approve) → submitting →
  SUBMITTED → AWAITING-DELIVERY → DELIVERED**, plus the terminal refusal states; the
  redeem path extends **DELIVERED (to Composer) → AWAITING-REDEMPTION → REDEEMED
  (native XRP settled)**. `submitted` is never rendered as delivered; an unknown
  delivery outcome is never rendered as failed.

- **M8-R4 — the quote is honest, the fee is real, the delivered amount is exact.**
  `bridge-quote.ts` reads the OFT's own quote — `quoteSend` for the `nativeFee`
  (rendered in mono with C2FLR, full precision), `quoteOFT` for the
  `amountReceivedLD` and any min/max limits — and computes the protected minimum
  `amount · (10000 − slippageBips) / 10000` shown beside the expected receive
  amount. The receive leg renders `amountReceivedLD` (dust-adjusted), never the
  input; an unknown value renders `—`, never `0`. A quote carries the time it was
  read; a limit or balance change that reverts the send on-chain renders as its
  distinct typed state, not a kit failure. Fee and limits come from live reads.

- **M8-R5 — approvals are never hidden.** The ERC-20 allowance of FXRP is read for
  the spender the route actually uses (the OFT adapter for a plain bridge; the
  composer for the compose route); the plan includes an `approve` **only** when
  short. Every approval is its own step with its own transaction, and the full
  sequence is stated before the first signature (R-LIQ-106); a pre-approved leg
  shows no step.

- **M8-R6 — real-first; the mock copies observed behaviour.** `mock-bridge.ts` is
  written **only after** the real path and reproduces the observed fee shape, the
  `amountReceivedLD`/dust behaviour, the two-leg redeem lifecycle, the delivery
  timing surface (in-flight → delivered), and the failure shapes. Mock mode is
  explicit and labelled, never a fallback triggered by a failure, and it **refuses
  to answer any route, direction or state it never observed** rather than returning
  a plausible zero.

- **M8-R7 — RouteCatalogue.** Lists the configured cross-chain routes for the
  active network with, per route: the source and destination chains, the primitive
  (OFT bridge / compose-redeem), the live cross-chain fee, and its **verified**
  state — each from live reads/config with a SourceChip, `—` where unknown, never a
  guess. A route configured but not `bridgeVerified` shows its config but its bridge
  action is a **declared-unbuilt** affordance (present, disabled, reasoned), never a
  plan that could misrender.

- **M8-R8 — BridgeCard.** One "you send" leg (FXRP on the source chain) and one
  "you receive" leg (the dust-adjusted `amountReceivedLD` on the destination); the
  real `quoteSend` fee; the exact minimum under slippage; a plain-language statement
  that delivery is asynchronous and settles on the destination chain. The approve(s)
  and `send` render on the operation spine as the real steps they are (M8-R5),
  followed by a **durable delivery timeline**: SUBMITTED (source tx + a LayerZeroScan
  evidence link) → AWAITING-DELIVERY → DELIVERED (from the destination read). The
  card is **source-network aware** — bridging FXRP back to Flare offers the
  **"deliver as native XRP"** compose-redeem route (M8-R9). When there is no FXRP
  balance it shows an honest **no-balance** state; when a read is unavailable it
  shows **unavailable**, never a confident "no balance" (the M6 F1 rule). Reuses the
  established card anatomy — no new per-surface design artifact.

- **M8-R9 — cross-chain redeem committed; cross-chain mint declared-unbuilt.** The
  compose-messaging **redeem** (Sepolia FXRP → Coston2 Composer → native XRP on
  XRPL) is built and live-verified: its plan carries the compose message and the
  higher compose/executor gas, and its two-leg delivery (LZ delivery → FAssets
  redemption / XRPL settlement) renders on the spine as distinct states. The
  cross-chain **mint** (XRPL payment → FDC automint → bridge out, via the shim)
  ships as a **declared-unbuilt** affordance (the `fk-unbuilt` idiom — present,
  disabled, reasoned) **unless** the live redeem lands with time to spare, in which
  case it is promoted; it is never faked.

- **M8-R10 — network is configuration; unverified routes are gated, not faked.**
  One code path serves Coston2 → Sepolia and every future route (mainnet OFT chains,
  Hyperliquid); only the registry changes. Testnet first. Reads/quotes run on any
  configured route; a route not `bridgeVerified` on the active network never emits a
  bridge/redeem plan — it renders the declared-unbuilt affordance (the M6 F2 / M7
  precedent: never sign or pay a fee on an unverified route).

- **M8-R11 — reuse, files < 300 lines.** Reuse `SwapLeg` for the send/receive legs,
  the `OperationTimeline` spine (its `awaiting_external` rendering carries the
  in-flight delivery, with a LayerZeroScan `EvidenceChip`), and `Panel` / `Button` /
  `AssetLogo` / `EvidenceChip` / `DetailRow` / `Note` / `SourceChip`. The pure
  state→chrome mapping splits into `bridge-card-state.ts` / `route-catalogue-state.ts`
  at the same seam `swap-card-state.ts` / `withdraw-card-state.ts` sit on. The shared
  card chrome homed in M7-R11 is reused, not re-declared. A new primitive is added
  **only** if `OperationTimeline` genuinely cannot carry the two-leg delivery.

## Out of scope (M8)

- **Cross-chain mint live** (XRPL pay → FDC automint → bridge out, via the shim) —
  declared-unbuilt this milestone unless the live redeem lands early (M8-R9). A
  mainnet/mint live run is its own follow-up, exactly as M6's mainnet add was.
- **Non-Sepolia routes** (Hyperliquid testnet; the mainnet OFT chains — HyperEVM,
  Base, BNB, Ethereum, Monad, Katana) — configured for reads/quotes only and
  declared-unbuilt-until-verified per route (M8-R10). Each is its own live run.
- **Third-party aggregator bridging** (the Stargate UI referenced in `index.mdx:48`,
  mainnet-only) — the kit drives the OFT directly; it does not embed an aggregator.
- **Arbitrary non-FXRP OFT / a general message-passing SDK** — the kit ships the
  FXRP OFT bridge and the FAssets Composer redeem; a generic LayerZero message bus
  is not this milestone.
- **Operating DVNs or an executor** — the kit consumes LayerZero's security stack
  and delivery; it never runs one. Delivery truth is read from the destination
  contract, not asserted by us.

## Files (added to SPEC.md's `## Files` manifest before writing)

- `packages/contracts/src/bridge.ts` — the network-keyed cross-chain route registry:
  source OFT adapter, `dstEid`, destination peer OFT, composer, per-route
  executor/compose gas, asset key, `bridgeVerified`. M8-R1.
- `packages/contracts/src/bridge-abis.ts` — the IOFT ABI (adapter: `token`,
  `quoteOFT`, `quoteSend`, `send`, `OFTReceived`) and the destination-OFT read +
  Composer ABIs, split from `abis.ts` to stay < 300 lines. M8-R1.
- `packages/core/src/bridge.ts` — bridge + redeem operations: intents, adapter
  dispatch, plan, execution, states, typed errors. M8-R2/R3.
- `packages/core/src/bridge-adapter.ts` — the `CrossChainAdapter` interface and the
  OFT-send + Composer-redeem adapters (per-flow calls behind one lifecycle). M8-R2.
- `packages/core/src/bridge-quote.ts` — `quoteSend`/`quoteOFT` → real fee + delivered
  amount + minimum from slippage; the destination-read reconciler for delivery truth
  (split off to `bridge-delivery.ts` if either exceeds 300 lines). M8-R4/R3.
- `packages/core/src/mock-bridge.ts` — the mock, written after the real path. M8-R6.
- `packages/core/scripts/live-bridge.mjs` — the live driver (Phase A bridge
  Coston2 → Sepolia + destination verify; Phase B compose-redeem
  Sepolia → Coston2 → XRPL).
- `packages/react/src/use-bridge.ts` — the `useBridge` hook over the operation, the
  M5/M6/M7 hook precedent (read/plan need no key).
- `packages/react-ui/src/RouteCatalogue.tsx` (+ `route-catalogue-state.ts` if > 300
  lines). M8-R7.
- `packages/react-ui/src/BridgeCard.tsx` (+ `bridge-card-state.ts`). M8-R8/R9.
- `packages/react-ui/src/bridge.css` — the cross-chain surfaces' CSS, values from
  tokens.
- `packages/react-ui/gallery/m8-bridge-sections.tsx` (+ Gallery wiring) — the AC5
  state matrix in both themes.

## Acceptance criteria

- **AC1** — a real **bridge Coston2 → Sepolia** is executed and recorded: the FXRP
  approval tx (where short) and the `send` tx, the quoted `nativeFee`, the message
  `guid`, the source explorer link and the **LayerZeroScan** link, and — the point
  of the milestone — the **destination confirmation on Sepolia** (the OFT balance
  delta / `OFTReceived`), with network + addresses + balances before/after on both
  chains as evidence. The **cross-chain redeem** (Sepolia FXRP → Coston2 Composer →
  native XRP) is additionally driven once end-to-end, recording the send+compose tx,
  the Composer delivery, the FAssets redemption, and the XRPL settlement evidence.
- **AC2** — the rendered fee equals `quoteSend`'s `nativeFee` for the same inputs;
  the rendered "you receive" equals `amountReceivedLD` and **matches the actual
  destination balance delta** AC1 records within OFT shared-decimal rounding; an
  under-funded fee or a delivered amount that would breach `minAmountLD` reverts and
  renders as its distinct typed state (**insufficient-fee** / **dust-below-min**),
  never as success or a kit failure.
- **AC3** — a **submitted send is never rendered as delivered**: SUBMITTED,
  AWAITING-DELIVERY and DELIVERED are each distinct, reachable states, and DELIVERED
  is entered **only** from a destination read; for the redeem, AWAITING-REDEMPTION
  and REDEEMED (XRPL settled) are their own distinct states. An unknown delivery
  outcome is never rendered as failed. `mock-bridge.ts` **refuses** any route,
  direction or state it never observed (a plausible zero is a loud error).
- **AC4** — the route choice is shown with its **real fee**; a route that is not
  `bridgeVerified` renders the **declared-unbuilt** affordance, never a plan; each
  approval is its own step and a pre-approved leg shows none; the cross-chain-mint
  surface renders **declared-unbuilt** (unless promoted per M8-R9), never faked.
- **AC5** — Gallery, both themes, states reachable from props: RouteCatalogue
  {routes, route-unverified/declared-unbuilt, read-unavailable}, BridgeCard
  {quote, no-balance, unavailable, needs-approval, approving, sending, submitted,
  awaiting-delivery, delivered, insufficient-balance, insufficient-fee,
  dust-below-min}, the redeem route {quote, awaiting-lz-delivery,
  awaiting-fasset-redemption, xrp-redeemed}, cross-chain-mint {declared-unbuilt}.
  Computed-style + a11y verified (contrast composited with opacity, focus, target
  size), the M4-R12 method.

## Verification

**Probe first (Task 1, recorded before building — the M7-probe precedent).** A
read-only run confirms the on-chain reality and funding, and **assumes nothing**:
the Coston2 adapter's `token()` == FTestXRP; a live `peers(SEPOLIA_EID)` is set
(so a Coston2 → Sepolia `send` will route, not revert); `quoteSend`/`quoteOFT`
return; the OFT `sharedDecimals` (to know whether FXRP bridging removes dust); and
funding — Coston2 **C2FLR** (fee + gas) and **FXRP** (carried from the M7 evidence
as `0xA4b05cdB…31Bd9` holding 23.80 FXRP + 97.82 C2FLR on 2026-08-11, **re-read**,
not assumed), **Sepolia ETH** for the return-leg fee/gas, and an **XRPL testnet
account** to receive the redeemed XRP. Recorded as
`.thoughts/verification/2026-08-11-m8-bridge-probe.json`. If a peer is unset or a
balance is short, that is surfaced as a real blocker before any build — not
papered over.

**Live run.** `packages/core/scripts/live-bridge.mjs` drives the whole path
through the kit: `quoteSend`/`quoteOFT` → `buildBridgePlan` → sign the approval
(where short) and `send` on Coston2; capture the `guid`; **reconcile the
destination** (poll the Sepolia OFT for the `OFTReceived`/balance delta) →
DELIVERED. Then the redeem: `buildRedeemPlan` → bridge Sepolia FXRP back with the
compose message → reconcile the Composer delivery, then the FAssets redemption and
the XRPL settlement → REDEEMED. It records every tx hash, the `guid`, explorer +
LayerZeroScan links, and balances before/after on **both chains and XRPL**. It
signs with its own key (`privateKeyToAccount(secrets.evm.privateKey)`), the
headless path, exactly as `live-swap.mjs` / `live-liquidity.mjs` / `live-vault.mjs`
do; the browser surfaces sign through the host's connected wallet via `onSubmit`
and never hold a key. Because LZ delivery and the FAssets redemption span time, the
run is **staged** (send, then confirm-delivery; request-redeem, then
confirm-settlement) and the evidence file records each stage with its timestamps.
`pnpm build && pnpm typecheck && pnpm lint && pnpm test` green, shown with output.
The gallery drives every AC5 state and is screenshotted in both themes.

## Sources

- `sources/flare-foundation/flare-viem-starter/src/layer-zero/{config.ts,bridge-fxrp.ts,cross-chain-redeem.ts,cross-chain-redeem-to-tag.ts,cross-chain-mint.ts,cross-chain-mint-memo-field.ts,types.ts}` and `src/abis/FXRPOFT.ts` — the live route addresses, EIDs, executor-gas constants, `SendParam` shape, and `send`/`quoteSend`/approve call shapes.
- `developer-hub/docs/fxrp/oft/{index.mdx,fassets-autoredeem.mdx,fassets-automint.mdx}` — the OFT model, the DVN stack, the testnet/mainnet deployment tables, the Sepolia OFT address (`0x81672c5d…`, `fassets-autoredeem.mdx:995`), and the Composer redeem flow.
- `developer-hub/docs/smart-accounts/guides/typescript-viem/04-cross-chain-mint.mdx` (real Coston2 → Sepolia delivery evidence, `:543-630`), `05-cross-chain-redeem.mdx`, `06-cross-chain-redeem-to-tag.mdx`; `sources/flare-foundation/flare-smart-accounts/contracts/composer/implementation/FAssetRedeemComposer.sol` (the compose → FAssets redeem contract) and its test.
- `.thoughts/specs/2026-08-11-m7-vaults.md`, `2026-08-11-m6-liquidity.md`, `2026-08-09-m5-swaps.md` — the operation lifecycle, the card anatomy, the real-first order, and the verified-flag + honest-quote precedents this milestone extends.
- `.thoughts/decisions/2026-08-04-build-everything-real-first.md` (§4, the "Bridges, messaging, OFTs" row) and `2026-08-03-agent-facing-surfaces.md` (the two signing paths: host wallet for people, own key for agents; read/plan need no key).
- Accepted design: DESIGN.md "Components — re-cut 2026-08-09" (card anatomy, the operation spine, the declared-unbuilt idiom) and the paper+cobalt token contract.
