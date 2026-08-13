# M8 Cross-chain (LayerZero V2 OFT + Composer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline)
> — this milestone is driven **real-first against live Coston2 ↔ Sepolia**, so the
> implementer must observe both chains to write correct code and fixtures. Steps use
> checkbox (`- [ ]`) syntax. Plan location follows the project convention
> (`.thoughts/plans/`), overriding the skill default. This repo is **not** a git
> repo in this session — treat "Commit" steps as checkpoint markers; skip the actual
> `git` call if it errors.

**Goal:** Ship a real FXRP cross-chain OFT bridge (Coston2 → Sepolia) plus a
cross-chain redeem-to-native-XRP (Sepolia → Coston2 Composer → XRPL), as two React
surfaces over the existing M1 operation lifecycle, with delivery proven by reading
the destination chain — never a source send dressed up as a delivery.

**Architecture:** Mirror the M5/M6/M7 stack, extended to a **source/destination
pair**. `@flare-kit/contracts` gains a `bridge.ts` route registry (a `BridgeRoute`
pairs two `ChainEndpoint`s — Coston2 and the external Sepolia — carrying OFT
addresses, EIDs, executor/compose gas, composer, and `bridgeVerified`) and
`bridge-abis.ts` (IOFT + destination-read + Composer fragments). `@flare-kit/core`
gains `bridge-adapter.ts` (one `CrossChainAdapter` over a **source** and a
**destination** viem client — the shared thing is the lifecycle, not the chain),
`bridge-quote.ts` (`quoteSend`/`quoteOFT` → real fee + delivered amount + minimum,
and the destination-read **delivery reconciler**), and `bridge.ts` (immutable
intents → unsigned approve-when-short plans → canonical states, the durable
submit→await-delivery→delivered lifecycle reusing the M1 engine). The real path is
verified live before the mock is written. `@flare-kit/react` adds `use-bridge`;
`@flare-kit/react-ui` adds `RouteCatalogue` and `BridgeCard`, reusing `SwapLeg`, the
`OperationTimeline` spine, and the shared card chrome M7 homed.

**Tech Stack:** TypeScript, viem, wagmi (peer), React, vitest, Turborepo/pnpm.
LayerZero V2 OFT (IOFT `quoteSend`/`quoteOFT`/`send`), type-3 executor options.

## Global Constraints

- Production source files **< 300 lines**; split before writing (CLAUDE.md).
- **Never fake protocol reality**: a confirmed source `send` is `submitted`, **never**
  rendered as delivered/`succeeded`; delivery is entered **only** from a destination
  read; an unknown delivery outcome is never rendered as failed; unknown → `—`, never
  `0`; mock mode is explicit/labelled, never a failure fallback.
- **Reuse, do not re-code**: one shared component per pattern; reuse `SwapLeg`,
  `OperationTimeline`, the M7-homed `card-chrome.ts`, and `Panel`/`Button`/`AssetLogo`/
  `EvidenceChip`/`DetailRow`/`Note`/`SourceChip`. Never build a card/badge/pill inline.
- **Network is configuration — now a source/destination pair**: all addresses, EIDs,
  RPC URLs, explorers and executor/compose gas come from `@flare-kit/contracts`
  (`bridge.ts`); nothing hardcoded elsewhere. Testnet first, mainnet-capable.
- **Public values are constants, not env vars**: the Sepolia RPC, chain id, EID and
  OFT address are exported constants. The only secret is the signing key — never
  logged, never in `--json`/evidence.
- **Exact values render in the mono face** with tabular numerals, full precision,
  carrying asset symbol. The `nativeFee` renders as C2FLR; the receive leg renders the
  dust-adjusted `amountReceivedLD`, never the input.
- **Operations self-reconcile** against the **destination** chain on open (by message
  `guid`); no Resume button.
- **Real integration first**; `mock-bridge.ts` is written afterwards and copies
  observed behaviour, refusing anything it never observed.
- Gate: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`, shown with output.

### Harness mechanics (read before Task 1)

- **Never `cd` into a package/`sources/`** — the stage guard resolves the project root
  from the shell cwd and will block source writes. Use `pnpm --filter` from the repo
  root.
- **SPEC.md `## Files` manifest** (Task 0): a source file must be listed there before
  it is written. The section ends at the next `##`/`###` of any depth.
- **Test lock**: each test file's mtime is compared to SPEC.md's; one SPEC.md write
  unlocks every test file once. Batch test edits behind the one Task-0 SPEC write;
  never touch SPEC.md just to unlock.
