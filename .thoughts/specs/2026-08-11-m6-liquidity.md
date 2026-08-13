# Spec: flare-kit milestone 6 — liquidity, real (AddLiquidityCard + PositionCard)

> Governed by `.thoughts/decisions/2026-08-04-build-everything-real-first.md`
> (the "Swaps, liquidity, vaults" DEX bucket; M5 built the swap, M6 builds
> add/remove liquidity on the same venue). Reconciles the liquidity-provision
> surfaces first sketched in
> `.thoughts/specs/2026-08-03-merchant-and-liquidity-surfaces.md`
> (LIQ-04 / LIQ-05 / LIQ-06 and rules R-LIQ-101…106).
> Venue + pool already grounded by M5's R1 probe
> (`.thoughts/verification/2026-08-09-m5-r1-coston2-swap-venue.md`) and the live
> swap (`.thoughts/verification/2026-08-09-coston2-live-swap.md`).

## Objective

After this milestone a developer can install the kit and drop a working
**add-liquidity** card and a **position / remove-liquidity** card into their own
React app, and a person can supply real FXRP + USD₮0 into a real DEX pool on
Coston2 — testnet first — and later withdraw it, seeing the **honest paired
amount** at the pool's current reserve ratio, their **expected LP share**, the
**exact minimums** each asset is protected to under slippage, every **approval as
its own step**, and both transactions on an explorer. Liquidity is the second
application-layer capability in the DEX bucket, built on the same BlazeSwap V2
venue M5 verified live, and it reuses the durable operation lifecycle M1 forced
into being and the surface anatomy M5 established.

## The venue — already decided and already verified

M6 does **not** run a new on-chain probe. It extends the venue M5 grounded and
drove live: **BlazeSwap V2 on Coston2**, addresses in `@flare-kit/contracts`
(`dex.ts`) — Router `0x440602f459d7dd500a74528003e6a20a46d6e2a6`, Factory
`0x02d03957Cf02d153141bf23C60099E9aa48bf872`. The one live pool is **FXRP / USD₮0**
(`0xDD598473…`), both tokens 6 dp; the same registry carries SparkDEX's V2 router
on mainnet, so one code path serves both networks and only the address changes
(network is configuration). The only new on-chain reads M6 needs are the pair's
`getReserves` (already in the ABI), the LP token's `totalSupply`, and the signer's
LP `balanceOf` — no pool is assumed, and a pair with no `getPair` never quotes.

## The V2 liquidity model, and the honesty it forces

BlazeSwap V2 is an **AMM with fungible LP shares**, not a ranged (V3) venue. This
determines the whole surface, and three consequences are load-bearing:

- **Positions are fungible ERC-20 LP tokens**, so **out-of-range (R-LIQ-103) is
  declared Not Applicable** — it is a V3/SparkDEX concept, and V3 is mainnet-only,
  deferred for exactly the testnet-first reason M5 deferred it. The surface states
  this rather than silently omitting it.
- **Adding is ratio-locked.** The card quotes the *paired* amount from live
  reserves (`amountB = amountA · reserveB / reserveA`) so the person supplies
  matched amounts and there is **no silent excess** — V2's `addLiquidity` does not
  swap a mismatched remainder, it would simply leave it in the wallet. Expected LP
  minted = `min(amountA · totalSupply / reserveA, amountB · totalSupply / reserveB)`;
  the resulting **pool share %** is shown.
- **Fees are embedded in reserves, not claimable.** V2 has no separate
  "claim fees" call; an LP's share of a growing pool *is* the fee. The position
  surface never renders a claimable-fees balance that does not exist. It shows the
  current composition of both assets, and a value-change-against-supplied **only
  when the kit recorded the supplied basis**; a position the kit did not create is
  shown honestly as current composition with no invented P&L (R-LIQ-104).

Two more binding rules carry over unchanged: supplying liquidity **is not a
deposit** and copy never calls it saving, earning or yield without naming the
mechanism (R-LIQ-101); and **a position's composition changes with price**, stated
in plain language at supply time, not hidden behind a tooltip and not reduced to
the phrase "impermanent loss" alone (R-LIQ-102).

## Requirements

- **M6-R1 — `@flare-kit/contracts` extends the DEX; no re-probe.** `dex.ts` gains
  the V2 Router `addLiquidity` and `removeLiquidity` functions and the LP token's
  `totalSupply` read, reusing the existing `getReserves` / `getPair` and ERC-20
  `allowance` / `approve` / `balanceOf` already present. The LP token is the pair
  address itself. No address is hardcoded anywhere else; every address stays in
  the registry M5 verified.

