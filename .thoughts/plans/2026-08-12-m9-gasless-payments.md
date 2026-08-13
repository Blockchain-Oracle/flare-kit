# M9 Gasless, Relayers, Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline)
> — this milestone is driven **real-first against live Coston2**: the implementer
> must **deploy** the forwarder/MockUSDT0/facilitator and **run** the relayer +
> x402 server to write correct code and fixtures. Steps use checkbox (`- [ ]`)
> syntax. Plan location follows the project convention (`.thoughts/plans/`),
> overriding the skill default. This repo is **not** a git repo in this session —
> treat "Checkpoint" steps as markers; skip the `git` call if it errors.

**Goal:** Ship two real payment rails as installable kit surfaces — (1) **gasless
FXRP**: a person or agent sends real FXRP with no gas for the payment, via a
custom forwarder + one-time approval + a fee-free operated relayer; and (2)
**x402 / HTTP-402**: the `402 → sign → settle → resource` loop, live on Coston2,
on a **labelled MockUSDT0 demo token** (real settlement, demo asset) — with the
one path that has no substrate, gasless USD₮0, declared unavailable-on-testnet.

**Architecture:** Mirror the M5–M8 stack. New repo topology: a `reference/contracts/`
Hardhat project (adapted from the documented examples) deploys the three contracts
to Coston2; a new `services/*` workspace category holds `services/relayer` and
`services/x402-server`, both **importing `@flare-kit/core`** so their EIP-712 /
EIP-3009 crypto never drifts from the client. `@flare-kit/contracts` gains
`gasless.ts` + `x402.ts` registries (`bridge.ts` mould: real addresses,
`gaslessVerified`/`x402Verified` flags, `demoToken:true`). `@flare-kit/core` gains
`gasless-eip712.ts`/`gasless-adapter.ts`/`gasless.ts`/`gasless-states.ts`/`mock-gasless.ts`
and `x402-eip3009.ts`/`x402-client.ts`/`x402-states.ts`/`mock-x402.ts`, reusing the
canonical `states.ts` lifecycle and the `reconcileTo`/`pathTo` walker. `@flare-kit/react`
adds `use-gasless`/`use-x402`; `@flare-kit/react-ui` adds `GaslessCard`/`X402Card`,
reusing `SwapLeg`, the `OperationTimeline` spine and the M7-homed card chrome. The
real path is deployed and exercised before either mock is written.

**Tech Stack:** TypeScript, viem (peer), React, vitest, Turborepo/pnpm, Express
(services), Hardhat (`reference/contracts`). EIP-712 meta-transactions (custom
forwarder) and EIP-3009 `transferWithAuthorization` (x402 facilitator).

## Global Constraints

- Production source files **< 300 lines**; split before writing (CLAUDE.md).
- **Never fake protocol reality**: a relayer's HTTP-200 is `awaiting_external`,
  **never** `succeeded`; `succeeded` is entered **only** from reading the on-chain
  FXRP transfer (gasless) / the facilitator settlement + resource (x402). An unknown
  outcome is never `failed`; unknown → `—`, never `0`. **Gasless ≠ free**: the
  one-time approval is a gas-costing step, shown; the relayer bears gas, shown; no
  fee line where none is charged. **Settlement ≠ resource**: x402 keeps the two
  independently visible. The **demo-token label** (`demoToken:true`, registry data)
  rides every x402 surface; MockUSDT0 is never rendered as USD₮0 or FXRP. Mock mode
  is explicit/labelled, never a failure fallback.
- **Reuse, do not re-code**: reuse `SwapLeg`, `OperationTimeline`, the M7-homed
  `card-chrome.ts`, `Panel`/`Button`/`AssetLogo`/`EvidenceChip`/`DetailRow`/`Note`/
  `SourceChip`, and the `reconcileTo`/`pathTo`/`waitSince`/`advance` reconciler
  helpers. Never build a card/badge/pill inline; never re-declare the EIP-712 types
  in a service — import them from core.
- **Network is configuration**: forwarder, MockUSDT0, facilitator addresses, the
  relayer base URL and the x402 endpoint come from `@flare-kit/contracts`; nothing
  hardcoded elsewhere. Testnet first, mainnet-capable.
- **Public values are constants, not env vars**: RPC URLs, chain id, contract
  addresses are exported constants. The **only** secrets are the relayer/operator
  signing key and the payer key — never logged, never in `--json`/evidence/receipts.
- **Exact values render in the mono face** with tabular numerals, full precision,
  carrying asset symbol (FXRP; MockUSDT0 with its demo mark).
- **Operations self-reconcile** on open (gasless: the on-chain transfer; x402:
  settlement + resource); no Resume button.
- **Real integration first**; `mock-gasless.ts`/`mock-x402.ts` are written afterwards
  and copy observed behaviour, refusing anything they never observed.
- Gate: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`, shown with output.

### Harness mechanics (read before Task 0)

- **Never `cd` into a package/`services/`/`reference/`** — the stage guard resolves
  the project root from the shell cwd and will block source writes. Use
  `pnpm --filter` from the repo root.
- **SPEC.md `## Files` manifest** (Task 0): every source file (packages **and** the
  new `services/*` and `reference/contracts/*` files) must be listed there before it
  is written. The section ends at the next `##`/`###` of any depth — insert only flat
  bullets, never a subheading.
- **Test lock**: each test file's mtime is compared to SPEC.md's; one SPEC.md write
  unlocks every test file once. Batch test-file creation behind the one Task-0 SPEC
  write; never touch SPEC.md just to unlock.
- **react-ui imports `@flare-kit/react` from dist**, and the services import
  `@flare-kit/core` from dist — a core/hook change needs `pnpm build` before react-ui
  (and the services) see it.
- **`applyTransition` silently drops its patch** on an illegal hop — every reconciler
  must **walk the `states.ts` table** via `pathTo` (BFS), never jump states. Reuse
  the `reconcileTo` helper shape from `bridge-states.ts`.
- **Signing keys**: `.secrets/live-run.json` holds the dev EVM key; live scripts and
  the services sign with `privateKeyToAccount(secrets.evm.privateKey)`. Browser
  surfaces sign only via `onSubmit` and never hold a key. Keys never logged, never in
  `--json`/evidence.