- **react-ui imports @flare-kit/react from dist** — a hook/core change needs
  `pnpm build` before react-ui (and react) tests see it.
- **`applyTransition` silently drops its patch** on an illegal hop — the reconciler
  must **walk the `states.ts` table** (BFS), never jump states.
- **Signing key**: `.secrets` holds the dev EVM key; live scripts sign with
  `privateKeyToAccount(secrets.evm.privateKey)`. Browser surfaces sign only via
  `onSubmit` and never hold a key. Keys never logged, never in `--json`/evidence.
- **Two chains, two clients**: core reads the source via one `PublicClient` and the
  destination via another (Sepolia public RPC constant). The live script needs Sepolia
  ETH for the return-leg gas/fee and an XRPL testnet account for the redeem payout.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `packages/contracts/src/bridge.ts` | route registry: `ChainEndpoint` pairs, gas, composer, `bridgeVerified` | 2 |
| `packages/contracts/src/bridge-abis.ts` | IOFT + destination-read + Composer ABIs (split from abis.ts) | 2 |
| `packages/core/src/bridge-adapter.ts` | `CrossChainAdapter` over src+dst clients; type-3 option encoder | 3 |
| `packages/core/src/bridge-quote.ts` | `quoteSend`/`quoteOFT` → fee/amount/min; delivery reconciler | 4 |
| `packages/core/src/bridge.ts` | intents → plan → execution → states (durable delivery lifecycle) | 5 |
| `packages/core/scripts/live-bridge.mjs` | live Coston2→Sepolia + redeem evidence run | 6 |
| `packages/core/src/mock-bridge.ts` | the mock, after the real path | 7 |
| `packages/react/src/use-bridge.ts` | `useBridge` hook over the operation | 8 |
| `packages/react-ui/src/RouteCatalogue.tsx` (+ `route-catalogue-state.ts`) | routes surface | 8 |
| `packages/react-ui/src/BridgeCard.tsx` (+ `bridge-card-state.ts`) | bridge + redeem surface | 9 |
| `packages/react-ui/src/bridge.css` | cross-chain surfaces' CSS, values from tokens | 8–9 |
| `packages/react-ui/gallery/m8-bridge-sections.tsx` | AC5 state matrix, both themes | 10 |

---

## Task 0: Declare M8 files in SPEC.md manifest

**Files:** Modify `SPEC.md` (`## Files` section only).

- [ ] **Step 1** Append the 11 M8 source files above to SPEC.md's `## Files` section as
  flat bullets (no subheading — a `###` would hide everything below it from the scope
  guard), each with a one-line responsibility and its `M8-R#`.
- [ ] **Step 2** Verify the section still ends at the next `##`. This single write
  unlocks every M8 test file once — batch all test-file creation behind it.
- [ ] **Step 3** Checkpoint `chore: declare M8 cross-chain files in SPEC.md manifest`.

**Acceptance:** every file a later task creates is listed; no `###` inserted inside
`## Files`.

---

## Task 1: Read-only **probe** — confirm on-chain reality + funding (no product code)

**Files:** Create `packages/core/scripts/probe-bridge.mjs` (dev script, not shipped);
produce `.thoughts/verification/2026-08-11-m8-bridge-probe.json`. **No product code.**

This is the M7-probe precedent: assume nothing is live until read. If a peer is unset
or a balance is short, **STOP and surface it to Abu** (a faucet trip is his `! ...`
call) rather than building on a route that cannot deliver.

- [ ] **Step 1** Against Coston2 (`https://coston2-api.flare.network/ext/C/rpc`), read
  the OFT Adapter `0xCd3d2127935Ae82Af54Fc31cCD9D3440dbF46639`:
  - `token()` → assert it equals FTestXRP `0x0b6A3645c240605887a5532109323A3E12273dc7`.
  - `peers(40161)` (Sepolia EID) → assert **non-zero** (a Sepolia peer is wired, so a
    `send` will route, not revert). Record the bytes32 peer.
  - `sharedDecimals()` and `decimalConversionRate()` (or equivalent) → record whether
    FXRP (6dp) loses sub-shared-decimal **dust** on bridge (determines whether
    `amountReceivedLD == amountSentLD`).
  - Build a `SendParam` for 1 FXRP to the signer on Sepolia and call `quoteSend(sp,false)`
    → record `nativeFee` (C2FLR); call `quoteOFT(sp)` → record `amountReceivedLD` + limits.
- [ ] **Step 2** Against Sepolia (`https://ethereum-sepolia-rpc.publicnode.com`,
  chain 11155111), read the FXRP OFT `0x81672c5d42f3573ad95a0bdfbe824faac547d4e6`:
  `token()`/`decimals()`/`symbol()` and confirm it responds (the delivery-read target).
