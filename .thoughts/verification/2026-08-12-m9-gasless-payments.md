# M9 — Gasless, relayers, payments: milestone evidence (2026-08-12)

Two real payment rails shipped as installable kit surfaces and live-verified on
Coston2, real-first: **gasless FXRP** (a payer sends real FXRP with 0 gas for the
payment, via a custom forwarder + one-time approval + a fee-free operated relayer) and
**x402/HTTP-402** (the `402 → sign → settle → resource` loop, real settlement on a
labelled demo token, MockUSDT0). The one path with no substrate — gasless USD₮0 — is
declared unavailable-on-testnet, never faked.

## What shipped

- **`reference/contracts/`** — a standalone Hardhat project (not a workspace member).
  Adapted, deployed + explorer-verified on Coston2:
  - `GaslessPaymentForwarder` `0x7F358717afdEC6FD4AFEfCf2e7dD9ff3dF4b9c17` (adaptation:
    the reference example's `authorizedRelayers` allowlist was decorative; it now
    enforces the allowlist in `executePayment`, matching the spec).
  - `MockUSDT0` (demo) `0x2dA725841FF6F5367E65C5d114aa66C034A3d97b`.
  - `X402Facilitator` `0x57da665Ef6Bd39F82Af6BC0764cd779E9C156DdA` (deployed fee-free;
    the inherited feeBps fields are inert and disclosed, not shipped as working).
  - Addresses recorded to `reference/contracts/deployments/coston2.json`.
- **`@flare-kit/contracts`** — `gasless.ts` (+ `gasless-abis.ts`), `x402.ts` (+
  `x402-abis.ts`): the registries, `gaslessVerified`/`x402Verified` flags, `demoToken:
  true`. No address literal outside the registries.
- **`@flare-kit/core`** — `gasless-eip712.ts` + `gasless-adapter.ts` + `gasless.ts` +
  `gasless-states.ts` + `mock-gasless.ts`; `x402-eip3009.ts` + `x402-client.ts` +
  `x402-states.ts` + `mock-x402.ts`; and `reconcile.ts` (the shared table-walking
  reconcile helpers extracted from `bridge-states.ts`). The EIP-712/EIP-3009 crypto is
  defined ONCE here and imported by the services.
- **`services/relayer`** (fee-free gasless relayer) and **`services/x402-server`**
  (single-endpoint x402 fixture) — new `services/*` workspace members, both importing
  `@flare-kit/core` for the crypto (no re-declaration); keys read from env, never logged
  or returned.
- **`@flare-kit/react`** — `use-gasless.ts`, `use-x402.ts` (durable reconcile polls).
- **`@flare-kit/react-ui`** — `GaslessCard` + `X402Card` (+ their pure state splits) +
  `payments.css`, reusing `SwapLeg`, the `OperationTimeline` spine and the shared card
  chrome. Gallery `m9-gasless-sections.tsx` + `m9-x402-sections.tsx`.

## AC1/AC2 — gasless FXRP, live (evidence: 2026-08-12-m9-gasless.md)

A real FXRP payment landed with the **payer paying 0 gas for it**:
- one-time approval (payer-gassed): tx `0x753a184f…`, payer C2FLR −0.0335.
- drained the payer to ~0.001365 C2FLR, then the relayed payment: tx
  `0x799d3c9eb0893643d418f334cb15d97cc6b2140d541bd46cef6901938f5b02d4`, **payer C2FLR
  unchanged across the payment**, FXRP payer −1 / recipient +1.
- Lifecycle `submitted (relay HTTP) → awaiting_external(relayer) → succeeded`;
  `succeeded` reached ONLY from the on-chain `PaymentExecuted` read.
`gaslessVerified` flipped `false → true` after the confirmed read.

## AC3 — x402, live (evidence: 2026-08-12-m9-x402.md)

`402 → sign EIP-3009 → settle → resource`:
- settlement (fact 1): tx `0x2923aa74b5478b3cf6b5aa6e279acfdf120ece201afd8de8f0701d076e698158`
  (status success), paymentId `0x3ef50c3d…`, mUSDT0 payer −0.1 / payee +0.1.
- resource (fact 2): HTTP 200, obviously-synthetic body (no fabricated data).
- Settlement and resource recorded as two independent facts; the asset is the demo token
  throughout; `succeeded` only from settled+delivered.
`x402Verified` flipped `false → true` after the confirmed settlement read.

## AC4 — gasless ≠ free, rendered

GaslessCard shows the one-time approval as a loud, distinct gas-costing setup step
("costs gas, once"), the "relayer covers gas · no fee" line, and no fee where none is
charged. X402Card shows the payer-signs-free / server-pays-gas split; the resource
carries no invented data.

## AC5 — declared gaps, not fakes

USD₮0-gasless renders unavailable-on-testnet with the EIP-3009 reason in the asset row;
both `*Verified` flags gate their surfaces (a not-verified path renders "Not available",
never a plan). Re-probed 2026-08-12: neither FXRP nor the real Coston2 USD₮0 dispatches
any EIP-3009 selector (`2026-08-12-m9-probe.json`).

## AC6 — surfaces, browser-verified, both themes