- **The payer must be a distinct account** for AC1: the operator/deployer key runs
  the relayer (pays gas); the **payer** is a separate account funded with FXRP + a
  little C2FLR for the one approval, then drained to ~0 to prove the payment is
  gasless. Task 1 records/creates it.
- **state.json bump** at close (Task 17) via a JSON load/mutate/dump script — never
  hand-edit.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `reference/contracts/**` | Hardhat project: forwarder + MockUSDT0 + facilitator + deploy scripts | 2 |
| `packages/contracts/src/gasless.ts` | forwarder registry, `gaslessVerified` | 3 |
| `packages/contracts/src/gasless-abis.ts` | forwarder + FXRP fragments (split from abis.ts) | 3 |
| `packages/contracts/src/x402.ts` | MockUSDT0 + facilitator registry, `x402Verified`, `demoToken` | 3 |
| `packages/contracts/src/x402-abis.ts` | facilitator + EIP-3009 fragments | 3 |
| `packages/core/src/gasless-eip712.ts` | canonical `PaymentRequest` type + sign/recover (viem) | 4 |
| `packages/core/src/gasless-adapter.ts` | forwarder/FXRP reads, unsigned approve, relay POST, transfer read | 4 |
| `packages/core/src/gasless.ts` | intents → verified-gated plan → lifecycle | 5 |
| `packages/core/src/gasless-states.ts` | `reconcileGaslessPayment` (relay→transfer read) | 5 |
| `services/relayer/**` | fee-free relayer (`/nonce`, `/execute`), imports core | 6 |
| `packages/core/scripts/live-gasless.mjs` | live approve→drain→pay evidence run | 7 |
| `packages/core/src/mock-gasless.ts` | the gasless mock, after the real path | 8 |
| `packages/core/src/x402-eip3009.ts` | canonical EIP-3009 authorization + sign (viem) | 9 |
| `packages/core/src/x402-client.ts` | 402 parse → sign → X-Payment → settlement/resource split | 9 |
| `packages/core/src/x402-states.ts` | `reconcileX402` (settlement≠resource) | 9 |
| `services/x402-server/**` | single-endpoint fixture (402 → verify → settle), imports core | 10 |
| `packages/core/scripts/live-x402.mjs` | live 402→settle→resource evidence run | 11 |
| `packages/core/src/mock-x402.ts` | the x402 mock, after the real path | 12 |
| `packages/react/src/use-gasless.ts`, `use-x402.ts` | hooks over the two operations | 13 |
| `packages/react-ui/src/GaslessCard.tsx` (+ `gasless-card-state.ts`) | GAS-01/02/03 surface | 14 |
| `packages/react-ui/src/X402Card.tsx` (+ `x402-card-state.ts`) | PAY-01/02 surface | 15 |
| `packages/react-ui/src/payments.css` | `fk-gasless` / `fk-x402` CSS, values from tokens | 14–15 |
| `packages/react-ui/gallery/m9-gasless-sections.tsx`, `m9-x402-sections.tsx` | AC6 state matrix, both themes | 16 |

---

## Task 0: Declare M9 files in SPEC.md manifest + add `services/*` workspace

**Files:** Modify `SPEC.md` (`## Files` section only), `pnpm-workspace.yaml`.

- [ ] **Step 1** Append every M9 source file (the packages files above **and** the
  `services/relayer/**`, `services/x402-server/**`, `reference/contracts/**` source
  paths) to SPEC.md's `## Files` as flat bullets — no subheading (a `###` hides
  everything below it from the scope guard) — each with a one-line responsibility and
  its `M9-R#`.
- [ ] **Step 2** Add `services/*` to `pnpm-workspace.yaml`'s `packages:` list
  (alongside `packages/*` and `apps/*`). `reference/contracts` is **not** a workspace
  member (it is a Hardhat project); leave it out of the glob.
- [ ] **Step 3** Verify the `## Files` section still ends at the next `##`. This single
  write unlocks every M9 test file once — batch all test-file creation behind it.
- [ ] **Step 4** Checkpoint `chore: declare M9 gasless/x402 files in SPEC.md manifest + services/* workspace`.

**Acceptance:** every file a later task creates is listed; `services/*` is a workspace
glob; no `###` inserted inside `## Files`.

---

## Task 1: Read-only **probe** — substrate + funding (no product code)

**Files:** Create `packages/core/scripts/probe-gasless.mjs` (dev script, not shipped);
produce `.thoughts/verification/2026-08-12-m9-probe.json`. **No product code.**

The M7/M8-probe precedent: assume nothing until read. If a balance is short, **STOP and
surface it to Abu** (a faucet trip is his `! ...` call) rather than building on a path
that cannot run.

- [ ] **Step 1** Against Coston2 (`https://coston2-api.flare.network/ext/C/rpc`), read
  the FXRP token `0x0b6A3645c240605887a5532109323A3E12273dc7`: `decimals()` (assert 6),
  `symbol()`, and the operator's `balanceOf(0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9)`.
- [ ] **Step 2** Re-confirm the declared-gap facts (record as JSON, they justify the
  forwarder + demo token): FXRP has **no** EIP-3009 (`getCode` has none of `0xe3ee160e`
  `0xef55bec6` `0xe94a0102` `0x5a049a70`); the real USD₮0 `0xC1A5B41512496B80903D1f32d6dEa3a73212E71F`
  likewise has none (this session's probe — re-read, do not assume).
- [ ] **Step 3** Funding: the operator's native **C2FLR** (needs enough for 3 contract
  deploys + relayer gas + facilitator settle gas); and establish the **payer account**
  for AC1 — either an existing second key in `.secrets` or a freshly generated one to be
  funded in Task 7. Record the payer address (no private key in the JSON).
- [ ] **Step 4** Write the probe JSON: block number, every value above, and a `blockers`
  array (empty if green). No key material.
- [ ] **Step 5** Checkpoint. If `blockers` is non-empty, **pause** and report the exact
  faucet/action to Abu.

**Acceptance:** FXRP decimals/symbol confirmed; the two no-EIP-3009 facts re-recorded;
operator C2FLR sufficient for deploys+gas (or a blocker raised); a payer address chosen.

---

## Task 2: `reference/contracts` — Hardhat project, adapt + **deploy** to Coston2