- [ ] **Step 3** Funding (re-read, never assume): Coston2 `balanceOf` FXRP + native
  C2FLR for `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9`; **Sepolia ETH** balance for
  the same address; and confirm an **XRPL testnet account** exists in `.secrets`
  (or note it as needed for the redeem payout). Record all.
- [ ] **Step 4** Write the probe JSON: block numbers on both chains, every value above,
  and a `blockers` array (empty if all green). No key material.
- [ ] **Step 5** Checkpoint. If `blockers` is non-empty, **pause the plan** and report
  to Abu with the exact faucet/action needed.

**Acceptance:** the Sepolia peer is confirmed wired; `quoteSend`/`quoteOFT` return; the
dust behaviour is known; funding on Coston2 + Sepolia + XRPL is recorded (or a blocker
raised). Nothing downstream assumes a value this probe did not read.

---

## Task 2: `@flare-kit/contracts` — route registry + ABIs

**Files:** Create `packages/contracts/src/bridge.ts`, `packages/contracts/src/bridge-abis.ts`;
Modify `packages/contracts/src/index.ts` (exports); Test
`packages/contracts/test/bridge.test.ts`.

**Interfaces — Produces:**
```ts
export interface ChainEndpoint {
  readonly key: string            // 'coston2' | 'sepolia'
  readonly chainId: number        // 114 | 11155111
  readonly eid: number            // FLARE_V2_TESTNET | 40161
  readonly rpcUrl: string         // public constant
  readonly explorer: string       // tx base url
  readonly oft: `0x${string}`     // FXRP OFT (adapter on Flare, native OFT on external)
}
export type RouteKind = 'bridge' | 'redeem'
export interface BridgeRoute {
  readonly key: string            // 'coston2-sepolia' | 'sepolia-coston2-redeem'
  readonly kind: RouteKind
  readonly from: ChainEndpoint
  readonly to: ChainEndpoint
  readonly asset: { symbol: 'FXRP'; address: `0x${string}`; decimals: number } // on `from`
  readonly composer?: `0x${string}`   // set on 'redeem' (Flare side)
  readonly executorGas: number        // lzReceive gas: 200_000 bridge
  readonly composeGas?: number         // 1_000_000 for redeem
  readonly scanUrl: string             // 'https://testnet.layerzeroscan.com/tx/'
  readonly bridgeVerified: boolean     // true only where a live run confirmed delivery
}
export const BRIDGE_ROUTES: Readonly<Record<FlareNetworkKey, readonly BridgeRoute[]>>
export function routesFor(network: FlareNetworkKey): readonly BridgeRoute[]
export function routeByKey(network: FlareNetworkKey, key: string): BridgeRoute | undefined
```
`bridge-abis.ts` produces `OFT_ADAPTER_ABI` (`token`, `quoteSend`, `quoteOFT`, `send`,
event `OFTSent`), `OFT_DEST_ABI` (`balanceOf`, `decimals`, event
`OFTReceived(bytes32 guid, uint32 srcEid, address toAddress, uint256 amountReceivedLD)`),
and `COMPOSER_ABI` (the `FAssetRedeemComposer` fragments the kit reads) — fragments
only, each verified against Task 1 / the vendored `FXRPOFT.ts` ABI, split from
`abis.ts` to stay < 300 lines.

**Data (probe-verified — Coston2 testnet):** `from` Coston2 (chainId 114, eid
`FLARE_V2_TESTNET`, oft `0xCd3d…46639`, asset FTestXRP `0x0b6A…3dc7` 6dp), `to` Sepolia
(chainId 11155111, eid 40161, oft `0x81672c5d…d4e6`). `coston2-sepolia`
(kind `bridge`, executorGas 200000, **`bridgeVerified` starts false**, set true in
Task 6). `sepolia-coston2-redeem` (kind `redeem`, from Sepolia → to Coston2, composer
`0xa10569…23b0`, composeGas 1000000, executorGas 1000000, `bridgeVerified` false→true
in Task 6).

- [ ] **Step 1** Write `bridge.test.ts`: `routesFor('coston2')` returns both routes with
  exact probe addresses/EIDs; every route `bridgeVerified === false` **for now** (Task 6
  flips the two); no duplicate keys; the redeem route carries a `composer` and
  `composeGas`, the bridge route does not; no address literal appears outside `bridge.ts`.
