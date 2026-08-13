# M5-AC1 — a real swap on Coston2

**Date:** 2026-08-09 · **Network:** Coston2 (chainId 114) · **Venue:** BlazeSwap V2

A real `approve` + `swapExactTokensForTokens` on the live router, driven entirely
through the kit (`quoteSwap` → `readAllowance` → `buildSwapPlan` → sign). Raw log:
`2026-08-09-coston2-live-swap.json`. Reproduce with `node scripts/live-swap.mjs 1 300`.

## Accounts & addresses

| | |
|---|---|
| Signer (EVM) | `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9` |
| Router (BlazeSwap) | `0x440602f459d7dd500a74528003e6a20a46d6e2a6` |
| FXRP (FTestXRP) | `0x0b6A3645c240605887a5532109323A3E12273dc7` (6 dp) |
| USD₮0 | `0xC1A5B41512496B80903D1f32d6dEa3a73212E71F` (6 dp) |

## The trade

| | |
|---|---|
| In | 1.000000 FTestXRP |
| Quote out (`getAmountsOut`) | 1.224352 USD₮0 |
| Slippage | 300 bips → minReceived 1.187621 USD₮0 |
| Price impact (reference-quote method) | **419.78 bips (4.20%)** — the pool is thin, and the surface renders that honestly |
| Received (actual) | **1.224352 USD₮0** — met the minimum ✓ |

## Transactions (both `status: success`)

- **Approve** — `0x9d2bfbc7bfdc056e03374c940019056f8c2129a179b9e2bd7244f8de803a96ce`
  (block 33912156) · https://coston2-explorer.flare.network/tx/0x9d2bfbc7bfdc056e03374c940019056f8c2129a179b9e2bd7244f8de803a96ce
- **Swap** — `0x3fb03145571077860d1598c621fdb012cc1d09379e9f85c205259119fe3eb7f4`
  (block 33912159) · https://coston2-explorer.flare.network/tx/0x3fb03145571077860d1598c621fdb012cc1d09379e9f85c205259119fe3eb7f4

## What this establishes

- **AC1** — a real swap executed and recorded, with its approval tx, swap tx and
  explorer links, on Coston2. ✓
- **AC2** — `amountOutMin` was enforced on chain and met; the swap did not revert.
  The 4.20% impact is real pool behaviour, shown, not hidden. ✓
- **AC4** — the approval is its own transaction. The allowance was `0`, so the plan
  included an `approve` step; it was never folded into the swap. ✓
- The allowance started at `0` and `buildSwapPlan` produced the approve step from
  that reading — the plan is honest about what it needs.

Balances: FTestXRP 24.800000 → 23.800000, USD₮0 10.000000 → 11.224352.