**Files:** Create `reference/contracts/contracts/GaslessPaymentForwarder.sol`,
`.../MockUSDT0.sol`, `.../X402Facilitator.sol`, `reference/contracts/scripts/deploy-gasless.ts`,
`.../deploy-x402.ts`, `reference/contracts/hardhat.config.ts`, `.../package.json`, `.../README.md`.
Produce `reference/contracts/deployments/coston2.json` (recorded addresses).

**Adapt (do not author from scratch) — verified present (spec "Reference material"):**
- Forwarder ← `developer-hub/examples/developer-hub-solidity/GaslessPaymentForwarder.sol`
  (149 lines): `executePayment(from,to,amount,deadline,signature)`, `getNonce(addr)`,
  `fxrp()` (from the Flare Contract Registry), `authorizedRelayers`, EIP-712 domain
  `("GaslessPaymentForwarder","1")`.
- MockUSDT0 ← `sources/flare-foundation/flare-hardhat-starter/contracts/x402/MockUSDT0.sol`
  (278 lines): ERC-20 + EIP-3009 `transferWithAuthorization`; a public `mint` for the
  demo; 6 decimals; name/version for the EIP-712 domain.
- Facilitator ← `sources/flare-foundation/flare-hardhat-starter/contracts/x402/X402Facilitator.sol`
  (296 lines): `verifyPayment(auth) view returns (bytes32,bool)`, `settlePayment(auth) returns (bytes32)`,
  supported-token config.

- [ ] **Step 1** Scaffold the Hardhat project (`hardhat.config.ts` with the Coston2
  network from the constant RPC + `secrets.evm.privateKey`; `@openzeppelin/contracts`
  + `@flarenetwork/flare-periphery-contracts` deps). Copy the three `.sol` files in,
  adjusting imports/pragma only.
- [ ] **Step 2** `deploy-gasless.ts`: deploy the forwarder; call
  `setRelayerAuthorization(operatorAddress, true)` so the relayer may call
  `executePayment`; log + record the forwarder + resolved FXRP address.
- [ ] **Step 3** `deploy-x402.ts`: deploy MockUSDT0 + X402Facilitator; add MockUSDT0 as
  the facilitator's supported token; `mint` a demo balance to the payer; record MockUSDT0
  + facilitator + payee addresses.
- [ ] **Step 4** Run both deploys against Coston2 (`pnpm --filter` won't apply — run the
  Hardhat scripts from repo root, e.g. `npx hardhat run reference/contracts/scripts/deploy-gasless.ts`).
  Write every address into `reference/contracts/deployments/coston2.json`.
- [ ] **Step 5** Read each deployed contract back (forwarder `fxrp()`; MockUSDT0
  `authorizationState`/`DOMAIN_SEPARATOR`; facilitator supported-token) to confirm it
  responds. Checkpoint `feat(reference): deploy forwarder + MockUSDT0 + facilitator on Coston2`.

**Acceptance:** three contracts deployed on Coston2, addresses recorded, the forwarder
authorizes the operator relayer, the facilitator supports MockUSDT0, and each reads back.
Nothing downstream hardcodes an address this task did not record.

---

## Task 3: `@flare-kit/contracts` — gasless + x402 registries + ABIs

**Files:** Create `packages/contracts/src/gasless.ts`, `gasless-abis.ts`, `x402.ts`,
`x402-abis.ts`; Modify `packages/contracts/src/index.ts`; Test
`packages/contracts/test/gasless.test.ts`, `packages/contracts/test/x402.test.ts`.

**Interfaces — Produces:**
```ts
export interface GaslessDeployment {
  readonly network: FlareNetworkKey        // 'coston2'
  readonly forwarder: `0x${string}`
  readonly fxrp: { symbol: 'FXRP'; address: `0x${string}`; decimals: 6 }
  readonly relayerUrl: string              // reference relayer base URL (constant)
  readonly gaslessVerified: boolean        // false until Task 7's live payment
}
export const GASLESS: Readonly<Record<FlareNetworkKey, GaslessDeployment | undefined>>
export function gaslessFor(n: FlareNetworkKey): GaslessDeployment | undefined

export interface X402Deployment {
  readonly network: FlareNetworkKey
  readonly token: { symbol: 'MockUSDT0'; address: `0x${string}`; decimals: 6; demoToken: true }
  readonly facilitator: `0x${string}`
  readonly payee: `0x${string}`
  readonly serverUrl: string               // reference x402 server base URL (constant)
  readonly resourcePath: string            // '/api/demo' (the single fixture endpoint)
  readonly x402Verified: boolean           // false until Task 11's live settle
}
export const X402: Readonly<Record<FlareNetworkKey, X402Deployment | undefined>>
export function x402For(n: FlareNetworkKey): X402Deployment | undefined
```
`gasless-abis.ts` produces `FORWARDER_ABI` (`fxrp`, `getNonce`, `executePayment`, event
`PaymentExecuted(address from,address to,uint256 amount,uint256 nonce)`) and reuses the
existing ERC-20 fragments for FXRP. `x402-abis.ts` produces `FACILITATOR_ABI`
(`verifyPayment`, `settlePayment` — the tuple shapes from `x402Server.ts`) and
`EIP3009_ABI` (`authorizationState`, `DOMAIN_SEPARATOR`, `transferWithAuthorization`) —
fragments only, each verified against the Task-2 contracts, split to stay < 300 lines.

- [ ] **Step 1** Write `gasless.test.ts` + `x402.test.ts`: `gaslessFor('coston2')` /
  `x402For('coston2')` return the Task-2 addresses; **both verified flags `false` for now**
  (Task 7/11 flip them); `demoToken === true` on the x402 token; no address literal appears
  outside these two files.
- [ ] **Step 2** Run `pnpm --filter @flare-kit/contracts test` — expect FAIL (missing modules).
- [ ] **Step 3** Write the four files from `reference/contracts/deployments/coston2.json`;
  export from `index.ts`. RPC/URLs are constants here. Keep each < 300 lines.
- [ ] **Step 4** Run the test — expect PASS. Then `pnpm --filter @flare-kit/contracts build`.
- [ ] **Step 5** Checkpoint `feat(contracts): M9 gasless + x402 registries + ABIs`.

**Acceptance:** addresses match Task 2; no literal outside the registries; `demoToken:true`
present; both verified flags false until their live run; files < 300 lines.

---

## Task 4: `@flare-kit/core` — `gasless-eip712.ts` + `gasless-adapter.ts`