- [ ] **Step 2** Run `pnpm --filter @flare-kit/contracts test` — expect FAIL (missing module).
- [ ] **Step 3** Write `bridge-abis.ts` and `bridge.ts`; export from `index.ts`. RPC URLs
  and EIDs are constants here. Keep each < 300 lines.
- [ ] **Step 4** Run the test — expect PASS. Then `pnpm --filter @flare-kit/contracts build`.
- [ ] **Step 5** Checkpoint `feat(contracts): M8 cross-chain route registry + OFT/Composer ABIs`.

**Acceptance:** addresses/EIDs match the probe; no literal outside `bridge.ts`; files
< 300 lines; `bridgeVerified` present and honest (both false until Task 6).

---

## Task 3: `@flare-kit/core` — `bridge-adapter.ts` (one lifecycle, src+dst clients)

**Files:** Create `packages/core/src/bridge-adapter.ts` (+ `bridge-options.ts` if the
option encoder pushes it over 300 lines); Test `packages/core/test/bridge-adapter.test.ts`,
`packages/core/test/bridge-options.test.ts`.

**Interfaces — Consumes:** `BridgeRoute`, the ABIs, two viem `PublicClient`s.
**Produces** the seam every later task depends on:
```ts
export interface SendParam {              // the IOFT struct, mirrors the vendored shape
  dstEid: number; to: `0x${string}`; amountLD: bigint; minAmountLD: bigint
  extraOptions: `0x${string}`; composeMsg: `0x${string}`; oftCmd: `0x${string}`
}
export interface BridgeReads {            // pure chain reads, no key
  underlyingToken(): Promise<Address>     // src OFT token()
  assetAllowance(owner: Address, spender: Address): Promise<bigint>
  quoteFee(sp: SendParam): Promise<{ nativeFee: bigint; lzTokenFee: bigint }>   // quoteSend
  quoteReceive(sp: SendParam): Promise<{ amountReceivedLD: bigint; minAmountLD: bigint }> // quoteOFT
  delivery(guid: `0x${string}`, since: bigint): Promise<DeliveryState>  // reads the DEST client
}
export type DeliveryState =
  | { kind: 'in-flight' }
  | { kind: 'delivered'; amountReceivedLD: bigint | null }   // null if log found but amount unread
export interface BridgeWrites {           // build UNSIGNED calldata only
  approveAsset(spender: Address, amount: bigint): UnsignedCall
  send(sp: SendParam, fee: { nativeFee: bigint; lzTokenFee: bigint }, refund: Address): UnsignedCall // value=nativeFee
}
export interface BridgeAdapter { reads: BridgeReads; writes: BridgeWrites; route: BridgeRoute }
export function makeBridgeAdapter(src: PublicClient, dst: PublicClient, route: BridgeRoute): BridgeAdapter
// SendParam builder — the ONE place executor/compose options are encoded:
export function buildSendParam(route: BridgeRoute, opts: {
  to: Address; amountLD: bigint; minAmountLD: bigint; composeMsg?: `0x${string}`
}): SendParam
```
`UnsignedCall` is the existing core type M5/M6/M7 use (`{ to, data, value? }`) — reuse
it. `Address` is viem's.

**Non-obvious adapter behaviour to encode (verified against Task 1 / the starter):**
- **type-3 option encoding** lives here and nowhere else. `extraOptions` for a plain
  bridge = one `addExecutorLzReceiveOption(route.executorGas, 0)`; for a redeem =
  `lzReceive(executorGas)` **plus** `addExecutorLzComposeOption(index=0, composeGas, 0)`.
  Encode the type-3 bytes directly (`0x0003` + worker/option TLVs) in a small pure
  function; **assert the produced hex equals the vendored `@layerzerolabs/lz-v2-utilities`
  output** captured as a fixture from the starter (Task 1), so we ship no LZ runtime dep
  but stay byte-identical.
- `to` is the recipient **left-padded to 32 bytes** (`pad(addr,{size:32})`).
- `delivery(guid, since)` reads the **destination** client for an `OFTReceived` log with
  that `guid` at/after block `since`; found → `{delivered, amountReceivedLD}`; absent →
  `{in-flight}`. It never concludes failure from absence (LZ can take minutes).
- For the redeem route the `send` runs on the **Sepolia** client (source=Sepolia OFT);
  `makeBridgeAdapter` swaps which client is source per `route.from`.

- [ ] **Step 1** Write `bridge-options.test.ts`: the type-3 encoder output equals the
  captured LZ-utilities fixture for both the bridge (200k) and redeem (1M+1M compose)
  cases. Write `bridge-adapter.test.ts` against mocked clients: `buildSendParam` pads
  `to`, sets `minAmountLD`, and attaches the right options per route kind; `delivery`
  returns `in-flight` when no log, `delivered` with amount when the `OFTReceived` fixture
  is present.
