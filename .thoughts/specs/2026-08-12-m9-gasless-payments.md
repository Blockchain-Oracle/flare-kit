# Spec: flare-kit milestone 9 — gasless payments (FXRP forwarder + x402 demo), real-first (GaslessCard + X402Card)

> Governed by `.thoughts/decisions/2026-08-04-build-everything-real-first.md`
> (the next row after "Bridges, messaging, OFTs" closed at M8: **"Gasless,
> relayers, payments"**). Two documented mechanisms, decided with Abu on
> 2026-08-12:
> - **Feature 1 — Gasless FXRP (real).** A custom `GaslessPaymentForwarder` +
>   a one-time FXRP approval + an operated relayer. Real FXRP the whole way.
>   Grounded in `developer-hub/docs/fxrp/token-interactions/04-gasless-fxrp-payments.mdx`.
> - **Feature 2 — x402 / HTTP-402 (real flow, demo token).** MockUSDT0 +
>   X402Facilitator, self-deployed on Coston2. The flow is live (real settlement
>   transactions); the **asset** is a labelled demo stand-in, because x402
>   settles by calling EIP-3009 `transferWithAuthorization`, which neither FXRP
>   nor the real Coston2 USD₮0 implements. Grounded in
>   `developer-hub/docs/fxrp/token-interactions/03-x402-payments.mdx`.
>
> Load-bearing probe (2026-08-12, this session): the real Coston2 USD₮0
> `0xC1A5B41512496B80903D1f32d6dEa3a73212E71F` is a plain ERC-20 — `transfer`,
> `approve`, `balanceOf` present; **all four EIP-3009 selectors absent**
> (`transferWithAuthorization` `0xe3ee160e`, `receiveWithAuthorization`
> `0xef55bec6`, `authorizationState` `0xe94a0102`, `cancelAuthorization`
> `0x5a049a70`), and no EIP-2612 permit. So **gasless USD₮0 has no substrate on
> testnet** and **real x402-with-FXRP is impossible** until FXRP implements
> EIP-3009 (Flare's own docs say so). Both are declared, not faked.
>
> Scope decided with Abu, 2026-08-12: **ship the self-hostable reference**
> (forwarder + relayer + x402 server as deployable artifacts; flare-kit never
> becomes a hosted operator); **fee-free reference relayer** (absorbs gas, no
> fabricated fee/quota); the **one-time approval stays loud** (a gas-costing
> setup step, never smoothed); the **x402 server is a fixture, not a
> marketplace** (there is no marketplace on Flare or in the kit — verified);
> the **polished agent tool / MCP / CLI is M10**, and the **FCC/TEE
> policy-signer** (`fce-direct-sign`) is the later Flare Confidential Compute
> milestone.

## Objective

After this milestone a developer can install the kit and drop a working
**gasless payment** card and an **x402 payment** card into their own React app,
and:

- a person (or an agent with its own key) can send **real FXRP** to a recipient
  **without holding gas for the payment** — signing an EIP-712 payment off-chain
  that an operated relayer submits and pays for — after a **one-time approval**
  that is shown honestly as the gas-costing setup step it is; and
- a client (or agent) can complete the **HTTP-402 → sign → settle → resource**
  loop end-to-end against a live facilitator, seeing the **settlement** and the
  **resource delivery** as two independent facts, with the paid asset **labelled
  a demo token** at every turn and never dressed as FXRP or USD₮0.

Gasless is the first capability whose on-chain transaction is **submitted by a
third party (the relayer) on the user's behalf**; x402 is the first whose
outcome has **two independent legs on two different transports** (an on-chain
settlement and an HTTP resource). Both reuse the durable, self-reconciling
operation lifecycle M1 forced into being and the surface anatomy M5–M8
established. Both extend the project's spine rule — a submitted thing is never a
succeeded thing — to a **relay receipt** (not the transfer) and a **settlement**
(not the resource).

## The two mechanisms, and why they differ

**Gasless FXRP uses a forwarder because FXRP is a plain token.** FXRP exposes no
meta-transaction entrypoint, so a helper contract carries the authorization:

1. **One-time:** the payer calls `approve(forwarder, allowance)` on FXRP. This
   is an ordinary transaction — **the payer pays gas for it, once.**
2. **Per payment:** the payer signs an EIP-712 `PaymentRequest`
   (`from, to, amount, nonce, deadline`) off-chain — no gas.
3. The payer POSTs the signed request to the **relayer** (`services/relayer`),
   which recovers the signer, validates balance/allowance/deadline, simulates,
   then calls `forwarder.executePayment(...)` and **pays the gas.**
4. The **forwarder** verifies the signature is the `from` account's, checks the
   nonce is unused, pulls `amount` FXRP from the payer via `transferFrom`, sends
   it to `to`, and increments the nonce (replay protection; the `deadline`
   expires stale signatures).
5. The payer gets a receipt — a **real on-chain transaction hash.**

The forwarder carries an `authorizedRelayers` allowlist (which relayers may call
`executePayment`). The reference relayer is **fee-free**: it absorbs its own gas
and charges the payer nothing. A production relayer would add quota/auth/rate
limiting; M9 does not build that and does not render a fee that is not charged.

**x402 requires EIP-3009 because the protocol settles by calling the token
directly.** There is no forwarder option for x402:

1. The client requests a resource from `services/x402-server`.
2. The server returns **`402 Payment Required`** with a payment requirement
   (`scheme, network, maxAmountRequired, payTo, asset, extra{tokenAddress,
   facilitatorAddress, chainId}`) and an expiry window.
3. The client signs an **EIP-3009 authorization** off-chain (no gas).
4. The client re-sends the request with a Base64 `X-Payment` header carrying the
   signed authorization.
5. The server hands it to the **X402Facilitator**, which calls
   `transferWithAuthorization` to move the token; the server returns
   **`200 OK` + the resource** and an `X-Payment-Response` header with the
   settlement transaction.

Because `transferWithAuthorization` is mandatory and neither FXRP nor the real
Coston2 USD₮0 has it, the demo runs on **MockUSDT0** — deployed by us, minted
freely, **labelled a demo token everywhere it appears.** The flow, the
facilitator, and the settlement transaction are all real; only the asset is a
stand-in. The server exposes exactly one paid endpoint returning an
**obviously-synthetic payload with no fabricated data** (unlike the tutorial's
example, which returns a made-up `flarePrice` — deliberately not copied).

## The honesty it forces

The signature that this project keeps re-learning, applied to M9:

- **A relay receipt is not a transfer.** The relayer accepting a job
  (`relay_accepted`) is not the money moving. `succeeded` is entered **only**
  from reading the FXRP transfer on-chain — never from the relayer's HTTP 200.
- **A settlement is not a resource.** x402 `settled` (the facilitator
  transaction) and `resource_delivered` (HTTP 200 + body) are two independent
  states. One can succeed while the other fails; the surface shows both.
- **Gasless is not free.** The one-time approval costs the payer gas (shown as a
  distinct setup step); the relayer/server bears the settlement gas (shown). No
  fabricated fee line, no decorative quota.
- **A demo token is never dressed as real.** Every x402 surface names MockUSDT0
  and marks it a demo stand-in; it is never rendered as USD₮0 or FXRP. The label
  is registry data (`demoToken: true`), not a hand-typed string that could drift.
- **An unavailable path is declared, not faked.** USD₮0-gasless (no EIP-3009 on
  testnet) renders as unavailable-on-testnet with the reason; it never emits a
  plan.
- **The mock copies only what the live run observed** and refuses the unobserved
  (the `mock-never-fills-unobserved` rule), for both features.

## Requirements

- **M9-R1 — `@flare-kit/contracts` gains the gasless and x402 registries.**
  `gasless.ts` (+ `gasless-abis.ts`) carries the forwarder address/ABI per
  network and a `gaslessVerified` flag; `x402.ts` (+ `x402-abis.ts`) carries the
  MockUSDT0 + X402Facilitator addresses/ABIs, an `x402Verified` flag, and
  explicit `demoToken: true` metadata. All addresses are read from the live
  deploy (M9 Verification), never hardcoded elsewhere. Both `*Verified` flags
  start `false` and flip to `true` only after the confirmed live read, exactly
  as `bridgeVerified`/`withdrawVerified` did. Until then the surfaces show the
  configured path but a declared-unbuilt affordance, never a plan.

- **M9-R2 — `@flare-kit/core` gasless FXRP operation.** `gasless-eip712.ts` is
  the canonical `PaymentRequest` type + domain + sign/recover helpers — **the
  single source of truth `services/relayer` imports** (co-location makes crypto
  drift impossible, the same principle that kept the mock in core).
  `gasless-adapter.ts` reads the forwarder nonce, checks FXRP balance/allowance,
  determines "needs approval?", builds and signs the request, POSTs to the
  relayer, and reads the on-chain transfer for reconciliation. `gasless.ts` maps
  intents → a `gaslessVerified`-gated plan → the lifecycle.

- **M9-R3 — the gasless lifecycle is durable and self-reconciling.**
  `gasless-states.ts` walks `needs_approval → approving → approved → authorized
  → relay_accepted → submitted → succeeded/failed`. `relay_accepted`,
  `submitted` and `succeeded` are distinct; **`succeeded` is entered only from
  the on-chain FXRP transfer read**, never from the relayer response. A submitted
  operation persists its evidence and reconciles against the chain when the app
  reopens — no Resume button.

- **M9-R4 — the one-time approval is explicit; gasless ≠ free.** The
  `approve(forwarder, …)` step is a first-class, labelled setup step ("costs
  gas, once"), separated from the gasless signature, with the nonce/deadline and
  a replay note. The relayer-bears-gas fact is shown. No fee is rendered unless a
  fee is actually charged (the reference charges none).

- **M9-R5 — fee-free reference relayer.** `services/relayer` (`GET /nonce/:addr`,
  `POST /execute`) recovers the signer, validates
  balance/allowance/deadline/nonce, simulates via `staticCall`, submits
  `executePayment`, and returns the receipt. It imports `@flare-kit/core` for the
  EIP-712 types + validation (M9-R2). It absorbs its own gas and adds no fee or
  quota. It logs no signing key and includes none in any output.

- **M9-R6 — `@flare-kit/core` x402 client.** `x402-eip3009.ts` is the canonical
  EIP-3009 authorization type + domain + sign/recover — **the single source of
  truth `services/x402-server` imports.** `x402-client.ts` parses a `402`
  challenge, signs, attaches the `X-Payment` header, reads `X-Payment-Response`,
  and tracks settlement and resource delivery **separately**. `x402-states.ts`
  walks `challenge_received → authorized → settling → settled →
  resource_delivered/resource_failed`, honors the challenge expiry, and treats
  the nonce as the idempotency key.

- **M9-R7 — the demo token is labelled, the flow is real.** MockUSDT0 is marked
  `demoToken: true` in the registry (M9-R1) and every x402 surface renders that
  label; it is never shown as USD₮0 or FXRP. The settlement transaction, the
  facilitator, and the payment ID are real and shown as such — the demo qualifier
  attaches to the **asset**, never to the flow.

- **M9-R8 — the reference services and Solidity get an honest home.**
  `pnpm-workspace.yaml` gains a `services/*` glob; `services/relayer` and
  `services/x402-server` are workspace members that import `@flare-kit/core`.
  First-party Solidity (`GaslessPaymentForwarder.sol`, `MockUSDT0.sol`,
  `X402Facilitator.sol`) + deploy scripts live in a `reference/contracts/`
  Hardhat project (adapted from the documented examples; not a JS workspace
  member). `sources/` stays vendored-reference-only.

- **M9-R9 — real-first; the mock copies observed behaviour.** `mock-gasless.ts`
  and `mock-x402.ts` are derived from the live runs (M9 Verification): they
  reproduce what the real relayer/facilitator did and refuse to render anything
  not observed. No live code path constructs a mock under any error.

- **M9-R10 — GaslessCard (GAS-01/02/03).** One card folding the composer, the
  authorization/approval review, and the relay→outcome timeline. Composer: FXRP,
  amount, recipient, relayer identity + reachability, the "relayer covers gas ·
  no fee" line, and USD₮0 shown as unavailable-on-testnet with the EIP-3009
  reason (the declared gap lives in the asset picker; no separate catalogue).
  Authorization: the loud one-time approval + nonce/deadline + replay note.
  Timeline: `relay_accepted → submitted → succeeded`, succeeded only from the
  on-chain read.

- **M9-R11 — X402Card (PAY-01/02).** Challenge review: resource requested, amount
  in MockUSDT0 with the demo-token label, payee, facilitator, network, expiry;
  sign. Outcome: settlement and resource delivery independently visible; the
  receipt carries the real settlement tx hash and payment ID; a duplicate/
  idempotent replay is shown as such, not a second charge.

- **M9-R12 — network is configuration; unverified paths are gated, not faked.**
  Addresses come from `@flare-kit/contracts` (M9-R1). USD₮0-gasless is declared
  unavailable-on-testnet; real x402-with-FXRP is declared impossible-until-3009.
  Neither ever emits a plan. Testnet-first, mainnet-capable with no source
  rewrite.

- **M9-R13 — reuse; files < 300 lines.** Reuse `SwapLeg` for the send/receive
  legs, the `OperationTimeline` spine for both lifecycles, and the M7/M8 card
  chrome. Exact values render in the mono face with their asset and full
  precision. Split any module approaching 300 lines before writing (e.g. a
  `gasless-approval.ts` or `x402-settlement.ts` split if a states file grows).

- **M9-R14 — `@flare-kit/react` hooks.** `use-gasless.ts` drives the gasless
  lifecycle, polling the relayer job **and** the on-chain transfer;
  `use-x402.ts` drives the x402 lifecycle, polling settlement **and** resource
  delivery. Read/plan paths need no key; signing uses the caller's key
  (agent-usable, per the agent-facing-surfaces decision).

## Out of scope (M9)

- **Gasless USD₮0 (EIP-3009 token-native).** No EIP-3009 on the real Coston2
  USD₮0 (probed). Declared unavailable-on-testnet; renders the reason, never a
  plan (M9-R12).
- **Real x402 settlement in FXRP or real USD₮0.** Impossible until the token
  implements EIP-3009. Declared; the demo runs on MockUSDT0 only (M9-R7).
- **A production fee/quota/rate-limit model for the relayer.** The reference is
  fee-free by design (M9-R4/R5). A real deployment would add one; M9 does not.
- **The polished agent tool, MCP server, CLI, and scaffolder for x402/gasless.**
  That is M10 (its own roadmap row). M9 ships the headless core (agent-usable)
  and the React surfaces; it does not ship the packaged agent tooling.
- **The FCC/TEE policy-signer** (`fce-direct-sign` holding the agent's key and
  enforcing merchant/amount/budget policy before signing). That is the later
  Flare Confidential Compute milestone.
- **A marketplace.** None exists on Flare or in the kit (verified). The x402
  server is a single-endpoint fixture, not a product surface.
- **Mainnet gasless/x402.** Testnet-first; mainnet addresses slot into the same
  registries with no source rewrite when a live run verifies them.

## Files (added to SPEC.md's `## Files` manifest before writing)

Reference Solidity (Hardhat project; not a workspace member):
- `reference/contracts/contracts/GaslessPaymentForwarder.sol` — the forwarder;
  nonces, `authorizedRelayers`, `executePayment`. Adapted from the doc. M9-R8.
- `reference/contracts/contracts/MockUSDT0.sol` — demo ERC-20 with EIP-3009
  `transferWithAuthorization`. Adapted from the doc. M9-R7/R8.
- `reference/contracts/contracts/X402Facilitator.sol` — verifies/settles EIP-3009
  authorizations; supported-token config. Adapted from the doc. M9-R6/R8.
- `reference/contracts/scripts/deploy-gasless.ts`,
  `reference/contracts/scripts/deploy-x402.ts` — deploy + record addresses. M9-R8.
- `reference/contracts/hardhat.config.ts`, `package.json`, `README.md`.

Services (workspace members; import `@flare-kit/core`):
- `services/relayer/src/index.ts` (+ split modules < 300 lines) — the fee-free
  gasless relayer. M9-R5.
- `services/x402-server/src/index.ts` (+ split modules) — the single-endpoint
  x402 fixture. M9-R6/R7.
- `services/*/package.json`, `README.md`; `pnpm-workspace.yaml` gains `services/*`.

`@flare-kit/contracts`:
- `packages/contracts/src/gasless.ts` — forwarder registry, `gaslessVerified`. M9-R1.
- `packages/contracts/src/gasless-abis.ts` — forwarder + EIP-712 fragments. M9-R1.
- `packages/contracts/src/x402.ts` — MockUSDT0 + facilitator registry,
  `x402Verified`, `demoToken: true`. M9-R1/R7.
- `packages/contracts/src/x402-abis.ts` — facilitator + EIP-3009 fragments. M9-R1.
- `packages/contracts/src/index.ts` — export the above.

`@flare-kit/core`:
- `packages/core/src/gasless-eip712.ts` — canonical `PaymentRequest`. M9-R2.
- `packages/core/src/gasless-adapter.ts` — nonce/balance/allowance/approval,
  sign, relay POST, on-chain reconcile read. M9-R2.
- `packages/core/src/gasless-states.ts` — the durable lifecycle. M9-R3.
- `packages/core/src/gasless.ts` — intents → verified-gated plan → lifecycle. M9-R2.
- `packages/core/src/mock-gasless.ts` — copies observed, refuses unobserved. M9-R9.
- `packages/core/src/x402-eip3009.ts` — canonical authorization. M9-R6.
- `packages/core/src/x402-client.ts` — 402 → sign → X-Payment → track. M9-R6.
- `packages/core/src/x402-states.ts` — settlement/delivery split lifecycle. M9-R6.
- `packages/core/src/mock-x402.ts` — copies observed, refuses unobserved. M9-R9.
- `packages/core/src/index.ts` — export the above.

`@flare-kit/react`:
- `packages/react/src/use-gasless.ts` — relayer + on-chain poll. M9-R14.
- `packages/react/src/use-x402.ts` — settlement + resource poll. M9-R14.
- `packages/react/src/index.ts` — export the above.

`@flare-kit/react-ui`:
- `packages/react-ui/src/GaslessCard.tsx` — GAS-01/02/03. M9-R10.
- `packages/react-ui/src/X402Card.tsx` — PAY-01/02. M9-R11.
- `packages/react-ui/src/payments.css` — new `fk-gasless` / `fk-x402` classes. M9-R13.
- `packages/react-ui/gallery/m9-gasless-sections.tsx`,
  `packages/react-ui/gallery/m9-x402-sections.tsx` — drive every state. M9-AC6.
- `packages/react-ui/src/index.ts` — export the above.

## Acceptance criteria

- **M9-AC1 — gasless FXRP payment, live on Coston2.** A wallet holding real FXRP
  completes the one-time `approve()` (payer pays gas — recorded), then, from a
  **drained ~0 C2FLR** state, signs a `PaymentRequest` that the relayer submits;
  the FXRP transfer confirms on-chain and the **payer pays 0 gas for the
  payment.** Both transactions are recorded (approval: payer-gassed; payment:
  payer 0-gas, relayer-gassed) — the "gasless payments after a one-time setup"
  claim, evidenced both ways.

- **M9-AC2 — the gasless lifecycle traverses honestly.** The operation actually
  walks `relay_accepted → submitted → succeeded`, with `succeeded` entered only
  from the on-chain transfer read. A `submitted` operation whose transfer has not
  confirmed renders in-flight, **never `succeeded`**; the relayer's HTTP 200
  alone never advances it to succeeded.

- **M9-AC3 — x402 loop, live on Coston2.** A client hits the fixture endpoint,
  receives `402`, signs the EIP-3009 authorization, re-sends with `X-Payment`,
  the facilitator **settles in a real transaction**, and the resource is
  delivered. Settlement (tx hash + payment ID) and resource delivery (200 +
  body) are recorded as **two independent observed facts**; the asset is
  MockUSDT0, labelled a demo token in every rendering.

- **M9-AC4 — gasless ≠ free, rendered.** The one-time approval shows as a
  distinct gas-costing setup step; the relayer-covers-gas fact shows; no fee line
  is rendered where none is charged; the x402 payer-signs-free / server-pays-gas
  split shows.

- **M9-AC5 — declared gaps, not fakes.** USD₮0-gasless renders
  unavailable-on-testnet with the EIP-3009 reason; real-FXRP-x402 renders
  impossible-until-3009. Neither emits a plan. Both `*Verified` flags are `false`
  until their live read and gate their surfaces accordingly.

- **M9-AC6 — surfaces, browser-verified, both themes.** GaslessCard and X402Card
  are driven in a real browser through every required state via the gallery, in
  light and dark; exact values render in the mono face with asset + full
  precision; the a11y audit reports zero new `fk-gasless`/`fk-x402` issues.
  Screens recorded.

- **M9-AC7 — gate green; mock honest; reviewed.** `pnpm build && pnpm typecheck
  && pnpm lint && pnpm test` exits 0. `mock-gasless`/`mock-x402` reproduce the
  live runs and refuse the unobserved; no live path constructs a mock. Review-gate
  subagents (correctness, honest-rendering/silent-failure, simplification) run
  over the M9 diff and every critical/important finding is fixed and tested.

## Verification

Real-first, on Coston2 (114), reusing the M8 signer
`0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9`:

1. Deploy `GaslessPaymentForwarder`, `MockUSDT0`, `X402Facilitator` to Coston2;
   configure the facilitator's supported token and the forwarder's authorized
   relayer; record all addresses into `gasless.ts` / `x402.ts`.
2. Run `services/relayer` and `services/x402-server` (keys from env; never
   logged or emitted).
3. **Gasless FXRP (M9-AC1/AC2):** approve from a minimally-gassed FXRP wallet
   (record the payer-gassed approval tx); send the wallet's remaining C2FLR to
   ~0; sign and relay a payment; confirm the FXRP transfer on-chain and the
   payer's 0-gas payment. Capture the lifecycle traversal.
4. **x402 (M9-AC3):** run the client against the fixture; capture the `402`, the
   EIP-3009 authorization, the facilitator settlement tx + payment ID, and the
   `200` resource delivery as separate facts.
5. Flip `gaslessVerified` / `x402Verified` to `true` only after their confirmed
   reads. Derive `mock-gasless` / `mock-x402` from the observed runs.
6. Record evidence: `.thoughts/verification/2026-08-12-m9-gasless.md`,
   `.thoughts/verification/2026-08-12-m9-x402.md`, probe JSON, and both-theme
   screens under `.thoughts/verification/m9-screens/`. Record date, network,
   addresses, tx hashes and explorer links (CLAUDE.md evidence rule).
7. Full gate green; review-gate subagents; simplifier pass.

Note: this checkout is **not a git repository** — file mtimes are the only
chronology (as recorded across prior milestones). No git commit step applies.

## Sources

- `developer-hub/docs/fxrp/token-interactions/04-gasless-fxrp-payments.mdx` —
  forwarder + relayer + EIP-712 payment (Feature 1).
- `developer-hub/docs/fxrp/token-interactions/03-x402-payments.mdx` — x402 +
  EIP-3009 + MockUSDT0 + facilitator + server + agent (Feature 2); the MockUSDT0
  warning and the placeholder-only (self-deploy) deployment.
- `.thoughts/wiki/capability-inventory.md` — the gasless USD₮0 / gasless FXRP /
  x402 rows and their boundaries.
- `.thoughts/design/2026-08-03-product-surface-map.md` — GAS-01/02/03, PAY-01/02.
- `.thoughts/decisions/2026-08-04-build-everything-real-first.md` — the family
  ordering and the real-first rule.
- `.thoughts/decisions/2026-08-03-agent-facing-surfaces.md` — read/plan keyless,
  agents sign with their own key.
- USD₮0 EIP-3009 probe, this session (2026-08-12): `0xC1A5…E71F` has no EIP-3009
  or EIP-2612 selectors on Coston2.
- `sources/flare-foundation/fce-direct-sign` — the TEE/FCC signing reference for
  the later policy-signer milestone (out of scope here).

### Reference material to adapt (verified present, 2026-08-12)

The `reference/contracts/` and `services/*` code is adapted from these local
files — not written from scratch:
- `developer-hub/examples/developer-hub-solidity/GaslessPaymentForwarder.sol`
  → `reference/contracts/contracts/GaslessPaymentForwarder.sol`.
- `sources/flare-foundation/flare-hardhat-starter/contracts/x402/MockUSDT0.sol`
  and `.../X402Facilitator.sol`
  → `reference/contracts/contracts/{MockUSDT0,X402Facilitator}.sol`.
- `developer-hub/examples/developer-hub-javascript/fxrp-gasless/{payment,relayer,deploy}.ts`
  → `services/relayer` + the `gasless-eip712.ts` type it imports from core.
- `developer-hub/examples/developer-hub-javascript/{x402Server,x402Deploy,x402Agent}.ts`
  → `services/x402-server` + the `x402-eip3009.ts` type it imports from core.
  (`x402Agent.ts` is a reference for the M10 agent tool, not built in M9.)