**Files:** Create `packages/core/src/gasless-eip712.ts`, `packages/core/src/gasless-adapter.ts`;
Test `packages/core/test/gasless-eip712.test.ts`, `packages/core/test/gasless-adapter.test.ts`.

**Interfaces — Produces** (viem; `Address`/`Hex` are viem's, `UnsignedCall` the existing
core `{ to, data, value? }`):
```ts
// gasless-eip712.ts — THE single source of truth the relayer imports (M9-R2)
export const GASLESS_DOMAIN_NAME = 'GaslessPaymentForwarder'
export const GASLESS_DOMAIN_VERSION = '1'
export const PAYMENT_REQUEST_TYPES: {
  PaymentRequest: [
    { name: 'from'; type: 'address' }, { name: 'to'; type: 'address' },
    { name: 'amount'; type: 'uint256' }, { name: 'nonce'; type: 'uint256' },
    { name: 'deadline'; type: 'uint256' },
  ]
}
export interface PaymentRequestMessage {
  from: Address; to: Address; amount: bigint; nonce: bigint; deadline: bigint
}
export function gaslessDomain(chainId: number, forwarder: Address): TypedDataDomain
// sign via a viem WalletClient (browser passes onSubmit; scripts pass an account client)
export function signPaymentRequest(w: WalletClient, chainId: number, forwarder: Address, m: PaymentRequestMessage): Promise<Hex>
export function recoverPaymentSigner(chainId: number, forwarder: Address, m: PaymentRequestMessage, sig: Hex): Promise<Address>

// gasless-adapter.ts
export type GaslessTransferState =
  | { kind: 'in-flight' }
  | { kind: 'confirmed'; txHash: Hex; amount: bigint }   // PaymentExecuted read
export interface GaslessReads {
  fxrpToken(): Promise<Address>                          // forwarder.fxrp()
  decimals(): Promise<number>
  nonce(owner: Address): Promise<bigint>                 // forwarder.getNonce
  balance(owner: Address): Promise<bigint>
  allowance(owner: Address): Promise<bigint>             // FXRP.allowance(owner, forwarder)
  paymentSince(from: Address, nonce: bigint, sinceBlock: bigint): Promise<GaslessTransferState>
}
export interface GaslessWrites { approveForwarder(amount: bigint): UnsignedCall }  // FXRP.approve(forwarder,·)
export interface RelayerEndpoint { baseUrl: string }
export interface RelayReceipt { accepted: boolean; jobId?: string; txHash?: Hex; error?: string }
export interface GaslessAdapter {
  reads: GaslessReads; writes: GaslessWrites; forwarder: Address; relayer: RelayerEndpoint
  relay(req: { from: Address; to: Address; amount: bigint; deadline: bigint; signature: Hex }): Promise<RelayReceipt>
}
export function makeGaslessAdapter(client: PublicClient, d: GaslessDeployment): GaslessAdapter
```

**Behaviour to encode:**
- The domain uses `chainId` + `verifyingContract: forwarder`; the types are byte-identical
  to the reference `payment.ts` so a signature this signs, the forwarder verifies. Assert
  `recoverPaymentSigner(sign(...)) === signer` round-trips (a unit test, no chain).
- `paymentSince` reads the forwarder's `PaymentExecuted(from,·,·,nonce)` (or the FXRP
  `Transfer`) at/after `sinceBlock`; found → `confirmed` with the tx hash + amount; absent
  → `in-flight`. **Never** concludes failure from absence. Chunk `getLogs` to ≤25-block
  ranges (the M8 Coston2 cap rule).
- `relay` POSTs the signed request to `${relayer.baseUrl}/execute`; a non-200 → `{accepted:false,error}`;
  it never throws into the caller (the hook renders `relayer-unreachable`).
- `approveForwarder` builds unsigned calldata only; deadline is derived from the chain
  block timestamp by the caller (Task 5), not wall clock.

- [ ] **Step 1** Write `gasless-eip712.test.ts`: sign→recover round-trips for a fixed
  message; the domain/types match the reference constants. Write `gasless-adapter.test.ts`
  against a mocked client: `paymentSince` returns `in-flight` with no log, `confirmed` with
  the fixture; `relay` maps a 500 to `{accepted:false}`; `approveForwarder` targets FXRP.
- [ ] **Step 2** Run `pnpm --filter @flare-kit/core test gasless-eip712 gasless-adapter` — expect FAIL.
- [ ] **Step 3** Implement both files (< 300 lines each).
- [ ] **Step 4** Run — expect PASS.
- [ ] **Step 5** Checkpoint `feat(core): gasless EIP-712 types + forwarder adapter`.

**Acceptance:** sign/recover round-trips and matches the reference domain; `paymentSince`
never reports failure from absence and chunks reads; `relay` never throws; the EIP-712
types live in ONE place the service will import.

---

## Task 5: `@flare-kit/core` — `gasless.ts` (intents → plan → lifecycle) + `gasless-states.ts`

**Files:** Create `packages/core/src/gasless.ts`, `packages/core/src/gasless-states.ts`;
Modify `packages/core/src/index.ts`; Test `packages/core/test/gasless.test.ts`,
`packages/core/test/gasless-states.test.ts`.

**Interfaces — Consumes** the adapter + the M1 engine (`operation.ts`, `states.ts`,
`reconcileTo`/`pathTo`). **Produces:**
```ts
export interface GaslessIntent {
  readonly network: FlareNetworkKey; readonly to: Address
  readonly amount: bigint; readonly deadlineSeconds: number
}
export type GaslessError =
  | { kind: 'not-verified' } | { kind: 'insufficient-balance' }
  | { kind: 'expired-deadline' } | { kind: 'relayer-unreachable' }
export type GaslessPlan = { steps: PlanStep[] }          // reuse the M5–M8 PlanStep union
export function buildGaslessPlan(a: GaslessAdapter, i: GaslessIntent, owner: Address, chainTime: number): Promise<Result<GaslessPlan, GaslessError>>
export function reconcileGaslessPayment<I, Q, P>(record: OperationRecord<I, Q, P>, transfer: GaslessTransferState, now: number): OperationRecord<I, Q, P>
```

