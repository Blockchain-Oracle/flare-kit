# M6-AC1/AC2 — a real add→remove liquidity round trip on Coston2

**Date:** 2026-08-11 · **Network:** Flare Testnet Coston2 (chainId 114) · **Venue:** BlazeSwap V2

A real `addLiquidity` and `removeLiquidity` on the live FXRP/USD₮0 pool, driven
entirely through the kit (`quoteAddLiquidity` → `readAllowance` → `buildAddPlan` →
sign; then `quoteRemoveLiquidity` → `readLpAllowance` → `buildRemovePlan` → sign).
Raw log: `2026-08-11-coston2-live-liquidity.json`. Reproduce with
`node packages/core/scripts/live-liquidity.mjs 1 300 100`.

## Accounts & addresses

| | |
|---|---|
| Signer (EVM) | `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9` |
| Router (BlazeSwap) | `0x440602f459d7dd500a74528003e6a20a46d6e2a6` |
| Factory | `0x02d03957Cf02d153141bf23C60099E9aa48bf872` |
| Pair (LP token) | `0xDD598473f738df117Ee331bc07172481db60acBE` |
| FXRP (FTestXRP) | `0x0b6A3645c240605887a5532109323A3E12273dc7` (6 dp) |
| USD₮0 | `0xC1A5B41512496B80903D1f32d6dEa3a73212E71F` (6 dp) |

## The add

| | |
|---|---|
| Supplied (tokenA) | 1.000000 FTestXRP |
| Paired at pool ratio (tokenB) | 1.244651 USD₮0 (`amountADesired · reserveB / reserveA`) |
| Slippage | 300 bips → `amountAMin` 0.970000, `amountBMin` 1.207311 |
| Predicted LP (`expectedLp`) | **1112333** = `min(amountA·ts/rA, amountB·ts/rB)` (the pool's own mint formula) |
| Pool share | 417 bips (4.17%) |
| Actual composition after add | 0.999999 FTestXRP · 1.244650 USD₮0 |

### AC2 — predicted LP == actual minted LP

`lpMinted` (on-chain LP balance delta) = **1112333**, and `predictedLp` = **1112333** —
an **exact** match, zero wei of divergence. The kit's `min`-clamp quote predicts the
pool's `mint()` precisely. (This is also why the Task-3 test asserts `min(lpFromA,
lpFromB)`, not `lpFromA`: with these reserves the two differ by 1 wei, and the pool
mints the `min`.)

## Transactions (all `status: success`)

| Step | Tx | Block |
|---|---|---|
| Approve FXRP → router | [`0x6120fef7…`](https://coston2-explorer.flare.network/tx/0x6120fef76eb71030d3ca0c4f5cc3741a4dc4447ef82a18b9696f9a9db20ef348) | 33919177 |
| Approve USD₮0 → router | [`0x823fde84…`](https://coston2-explorer.flare.network/tx/0x823fde84c05d9b18db83b7e93ec75271b21e86736fd63cecf9938b22057e4be3) | 33919179 |
| **addLiquidity** | [`0x0200711d…`](https://coston2-explorer.flare.network/tx/0x0200711d5fd9eea654e41850651d5832d138f5eb0c44df31b58a874503774474) | 33919734 |
| Approve LP → router | [`0x21132959…`](https://coston2-explorer.flare.network/tx/0x2113295909cef73cd6aba57a0049b6853694cf760f7f6d79877aff0aec153210) | 33919735 |
| **removeLiquidity** | [`0x1576d74b…`](https://coston2-explorer.flare.network/tx/0x1576d74bf530d25f4673a630a9e5703c2db0a96b6634c6a3c40e0b73dd9d2177) | 33919736 |

LP balance after the 100% withdrawal: **0** — the round trip returned the position to flat.

## Protocol-reality finding — BlazeSwap `addLiquidity` is non-standard

The first broadcast's `addLiquidity` reverted with **empty data** (the two approvals
succeeded). Root cause: BlazeSwap's router `addLiquidity` is **not** the standard
UniswapV2 signature — it carries two extra `uint256` params, `feeBipsA` and `feeBipsB`,
between `amountBMin` and `to`:

```
addLiquidity(tokenA, tokenB, amountADesired, amountBDesired,
             amountAMin, amountBMin, feeBipsA, feeBipsB, to, deadline)
