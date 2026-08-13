# M5-R1 — Coston2 swap-venue probe (live, real-first)

Date: 2026-08-09 · Network: Flare Testnet Coston2 (chainId 114) · RPC
`https://coston2-api.flare.network/ext/C/rpc` · read-only probe, no signing.

## Established on-chain

- **BlazeSwap is live on Coston2.** Two Uniswap-V2 deployments exist; the one
  holding FXRP liquidity is **Factory A `0x02d03957Cf02d153141bf23C60099E9aa48bf872`**
  (17 pairs). Its **Router is `0x440602f459d7dd500a74528003e6a20a46d6e2a6`**
  (confirmed: `router.factory()` == Factory A; `getAmountsOut` returns).
  - A second deployment (Factory `0xF0f5e4CdE15b22A423E995415f373FEDC1f8F431`,
    Router `0xe3a1b355ca63abcbc9589334b5e609583c7baa06` — the same address as
    BlazeSwap's *mainnet* router) exists but does **not** hold the FXRP pool. Use
    Factory A on Coston2.
- **The only FXRP pool is FXRP/USD₮0** — `getPair(FXRP, WNAT)` returned the zero
  address, so **there is no FXRP/WCFLR pool** (the spec's original assumption,
  taken from Flare's FAssets swap-redeem example, was wrong for Coston2). Pool
  **`0xDD598473f738df117Ee331bc07172481db60acBE`**, reserves snapshot
  ~**24.38 FTestXRP / 26.90 USD₮0** (both 6 dp) — real but thin, and **zero swap
  history** (freshly seeded; only the factory's creation call touched it).
- **Token addresses (Coston2):** FXRP/FTestXRP `0x0b6A3645c240605887a5532109323A3E12273dc7`
  (6 dp), USD₮0 `0xC1A5B41512496B80903D1f32d6dEa3a73212E71F` (6 dp), WNAT/WC2FLR
  `0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273` (18 dp).
- **Real live quotes (router `0x4406…`):** `getAmountsOut(1_000000, [FXRP, USDT0])`
  → `[1000000, 1224352]` (1 FXRP → 1.224352 USDT0); `[USDT0, FXRP]` →
  `[1000000, 751758]` (1 USDT0 → 0.751758 FXRP).

## Consequences for the spec / build

1. **Quote via `getAmountsOut`, never a reserves+fee formula.** The router's quote
   (1.224 USDT0) diverges from the vanilla 0.3%-fee constant-product result
   (~1.057) off the snapshot reserves — BlazeSwap's pricing carries FTSO-reward
   mechanics, so only the router's own quote is honest. (Also: the snapshot may
   have shifted between reads; the router is the single source of truth read at
   quote time.)
2. **Demo pair is USD₮0 ↔ FXRP**, consistent with the mainnet flagship pair — the
   spec's canonical pair holds, but the *counter asset is USD₮0, not WCFLR*.
   Spec corrected.
3. **Liquidity is thin and untraded.** A real small swap is possible (real
   reserves) and satisfies AC1, but a meaningful size shows large price impact —
   which the surface renders honestly. If a deeper demo is wanted, mainnet SparkDEX
   holds the deep FXRP/USDT0 pool (same one code path via the V2 router interface).
4. **AC1 funding gate (later):** a real swap needs the signing account to hold the
   input token (FXRP or USD₮0) on Coston2 plus its approval. FXRP is obtained via
   the M1 mint flow. Reads/quotes and the whole UI need no funds.

## Mainnet grounded too (Flare, chainId 14)

The V2 interface holds on mainnet with the same pair: **SparkDEX V2 Router
`0x4a1E5A90e9943467FAd1acea1E7F0e5e88472a1e`**, Factory
`0x16b619B04c961E8f4F06C10B42FDAbb328980A89`, and a real **V2 FXRP/USD₮0 pool**
`0x642c9f8CD8fd8d9398Ab26532ecA9696f092E660` (~29.26 FXRP / 29.87 USD₮0).
`getAmountsOut(1 FXRP)` → 0.984313 USD₮0 — textbook 0.3% math, unlike Coston2's
FTSO-reward pricing. Same ABI, different economics ⇒ always quote via the router,
never reimplement the fee. Mainnet tokens: FXRP `0xAd552A648C74D49E10027AB8a618A3ad4901c5bE`
(6 dp), USD₮0 `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` (6 dp), WFLR
`0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d` (18 dp).

## Method

viem read-only calls (factory `allPairsLength`/`allPairs`/`getPair`, pair
`token0`/`token1`/`getReserves`, router `factory`/`getAmountsOut`) + Coston2
blockscout API (`getcontractcreation` → deployer → creations) to pin the router
that on-chain swap history could not (no swaps exist yet). Probe scripts were
run from the repo, then removed.