**Lifecycle rules (the load-bearing part) — reuse the canonical states, add NO identifier:**
- The gasless op maps onto the existing states: the one-time approval →
  **`awaiting_approval`** (a distinct, labelled step); signing → **`executing`**; the
  relayer submitting → **`awaiting_external`** with `awaiting.actor: 'relayer'`; the
  confirmed on-chain transfer → **`succeeded`**. `submitted` (relay accepted, tx in
  mempool) is distinct from `succeeded`.
- `buildGaslessPlan` **refuses** `{kind:'not-verified'}` when `GASLESS[network].gaslessVerified === false`
  — never a plan that signs an approval on an unverified forwarder (the M6/M7/M8 gate).
  Emits the approval step only when `allowance === 0n` (0/1 approvals). `insufficient-balance`
  when FXRP `< amount`; `expired-deadline` when `chainTime >= deadline`.
- `reconcileGaslessPayment` mirrors `reconcileDelivery` (bridge): `confirmed` →
  `reconcileTo(record,'succeeded',{steps done, awaiting:undefined})`; `in-flight` →
  `reconcileTo(record,'awaiting_external',{actor:'relayer', reason:'Relayer submitting your payment on-chain.', since})`.
  **`succeeded` is reached ONLY from `transfer.kind === 'confirmed'`** — the relayer's HTTP
  response never advances it. Walk the table (`pathTo`), never jump.

- [ ] **Step 1** Write `gasless-states.test.ts` (reuse the M8 table-walk shape): a reconcile
  with `in-flight` stays `awaiting_external` (actor relayer), never `succeeded`; `confirmed`
  reaches `succeeded` and finalizes the spine steps + clears `awaiting`. Write `gasless.test.ts`:
  `buildGaslessPlan` on `gaslessVerified:false` → `not-verified`, **no** approval step;
  approve-when-`allowance===0`; `insufficient-balance`; `expired-deadline`.
- [ ] **Step 2** Run — expect FAIL. **Step 3** Implement (< 300 lines each; reuse `reconcileTo`).
- [ ] **Step 4** Run — expect PASS. Export from `index.ts`.
- [ ] **Step 5** Checkpoint `feat(core): gasless operation — verified-gated plan + relay→transfer lifecycle`.

**Acceptance:** no new state identifier; `succeeded` only from the on-chain transfer read;
`not-verified` emits no approval; the approval is its own `awaiting_approval` step.

---

## Task 6: `services/relayer` — the fee-free relayer (imports core)

**Files:** Create `services/relayer/src/index.ts` (+ `relayer-execute.ts` if > 300 lines),
`services/relayer/package.json`, `services/relayer/README.md`, `services/relayer/tsconfig.json`;
Test `services/relayer/test/execute.test.ts`.

**Adapt** `developer-hub/examples/developer-hub-javascript/fxrp-gasless/relayer.ts` (384
lines) to viem + `@flare-kit/core`. It **imports `recoverPaymentSigner`, `PAYMENT_REQUEST_TYPES`,
`gaslessDomain` from `@flare-kit/core`** and `FORWARDER_ABI` from `@flare-kit/contracts` —
it re-declares no crypto (M9-R5/R8).

**Endpoints:** `GET /nonce/:addr` → `forwarder.getNonce(addr)`; `POST /execute` → validate
+ submit. **Behaviour:**
- Recover the signer via core's `recoverPaymentSigner`; assert it equals `req.from` (reject
  otherwise). Read balance/allowance/`getNonce`/chain-time; reject on short balance,
  short allowance, used nonce, or past deadline (mirror the reference `validateRequest`).
- `staticCall` (simulate) `executePayment` before sending; then submit with the operator
  key (`secrets.evm.privateKey`), wait for the receipt, return `{ txHash, blockNumber }`.
- **Fee-free**: it absorbs its own gas, charges nothing, adds no quota. The key is read
  from env, **never logged**, never in a response body.

- [ ] **Step 1** `services/relayer/package.json` depends on `@flare-kit/core`,
  `@flare-kit/contracts`, `viem`, `express`. Write `execute.test.ts`: a request whose
  recovered signer ≠ `from` is rejected; a short-allowance request is rejected; a valid
  request calls `executePayment` (mock the client) and returns a tx hash. No key in any
  response.
- [ ] **Step 2** Run `pnpm --filter @flare-kit/relayer test` — expect FAIL.
- [ ] **Step 3** Implement `index.ts` (+ split). `pnpm build` core first so the import
  resolves from dist.
- [ ] **Step 4** Run — expect PASS.
- [ ] **Step 5** Checkpoint `feat(services): fee-free gasless relayer over @flare-kit/core`.

**Acceptance:** imports the EIP-712 types from core (no re-declaration); rejects a mismatched
signer / short allowance / used nonce / expired deadline; simulates before sending; no key
in any log or response; adds no fee or quota.

---

## Task 7: **Live gasless verification** (AC1/AC2, gate for `gaslessVerified`)

**Files:** Create `packages/core/scripts/live-gasless.mjs`; produce
`.thoughts/verification/2026-08-12-m9-gasless.md` + `2026-08-12-coston2-live-gasless.json`.
Writes no product code except flipping `gaslessVerified:true` in `gasless.ts` after the
confirmed on-chain transfer.

**The run (the honest gasless proof):**
- [ ] **Phase A — setup:** fund the **payer** account with FXRP (transfer from the operator)
  and a small amount of C2FLR for exactly one approval; start `services/relayer` (operator
  key). Record both balances.
- [ ] **Phase B — one-time approval (payer pays gas):** the payer signs and sends
  `FXRP.approve(forwarder, MaxUint256)`; record the **approval tx hash** and that the
  payer's C2FLR dropped. This is the honest "setup costs gas, once."
- [ ] **Phase C — drain to ~0:** send the payer's remaining C2FLR back to the operator so
  the payer's native balance is ~0; record it. (If it cannot reach exactly 0 for dust/gas,
  record the residual — the claim is "no gas paid for the *payment*", proven in Phase D.)
- [ ] **Phase D — gasless payment (payer pays 0 gas):** build the request via
  `buildGaslessPlan` + `signPaymentRequest`; POST to the relayer; the relayer submits and
  pays gas. Poll `paymentSince(from, nonce, sinceBlock)` until `confirmed`; record the
  **payment tx hash**, the FXRP balance deltas (payer −amount, recipient +amount), and that
  the **payer's C2FLR is unchanged** across the payment. Assert the op traversed
  `awaiting_external(relayer) → succeeded`, `succeeded` only from the confirmed read.