- **M6-R2 — `@flare-kit/core` add/remove operation.** An immutable
  `AddLiquidityIntent` (tokenA, tokenB, amountADesired, slippageBips, deadline,
  recipient) and `RemoveLiquidityIntent` (tokenA, tokenB, an **absolute**
  `liquidity` LP-token amount, slippageBips, deadline, recipient — the percent
  affordance is a UI control that resolves to this absolute amount against the read
  LP balance, never a second field in the core intent) → an **unsigned plan** (an `approve` step for
  each token that is actually short on the add side, or a single LP-token `approve`
  on the remove side, then `addLiquidity` / `removeLiquidity` with `amountAMin` /
  `amountBMin` derived from the quote and slippage) → **execution** → canonical
  states, with typed errors distinct for **no-pool**, **insufficient-balance**,
  **ratio/slippage-exceeded**, and **expired-deadline**. It reuses the M1 lifecycle
  engine and walks the `states.ts` table (a reconciler never jumps states — see the
  `applyTransition` silent-drop hazard already recorded).

- **M6-R3 — the quote is honest, and minimums are exact.** `liquidity-quote.ts`
  reads live reserves + LP `totalSupply` (+ the signer's LP `balanceOf` for the
  position) and computes: the paired amount at the current ratio, the expected LP
  minted, the pool share %, and — for removal — the exact amount of each asset
  returned (`liquidity · reserveX / totalSupply`). Each protected minimum is
  `amount · (10000 − slippageBips) / 10000` and is shown at full precision in the
  mono face beside the expected amount. An unknown value renders as `—`, never `0`.
  A quote carries the time it was read; a swap of the ratio between quote and
  execution that trips `amountAMin` / `amountBMin` on-chain is rendered as
  **ratio/slippage-exceeded**, a distinct state, not a failure of the kit.

- **M6-R4 — approvals are never hidden.** The ERC-20 allowance is read for each
  asset; the add plan includes an `approve` **only** for a token that is actually
  short, so an add can carry zero, one or two approval steps. The remove plan reads
  the **LP token's** allowance to the router and includes its `approve` only when
  short. Every approval is its own step with its own transaction, and the full
  sequence is stated before the first signature (R-LIQ-106); a pre-approved leg
  shows no step.

- **M6-R5 — real-first; the mock copies observed behaviour.** `mock-liquidity.ts`
  is written only after the real path and reproduces observed reserves, the LP
  mint/burn math, pool share, and failure shapes (ratio revert, no-pool). Mock mode
  is explicit and labelled, never a fallback triggered by a failure, and it refuses
  to answer anything it never observed rather than returning a plausible zero.

- **M6-R6 — AddLiquidityCard (LIQ-05).** Two "you supply" legs for tokenA and
  tokenB, the second ratio-locked to the first from live reserves; the expected LP
  and pool share shown; an explicit plain-language statement of the risk being
  taken (composition changes with price). Asset marks via `AssetLogo`; exact
  amounts in mono; the approve(s) and `addLiquidity` render on the operation spine
  as the real steps they are (M6-R4). No new per-surface design artifact — it
  follows the established card anatomy.

- **M6-R7 — PositionCard (LIQ-06).** Reads the signer's live LP balance on open
  (a position is chain state, not session state — self-reconciling, no Resume
  button), shows the current composition of both assets and the value change
  against what was supplied when that basis is known, offers **partial removal by
  percent** (25 / 50 / 75 / 100 and an exact entry), and renders the LP-approve →
  `removeLiquidity` steps on the spine. When there is no LP balance it shows an
  honest **no-position** state, never an empty guess.

- **M6-R8 — network is configuration.** One code path serves Coston2 and mainnet;
  only the registry address changes. Testnet first, mainnet-capable, no source
  rewrite.

- **M6-R9 — reuse, files < 300 lines.** Reuse `SwapLeg` for both the supply legs
  (a `pay`-shaped role) and the returned-amount legs (a `receive`-shaped role),
  the `OperationTimeline` spine, and `Panel` / `Button` / `AssetLogo` /
  `EvidenceChip` / `DetailRow` / `Note`. The only candidate new shared primitive is
  a `PercentPills` control for partial removal, built once in the UI package if the
  remove-percent affordance is not already covered by an existing primitive. The
  pure state→chrome mapping for each card is split into an `add-liquidity-state.ts`
  / `position-card-state.ts` if the card would otherwise exceed 300 lines, at the
  same seam `swap-card-state.ts` sits on.