- [ ] **Step 2** Run `pnpm --filter @flare-kit/core test bridge-adapter bridge-options` — expect FAIL.
- [ ] **Step 3** Implement `bridge-adapter.ts` (+ `bridge-options.ts` if > 300 lines).
- [ ] **Step 4** Run the tests — expect PASS.
- [ ] **Step 5** Checkpoint `feat(core): CrossChainAdapter — one lifecycle over src+dst clients`.

**Acceptance:** option encoding is byte-identical to LZ-utilities and lives in one place;
`delivery` never reports failure from absence; no later file encodes options or touches a
raw OFT ABI.

---

## Task 4: `@flare-kit/core` — `bridge-quote.ts` (honest fee, delivered amount, minimum)

**Files:** Create `packages/core/src/bridge-quote.ts`; Test
`packages/core/test/bridge-quote.test.ts` (fixtures = probe values, then Task-6 measured).

**Interfaces — Consumes** `BridgeAdapter`. **Produces:**
```ts
export interface BridgeQuote {
  amountIn: bigint; amountReceivedLD: bigint       // dust-adjusted delivered amount
  minReceived: bigint                               // amountReceivedLD*(1e4-bips)/1e4, floor
  nativeFee: bigint; feeAsset: TokenMeta            // C2FLR (or source-native), mono
  readAt: number; asset: TokenMeta
}
export function quoteBridge(a: BridgeAdapter, amountIn: bigint, slippageBips: number, to: Address): Promise<BridgeQuote>
```

**Honest-rendering rules to encode:**
- `amountReceivedLD` is read from `quoteReceive` (dust-adjusted) — the "you receive" leg
  renders **this**, never `amountIn`. If the read fails, the field is `null` and renders
  `—`, never `0`.
- `nativeFee` from `quoteFee`; rendered mono with its asset + full precision; carried into
  the plan as the `value` the send must pay.
- `minReceived` at full precision, floor division; a later on-chain revert because the
  delivered amount would breach it is the distinct `dust-below-min` state (Task 5), not
  computed as failure here.
- A quote carries `readAt`; nothing here reads wall-clock in a way a test can't fix.

- [ ] **Step 1** Write `bridge-quote.test.ts` with probe fixtures: a 1 FXRP quote yields
  the probe `amountReceivedLD` and `nativeFee`; `minReceived` = `amountReceivedLD*9950/10000`
  at 50 bips; a throwing `quoteReceive` → `amountReceivedLD: null`.
- [ ] **Step 2** Run — expect FAIL. **Step 3** Implement (< 300 lines). **Step 4** Run — expect PASS.
- [ ] **Step 5** Checkpoint `feat(core): bridge-quote — real fee, dust-adjusted receive, honest unknowns`.

---

## Task 5: `@flare-kit/core` — `bridge.ts` (intents → plan → durable delivery lifecycle)

**Files:** Create `packages/core/src/bridge.ts` (+ `bridge-states.ts` if the state map
pushes it over 300 lines); Modify `packages/core/src/index.ts`, `packages/core/src/states.ts`;
Test `packages/core/test/bridge.test.ts`, `packages/core/test/bridge-states.test.ts`.

**Interfaces — Consumes** adapter + quote + the M1 engine (`operation.ts`, `states.ts`).
**Produces:**
```ts
export interface BridgeIntent {
  readonly routeKey: string; readonly network: FlareNetworkKey
  readonly amountIn: bigint; readonly slippageBips: number; readonly deadline: number
  readonly recipient: Address                       // on the destination chain
}
export interface RedeemIntent {                      // Sepolia FXRP -> native XRP
  readonly routeKey: string; readonly network: FlareNetworkKey
  readonly amountIn: bigint; readonly slippageBips: number; readonly deadline: number
  readonly xrplDestination: string                   // XRPL address for the payout
}
export type BridgePlan = { steps: PlanStep[] }        // reuse the M5/M6/M7 PlanStep union
export function buildBridgePlan(a: BridgeAdapter, intent: BridgeIntent, owner: Address): Promise<Result<BridgePlan, BridgeError>>
export function buildRedeemPlan(a: BridgeAdapter, intent: RedeemIntent, owner: Address): Promise<Result<BridgePlan, BridgeError>>
export type BridgeError =
  | { kind: 'not-verified' } | { kind: 'insufficient-balance' } | { kind: 'insufficient-fee' }
  | { kind: 'dust-below-min' } | { kind: 'expired-deadline' } | { kind: 'no-peer' }
export type BridgeState =                             // canonical operation states
  | 'pre-plan' | 'needs-approval' | 'approving' | 'submitting'
  | 'submitted' | 'awaiting-delivery' | 'delivered'          // bridge terminal = delivered
  | 'awaiting-redemption' | 'redeemed'                       // redeem two-leg extension
  | 'not-verified' | 'insufficient-balance' | 'insufficient-fee'
  | 'dust-below-min' | 'expired' | 'no-peer'
```