- [ ] **Step: flip verification** — set `gaslessVerified:true` for Coston2 in `gasless.ts`;
  re-run Task 3's gasless test (now asserts true). Never flip before the confirmed transfer.
- [ ] **Evidence** — write the JSON/MD: date, network, addresses, the approval tx (payer-gassed)
  AND the payment tx (payer 0-gas, relayer-gassed), all balance deltas, the lifecycle traversal.
  No key material. Gate + checkpoint `chore(core): live M9 gasless payment on Coston2 (AC1/AC2)`.

**Acceptance (AC1/AC2):** a real FXRP payment lands with the payer paying **0 gas** for it
(both the payer-gassed approval and the payer-0-gas payment recorded); the op reached
`succeeded` only from the on-chain transfer read.

---

## Task 8: `mock-gasless.ts` — the mock, after the real path

**Files:** Create `packages/core/src/mock-gasless.ts`; Test `packages/core/test/mock-gasless.test.ts`.

- [ ] Reproduce the **observed** shapes from Task 7: the nonce/allowance/`needsApproval`
  progression, the relay-accept→confirmed transition, the confirmed transfer amount/tx shape,
  and the failure shapes — copied from the evidence, not invented. Mock mode explicit/labelled.
- [ ] **Refuses the unobserved**: a network/recipient/state the live run never produced throws
  a loud error, never a plausible zero; a `confirmed` transfer is never fabricated without an
  observed on-chain read (the M4/M6/M8 mock discipline).
- [ ] Test: mock parity with the recorded fixtures; an unobserved call throws. Gate + checkpoint
  `feat(core): mock-gasless, copies observed, refuses unobserved`.

---

## Task 9: `@flare-kit/core` — x402 client (`x402-eip3009.ts` + `x402-client.ts` + `x402-states.ts`)

**Files:** Create the three files; Modify `packages/core/src/index.ts`; Test
`packages/core/test/x402-eip3009.test.ts`, `x402-client.test.ts`, `x402-states.test.ts`.

**Interfaces — Produces:**
```ts
// x402-eip3009.ts — the single source of truth the x402 server imports (M9-R6)
export const EIP3009_TRANSFER_TYPES: {
  TransferWithAuthorization: [
    { name: 'from'; type: 'address' }, { name: 'to'; type: 'address' },
    { name: 'value'; type: 'uint256' }, { name: 'validAfter'; type: 'uint256' },
    { name: 'validBefore'; type: 'uint256' }, { name: 'nonce'; type: 'bytes32' },
  ]
}
export interface Authorization { from: Address; to: Address; value: bigint; validAfter: bigint; validBefore: bigint; nonce: Hex }
export function eip3009Domain(name: string, version: string, chainId: number, token: Address): TypedDataDomain
export function signAuthorization(w: WalletClient, d: TypedDataDomain, a: Authorization): Promise<{ v: number; r: Hex; s: Hex }>

// x402-client.ts
export interface X402Challenge {
  scheme: string; network: string; maxAmountRequired: bigint; resource: string
  payTo: Address; token: Address; facilitator: Address; chainId: number
  asset: string; demoToken: boolean; expiresAt: number         // now + maxTimeoutSeconds
}
export function parseChallenge(body: unknown, receivedAt: number): X402Challenge
export function encodeXPayment(a: Authorization, sig: { v: number; r: Hex; s: Hex }): string  // base64 JSON
export type SettlementState = { kind: 'pending' } | { kind: 'settled'; txHash: Hex; paymentId: Hex } | { kind: 'rejected'; reason: string }
export type ResourceState = { kind: 'undelivered' } | { kind: 'delivered'; body: unknown } | { kind: 'failed'; status: number }
export interface X402Outcome { settlement: SettlementState; resource: ResourceState }
export function readXPaymentResponse(headerB64: string): { paymentId: Hex; txHash: Hex } | null

// x402-states.ts
export function reconcileX402<I, Q, P>(record: OperationRecord<I, Q, P>, s: SettlementState, r: ResourceState, now: number): OperationRecord<I, Q, P>
```

**Behaviour:**
- `parseChallenge` reads the `402` body (`accepts[0]`), computes `expiresAt = receivedAt +
  maxTimeoutSeconds*1000`, and carries `demoToken` from the registry (the label is data).
- The auth domain `name`/`version` come from MockUSDT0's own EIP-712 domain (read once);
  `signAuthorization` returns the split `{v,r,s}` the facilitator's tuple expects. The server
  imports `EIP3009_TRANSFER_TYPES`/`Authorization` — no re-declaration.
- `reconcileX402` maps onto canonical states: settling → `awaiting_external` (actor
  `'provider'`); **settled + delivered → `succeeded`**; **settled + resource `failed` →
  `partially_succeeded`** (the honest split — payment took, resource did not); `rejected` →
  `failed`. Walk the table; `succeeded`/`partially_succeeded` only from observed settlement +
  resource, never from the `402` alone.

- [ ] **Step 1** Write `x402-eip3009.test.ts` (sign produces a `{v,r,s}` recoverable to the
  signer for a fixed auth), `x402-client.test.ts` (`parseChallenge` computes `expiresAt` and
  carries `demoToken`; `encodeXPayment`/`readXPaymentResponse` round-trip base64), and
  `x402-states.test.ts` (settled+delivered → succeeded; settled+failed → partially_succeeded;
  pending → awaiting_external; never succeeded from pending).
- [ ] **Step 2** Run — expect FAIL. **Step 3** Implement (< 300 lines each; reuse `reconcileTo`).
- [ ] **Step 4** Run — expect PASS. Export from `index.ts`.
- [ ] **Step 5** Checkpoint `feat(core): x402 client — EIP-3009 auth, settlement≠resource lifecycle`.

**Acceptance:** the auth types live in ONE place the server imports; settlement and resource
are two independent states; settled-but-resource-failed is `partially_succeeded`, never
`succeeded`; `demoToken` flows from the registry.

---

## Task 10: `services/x402-server` — the single-endpoint fixture (imports core)

**Files:** Create `services/x402-server/src/index.ts` (+ split if > 300 lines),
`package.json`, `README.md`, `tsconfig.json`; Test `services/x402-server/test/challenge.test.ts`.

