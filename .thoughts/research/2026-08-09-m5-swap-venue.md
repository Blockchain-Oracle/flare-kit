# M5 swap-venue research — which real DEX the kit integrates

Date: 2026-08-09
Question: For M5 (SwapCard + TokenSelector, real-first), which Flare/Coston2 DEX
does the kit integrate? Governed by the hard rules: **never fake protocol reality**
(no invented quotes/routes), **network is configuration** (testnet-first,
mainnet-capable, no source rewrite), **addresses come from `@flare-kit/contracts`**.

## The two documented Flare swap paths (from the vendored `developer-hub`)

Flare's own developer hub documents **two** DEX integrations — this is the primary,
authoritative evidence:

1. **SparkDEX = Uniswap V3** — `developer-hub/docs/fxrp/token-interactions/02-usdt0-fxrp-swap.mdx`
   + `examples/.../UniswapV3Wrapper.sol`. Flagship pair **USDT0 → FXRP**, fee tier 500
   (0.05%). Uses `ISwapRouter.exactInputSingle`, `IUniswapV3Factory.getPool`, and a
   pool-liquidity check before swapping. **All addresses given are Flare mainnet.**
2. **BlazeSwap = Uniswap V2** — `developer-hub/docs/fassets/developer-guides/11-fassets-swap-redeem.mdx`
   + `examples/.../FAssetsSwapAndRedeem.sol`. Swaps **WCFLR → FXRP** then redeems FXRP
   to XRPL through the FAssets asset manager. WCFLR + `FTestXRP` (the Coston2 FXRP
   `0x0b6A3645c240605887a5532109323A3E12273dc7`, decimals 6) mark this a **testnet**
   flow. V2 semantics.

## Deployment reality (authoritative sources; web-search specifics treated as unverified)

- **SparkDEX (V3 AMM): mainnet-only in its own docs.** `docs.sparkdex.ai` lists only
  Flare-mainnet addresses — V3 SwapRouter `0x8a1E35F5c98C4E85B36B7B253222eE17773b2781`,
  V3 Factory `0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652`, QuoterV2
  `0x2DcABbB3a5Fe9DBb1F43edf48449aA7254Ef3a80`, V2 Router
  `0x4a1E5A90e9943467FAd1acea1E7F0e5e88472a1e`, UniversalRouter
  `0x0f3D8a38D4c74afBebc2c42695642f0e3acb15D3`. **No Coston2 AMM addresses documented.**
  (SparkDEX's *perps* product may be on Coston2 per its roadmap — a different product,
  not the swap AMM. A search summary claiming the V3 router is "on Coston2" is
  unverified and contradicted by the docs.)
- **BlazeSwap (V2): live on Coston2 AND mainnet.** Flare-native (Flare/Songbird/Coston),
  open-source, "highly inspired by Uniswap V2" with FTSO-delegation extensions.
  Coston2 BLAZE-LP pool tokens exist on the explorer (`0x84c8b3c2…`, `0xaeB2aB5d…`) —
  LP tokens existing ⇒ factory + router + pools deployed on Coston2. Mainnet Router
  `0xe3A1b355ca63abCBC9589334B5e609583C7BAa06`.

## Recommendation — integrate the **Uniswap V2 router *interface*** (BlazeSwap on Coston2)

Not "brand X" but the **V2 router interface**, with the address from
`@flare-kit/contracts` per network. Rationale, tied to the kit's laws:

1. **Testnet-first is the deciding law.** BlazeSwap's V2 AMM is deployed on **both**
   Coston2 and mainnet, so one interface drives both with no source rewrite. SparkDEX's
   V3 AMM is mainnet-only in its docs, so it cannot be driven testnet-first — it fails
   the network-is-configuration law on its own.
2. **Honest quoting is simpler in V2.** `getAmountsOut` returns an on-chain quote from a
   single router call — no separate quoter, no concentrated-liquidity tick math. Fewer
   places to accidentally render a number no pool committed to.
3. **On-theme + Flare's own testnet example.** Flare documents BlazeSwap V2 for exactly
   the kit's asset (WCFLR ↔ FXRP → redeem), reusing the FAssets/FXRP lifecycle already
   built in M1.
4. **network is configuration.** Registry holds the V2 router per network — BlazeSwap on
   Coston2; on mainnet either BlazeSwap (`0xe3A1…`) or SparkDEX's own V2 router. One
   code path, both networks.

Trade-off acknowledged: SparkDEX/USDT0↔FXRP is the flashier *mainnet* liquidity story;
a V3 integration would chase deeper pools at the cost of a mainnet-only, heavier path.

## Must verify on-chain as the M5 build's FIRST real-first step (not assumed here)

- The exact **BlazeSwap Coston2 Router + Factory** addresses (read from chain / verified
  source), added to `@flare-kit/contracts`.
- That a **kit-relevant pool has real, swappable liquidity on Coston2** (FXRP/WCFLR or
  FXRP/USDT0). LP tokens exist, but depth is unconfirmed. The swap surface performs a
  live `getPair`/reserves check before quoting — exactly as the vendored UniswapV3Wrapper
  checks pool liquidity — so an empty pool renders "no route", never a faked quote. **If
  Coston2 depth is too thin to demo, the live demo runs on mainnet — same one code path.**

## Sources
- Vendored: `developer-hub/docs/fxrp/token-interactions/02-usdt0-fxrp-swap.mdx`,
  `developer-hub/docs/fassets/developer-guides/11-fassets-swap-redeem.mdx`,
  `developer-hub/examples/developer-hub-solidity/UniswapV3Wrapper.sol`.
- `docs.sparkdex.ai/additional-information/smart-contract-overview/v2-v3.1-dex` (mainnet-only).
- BlazeSwap: `github.com/blazeswap/contracts`, `blazeswap.xyz`, Coston2 explorer BLAZE-LP tokens.