**Lifecycle rules (the load-bearing part):**
- Extend the **states.ts transition table** with the delivery path:
  `submitting → submitted → awaiting-delivery → delivered` (bridge), and the redeem
  extension `delivered → awaiting-redemption → redeemed`. Approvals prefix:
  `pre-plan → [needs-approval → approving] → submitting`. `submitted`,
  `awaiting-delivery` and `awaiting-redemption` map onto the canonical
  **`awaiting_external`** shape (M3 FDC / M7 vault precedent); `delivered`/`redeemed`
  map onto `succeeded`. **No jump** may skip `awaiting-delivery` → `delivered` without a
  destination read.
- `buildBridgePlan`/`buildRedeemPlan` **refuse** (`{kind:'not-verified'}`) when the
  route's `bridgeVerified === false` for the intent's network — never emit a plan that
  spends a fee on an unverified route (M8-R10 / the M6 F2 / M7 precedent).
- `no-peer` is produced if the adapter reports the destination peer unset; `insufficient-fee`
  if native balance < `nativeFee + gas`; `dust-below-min` if `quoteReceive.amountReceivedLD`
  < `minReceived`; `insufficient-balance` if FXRP < `amountIn`; `expired` past `deadline`.
- Reconciliation walks the table via BFS and derives `awaiting-delivery` vs `delivered`
  from `adapter.reads.delivery(guid, since)` on app open — **destination** chain state,
  not session state, not a source receipt.

- [ ] **Step 1** Write `bridge-states.test.ts`: the delivery table has no illegal hop that
  would silently drop a patch (reuse the M6/M7 table-walk test shape); a reconcile that has
  only a source receipt stays in `submitted`/`awaiting-delivery`, never `delivered`.
- [ ] **Step 2** Write `bridge.test.ts`: `buildBridgePlan` on a `bridgeVerified:false` route
  → `not-verified`, **no** approval step; approve-when-short (0/1 approval); `insufficient-fee`
  when native balance short; `dust-below-min` when receive < min; expired deadline → `expired`.
- [ ] **Step 3** Run — expect FAIL. **Step 4** Implement `bridge.ts` + extend `states.ts`
  (< 300 lines each; the pure state map may split into `bridge-states.ts`).
- [ ] **Step 5** Run — expect PASS. Export from `index.ts`.
- [ ] **Step 6** Checkpoint `feat(core): cross-chain operations — durable submit→deliver lifecycle, verified-gating`.

---

## Task 6: **Live Coston2 → Sepolia verification** (AC1/AC2, gate for `bridgeVerified`)

**Files:** Create `packages/core/scripts/live-bridge.mjs`; produce
`.thoughts/verification/2026-08-11-coston2-live-bridge.json`. This task **writes no
product code except flipping `bridgeVerified: true`** in `bridge.ts` after delivery is
confirmed on the destination.

**The run (staged — LZ delivery and FAsset redemption span minutes):**
- [ ] **Phase A — bridge Coston2 → Sepolia:** read `quoteFee`/`quoteReceive` + allowance →
  `buildBridgePlan` → sign the FXRP approval (where short) and `send`; capture the source
  tx, the message **`guid`** (from the `OFTSent`/messaging receipt), the LayerZeroScan link.
  Then **poll `delivery(guid, sinceSepoliaBlock)` on the Sepolia client** until
  `OFTReceived` appears; record the delivered `amountReceivedLD` and the Sepolia balance
  delta. Assert `quote.amountReceivedLD === actual delivered` within shared-decimal rounding
  (AC2) and that the op traversed `submitted → awaiting-delivery → delivered` (AC3).
- [ ] **Phase B — cross-chain redeem Sepolia → Coston2 → XRPL:** using the FXRP now on
  Sepolia, `buildRedeemPlan` → sign approval (to the source OFT/composer) + `send` with the
  compose message targeting the Composer; capture the tx + `guid`. Reconcile the Composer
  **delivery** on Coston2, then the **FAssets redemption** and the **XRPL settlement** to the
  `xrplDestination`; record each with timestamps. Assert `awaiting-redemption` and `redeemed`
  are distinct, and "XRP received" is asserted only from XRPL settlement evidence.