The gallery drove GaslessCard (13 states) and X402Card (9 states) in a real browser
(Chromium via Playwright), light and dark, at a fixed MOCK_EPOCH. Exact values render in
the mono face with asset + full precision. `window.__auditA11y()` reported **zero
findings on any M9-new `fk-gasless`/`fk-x402` element** in both themes (the remaining
findings are on shared primitives — the gradient primary button and the SwapLeg amount
input — pre-existing since M5–M8, and an M7-only AssetLogo). Screens under
`.thoughts/verification/m9-screens/` (m9-gasless-{light,dark}.png,
m9-x402-{light,dark}.png).

## AC7 — gate green; mock honest; reviewed

Full gate (turbo, 9 tasks each): `pnpm build` (4 packages) · `pnpm typecheck` (9,
incl. both services) · `pnpm lint` (clean) · `pnpm test` — all green, 0 failures
(contracts 16 files, core 73, react 5, react-ui 35, relayer 1, x402-server 1). The mocks
(`mock-gasless`/`mock-x402`) reproduce the observed live runs and refuse the unobserved
(a network never driven throws; a `confirmed`/`settled` outcome is never fabricated
without the caller asserting the observed read). Review gate: correctness /
security / honest-rendering-silent-failure / simplification subagents dispatched over the
M9 diff — findings and fixes recorded below.

## Review gate outcome

Four review subagents ran over the M9 diff: correctness, security, honest-rendering /
silent-failure, and simplification. **One critical + several important findings; all
fixed and re-tested.** The full gate is green after the fixes (contracts 148, core 811,
react 28, react-ui 321, relayer 7, x402-server 12; build/typecheck/lint all pass).

**Critical (fixed):**
- **A reverted x402 settlement tx was dressed as `succeeded`.** `x402-settle.ts` awaited
  the receipt but never checked `receipt.status` — viem's `waitForTransactionReceipt`
  resolves for a mined-but-reverted tx. So a settlement that passed simulate then reverted
  (the double-settle race: two requests with the same authorization, the second reverting
  "authorization used") returned `{ok:true}` → served 200 + `settled:true` → rendered
  "Delivered." **Fix:** gate success on `receipt.status === 'success'` (the check
  `live-x402.mjs` already made), return 502 on revert. New test covers it.

**Important (fixed):**
- **Relayer, same missing `receipt.status` check** → a reverted `executePayment` reported
  `ok:true`. Fixed with the same gate, plus the submit now captures the txHash *before*
  awaiting the receipt so a broadcast-then-receipt-timeout reports the tx (which may still
  land) rather than a false "nothing moved." New test covers the reverted case.
- **x402 payee bypass (security).** The server settled without checking the
  authorization's `to` equals the configured payee, so a payer could sign a self-transfer
  (`from=to=attacker`) and get the resource for free. **Fix:** enforce
  `payload.to === ctx.payee` before settling. New test covers it.
- **x402 unauthenticated DoS (security).** The async `/api/demo` handler had no try/catch
  (Express 4 doesn't catch a rejected async handler) and `decodePaymentHeader` only
  checked field truthiness, so a malformed `X-Payment` (`{"value":"abc"}`, missing fields)
  threw → unhandled rejection. **Fix:** strict type-validation in `decodePaymentHeader` +
  a try/catch around the handler (400 on any throw). New tests cover it.
- **Leg-timeline re-coded inline in both cards (simplification / "never build a spine
  inline in a screen").** The two in-flight leg lists + their CSS were duplicated.
  **Fix:** extracted a shared `LegTimeline` primitive (+ one `.fk-legtl` CSS block);
  both cards and their gallery cases re-verified in the browser (both themes,
  a11y-clean).

**Minor (fixed):** `paymentSince` no longer falls back to `amount: 0n` for an undecodable
amount (stays in-flight — "unknown renders —, never 0"); the speculative unused
`RelayReceipt.jobId` was replaced with the useful `blockNumber` (a tight `sinceBlock` for
the poll); `parseChallenge` now rejects a challenge missing `facilitatorAddress` rather
than defaulting it to `0x0`.

**Noted, deliberately not changed:** the relayer has no rate-limit/quota (the reference
is fee-free by design — a production fee/quota model is M9 out-of-scope, disclosed in the
README); returning a distinct idempotent "already settled" signal from the server (the
host reads `getPayment` for the duplicate case); a core `readSettlementOnChain` helper so
a future app surface can re-verify the server's `X-Payment-Response` on-chain (the
server-side receipt gate above is the primary defense).

## Rules the live runs taught (for state.json)

- The forwarder EIP-712 domain `("GaslessPaymentForwarder","1")` + the MockUSDT0 domain
  `("Mock USDT0","1")` are byte-identical to the on-chain `DOMAIN_SEPARATOR`; core
  reproduces both offline (asserted in tests), so the relayer/facilitator accept the
  kit's signatures. This is the strongest "single source of truth" test.
- A relay/server HTTP 200 is NOT the transfer/settlement: `succeeded` only from the
  on-chain read.
- The one-time approval is the ONLY payer-gas step; the payment is gasless.
- x402: settlement ≠ resource; settled-but-resource-failed is `partially_succeeded`.
- MockUSDT0 is the only EIP-3009 substrate on Coston2; `demoToken` is registry data.
- viem: passing a bare address string as `simulateContract({account})` makes it a
  node-signed (json-rpc) account, so `writeContract(request)` then fails on a node
  without the key ("missing/invalid parameters"). Pass the local Account object.
- Coston2 base gas price spiked to ~650 gwei during the run (≈26× usual); native-transfer
  drain fee math must use an explicit legacy `gasPrice` + `gas=21000`, not an EIP-1559
  maxFee estimate, or the drain fails "gas required exceeds allowance".
