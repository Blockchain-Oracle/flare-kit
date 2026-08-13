# M8 Cross-chain (LayerZero V2 OFT bridge + Composer redeem) — evidence

**Date:** 2026-08-11 · **Network:** Coston2 (114) ↔ Sepolia (11155111) ↔ XRPL testnet
**Signer:** `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9` · **XRPL dest:** `rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio`
**Venue:** LayerZero V2 OFT — Coston2 OFT Adapter `0xCd3d…46639`, Sepolia FXRP OFT
`0x81672c5d…d4e6`, FAssetRedeemComposer `0xa10569…23b0`.
Raw JSON: `2026-08-11-m8-bridge-probe.json`, `2026-08-11-coston2-live-bridge.json`.
Screens: `m8-screens/` (light + dark).

## What was built (Tasks 0–10)

`@flare-kit/contracts` `bridge.ts` (route registry, per-route `bridgeVerified`) + `bridge-abis.ts`
(IOFT / dest-read / Composer fragments, split from `abis.ts`). `@flare-kit/core` `bridge-adapter.ts`
(one `CrossChainAdapter` over a **source** and a **destination** client), `bridge-options.ts` (the
type-3 executor/compose option encoder — no LZ runtime dep), `bridge-quote.ts`, `bridge.ts` +
`bridge-states.ts` (intents → verified-gated plan → the durable submit→deliver lifecycle,
self-reconciling against the destination), `mock-bridge.ts` (copies observed, refuses unobserved).
`@flare-kit/react` `use-bridge.ts` (the delivery poll). `@flare-kit/react-ui` `RouteCatalogue` +
`BridgeCard` + `bridge.css`, reusing `SwapLeg`, the `OperationTimeline` spine and the M7-homed
card chrome. Gallery `m8-bridge-sections.tsx` drives every AC5 state.

## AC1/AC2/AC3 — live, real-first

### Phase A — bridge Coston2 → Sepolia (the AC1 gate)
- Approve `0x6cf3a06b…e857d7d`, **send `0xdea75d2d0b31ffb3816b95efb2ae8cbba3a07114d834b471d391b61c58ed50c4`**
  (Coston2 block 33940747, success). Message **guid `0xd0f1e2c6172a0bec72221e25b95c6c1952c64839073081bf20e2c343c2b22a04`**.
  LayerZeroScan: `https://testnet.layerzeroscan.com/tx/0xdea75d2d…50c4`.
- **Delivery confirmed by reading Sepolia**: OFTReceived; Sepolia FXRP balance `0 → 1_000_000`,
  `amountReceivedLD = 1_000_000`. Quoted `nativeFee 22.950824887834713257 C2FLR`; **quoted receive ==
  delivered exact** (no dust: sharedDecimals 6, decimalConversionRate 1). Confirmed 21:22:56Z.
- **Lifecycle actually traversed** `submitted → awaiting_external (in-flight, ~7 polls) → succeeded` —
  `succeeded` entered ONLY from the destination read. (AC2 fee==quoteSend; AC2 receive==balance delta;
  AC3 submitted-never-delivered.)

### Phase B — redeem Sepolia → Coston2 composer → native XRP on XRPL
- Top-up (to reach ≥ 1 FAssets lot = 10 FXRP on Sepolia): send `0x1b677853…4edcc55`, delivered →
  Sepolia holds 11 FXRP.
- Redeem **send `0x11638b575b75060bf13f4ad5aa82340cf8233b5b0f63a0a91d8e783a4ca86b1d`** (Sepolia, success),
  **no approve** (native OFT burns its own balance). guid `0x4d73dd2c…ed1b04b2`.
- **Composer FAssetRedeemed** on Coston2: `redeemedAmountUBA 9_990_000` to `rGEg…`.
- **Native XRP SETTLED on XRPL**: payment `401F75919BF99BA32E6298357946DE912D4166B360F0ED5DE3D7E0498DE10F8F`,
  **9_940_050 drops (9.94 XRP)** from FAssets agent `rDYeqGVc…VF6r`.