- [ ] **Step: flip verification** — once Phase A delivery (and, where reached, Phase B
  redemption) confirm, set `bridgeVerified: true` for the two Coston2 routes in `bridge.ts`;
  re-run Task 2 test (now asserts true for those two). Never flip before a confirmed
  destination read.
- [ ] **Evidence** — write the JSON: date, both chains' blocks, addresses, every tx hash +
  `guid` + explorer + LayerZeroScan links, FXRP/native balances before/after on **both chains
  and XRPL**, the observed dust behaviour, and quote-vs-actual for fee and delivered amount.
  No key material.
- [ ] **Gate + checkpoint** `chore(core): live M8 cross-chain bridge + redeem on Coston2↔Sepolia (AC1/AC2)`.

**Acceptance (AC1/AC2/AC3-lifecycle):** a real bridge is delivered and **confirmed on
Sepolia by reading the destination**; the redeem reaches XRPL settlement (or is recorded
staged if it spans the session); quote fee == `quoteSend`; delivered == `amountReceivedLD`;
each delivery state actually traversed. If Sepolia ETH or the XRPL account is missing,
Task 1 already surfaced it — do not fake the leg.

---

## Task 7: `mock-bridge.ts` — the mock, after the real path

**Files:** Create `packages/core/src/mock-bridge.ts`; Test
`packages/core/test/mock-bridge.test.ts`.

- [ ] Reproduce **observed** fee shape, the `amountReceivedLD`/dust behaviour, the two-leg
  redeem lifecycle (delivery → redemption → XRPL settled), the delivery-timing surface
  (in-flight → delivered), and the failure shapes — copied from the Task-6 evidence, not
  invented. Mock mode is explicit/labelled.
- [ ] **Refuses the unobserved**: a route, direction, or state the live run never produced
  throws a loud error, never a plausible zero (the M4/M6/M7 mock discipline). In particular a
  `delivered` result is never fabricated without an observed destination read.
- [ ] Test: mock bridge/redeem parity with the recorded fixtures; an unobserved route throws.
  Gate + checkpoint `feat(core): mock-bridge, copies observed, refuses unobserved`.

---

## Task 8: `use-bridge` hook + `RouteCatalogue` + `bridge.css`

**Files:** Create `packages/react/src/use-bridge.ts` (Modify `packages/react/src/index.ts`);
Create `packages/react-ui/src/RouteCatalogue.tsx`, `route-catalogue-state.ts`, `bridge.css`;
Test `packages/react/test/use-bridge.test.ts`, `packages/react-ui/test/route-catalogue.test.tsx`.
(Run `pnpm build` after the react change so react-ui sees it from dist.)