**Adapt** `x402Server.ts` (353 lines) to viem + core, **reduced to ONE endpoint**. It
imports `Authorization`/`EIP3009_TRANSFER_TYPES` from `@flare-kit/core` and `FACILITATOR_ABI`
from `@flare-kit/contracts`.

**Behaviour:**
- One gated route `GET /api/demo`. No `X-Payment` → `402` with a requirement whose `asset`
  names the demo token (`"MockUSDT0 (demo)"`), `payTo`/`token`/`facilitator`/`chainId` from
  the registry, `maxTimeoutSeconds`. With `X-Payment` → decode, `facilitator.verifyPayment`,
  then `facilitator.settlePayment` (operator key), set `X-Payment-Response`, and return an
  **obviously-synthetic payload with NO fabricated data** — e.g. `{ demo: true, note: "This
  is a synthetic x402 demo resource. No real data.", servedAt: <server time> }`. **Do not
  copy the tutorial's fake `flarePrice`.**
- Key from env, never logged. A `GET /health` reports config (addresses only, no key).

- [ ] **Step 1** `package.json` deps `@flare-kit/core`,`@flare-kit/contracts`,`viem`,`express`.
  Write `challenge.test.ts`: a no-header request returns `402` with the demo-labelled asset and
  the registry addresses; an under-value payment is rejected; the payload carries no invented
  fields.
- [ ] **Step 2** Run `pnpm --filter @flare-kit/x402-server test` — expect FAIL.
- [ ] **Step 3** Implement (build core first). **Step 4** Run — expect PASS.
- [ ] **Step 5** Checkpoint `feat(services): single-endpoint x402 fixture over @flare-kit/core`.

**Acceptance:** one endpoint; the `402` asset is demo-labelled; the resource payload invents
no data; imports the auth types from core; no key logged.

---

## Task 11: **Live x402 verification** (AC3, gate for `x402Verified`)

**Files:** Create `packages/core/scripts/live-x402.mjs`; produce
`.thoughts/verification/2026-08-12-m9-x402.md` + `2026-08-12-coston2-live-x402.json`.
Flips `x402Verified:true` after the confirmed settlement + delivery.

- [ ] **Run:** start `services/x402-server`; the client (the payer, holding minted MockUSDT0)
  calls `GET /api/demo` → receives `402` → `parseChallenge` → `signAuthorization` →
  `encodeXPayment` → re-request with `X-Payment`. The server settles via the facilitator (real
  tx). Record the **settlement tx hash + paymentId** (from `X-Payment-Response`) and the
  **resource body** (200) as two independent facts. Assert the op reached `succeeded` from
  settled+delivered (and exercise a resource-failure fixture → `partially_succeeded` if
  reproducible).
- [ ] **Step: flip verification** — set `x402Verified:true` for Coston2; re-run Task 3's x402
  test (asserts true). Never flip before the confirmed settlement read.
- [ ] **Evidence** — JSON/MD: date, network, addresses (token marked demo), settlement tx +
  paymentId, the resource delivery, that the asset is MockUSDT0. No key material. Gate +
  checkpoint `chore(core): live M9 x402 settle+resource on Coston2 (AC3)`.

**Acceptance (AC3):** a real facilitator settlement lands and the resource is delivered, the
two recorded independently; the asset is the demo token throughout; `succeeded` only from the
observed settlement + delivery.

---

## Task 12: `mock-x402.ts` — the mock, after the real path

**Files:** Create `packages/core/src/mock-x402.ts`; Test `packages/core/test/mock-x402.test.ts`.

- [ ] Reproduce the **observed** x402 flow from Task 11: the challenge shape, the settled
  tx/paymentId, the delivered resource, and the settled-but-resource-failed split — copied from
  the evidence. Mock mode explicit/labelled; the demo-token label preserved.
- [ ] **Refuses the unobserved**: an endpoint/state the live run never produced throws; a
  `settled` outcome is never fabricated without an observed settlement read.
- [ ] Test: parity with fixtures; unobserved throws. Gate + checkpoint
  `feat(core): mock-x402, copies observed, refuses unobserved`.

---

## Task 13: `use-gasless` + `use-x402` hooks

**Files:** Create `packages/react/src/use-gasless.ts`, `packages/react/src/use-x402.ts`;
Modify `packages/react/src/index.ts`; Test `packages/react/test/use-gasless.test.ts`,
`use-x402.test.ts`. (Run `pnpm build` after so react-ui sees them from dist.)