- **M6-R10 — PoolCatalogue (LIQ-04) is declared unbuilt.** With one live Coston2
  pool a discovery catalogue would render a single row, so it is shown as a
  declared-unbuilt state — present, disabled, and reasoned ("one live Coston2 pool
  today; a multi-pool, multi-venue catalogue is a later milestone once mainnet or
  additional pools qualify") — per DESIGN.md's precedent that a surface which
  cannot honestly act is declared, not faked, and not silently omitted.

## Out of scope (M6)

- **First-liquidity / new-pool creation** — there is no empty pool on Coston2 to
  exercise it against, it would set the initial price arbitrarily (V2 mints
  `sqrt(a·b) − MINIMUM_LIQUIDITY`) and needs its own risk copy; adding to the
  existing seeded pool is the committed real-first path. A later milestone, or the
  same milestone against a network that has an empty pool.
- **PoolCatalogue as a full surface** (LIQ-04) — declared unbuilt, above.
- **V3 / SparkDEX concentrated (ranged) liquidity** — mainnet-only today, so it
  fails testnet-first, exactly as in M5. Revisit if SparkDEX ships a Coston2 AMM.
- **Farming / staking the LP token, and zap / single-sided add** — a single-sided
  add would require an internal swap the kit will not hide inside "add liquidity".
- **Vaults (ERC-4626)** — the next DEX-adjacent capability, its own milestone.

## Files (added to SPEC.md's `## Files` manifest before writing)

- `packages/contracts/src/dex.ts` — **extend**: Router `addLiquidity` /
  `removeLiquidity`, LP `totalSupply`. M6-R1.
- `packages/core/src/liquidity.ts` — the add/remove operation: intents, plan,
  execution, states, typed errors. M6-R2.
- `packages/core/src/liquidity-quote.ts` — reserves + LP supply → paired amount,
  expected LP, pool share, per-asset removal amounts, minimums from slippage;
  split at the quote/execute seam as `swap-quote.ts` / `swap.ts` are. M6-R3.
- `packages/core/src/mock-liquidity.ts` — the mock, written after the real path.
  M6-R5.
- `packages/react-ui/src/AddLiquidityCard.tsx` (+ `add-liquidity-state.ts` if the
  card would exceed 300 lines). M6-R6.
- `packages/react-ui/src/PositionCard.tsx` (+ `position-card-state.ts` if needed).
  M6-R7.
- `packages/react-ui/src/liquidity.css` — the liquidity surfaces' CSS, values from
  tokens.
- `packages/react-ui/gallery/m6-liquidity-sections.tsx` (+ Gallery wiring) — the
  AC5 state matrix in both themes.
- `packages/react-ui/src/primitives/PercentPills.tsx` — only if the remove-percent
  control is not already covered by an existing primitive. M6-R9.

## Acceptance criteria

- **AC1** — a real **add-then-remove round trip** is executed and recorded on
  Coston2, with the add-side approval tx(s), the `addLiquidity` tx, the LP-token
  approval tx, and the `removeLiquidity` tx, each with its explorer link, and the
  network + addresses + the LP balance before/after noted as evidence.
- **AC2** — the rendered add quote (paired amount, expected LP, pool share) equals
  the value computed from the on-chain reserves and supply for the same inputs, and
  the predicted LP matches the **actual LP minted** (the LP balance delta AC1
  records) within rounding; `amountAMin` / `amountBMin` are enforced on-chain; a
  ratio drift that would breach
  them reverts and renders as **ratio/slippage-exceeded**, a distinct state, never
  as success or as a kit failure.
- **AC3** — a pair with no pool renders **no-pool** with a reason, never `0` and
  never a guessed ratio (`getPair` returns the zero address).
- **AC4** — each approval is shown as its own step: an add shows only the
  approval(s) actually short (zero, one or two), a remove shows the LP approval only
  when short, and a pre-approved leg shows no approval step.
- **AC5** — Gallery, both themes, states reachable from props: AddLiquidityCard
  {quote, needs-approval-A, needs-approval-B, approving, adding, success, no-pool,
  ratio-exceeded, insufficient-balance} and PositionCard {no-position, position,
  remove-approval, removing, removed, partial}. Computed-style + a11y verified
  (contrast composited with opacity, focus, target size), the same method M4-R12
  established.

## Verification

A live script (`packages/core/scripts/live-liquidity.mjs`) drives the whole path
through the kit — read reserves/supply → `readAllowance` for both tokens →
`buildAddPlan` → sign the approval(s) and `addLiquidity`; then read the LP balance
→ `readAllowance` for the LP token → `buildRemovePlan` → sign the LP approval and
`removeLiquidity` — recording every tx hash, explorer link, and the LP and asset
balances before and after. It signs with its own key
(`privateKeyToAccount(secrets.evm.privateKey)`), the headless path, exactly as
`live-swap.mjs` does; the browser surfaces sign through the host's connected wallet
via the `onSubmit` callback and never hold a key. `pnpm build && pnpm typecheck &&
pnpm lint && pnpm test` green, shown with output. The gallery drives every AC5
state and is screenshotted in both themes.

## Sources

- `.thoughts/specs/2026-08-09-m5-swaps.md` (the venue, the operation lifecycle,
  and the surface anatomy this milestone extends).
- `.thoughts/specs/2026-08-03-merchant-and-liquidity-surfaces.md` (LIQ-04/05/06 and
  rules R-LIQ-101…106, reconciled here to the BlazeSwap V2 reality).
- `.thoughts/verification/2026-08-09-m5-r1-coston2-swap-venue.md`,
  `.thoughts/verification/2026-08-09-coston2-live-swap.md` (venue + pool, live).
- `.thoughts/decisions/2026-08-03-agent-facing-surfaces.md` (the two signing paths:
  host wallet for people, own key for agents; read/plan need no key).
- `developer-hub/docs/fxrp/token-interactions/02-usdt0-fxrp-swap.mdx`,
  `github.com/blazeswap/contracts` (the V2 Router `addLiquidity` / `removeLiquidity`
  interface), `docs.sparkdex.ai` (mainnet V2 router).
- Accepted design: DESIGN.md "Components — re-cut 2026-08-09" (card anatomy, the
  operation spine, declared-unbuilt precedent).