- **Lifecycle** `submitted → awaiting_external (executor: LZ delivery) → awaiting_external (xrpl: agent
  paying) → succeeded` — **`succeeded` reached ONLY from the XRPL settlement read**, never from
  FAssetRedeemed (which is the redemption *filed*, not XRP received — M1's rule).

Both Coston2 routes flipped `bridgeVerified: true` only after their own confirmed destination read.

## Two correctness fixes forced by the real run (caught before the mock copied them)
1. **Coston2 `eth_getLogs` caps at ~30 blocks.** The delivery reconciler's single-range scan works on
   Sepolia (slow blocks) but reverts on Coston2 over a multi-minute wait. Fixed: `bridge-adapter.ts`
   `scanByGuid` chunks to ≤25-block ranges (the vendored redeem script's precedent).
2. **`FAssetRedeemed` ≠ "XRP received".** The first reconciler concluded `succeeded` from the redemption
   *filing*. Per M1 (nothing is done until the protocol settles) and AC3, refactored to a three-leg
   redeem — `executor → flare → xrpl` — where `succeeded` comes ONLY from the XRPL settlement read.

## AC4/AC5 — surfaces, browser-verified, both themes

Full gate green: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` — build (4), typecheck (7),
lint clean, test (7 tasks). Suite totals: contracts 137/2-skip, core 753, react 21, react-ui 308.

Gallery driven in a real browser (Playwright, vite gallery), both themes via the app's own toggle:
- **RouteCatalogue** — both routes "Verified" with the live fee in full-precision mono
  (`22.950824887834713257 C2FLR`, `0.000101716112596575 ETH`) via SourceChip; the unverified route
  renders the declared-unbuilt affordance; a missing read renders "unavailable", never `0`.
- **BridgeCard** — you-send/you-receive legs (dust-adjusted receive), the real fee + exact
  `minimum received 0.995000`, the "Delivery is asynchronous … never shows a sent message as
  delivered" note, the approve→send spine, and the durable delivery timeline. A `submitted` card's
  **Delivered leg stays pending**; `submitted → awaiting-delivery → delivered` distinct.
- **Redeem** extends the timeline to native-XRP-redeemed; **cross-chain mint renders
  declared-unbuilt**, never faked.
- **a11y** (`window.__auditA11y()`): **zero M8-new (`fk-bridge` / `fk-route`) issues** after fixing the
  LayerZeroScan link's target size to 24px. Three remaining are pre-existing/shared and out of M8's
  new-element scope: the cobalt-gradient primary CTA (not-measurable → verified by hand: white on
  cobalt, high contrast), the M7 vFXRP AssetLogo initials, and the shared SwapLeg input (accepted
  through M7). Screens in `m8-screens/`.

## Review gate (CLAUDE.md)

Three review subagents over the M8 diff — correctness, honest-rendering/silent-failure,
simplification. The honest-by-construction spine was verified sound (absence is never a
negative outcome; `succeeded` is gated to a destination read; the mock refuses the
unobserved). Every critical/important finding was fixed **and tested**:

- **Terminal reconcile** now clears the stale `awaiting` descriptor (`{awaiting: undefined}`)
  and finalizes the spine steps (`advanceSteps`) — a settled op no longer claims it waits on
  somebody, and a succeeded op's delivery step no longer reads "outcome unknown".
- **XRPL settlement** is correlated to the redemption (amount ≥95% of `redeemedAmountUBA`
  and a ledger date postdating the filing) — a faucet payment can't false-positive "redeemed".
- **`buildPlan`** returns `unavailable` on a read failure instead of an unhandled rejection.
- **`useBridge`** clears a transient read error on the next successful poll.
- **`deliveryLegs`** projects `done` only when a destination read proved delivery.
- Simplifications: `pathTo` homed once in `states.ts` (shared with the FDC reconciler); dead
  `BridgeState` / `sharedDecimals` / `underlyingToken` removed; `quoteReceive` narrowed;
  `floorMin` shared + slippage clamped.

## Deferred / honest notes
- **Cross-chain mint** ships declared-unbuilt this milestone (M8-R9) — the shim address is carried in
  the registry for the milestone that verifies it.
- Non-Sepolia routes (Hyperliquid, mainnet OFT chains) are configured-for-reads only and
  declared-unbuilt-until-verified per route.