- [ ] `use-gasless` — thin hook over the gasless op (reads/plan need no key; the approval +
  the signed request go out via the host's `onSubmit`), mirroring `use-bridge`/`use-vault`.
  Returns the plan builder, the relay call, and the live transfer state (polls `paymentSince`
  on a host-controlled interval). Clears a transient relay/read error (the M8 `useBridge` fix).
- [ ] `use-x402` — thin hook over the x402 op: parse challenge → sign → settle-and-fetch →
  the settlement + resource states (polls if the host re-opens). Returns both independently.
- [ ] Tests reach each returned state from mocked core. Gate + checkpoint
  `feat(react): use-gasless + use-x402`.

---

## Task 14: `GaslessCard` (GAS-01/02/03) + `payments.css`

**Files:** Create `packages/react-ui/src/GaslessCard.tsx`, `gasless-card-state.ts`,
`packages/react-ui/src/payments.css`; Modify `packages/react-ui/src/index.ts`; Test
`packages/react-ui/test/gasless-card.test.tsx`.

- [ ] **Composer (GAS-01):** `SwapLeg`-style "you send" (FXRP, amount, recipient); the
  **relayer identity + reachability**; the line **"relayer covers gas · no fee"**; and USD₮0
  shown in the asset picker as **unavailable-on-testnet** with the EIP-3009 reason
  (`fk-unbuilt` idiom) — the declared gap lives here, no separate catalogue.
- [ ] **Authorization (GAS-02):** the one-time `approve` as a **loud, distinct setup step**
  ("this costs gas, once"), separated from the gasless signature; nonce/deadline + a replay
  note. Sign only via `onSubmit`.
- [ ] **Timeline (GAS-03):** approve → sign → `submitted` (relay accepted, an `EvidenceChip`
  for the relay job) → `awaiting_external` (relayer) → `succeeded` (from the on-chain read),
  on the `OperationTimeline` spine.
- [ ] States {compose, no-balance, unavailable, needs-approval, approving, signing, submitted,
  awaiting-relay, succeeded, insufficient-balance, expired, relayer-unreachable, not-verified}
  reachable from props; `unavailable` (read failed) never rendered as `no-balance`. Pure split
  in `gasless-card-state.ts` (reuse `card-chrome.ts`). `payments.css` values from tokens only.
- [ ] Tests reach each state from props. Gate + checkpoint.

---

## Task 15: `X402Card` (PAY-01/02)

**Files:** Create `packages/react-ui/src/X402Card.tsx`, `x402-card-state.ts`; Modify
`packages/react-ui/src/index.ts`; Test `packages/react-ui/test/x402-card.test.tsx`.

- [ ] **Challenge (PAY-01):** resource requested; amount in **MockUSDT0 with the demo-token
  label** (never USD₮0/FXRP); payee; facilitator; network; **expiry** (shown, and an expired
  challenge renders `expired`, not valid). Sign only via `onSubmit`.
- [ ] **Outcome (PAY-02):** **settlement and resource delivery independently visible** — the
  receipt carries the real settlement tx hash + paymentId; a settled-but-resource-failed state
  renders `partially_succeeded` (payment took, resource did not), never `succeeded`; a
  duplicate/idempotent replay is shown as such, not a second charge.
- [ ] States {challenge, expired, signing, settling, settled-delivered, settled-resource-failed,
  rejected, facilitator-unavailable} reachable from props. Pure split in `x402-card-state.ts`
  (reuse `card-chrome.ts`). Reuse `payments.css`.
- [ ] Tests reach each state from props. Gate + checkpoint.

---

## Task 16: Gallery — every AC6 state, both themes, a11y-verified

**Files:** Create `packages/react-ui/gallery/m9-gasless-sections.tsx`,
`packages/react-ui/gallery/m9-x402-sections.tsx`; wire into the gallery index.

- [ ] Drive every state (Task 14/15 lists) from props at a fixed `MOCK_EPOCH` (not wall time —
  the gallery-clock rule) so the in-flight/expiry states screenshot deterministically.
- [ ] Run `window.__auditA11y()` — contrast composited with opacity, focus, target size (the
  M4-R12 method) — every M9-new (`fk-gasless`/`fk-x402`) element clean, both themes. Screenshot
  each state both themes into `.thoughts/verification/m9-screens/`.
- [ ] Checkpoint `test(react-ui): M9 gasless + x402 gallery, all states, both themes, a11y-clean`.

---

## Task 17: Full gate, evidence, review gate, close-out

- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm test` — paste output.
- [ ] Drive both cards in a **real browser** (not just jsdom) — screenshot and look (CLAUDE.md);
  confirm the gasless timeline advances, the "gasless ≠ free" approval step reads honestly, and
  the x402 settlement/resource split + demo-token label render in both themes.
- [ ] Write `.thoughts/verification/2026-08-12-m9-gasless-payments.md` — the full evidence: the
  live gasless payment (payer 0-gas), the live x402 settle+resource, quote/label honesty, the
  browser run, the a11y result, any deferred minors with reasons.
- [ ] **Review gate** (CLAUDE.md): dispatch review subagents (correctness, honest-rendering/
  silent-failure, simplification) over the M9 diff; fix critical/important before close. Then
  the simplifier for unrequested config.
- [ ] Bump `state.json` via a JSON load/mutate/dump script (never hand edit): add
  `completed_milestones.M9`, update `milestone`/`current_spec`/`next_authorized_action` (→ the
  next roadmap family, "Governance, delegation, staking, rewards"), and append the M9
  `rules_that_are_not_obvious` the live runs taught (the forwarder EIP-712 domain; relay-accept ≠
  transfer; the one-time approval is the only payer-gas step; settlement ≠ resource; MockUSDT0 is
  the only EIP-3009 substrate on Coston2; `demoToken` label is registry data).

---

## Self-Review (against the spec)

- **Coverage:** M9-R1→Task 3; R2→Task 4; R3→Task 5; R4→Task 5/7/14; R5→Task 6; R6→Task 9;
  R7→Task 9/10/15; R8→Task 0/2/6/10; R9→Task 8/12; R10→Task 14; R11→Task 15; R12→Task 14 (USD₮0
  unavailable) + 3 (verified gating); R13→Task 14/15 (reuse, <300); R14→Task 13. AC1/AC2→Task 7;
  AC3→Task 11; AC4→Task 14 (+ honest lifecycle 5/9); AC5→Task 3/14/15; AC6→Task 16; AC7→Task 17.
  The probe (spec Verification) → Task 1; the two live runs → Tasks 7/11. All covered.
- **Placeholder scan:** no TBD/TODO; every interface block carries concrete signatures; the
  EIP-712/EIP-3009 domains, the relay/settle behaviours, and the reconcilers are specified.
- **Type consistency:** `GaslessDeployment`/`X402Deployment`/`GaslessAdapter`/`GaslessTransferState`/
  `PaymentRequestMessage`/`Authorization`/`X402Challenge`/`SettlementState`/`ResourceState` names
  are used identically across Tasks 3–15; `UnsignedCall`/`PlanStep`/`Result`/`OperationRecord`/
  `reconcileTo`/`pathTo` reuse existing core types (not redefined); the EIP-712/3009 types are
  defined once in core and imported by the services (no re-declaration).
- **Real-first honoured:** the probe (Task 1) and the deploy (Task 2) + live runs (Tasks 7/11)
  precede the mocks (Tasks 8/12); `gaslessVerified`/`x402Verified` flip true only after a confirmed
  on-chain read, never a relayer/server HTTP response.

## Execution Handoff

Inline execution (this session), real-first, checkpointing after each task. Time-bounded points:
**Task 1** may surface a funding blocker (operator C2FLR for three deploys + gas, or the payer's
FXRP) that pauses the plan for an Abu `! ...` faucet action; **Task 2** deploys three contracts and
**Tasks 7/11** run the live payment/settle — the milestone is not closed (Task 17 state bump) until
both live runs confirm on-chain. The two features are independent after the shared Task 0–3 setup:
gasless (Tasks 4–8) and x402 (Tasks 9–12) can be built and verified in either order.