```

The standard 8-param call's selector (`0xe8e33700`) hits the router's fallback and
reverts with no reason string. Authoritative source:
`sources/…/fasset-liquidator/contracts/interfaces/IUniswapV2/IUniswapV2Router.sol`;
Flare's own liquidator calls it with `feeBipsA = 0, feeBipsB = 0` (the fee-on-transfer
tolerance; 0 is correct for standard tokens like FXRP/USD₮0). Fixed in
`packages/contracts/src/dex.ts` (ABI) and `packages/core/src/liquidity.ts`
(`buildAddPlan` sets both to `0n`). **`removeLiquidity` and `swapExactTokensForTokens`
are standard on BlazeSwap and were unchanged.**

> **Carried note (out of M6 scope):** a future mainnet (SparkDEX V2) liquidity path may
> use the *standard* `addLiquidity` signature — so adds are **venue-specific**, unlike
> swap/remove. Both networks currently share one `UNIV2_ROUTER_ABI`; a mainnet-liquidity
> milestone must express the per-venue split. M6 is Coston2/BlazeSwap only.

## What this establishes

- **AC1** — a real add→remove round trip executed and recorded, with every tx hash and
  explorer link, on Coston2. ✓
- **AC2** — the predicted LP (`expectedLp` 1112333) equals the actual minted LP
  (balance delta 1112333), exactly. The `amountAMin`/`amountBMin` floors were enforced
  on chain and met; nothing reverted. ✓
- **AC4** — each approval is its own transaction, produced by `buildAddPlan`/
  `buildRemovePlan` from a live allowance reading, and never folded into the
  add/remove call. The add needed two token approvals; the remove needed the LP-token
  approval. ✓
- The whole flow — quote, paired amount, minimums, plan, position read — went through
  the shipped `@flare-kit/core`. Only the signing is dev-only (viem + a key in
  `.secrets/`), which the published package never does.

## AC5 — Gallery, both themes, states reachable from props (browser-verified)

Driven in a real browser (vite gallery, `pnpm --filter @flare-kit/react-ui gallery`), both
themes toggled through the gallery's own control (never a scripted `data-theme`, per the
M4-R12 lesson). Screens in `m6-screens/`.

**States built and rendered (all reachable purely from props via the real state machine):**
- AddLiquidityCard (9): quote, needs-approval-A, needs-approval-B, approving, adding,
  success, no-pool, ratio-exceeded, insufficient-balance.
- PositionCard (6): no-position, position, remove-approval, removing, removed, partial.

**Honesty confirmed by eye:** the paired amount, expected LP (`…BLAZE-LP`, 18-dp full
precision), pool share and minimums all render in the mono face; the no-pool state states a
reason (never `0`); the ratio-moved state is distinct (never a kit failure); the
insufficient-balance state blocks the supply and names the short asset; the PositionCard shows
the current composition and pool share and carries **no claimable-fees balance** ("Fees are
already in your balance … there is no separate fee to claim"); the no-position state is honest.

**A11y — `window.__auditA11y()` (the M4-R12 checker: contrast composited with opacity, target
size, focus), scoped to the 15 M6 cards, both themes:** every M6-**new** element
(`.fk-liq`, `.fk-pct` / `.fk-pct-pill` PercentPills, the Expected-LP row, the insufficient
note) is **clean — zero findings**. Two residual findings sit on **shared components reused
from M5**, both verified by hand as non-failures, neither M6-introduced:
1. `span.fk-am` (the `AssetLogo` monogram) reports `1.00:1` in light theme only — a checker
   limitation: `backgroundOf()` walks `parentElement` and so misses the monogram's **own**
   tan background (`rgb(152,122,62)`). The real contrast is white-on-tan ≈ **4.04:1** (and it
   passes cleanly as a non-text asset-identifier graphic at 3:1). Proof it is an artifact: the
   same element's finding disappears in dark theme, where the parent bg the checker grabs is
   dark — a real contrast defect cannot flip on which *ancestor* colour is sampled. Pre-existing
   since M5's TokenSelector.
2. `button.fk-btn` "Review supply" is `not-measurable` (the primary button's cobalt gradient
   has no single bg the checker can read — it says so, by design). Verified by hand: near-white
   `rgb(253,252,249)` on the gradient stops `rgb(75,105,228)→rgb(43,69,197)` ≈ 5–8:1, passes.
The one `target-size` finding (`input` 336×19) is **outside M6 entirely** (all short inputs are
in M1–M5 sections; M6's SwapLeg inputs measure 31px). Carried, not M6's: the checker's
`backgroundOf()` should consider an element's own background before an ancestor's, and the
`AssetLogo` monogram's ~4:1 white-on-tan deserves a dedicated a11y sweep across the whole kit.

## Full gate (2026-08-11)

`pnpm build && pnpm typecheck && pnpm lint && pnpm test` — all green:
- **build** — 4 packages, success.
- **typecheck** — 7 tasks, clean.
- **lint** — `eslint .` clean (one M6 lint error found and fixed: `mock-liquidity.ts` destructured an unused `args`).
- **test** — contracts **118 passed / 2 skipped**, core **665 passed**, react-ui **264 passed**, react **18 passed** → **1065 passed, 0 failed**.

Honesty + reuse invariants confirmed by hand:
- No M6 production file exceeds 300 lines (largest: `liquidity-quote.ts` 250).
- No hardcoded protocol address in M6 production source outside `dex.ts` — only the `ZERO_ADDRESS` null sentinel and the mock's observed `MOCK_PAIR` (the same pattern M5's `mock-swap.ts` established for a labelled mock reproducing observed chain state).
- Both cards import no wallet client and sign only via `onSubmit` (the host wallet signs; the kit holds no key).
- `mock-liquidity.ts` throws on any call it never observed.

## Whole-branch review — findings resolved (2026-08-11)

A final whole-branch review surfaced honesty dents and spec gaps the per-task reviews missed.
Two honesty findings were fixed; three spec items the plan had scoped out were built at Abu's
direction (quality bar over deadlines / nothing left behind).

- **F1 — PositionCard honesty.** The card took `Position | null`, so an RPC-outage read rendered
  as a confident "No position". Added an `unavailable?: string` prop: an unreadable position now
  renders "Couldn't read your position … This is not a zero — retry when the network settles."
  (screen `m6-position-unavailable.png`).
- **F2 — mainnet add safety.** `quoteAddLiquidity` would emit a BlazeSwap-feeBips plan on Flare
  mainnet (SparkDEX, standard signature) that reverts *after* the user signs two real approvals.
  Added a registry `addLiquidityVerified` flag (Coston2 only); the add quote now returns a typed
  `unavailable` on any venue whose add signature is unverified — declared unbuilt, not built badly
  (screen `m6-add-unverified-venue.png`).
- **R10 — PoolCatalogue built as a declared-unbuilt surface.** Present, disabled and reasoned,
  reusing the existing `fk-unbuilt*` idiom: "One live Coston2 pool today; a multi-pool, multi-venue
  catalogue is a later milestone once mainnet or additional pools qualify." (screen
  `m6-pool-catalogue-dark.png`).
- **R7 — exact entry** for partial removal added beside the 25/50/75/Max pills (`fk-pct-exact`,
  52×32px, bordered by shape not colour) — and **value-change vs the supplied basis** now renders
  when the kit recorded it: a **price-free per-asset delta** ("Change since supplied: +0.100000
  FXRP · −0.055000 USD₮0", "the change against what you supplied, not a priced valuation"), and
  nothing at all when the basis is unknown — no invented P&L (screens
  `m6-position-pnl-row-dark.png`, `m6-position-pnl-exact-dark.png`).

Re-verified after these changes: full gate **1072 passed, 2 skipped, 0 failed** (contracts 118/2,
core 666, react-ui 270, react 18); every new element (`fk-pct-exact`, `fk-unbuilt` PoolCatalogue,
the P&L row) audited **a11y-clean in both themes** — the only residual `__auditA11y` findings remain
the two pre-existing shared-component checker limitations noted above. Deferred minors (redundant
`fk-mono` spans; per-card chrome duplication; `readLpAllowance` bare-throw) and the carried a11y
items are tracked in `state.json` for a follow-up; they do not block M6.