- [ ] `use-bridge` — thin hook over the operation (read/quote need no key; `send` goes out
  via the host's `onSubmit`), mirroring `use-swap`/`use-vault`. Returns quote, plan builder,
  and the live delivery state (polls `delivery` on an interval the host controls).
- [ ] `RouteCatalogue` — one row per configured route for the active network: source→dest
  chains, primitive (bridge / redeem-to-XRP), live `nativeFee` via `SourceChip`, and the
  **verified** state; `—` where unknown. A `bridgeVerified:false` route shows its config + a
  **declared-unbuilt** bridge affordance (`fk-unbuilt` idiom), never a plan.
- [ ] Pure state→chrome split in `route-catalogue-state.ts`. Reuse Panel/AssetLogo/SourceChip/
  DetailRow and the M7 `card-chrome.ts`. `bridge.css` values from tokens only.
- [ ] Tests reach each state from props. Gate + checkpoint.

---

## Task 9: `BridgeCard` — you-send/you-receive + durable delivery timeline + redeem route

**Files:** Create `packages/react-ui/src/BridgeCard.tsx`, `bridge-card-state.ts`; Test
`packages/react-ui/test/bridge-card.test.tsx`.

- [ ] `SwapLeg` for the "you send" (FXRP on source, pay role) and "you receive" (dust-adjusted
  `amountReceivedLD` on destination, receive role) legs; the real `quoteSend` fee; the exact
  `minReceived` mono; a plain-language note that delivery is asynchronous and settles on the
  destination chain.
- [ ] Approve(s)→`send` on the `OperationTimeline` spine, then the **durable delivery timeline**:
  `submitted` (source tx + a LayerZeroScan `EvidenceChip`) → `awaiting-delivery` → `delivered`
  (from the destination read). The card is **source-network aware**: bridging FXRP back to Flare
  offers the **"deliver as native XRP"** redeem route, whose timeline extends
  `delivered → awaiting-redemption → redeemed` (XRPL). Sign only via `onSubmit`.
- [ ] States {quote, no-balance, unavailable, needs-approval, approving, sending, submitted,
  awaiting-delivery, delivered, insufficient-balance, insufficient-fee, dust-below-min} and the
  redeem route {awaiting-lz-delivery, awaiting-fasset-redemption, xrp-redeemed} reachable from
  props. `unavailable` (read failed) is never rendered as `no-balance` (M6 F1). The
  cross-chain-**mint** surface renders **declared-unbuilt** (M8-R9), never faked.
- [ ] Pure split in `bridge-card-state.ts` (reuse `card-chrome.ts`; do not re-declare). Gate +
  checkpoint.

---

## Task 10: Gallery — every AC5 state, both themes, a11y-verified

**Files:** Create `packages/react-ui/gallery/m8-bridge-sections.tsx`; wire into the gallery index.

- [ ] Drive every AC5 state (Task 8/9 lists) from props at a fixed `now`/`MOCK_EPOCH` (not wall
  time — the gallery-clock rule) so the in-flight/delivery states screenshot deterministically.
- [ ] Run `window.__auditA11y()` — contrast composited with opacity, focus, target size (the
  M4-R12 method) — every M8-new element clean, both themes. Screenshot each state in both themes
  into `.thoughts/verification/m8-screens/`.
- [ ] Checkpoint `test(react-ui): M8 cross-chain gallery, all AC5 states, both themes, a11y-clean`.

---

## Task 11: Full gate, evidence, review gate, close-out

- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm test` — paste output.
- [ ] Drive the two surfaces in a **real browser** (not just jsdom) — screenshot and look
  (CLAUDE.md verification rule); confirm the delivery timeline advances and the redeem route
  renders in both themes.
- [ ] Write `.thoughts/verification/2026-08-11-m8-cross-chain.md` — the full evidence: live
  bridge delivered + confirmed on Sepolia, the redeem/settlement (staged if needed), quote-vs-
  actual, browser run, a11y result, any deferred minors tracked with reasons.
- [ ] **Review gate** (CLAUDE.md): dispatch review subagents (correctness, honest-rendering/
  silent-failure, simplification) over the M8 diff; fix critical/important before close. Then
  the simplifier for unrequested config.
- [ ] Bump `state.json` via a JSON load/mutate/dump script (never hand edit):
  `completed_milestones.M8` (executed numbering), milestone marker, `next_authorized_action`
  (→ the next roadmap family), and append any new `rules_that_are_not_obvious` the live run
  taught (e.g. the observed dust behaviour, the delivery-poll cadence, any option-encoding gotcha).

---

## Self-Review (against the spec)

- **Coverage:** M8-R1→Task 2; R2→Task 3/5; R3→Task 5 (+ reconcile in 8/9); R4→Task 4;
  R5→Task 5/9; R6→Task 7; R7→Task 8; R8→Task 9; R9→Task 9 (+ mint declared-unbuilt); R10→Task 5/8;
  R11→Tasks 8/9 (reuse `card-chrome.ts`, files < 300). AC1/AC2→Task 6; AC3→Task 5/6/7/9;
  AC4→Task 8/9; AC5→Task 10. The probe (spec Verification) → Task 1. All covered.
- **Placeholder scan:** no TBD/TODO; every interface block carries concrete signatures; the
  option-encoding and delivery-read behaviours are specified, not deferred.
- **Type consistency:** `BridgeRoute`/`ChainEndpoint`/`SendParam`/`BridgeAdapter`/`DeliveryState`/
  `BridgeState`/`BridgeError` names are used identically across Tasks 2–9; `UnsignedCall`/
  `PlanStep`/`Result`/`TokenMeta` reuse existing core types (not redefined).
- **Real-first honoured:** the probe (Task 1) and the live run (Task 6) precede the mock (Task 7);
  `bridgeVerified` flips true only after a confirmed **destination** read, never a source receipt.

## Execution Handoff

Inline execution (this session), real-first, checkpointing after each task. Two time-bounded
points: **Task 1** may surface a funding blocker (Sepolia ETH / XRPL faucet) that pauses the plan
for an Abu `! ...` action; and **Task 6 Phase B** (the FAssets redemption → XRPL settlement) may
span minutes-to-longer — the bridge (Phase A) delivery is the AC1 gate and completes in-session,
while the redeem settlement is recorded staged if it runs long. The milestone is not closed
(Task 11 state bump) until the live bridge is confirmed delivered on Sepolia.
