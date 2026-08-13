# M10 Delegation & Claims Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline)
> — this milestone is driven **real-first against live Coston2**: the implementer
> **resolves the existing Flare contracts from the registry**, then **wraps,
> delegates and reads back** on-chain to write correct code and fixtures. Steps use
> checkbox (`- [ ]`) syntax. Plan location follows the project convention
> (`.thoughts/plans/`), overriding the skill default. This repo is **not** a git
> repo in this session — treat "Checkpoint" steps as markers; skip the `git` call
> if it errors.

**Goal:** Ship a **delegation** card and a **claims** card as installable kit
surfaces — (1) **FTSO vote-power delegation**: wrap native C2FLR → WNat, delegate
to one or two providers (percentage or explicit amount), read the delegate state
and vote power back on-chain, undelegate, unwrap — a full reversible live round
trip; and (2) **three distinct claims** (FTSO delegation reward with a Merkle
proof from an explicitly-untrusted Coston2 mirror; rNat with its 50%-locked-burn;
legacy FlareDrop, distributions concluded 2026-01-30) — each rendered with its own
semantics, never collapsed into one generic "claim."

**Architecture:** Mirror the M8/M9 stack, on the existing viem C-chain substrate —
**no contract deployment**: `WNat`, `RewardManager` (v2), `RNat`,
`DistributionToDelegators` already exist on Coston2 and are **resolved offline from
`FlareContractRegistry` and snapshotted** (the `ftso/addresses.ts` pattern), then
checked by a parity test. `@flare-kit/contracts` gains `delegation.ts` +
`rewards.ts` registries (`bridge.ts` mould: `delegationVerified`/`rewardsVerified`
flags, the FTSO `proofSource.official:false` as registry data). `@flare-kit/core`
gains `delegation-adapter.ts`/`delegation.ts`/`delegation-states.ts`/`mock-delegation.ts`
and `rewards-adapter.ts`/`rewards.ts`/`rewards-states.ts`/`mock-rewards.ts`, reusing
the canonical `states.ts` lifecycle and the shared `reconcileTo`/`waitSince`/`advance`
walker. `@flare-kit/react` adds `use-delegation`/`use-rewards` (thin `useBridge`
wrappers); `@flare-kit/react-ui` adds `DelegationCard`/`ClaimCard`, reusing `SwapLeg`,
`LegTimeline`, the `OperationTimeline` spine and the M7-homed card chrome. The real
reads/round-trip precede either mock. `portfolio.ts` flips its declared-unbuilt
`delegation` placeholder to a real observed position.

**Tech Stack:** TypeScript, viem (peer), React, vitest, Turborepo/pnpm. IVPToken
percentage/explicit delegation, EIP-nothing (plain contract calls), Merkle-proof
reward claims (`RewardManager` v2), off-chain proof retrieval from a labelled
community mirror.

## Global Constraints

- Production source files **< 300 lines**; split before writing (CLAUDE.md).
- **Never fake protocol reality**: a submitted delegate/claim is `awaiting_external`,
  **never** `succeeded`; `succeeded` is entered **only** from reading the on-chain
  `delegatesOf`/balance (delegation) or the claim confirmation (`Claimed`/balance
  delta). An unknown outcome is never `failed`; unknown → `—`, never `0`. **You
  cannot claim a reward you have not earned**: the FTSO delegation-reward claim is a
  **delayed, self-reconciling** op (the M7 Firelight shape) — `rewardsVerified`
  flips true only on a **real** claim. **Delegation-reward expiry (25 epochs) and
  staking-reward non-expiry are distinct** — never one "rewards expire" line.
  **rNat early exit destroys value** (50% of locked burned) — shown before signing.
  **FlareDrop is finished** (ended 2026-01-30) — legacy read-only, no "new drop."
  An empty entitlement renders the reason, never a fabricated amount. Mock mode is
  explicit/labelled, never a failure fallback.
- **The proof source is labelled, not trusted**: the Coston2 FTSO-reward tuples come
  from an unofficial community mirror; the `proofSource.official:false` flag is
  registry data and rides every surface. Absent tuples → **declared unavailable, not
  faked**.
- **Reuse, do not re-code**: reuse `SwapLeg`, `LegTimeline`, `OperationTimeline`, the
  M7-homed `card-chrome.ts`, `Panel`/`Button`/`DetailRow`/`Note`/`StateChip`, and the
  shared `reconcileTo`/`waitSince`/`advance` reconciler helpers from `reconcile.ts`.
  Never build a card/badge/pill inline; never re-implement the table walk.
- **Network is configuration**: WNat/RewardManager/RNat/DistributionToDelegators
  addresses come from `@flare-kit/contracts` (reusing the existing `wrappedNative`
  snapshot for WNat); nothing hardcoded elsewhere. Testnet first, mainnet-capable.
- **Public values are constants, not env vars**: RPC URL, chain id, contract
  addresses, the proof-mirror URL are exported constants. The **only** secret is the
  signing key — never logged, never in `--json`/evidence/receipts.
- **Exact values render in the mono face** with tabular numerals, full precision,
  carrying asset symbol (WNat/C2FLR; bips; vote power; reward amounts).
- **Operations self-reconcile** on open (the delegate/balance read; the claim
  confirmation); no Resume button.
- **Real integration first**; `mock-delegation.ts`/`mock-rewards.ts` are written
  afterwards and copy observed behaviour, refusing anything they never observed.
- Gate: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`, shown with output.

### Harness mechanics (read before Task 0)

- **Never `cd` into a package** — the stage guard resolves the project root from the
  shell cwd and will block source writes. Use `pnpm --filter` from the repo root.
- **SPEC.md `## Files` manifest** (Task 0): every source file must be listed there
  before it is written. The section ends at the next `##`/`###` of any depth — insert
  only flat bullets, never a subheading.
- **Test lock**: each test file's mtime is compared to SPEC.md's; one SPEC.md write
  unlocks every test file once. Batch test-file creation behind the one Task-0 SPEC
  write; never touch SPEC.md just to unlock.
- **react-ui imports `@flare-kit/react` from dist** — a core/hook change needs
  `pnpm build` before react-ui (and any live script that imports core) sees it.
- **`applyTransition` silently drops its patch** on an illegal hop — every reconciler
  must **walk the `states.ts` table** via the shared `reconcileTo` (BFS `pathTo`),
  never jump states. Import `reconcileTo`/`waitSince`/`advance` from `reconcile.ts`;
  do not re-implement (the `bridge-states.ts`/`gasless-states.ts` precedent).
- **Signing keys**: `.secrets/live-run.json` holds the dev EVM key; the live script
  signs with `privateKeyToAccount(secrets.evm.privateKey)` and must pass the **local
  `Account` object** as `account` (a bare address string makes viem json-rpc-sign and
  the node rejects it — the M9 viem gotcha). Browser surfaces sign only via `onSubmit`
  and never hold a key. Keys never logged, never in `--json`/evidence.
- **No contract deploys this milestone.** The contracts exist; Task 1 resolves and
  snapshots their addresses from `FlareContractRegistry`
  (`0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`). Task 2's parity test asserts the
  snapshot against a live registry read.
- **The reward claim is carried, not forced.** M10 closes with
  `rewardsVerified:false` — the FTSO delegation-reward claim awaits an earned reward +
  its (unofficial-mirror) proof in a later epoch, then `live-delegation.mjs claim`
  claims it and flips the flag (the Firelight pattern). The close-out (Task 14)
  records this carry in `state.json`, exactly as M7's Firelight claim was carried.
- **state.json bump** at close (Task 14) via a JSON load/mutate/dump script — never
  hand-edit.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `packages/core/scripts/probe-delegation.mjs` | read-only resolve + account probe (dev, not shipped) | 1 |
| `packages/contracts/src/delegation.ts` | WNat/delegation registry (reuses `wrappedNative`), `delegationVerified` | 2 |
| `packages/contracts/src/delegation-abis.ts` | IWNat + IVPToken fragments | 2 |
| `packages/contracts/src/rewards.ts` | RewardManager/RNat/Distribution registry, `rewardsVerified`, `proofSource` | 2 |
| `packages/contracts/src/rewards-abis.ts` | RewardManager/RNat/Distribution/FlareSystemsManager fragments | 2 |
| `packages/core/src/delegation-adapter.ts` | balances/delegate/vote-power reads + wrap/delegate/undelegate call builders | 3 |
| `packages/core/src/delegation.ts` | intents → verified-gated plan → lifecycle; ≤2/Σ≤10000/mode invariants | 4 |
| `packages/core/src/delegation-states.ts` | `reconcileDelegation` (wrap→delegate spine, succeeded from read) | 4 |
| `packages/core/src/portfolio.ts` | flip `delegation` placeholder → real observed position; keep `stake` unbuilt | 4 |
| `packages/core/scripts/live-delegation.mjs` | live wrap→delegate→read→undelegate→unwrap (+ `claim` subcommand) | 5 |
| `packages/core/src/mock-delegation.ts` | the delegation mock, after the real path | 6 |
| `packages/core/src/rewards-adapter.ts` | the three claim reads + Merkle-proof assembly + call builders | 7 |
| `packages/core/src/rewards.ts` | intents → verified-gated plans → the three claim lifecycles | 7 |
| `packages/core/src/rewards-states.ts` | `reconcileClaim` (claim confirmation, distinct kinds) | 7 |
| `packages/core/src/mock-rewards.ts` | the rewards mock, after the real reads | 9 |
| `packages/react/src/use-delegation.ts`, `use-rewards.ts` | hooks over the two operations | 10 |
| `packages/react-ui/src/DelegationCard.tsx` (+ `delegation-card-state.ts`) | DEL surface | 11 |
| `packages/react-ui/src/ClaimCard.tsx` (+ `claim-card-state.ts`) | CLAIM surface (3 kinds) | 12 |
| `packages/react-ui/src/delegation.css` | `fk-delegation` / `fk-claim` CSS, values from tokens | 11–12 |
| `packages/react-ui/gallery/m10-delegation-sections.tsx`, `m10-claims-sections.tsx` | AC6 state matrix, both themes | 13 |

---

## Task 0: Declare M10 files in SPEC.md manifest

**Files:** Modify `SPEC.md` (`## Files` section only).

- [ ] **Step 1** Append every M10 source file (the packages files in the File Structure
  table above) to SPEC.md's `## Files` as flat bullets — no subheading (a `###` hides
  everything below it from the scope guard) — each with a one-line responsibility and
  its `M10-R#`. Include the two dev scripts (`probe-delegation.mjs`,
  `live-delegation.mjs`) so the guard admits them.
- [ ] **Step 2** Verify the `## Files` section still ends at the next `##`. This single
  write unlocks every M10 test file once — batch all test-file creation behind it.
- [ ] **Step 3** Checkpoint `chore: declare M10 delegation/rewards files in SPEC.md manifest`.

**Acceptance:** every file a later task creates is listed; no `###` inserted inside
`## Files`; no other section of SPEC.md touched.

---

## Task 1: Read-only **probe** — resolve + snapshot addresses, account state (no product code)

**Files:** Create `packages/core/scripts/probe-delegation.mjs` (dev script, not shipped);
produce `.thoughts/verification/2026-08-12-m10-probe.json`. **No product code.**

The M7/M8/M9-probe precedent: assume nothing until read. If native C2FLR is short for
the wrap+delegate round trip, **STOP and surface it to Abu** (a faucet trip is his
`! ...` call) rather than building on a path that cannot run.

- [ ] **Step 1** Against Coston2 (`https://coston2-api.flare.network/ext/C/rpc`), call
  `FlareContractRegistry.getAllContracts()` at `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`
  and extract the addresses for `WNat`, `RewardManager`, `FtsoRewardManager`, `RNat`,
  `DistributionToDelegators`, `FlareSystemsManager`, `ClaimSetupManager`. Record each
  name→address. (Expected from this session's grounding: WNat
  `0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273`, RewardManager
  `0xB4f43E342c5c77e6fe060c0481Fe313Ff2503454`, RNat
  `0x221D27529e7788B929E13533edc3b00ec1ac5e8A`, DistributionToDelegators
  `0xbd33bDFf04C357F7FC019E72D0504C24CF4Aa010` — assert they still resolve, do not assume.)
- [ ] **Step 2** Confirm the read shapes for the account
  `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9`: WNat `balanceOf`, `delegationModeOf`
  (expect 0=NOTSET), `delegatesOf` (expect empty), `votePowerOf` (expect 0);
  RewardManager `getCurrentRewardEpochId`, `getRewardEpochIdsWithClaimableRewards`,
  `getStateOfRewards(account)` (expect empty for the account); RNat `getCurrentMonth`,
  `getBalancesOf(account)` (expect zeros); DistributionToDelegators `getClaimableMonths`
  / claimable amount (expect legacy/empty). Record every raw value.
- [ ] **Step 3** Funding: the account's native **C2FLR** must cover a small wrap + a
  delegate + an undelegate + an unwrap (a few txs of gas; ~47 C2FLR was present at
  grounding — assert it still is). Record it and a `blockers` array (empty if green).
- [ ] **Step 4** Confirm the FTSO proof-mirror URL is reachable (a `HEAD`/`GET` on the
  documented Coston2 tuples base, `gitlab.com/timivesel/ftsov2-testnet-rewards`), and
  record whether the **current** claimable epoch has tuples — this justifies the
  `proofSource.official:false` flag and the "declared unavailable when absent" branch.
- [ ] **Step 5** Write the probe JSON: block number, every value above, the resolved
  addresses, and `blockers`. No key material. Checkpoint. If `blockers` is non-empty,
  **pause** and report the exact faucet/action to Abu.

**Acceptance:** all seven contracts resolve on Coston2; the account's blank-slate reads
recorded; native C2FLR sufficient for the round trip (or a blocker raised); the proof
mirror's reachability + current-epoch tuple presence recorded.

---

## Task 2: `@flare-kit/contracts` — delegation + rewards registries + ABIs

**Files:** Create `packages/contracts/src/delegation.ts`, `delegation-abis.ts`,
`rewards.ts`, `rewards-abis.ts`; Modify `packages/contracts/src/index.ts`; Modify
`packages/contracts/test/manifest-parity.test.ts`; Test
`packages/contracts/test/delegation.test.ts`, `packages/contracts/test/rewards.test.ts`.

**Interfaces — Produces:**
```ts
// delegation.ts
export interface DelegationDeployment {
  readonly network: FlareNetworkKey            // 'coston2'
  readonly wnat: `0x${string}`                 // === existing wrappedNative snapshot
  readonly nativeSymbol: 'C2FLR' | 'FLR'
  readonly wrappedSymbol: 'WC2FLR' | 'WFLR'
  readonly maxPercentDelegates: 2              // protocol cap (docs: one or two providers)
  readonly delegationVerified: boolean         // false until Task 5's live round trip
}
export const DELEGATION: Readonly<Record<FlareNetworkKey, DelegationDeployment | undefined>>
export function delegationFor(n: FlareNetworkKey): DelegationDeployment | undefined

// rewards.ts
export type ClaimKind = 'ftso-delegation' | 'rnat' | 'flaredrop'
export interface ProofSource { readonly url: string; readonly official: boolean }
export interface RewardsDeployment {
  readonly network: FlareNetworkKey
  readonly rewardManager: `0x${string}`        // RewardManager v2
  readonly ftsoRewardManager: `0x${string}`    // legacy, read fallback
  readonly flareSystemsManager: `0x${string}`  // rewardsHash + epoch timing
  readonly rnat: `0x${string}`
  readonly distribution: `0x${string}`         // DistributionToDelegators
  readonly ftsoProofSource: ProofSource        // { official:false } on coston2
  readonly flareDropEndedAt: '2026-01-30'
  readonly delegationRewardExpiryEpochs: 25    // docs; the actual boundary read on-chain
  readonly rewardsVerified: boolean            // false until a real claim (carried past M10)
}
export const REWARDS: Readonly<Record<FlareNetworkKey, RewardsDeployment | undefined>>
export function rewardsFor(n: FlareNetworkKey): RewardsDeployment | undefined
```
`delegation-abis.ts` produces `IWNAT_ABI` (`deposit` payable, `withdraw`, `balanceOf`)
and `IVPTOKEN_ABI` (`delegate`, `delegateExplicit`, `batchDelegate`, `undelegateAll`,
`undelegateAllExplicit`, `delegatesOf` → `(address[],uint256[],uint256 count,uint256 mode)`,
`votePowerOf`, `delegationModeOf`, `undelegatedVotePowerOf`). `rewards-abis.ts` produces
`REWARD_MANAGER_ABI` (`claim`, `getStateOfRewards`, `getRewardEpochIdsWithClaimableRewards`,
`getNextClaimableRewardEpochId`, `getRewardEpochIdToExpireNext`, `getCurrentRewardEpochId`,
struct `RewardClaimWithProof{bytes32[] merkleProof; RewardClaim body}` /
`RewardClaim{uint24 rewardEpochId; bytes20 beneficiary; uint120 amount; uint8 claimType}`),
`RNAT_ABI` (`getBalancesOf`→`(uint256 wNat,uint256 rNat,uint256 locked)`, `getCurrentMonth`,
`claimRewards`, `withdraw`, `withdrawAll`), `DISTRIBUTION_ABI` (`getClaimableMonths`,
`getClaimableAmountOf`, `claim`), and `FLARE_SYSTEMS_MANAGER_ABI` (`rewardsHash`). Fragments
only, each verified against the Task-1 reads, split to stay < 300 lines.

- [ ] **Step 1** Write `delegation.test.ts` + `rewards.test.ts`: `delegationFor('coston2')`
  returns `wnat === wrappedNative('coston2')` (reuse, not a second literal) and
  `delegationVerified === false`; `rewardsFor('coston2')` returns the Task-1 addresses,
  `rewardsVerified === false`, `ftsoProofSource.official === false`, `flareDropEndedAt ===
  '2026-01-30'`; no address literal appears outside these files (except the reused
  `wrappedNative`). Extend `manifest-parity.test.ts` to resolve `WNat`/`RewardManager`/
  `RNat`/`DistributionToDelegators` from `FlareContractRegistry` and assert they equal the
  snapshot.

```ts
// delegation.test.ts (excerpt)
import { delegationFor } from '../src/delegation.js'
import { wrappedNative } from '../src/addresses.js'
test('WNat is the reused wrappedNative snapshot, verified flag false', () => {
  const d = delegationFor('coston2')!
  expect(d.wnat).toBe(wrappedNative('coston2'))
  expect(d.delegationVerified).toBe(false)
  expect(d.maxPercentDelegates).toBe(2)
})
```
- [ ] **Step 2** Run `pnpm --filter @flare-kit/contracts test` — expect FAIL (missing modules).
- [ ] **Step 3** Write the four files from the Task-1 probe JSON; export from `index.ts`.
  RPC/URLs and the proof-mirror base are constants here. Keep each < 300 lines.
- [ ] **Step 4** Run the tests — expect PASS. Then `pnpm --filter @flare-kit/contracts build`.
  Run the extended `manifest-parity.test.ts` (it makes a live registry read) — expect PASS.
- [ ] **Step 5** Checkpoint `feat(contracts): M10 delegation + rewards registries + ABIs`.

**Acceptance:** WNat reuses `wrappedNative`; the four contract addresses match the live
registry (parity test); both verified flags false; `proofSource.official:false`; files < 300.

---

## Task 3: `@flare-kit/core` — `delegation-adapter.ts` (reads + call builders)

**Files:** Create `packages/core/src/delegation-adapter.ts`; Modify `packages/core/src/index.ts`;
Test `packages/core/test/delegation-adapter.test.ts`.

**Interfaces — Consumes:** `DelegationDeployment`, `IWNAT_ABI`, `IVPTOKEN_ABI` (Task 2);
`UnsignedCall` (existing core type used by bridge/gasless adapters).
**Produces:**
```ts
export type DelegationMode = 0 | 1 | 2         // NOTSET | PERCENTAGE | AMOUNT
export interface DelegationReads {
  nativeBalance: bigint
  wrappedBalance: bigint
  mode: DelegationMode
  delegates: { address: `0x${string}`; bips: number }[]   // from delegatesOf, zipped
  votePower: bigint
  undelegatedVotePower: bigint
}
export interface DelegationAdapter {
  read(account: `0x${string}`): Promise<DelegationReads>
  buildWrap(amount: bigint): UnsignedCall                  // WNat.deposit, value: amount
  buildUnwrap(amount: bigint): UnsignedCall                // WNat.withdraw(amount)
  buildDelegate(to: `0x${string}`, bips: number): UnsignedCall
  buildBatchDelegate(t: { to: `0x${string}`; bips: number }[]): UnsignedCall
  buildDelegateExplicit(to: `0x${string}`, amount: bigint): UnsignedCall
  buildUndelegateAll(): UnsignedCall
}
export function makeDelegationAdapter(client: PublicClient, deployment: DelegationDeployment): DelegationAdapter
```

**Behaviour:** `read` calls WNat `balanceOf`/`delegationModeOf`/`votePowerOf`/
`undelegatedVotePowerOf` and `delegatesOf` (zipping the `address[]`/`bips[]` positionally,
count-bounded), plus the native balance via `getBalance`. Absence/read failure is surfaced
by the caller as `unavailable` — never a confident zero. The `build*` methods return
`UnsignedCall`s only (no signing here).

- [ ] **Step 1** Write `delegation-adapter.test.ts` against a stubbed `PublicClient`
  (the mock-client pattern from `mock-bridge`/`mock-gasless`): `read` zips a two-delegate
  `delegatesOf` response into `[{address,bips}]` with `mode:1`; `buildWrap(n)` produces a
  `deposit` call with `value:n`; `buildBatchDelegate` encodes the arrays in order.

```ts
test('read zips delegatesOf positionally with mode', async () => {
  const client = stubClient({
    balanceOf: 5_000000n, delegationModeOf: 1n, votePowerOf: 5_000000n,
    undelegatedVotePowerOf: 0n,
    delegatesOf: [[PROVIDER_A, PROVIDER_B], [3000n, 7000n], 2n, 1n],
    getBalance: 47_000000000000000000n,
  })
  const r = await makeDelegationAdapter(client, DELEGATION.coston2!).read(ACCOUNT)
  expect(r.mode).toBe(1)
  expect(r.delegates).toEqual([{ address: PROVIDER_A, bips: 3000 }, { address: PROVIDER_B, bips: 7000 }])
  expect(r.wrappedBalance).toBe(5_000000n)
})
```
- [ ] **Step 2** Run `pnpm --filter @flare-kit/core test delegation-adapter` — expect FAIL.
- [ ] **Step 3** Implement `delegation-adapter.ts` (< 300 lines). Export from `index.ts`.
- [ ] **Step 4** Run — expect PASS.
- [ ] **Step 5** Checkpoint `feat(core): delegation adapter — reads + wrap/delegate call builders`.

**Acceptance:** `read` returns the six fields with `delegatesOf` zipped by position and
count; `build*` return `UnsignedCall`s with correct selectors/values; no signing in the adapter.

---

## Task 4: `@flare-kit/core` — `delegation.ts` (ops + invariants) + `delegation-states.ts` + portfolio flip

**Files:** Create `packages/core/src/delegation.ts`, `packages/core/src/delegation-states.ts`;
Modify `packages/core/src/portfolio.ts`, `packages/core/src/index.ts`; Test
`packages/core/test/delegation.test.ts`, `delegation-states.test.ts`, and extend
`packages/core/test/portfolio.test.ts`.

**Interfaces — Consumes:** `DelegationAdapter`, `DelegationReads` (Task 3);
`reconcileTo`/`waitSince`/`advance` from `reconcile.ts`; the canonical `OperationState`/
`OperationRecord`/`Result` core types.
**Produces:**
```ts
export type DelegationIntent =
  | { kind: 'wrap'; amount: bigint }
  | { kind: 'unwrap'; amount: bigint }
  | { kind: 'delegate'; targets: { to: `0x${string}`; bips: number }[] }        // percentage
  | { kind: 'delegate-explicit'; targets: { to: `0x${string}`; amount: bigint }[] }
  | { kind: 'undelegate' }
export type DelegationError =
  | { kind: 'not-verified' }
  | { kind: 'too-many-delegates'; max: 2 }
  | { kind: 'bips-over-100'; sum: number }
  | { kind: 'mode-conflict'; current: 'percentage' | 'amount' }   // must undelegate first
  | { kind: 'insufficient-wrapped'; have: bigint; need: bigint }
export interface DelegationPlan { steps: PlanStep[]; calls: UnsignedCall[]; intent: DelegationIntent }
export function buildDelegationPlan(
  adapter: DelegationAdapter, deployment: DelegationDeployment,
  account: `0x${string}`, intent: DelegationIntent, reads: DelegationReads,
): Result<DelegationPlan, DelegationError>
export function reconcileDelegation<I, Q, P>(
  record: OperationRecord<I, Q, P>, reads: DelegationReads, intent: DelegationIntent, now: number,
): OperationRecord<I, Q, P>
// portfolio.ts
export function delegationPosition(reads: DelegationReads | undefined): Position   // observed | unavailable
```

**Behaviour:** `buildDelegationPlan` gates on `deployment.delegationVerified` FIRST
(returns `{kind:'error',error:{kind:'not-verified'}}` before any read/sign), then enforces
the invariants **before** producing calls: ≤ 2 percentage delegates, Σ bips ≤ 10000, and
**mode-exclusivity** — a `delegate` while `reads.mode===2` (AMOUNT) or a `delegate-explicit`
while `reads.mode===1` (PERCENTAGE) returns `mode-conflict`, never a call that would
silently no-op. `reconcileDelegation` walks the canonical table via `reconcileTo`:
wrap/delegate submit → `awaiting_external`(actor `'flare'`) → **`succeeded` only when
`reads` reflects the intent** (the delegate present in `delegatesOf`, or the wrapped balance
moved). `delegationPosition` renders a real observed position (wrapped balance + delegatees +
vote power) or `unavailable` on a read failure — never a confident zero.

- [ ] **Step 1** Write `delegation.test.ts`: verified-gate (`delegationVerified:false` →
  `not-verified`, no calls); `too-many-delegates` for 3 targets; `bips-over-100` for
  Σ=10001; `mode-conflict` for `delegate` when `reads.mode===2`; a valid two-target
  percentage delegate produces a `batchDelegate` call. `delegation-states.test.ts`:
  submitted delegate → `awaiting_external`; `succeeded` only once `reads.delegates` contains
  the target; a still-empty `delegatesOf` keeps it `awaiting_external`, never `succeeded`.
  Extend `portfolio.test.ts`: `delegationPosition(undefined)` → `unavailable`;
  a populated `reads` → an observed position carrying wrapped balance + delegatees;
  the `stake` position type is still declared-unbuilt.

```ts
test('mode-exclusivity: percentage delegate refused in AMOUNT mode', () => {
  const reads = { ...BLANK, mode: 2 } as DelegationReads
  const r = buildDelegationPlan(adapter, VERIFIED_DEP, ACCOUNT,
    { kind: 'delegate', targets: [{ to: PROVIDER_A, bips: 10000 }] }, reads)
  expect(r).toEqual({ kind: 'error', error: { kind: 'mode-conflict', current: 'amount' } })
})
test('succeeded only from delegatesOf reflecting the intent', () => {
  let rec = submittedDelegateRecord(PROVIDER_A)
  rec = reconcileDelegation(rec, { ...BLANK, delegates: [] }, INTENT_A, NOW)
  expect(rec.state).toBe('awaiting_external')
  rec = reconcileDelegation(rec, { ...BLANK, delegates: [{ address: PROVIDER_A, bips: 10000 }], mode: 1 }, INTENT_A, NOW)
  expect(rec.state).toBe('succeeded')
})
```
- [ ] **Step 2** Run `pnpm --filter @flare-kit/core test delegation` — expect FAIL.
- [ ] **Step 3** Implement `delegation.ts`, `delegation-states.ts` (reuse `reconcileTo`;
  no new state id; each < 300 lines) and the `portfolio.ts` flip (replace the `delegation`
  `UNBUILT_POSITION_TYPES` entry with `delegationPosition`; leave `stake` unbuilt). Build core.
- [ ] **Step 4** Run — expect PASS (incl. the extended `portfolio.test.ts`).
- [ ] **Step 5** Checkpoint `feat(core): delegation ops (invariants) + lifecycle + portfolio position`.

**Acceptance:** the plan gates on verified first, enforces ≤2/Σ≤10000/mode-exclusivity;
`succeeded` only from the on-chain read; the portfolio `delegation` placeholder is a real
observed position (or `unavailable`), `stake` still declared-unbuilt.

---

## Task 5: **Live delegation verification** (AC1/AC2/AC3, gate for `delegationVerified`)

**Files:** Create `packages/core/scripts/live-delegation.mjs`; produce
`.thoughts/verification/2026-08-12-m10-delegation.md` +
`2026-08-12-coston2-live-delegation.json`. Flips `delegationVerified:true` in
`delegation.ts` after the confirmed on-chain read. **Signing needs Abu's go.**

**The run (the honest delegation proof) — sign with the local `Account` object:**
- [ ] **Phase A — wrap:** from the account's native C2FLR, `WNat.deposit({value: W})` for
  a small `W` (e.g. 5 C2FLR); poll WNat `balanceOf` until it reflects `W`; record the wrap tx
  + the balance move.
- [ ] **Phase B — delegate:** pick **one or two real Coston2 FTSO providers** (resolve a
  provider address from the registry/entity list at run time — record which); call
  `delegate(providerA, 10000)` (or `batchDelegate([A,B],[5000,5000])`); poll `delegatesOf`
  until it reflects the target(s); record `delegatesOf`, `votePowerOf`, `delegationModeOf`.
  Assert the op traversed `awaiting_external(flare) → succeeded`, `succeeded` only from the
  `delegatesOf` read.
- [ ] **Phase C — undelegate + unwrap (reversibility):** `undelegateAll()`; poll
  `delegatesOf` empty; `WNat.withdraw(W)`; poll native balance restored (± gas). Record both
  txs. (Optionally exercise `delegateExplicit` once to record the AMOUNT-mode read for the
  gallery/mock; then undelegate.)
- [ ] **Step: flip verification** — set `delegationVerified:true` for Coston2 in
  `delegation.ts`; re-run Task 2's delegation test (now asserts true). Never flip before the
  confirmed `delegatesOf` read.
- [ ] **Evidence** — write the JSON/MD: date, network, addresses, the wrap/delegate/
  undelegate/unwrap tx hashes, the `delegatesOf`/`votePowerOf`/`mode` reads, the balance
  moves, the lifecycle traversal. No key material. Gate + checkpoint
  `chore(core): live M10 delegation round trip on Coston2 (AC1/AC2/AC3)`.

**Acceptance (AC1/AC2/AC3):** a real wrap → delegate → undelegate → unwrap round trip lands;
`delegatesOf`/`votePowerOf` read back as the source of `succeeded`; mode-exclusivity honored;
`delegationVerified` flipped only after the confirmed read.

---

## Task 6: `mock-delegation.ts` — the mock, after the real path

**Files:** Create `packages/core/src/mock-delegation.ts`; Test `packages/core/test/mock-delegation.test.ts`.

- [ ] Reproduce the **observed** shapes from Task 5: the pre/post `delegatesOf` progression,
  the wrapped-balance move, the vote-power read, both delegation modes (percentage from
  Phase B, explicit from Phase C if run), and the undelegate-to-empty — copied from the
  evidence, not invented. Mock mode explicit/labelled.
- [ ] **Refuses the unobserved**: a network/provider/state the live run never produced throws
  a loud error, never a plausible zero; a `succeeded` delegation is never fabricated without
  an observed `delegatesOf` read (the M4/M6/M8 mock discipline).
- [ ] Test: mock parity with the recorded fixtures; an unobserved call throws. Gate +
  checkpoint `feat(core): mock-delegation, copies observed, refuses unobserved`.

---

## Task 7: `@flare-kit/core` — rewards (`rewards-adapter.ts` + `rewards.ts` + `rewards-states.ts`)

**Files:** Create the three files; Modify `packages/core/src/index.ts`; Test
`packages/core/test/rewards-adapter.test.ts`, `rewards.test.ts`, `rewards-states.test.ts`.

**Interfaces — Consumes:** `RewardsDeployment`, `ClaimKind`, `ProofSource`, the four ABIs
(Task 2); `reconcileTo`/`advance`; the canonical operation types.
**Produces:**
```ts
export interface FtsoReward { kind: 'ftso-delegation'; epoch: number; amount: bigint; claimType: 0 | 2; proof: `0x${string}`[]; expiresAtEpoch: number; source: ProofSource }
export interface RnatState { kind: 'rnat'; month: number; wNat: bigint; rnat: bigint; locked: bigint; hasProject: boolean }
export interface FlareDropState { kind: 'flaredrop'; claimableMonths: number[]; amount: bigint; concluded: true }
export interface RewardsReads {
  currentRewardEpoch: number
  claimableEpochs: number[]                     // gated on rewardsHash(epoch) != 0
  expireNextEpoch: number                        // getRewardEpochIdToExpireNext
  ftso: FtsoReward[]                             // [] for the blank-slate account
  rnat: RnatState
  flaredrop: FlareDropState
}
export interface RewardsAdapter {
  read(account: `0x${string}`): Promise<RewardsReads>
  fetchFtsoProof(epoch: number, account: `0x${string}`): Promise<{ amount: bigint; claimType: 0 | 2; proof: `0x${string}`[] } | null>  // null → declared unavailable
  buildFtsoClaim(account: `0x${string}`, recipient: `0x${string}`, rewards: FtsoReward[], wrap: boolean): UnsignedCall
  buildRnatClaim(projectIds: bigint[], month: number): UnsignedCall
  buildRnatWithdrawAll(wrap: boolean): UnsignedCall     // burns 50% of locked
  buildFlareDropClaim(account: `0x${string}`, recipient: `0x${string}`, month: number, wrap: boolean): UnsignedCall
}
export function makeRewardsAdapter(client: PublicClient, deployment: RewardsDeployment): RewardsAdapter
export type ClaimIntent = { kind: ClaimKind; /* kind-specific fields */ }
export type ClaimError = { kind: 'not-verified' } | { kind: 'no-entitlement' } | { kind: 'proof-unavailable'; epoch: number } | { kind: 'concluded' }
export function buildClaimPlan(adapter: RewardsAdapter, deployment: RewardsDeployment, intent: ClaimIntent, reads: RewardsReads): Result<{ steps: PlanStep[]; calls: UnsignedCall[]; kind: ClaimKind }, ClaimError>
export function reconcileClaim<I, Q, P>(record: OperationRecord<I, Q, P>, confirmed: boolean, now: number): OperationRecord<I, Q, P>
```

**Behaviour:** `read` computes `claimableEpochs` by intersecting
`getRewardEpochIdsWithClaimableRewards` with epochs whose `FlareSystemsManager.rewardsHash`
is non-zero (the signed-epoch gate), reads `getStateOfRewards` (empty for the account),
RNat `getBalancesOf`/`getCurrentMonth` (with `hasProject` derived from whether any project
assigned rewards), and Distribution `getClaimableMonths` (legacy). `fetchFtsoProof` GETs the
`deployment.ftsoProofSource.url` tuples for the epoch and extracts the account's Merkle proof
+ body — returning `null` (→ `proof-unavailable`, a **declared** state) when the epoch's
tuples are absent. `buildClaimPlan` gates on `rewardsVerified` first, then per kind:
`ftso-delegation` → `no-entitlement` when `reads.ftso` is empty (the current reality),
else assembles `RewardClaimWithProof[]`; `rnat` → `no-entitlement` when `!hasProject`;
`flaredrop` → `concluded` framing (claim only where `claimableMonths` non-empty). Each kind
carries **distinct** facts (R-REWARD-002); a generic claim state is never emitted.
`reconcileClaim` reaches `succeeded` only from a confirmed on-chain read.

- [ ] **Step 1** Write the three test files: `rewards-adapter.test.ts` (`read` gates
  `claimableEpochs` on `rewardsHash`; `fetchFtsoProof` returns `null` for an epoch with no
  tuples; `buildRnatWithdrawAll` encodes the 50%-burn call); `rewards.test.ts` (verified-gate;
  `no-entitlement` for empty FTSO / no rNat project; `proof-unavailable` when the proof
  fetch is `null`; three kinds never share a shape); `rewards-states.test.ts` (a submitted
  claim is `awaiting_external` until `confirmed`, then `succeeded`; never `succeeded` from
  submission).

```ts
test('claimableEpochs excludes epochs with zero rewardsHash', async () => {
  const client = stubClient({
    getRewardEpochIdsWithClaimableRewards: [5902n, 5929n],
    rewardsHash: (e) => (e === 5929n ? ZERO32 : NONZERO32),   // 5929 not yet signed
    getStateOfRewards: [], getCurrentRewardEpochId: 5930n, getRewardEpochIdToExpireNext: 5902n,
    rnatGetBalancesOf: [0n, 0n, 0n], distributionGetClaimableMonths: [],
  })
  const r = await makeRewardsAdapter(client, REWARDS.coston2!).read(ACCOUNT)
  expect(r.claimableEpochs).toEqual([5902])          // 5929 filtered: unsigned
  expect(r.ftso).toEqual([])
})
test('ftso claim refused when nothing earned', () => {
  const r = buildClaimPlan(adapter, VERIFIED_REWARDS, { kind: 'ftso-delegation' }, { ...READS, ftso: [] })
  expect(r).toEqual({ kind: 'error', error: { kind: 'no-entitlement' } })
})
```
- [ ] **Step 2** Run `pnpm --filter @flare-kit/core test rewards` — expect FAIL.
- [ ] **Step 3** Implement the three files (< 300 lines each; reuse `reconcileTo`). Export
  from `index.ts`. Build core.
- [ ] **Step 4** Run — expect PASS.
- [ ] **Step 5** Checkpoint `feat(core): rewards — three distinct claim kinds, proof-gated, verified-gated`.

**Acceptance:** `claimableEpochs` gated on `rewardsHash`; `fetchFtsoProof` → `null` yields a
declared `proof-unavailable`; the three kinds carry distinct facts; the rNat call is the
50%-burn `withdrawAll`; `succeeded` only from a confirmed read.

---

## Task 8: **Live rewards reads + self-reconciling claim wiring** (AC4/AC5)

**Files:** Extend `packages/core/scripts/live-delegation.mjs` with a `rewards` read pass and
a `claim` subcommand; produce `.thoughts/verification/2026-08-12-m10-rewards.md` +
append to the live JSON. **Reads are keyless; any claim needs Abu's go.**

- [ ] **Read pass (keyless):** against Coston2, run the rewards adapter `read` for the
  account and record: `currentRewardEpoch`, the `rewardsHash`-gated `claimableEpochs`,
  `getStateOfRewards` (expect empty), RNat `getBalancesOf`/month (expect zeros, `hasProject:false`),
  Distribution `getClaimableMonths` (legacy/empty). Confirm the reads render as honest empty /
  legacy states, not zeros dressed as amounts.
- [ ] **Proof-source pass:** for the current `claimableEpochs`, call `fetchFtsoProof` and
  record whether tuples exist; where absent, confirm the op path is `proof-unavailable`
  (declared), not a fabricated claim. Record the mirror URL + its `official:false`.
- [ ] **Self-reconciling claim wiring (carry):** because the account has earned nothing, the
  FTSO claim is **carried** — document that after the Task-5 delegation runs for ≥1 reward
  epoch, `node packages/core/scripts/live-delegation.mjs claim` will read the then-earned
  reward + its proof, submit `RewardManager.claim(...)`, confirm the on-chain balance delta,
  and flip `rewardsVerified:true`. Leave `rewardsVerified:false` now. (The M7 Firelight
  pattern; recorded in Task 14's state bump.)
- [ ] **Evidence** — JSON/MD: the read values, the proof-source reachability + label, the
  carry note. No key material. Gate + checkpoint `chore(core): live M10 rewards reads + claim carry (AC4/AC5)`.

**Acceptance (AC4/AC5):** the reward reads run live and render honest empty/legacy states;
the proof source is recorded as an unofficial mirror; the FTSO claim is wired as a carried,
self-reconciling op; `rewardsVerified` stays false until a real claim.

---

## Task 9: `mock-rewards.ts` — the mock, after the real reads

**Files:** Create `packages/core/src/mock-rewards.ts`; Test `packages/core/test/mock-rewards.test.ts`.

- [ ] Reproduce the **observed** read shapes from Task 8: the epoch/`claimableEpochs` values,
  the empty `getStateOfRewards`, the zero RNat balances with `hasProject:false`, the legacy
  Distribution months, and the proof-present vs proof-absent branches — copied from the
  evidence. Mock mode explicit/labelled; the `official:false` label preserved. For the
  *claimed* shape (not yet observed on-chain), the mock **refuses** rather than fabricating a
  `succeeded` claim.
- [ ] **Refuses the unobserved**: an account/epoch/state the live run never produced throws;
  a `Claimed` outcome is never fabricated without an observed confirmation read.
- [ ] Test: parity with fixtures; unobserved (incl. an un-run claim) throws. Gate + checkpoint
  `feat(core): mock-rewards, copies observed, refuses unobserved`.

---

## Task 10: `use-delegation` + `use-rewards` hooks

**Files:** Create `packages/react/src/use-delegation.ts`, `packages/react/src/use-rewards.ts`;
Modify `packages/react/src/index.ts`; Test `packages/react/test/use-delegation.test.ts`,
`use-rewards.test.ts`. (Run `pnpm build` after so react-ui sees them from dist.)

- [ ] `use-delegation` — thin hook over the delegation op (reads/plan need no key; the wrap +
  delegate calls go out via the host's `onSubmit`), mirroring `use-bridge`/`use-gasless`.
  Returns the plan builder, the submit path, and the live delegate/balance reads (polls the
  host-supplied `reconcile` on a host-controlled interval). Clears a transient read error
  (the M8 `useBridge` fix).
- [ ] `use-rewards` — thin hook over the three claim ops: the claimable reads, the proof fetch
  state (present / `proof-unavailable`), and the claim confirmation. Returns each kind's state
  independently; never collapses them.
- [ ] Tests reach each returned state from mocked core (incl. `proof-unavailable` and the
  empty/legacy reads). Gate + checkpoint `feat(react): use-delegation + use-rewards`.

---

## Task 11: `DelegationCard` (DEL-01/02/03) + `delegation.css`

**Files:** Create `packages/react-ui/src/DelegationCard.tsx`, `delegation-card-state.ts`,
`packages/react-ui/src/delegation.css`; Modify `packages/react-ui/src/index.ts` and
`styles.css` (add `@import './delegation.css';`); Test
`packages/react-ui/test/delegation-card.test.tsx`.

- [ ] **Composer (DEL-01):** `SwapLeg`-style wrap/unwrap (C2FLR ↔ WNat, amount); one or two
  provider rows with per-provider **bips** (percentage) or explicit amounts; the **mode**
  indicator; the ≤2 / Σ≤10000 / mode-exclusivity rules rendered honestly (a disallowed switch
  shows **"undelegate first,"** not a silent no-op).
- [ ] **State panel (DEL-02):** wrapped balance, delegatees + bips + mode, vote power — all in
  the **mono face** with full precision; an `unavailable` read is shown as unknown (`—`),
  never a confident zero-delegation.
- [ ] **Timeline (DEL-03):** wrap → delegate on the `OperationTimeline` spine; `submitted`
  (an `EvidenceChip` for the tx) → `awaiting_external`(flare) → `succeeded` (from the
  `delegatesOf` read).
- [ ] States {compose, no-balance, needs-wrap, wrapping, delegating, submitted, awaiting,
  succeeded, unavailable, too-many-delegates, bips-over-100, mode-conflict, not-verified}
  reachable from props; `unavailable` never rendered as `no-balance`. Pure split in
  `delegation-card-state.ts` (reuse `card-chrome.ts`). `delegation.css` values from tokens.
- [ ] Tests reach each state from props. Gate + checkpoint `feat(react-ui): DelegationCard + delegation.css`.

**Acceptance:** wrap/unwrap + delegate/undelegate + state panel render; invariants shown
honestly; exact values in the mono face; every state reachable from props; a mode conflict
reads "undelegate first."

---

## Task 12: `ClaimCard` (CLAIM-01/02/03) — three distinct kinds

**Files:** Create `packages/react-ui/src/ClaimCard.tsx`, `claim-card-state.ts`; Modify
`packages/react-ui/src/index.ts`; Test `packages/react-ui/test/claim-card.test.tsx`.
Reuse `delegation.css` (add `fk-claim` rules there).

- [ ] **FTSO delegation reward (CLAIM-01):** reward-type, epoch, **proof source with the
  unofficial-mirror label**, expiry (25-epoch, the boundary read on-chain), recipient, fee;
  a `proof-unavailable` epoch renders **declared unavailable**, not a claimable amount; a
  `no-entitlement` account renders the honest "nothing earned yet — delegate to earn" empty.
- [ ] **rNat (CLAIM-02):** the locked/unlocked/rNat split; `withdrawAll` shows the **50%
  early-exit burn** as real value destruction before signing; a `!hasProject` account renders
  the honest empty state.
- [ ] **FlareDrop (CLAIM-03):** the **concluded-2026-01-30** legacy archive; no "new drop"
  affordance; an empty `claimableMonths` reads "distribution concluded," and a real historical
  month (if any) is claimable.
- [ ] **One** shared component parameterised by kind; the three render **distinctly** (never a
  collapsed generic "claim"). States {ftso-claimable, ftso-proof-unavailable, ftso-empty,
  ftso-expiring, rnat-claimable, rnat-locked-burn-warning, rnat-empty, flaredrop-month,
  flaredrop-concluded, claiming, awaiting, succeeded, not-verified} reachable from props. Pure
  split in `claim-card-state.ts` (reuse `card-chrome.ts`, `LegTimeline`, `Details`).
- [ ] Tests reach each state from props (assert the three kinds carry different fields). Gate +
  checkpoint `feat(react-ui): ClaimCard — 3 distinct claim kinds`.

**Acceptance:** the three kinds render with distinct semantics; the FTSO proof source is
labelled unofficial; the rNat 50% burn is shown before signing; FlareDrop reads concluded;
empty states are honest, never fabricated amounts.

---

## Task 13: Gallery — every AC6 state, both themes, a11y-verified

**Files:** Create `packages/react-ui/gallery/m10-delegation-sections.tsx`,
`packages/react-ui/gallery/m10-claims-sections.tsx`; wire into the gallery index.

- [ ] Drive every state (Task 11/12 lists) from props at a fixed `MOCK_EPOCH` (not wall time —
  the gallery-clock rule) so in-flight/expiry states screenshot deterministically. Include the
  real observed `delegation` portfolio position.
- [ ] Run `window.__auditA11y()` — contrast composited with opacity, focus, target size (the
  M4-R12 method) — every M10-new (`fk-delegation`/`fk-claim`) element clean, both themes.
  Screenshot each state both themes into `.thoughts/verification/m10-screens/`.
- [ ] Checkpoint `test(react-ui): M10 delegation + claims gallery, all states, both themes, a11y-clean`.

---

## Task 14: Full gate, browser verify, evidence, review gate, close-out

- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm test` — paste output.
- [ ] Drive both cards in a **real browser** (not just jsdom) — screenshot and look (CLAUDE.md);
  confirm the delegation timeline advances (wrap → delegate → succeeded from the read), the
  mode-conflict reads "undelegate first," the ClaimCard renders the three kinds distinctly with
  the unofficial-proof label + the rNat 50% burn + the FlareDrop concluded notice, in both
  themes, and the portfolio shows the real observed delegation position.
- [ ] Write `.thoughts/verification/2026-08-12-m10-delegation-claims.md` — the full evidence:
  the live delegation round trip (wrap/delegate/undelegate/unwrap tx hashes + `delegatesOf`
  reads), the rewards read pass (honest empty/legacy), the proof-source label, the browser run,
  the a11y result, and the **carried FTSO reward claim** (rewardsVerified:false, awaits an
  earned reward + proof) with reasons.
- [ ] **Review gate** (CLAUDE.md): dispatch review subagents (correctness, honest-rendering/
  silent-failure, simplification) over the M10 diff; fix critical/important before close. Then
  the simplifier for unrequested config.
- [ ] Bump `state.json` via a JSON load/mutate/dump script (never hand-edit): add
  `completed_milestones.M10`, update `milestone`/`current_spec`/`next_authorized_action` (→ the
  next split milestone, **M11 Staking**, then M12 Governance), record the **two carries**
  (the FTSO delegation-reward delayed claim — `rewardsVerified:false` until earned+proof; and
  the still-open M7 Firelight claim / M8 cross-chain MINT), and append the M10
  `rules_that_are_not_obvious` the live runs taught (delegate ≠ delegation — `succeeded` from
  `delegatesOf`; percentage/explicit mode-exclusivity silent-no-op; the 25-epoch
  delegation-reward expiry vs non-expiring staking rewards; the Coston2 FTSO proof is an
  unofficial mirror; rNat `withdrawAll` burns 50% of locked; FlareDrop concluded 2026-01-30).

---

## Self-Review (against the spec)

- **Coverage:** M10-R1→Task 2; R2→Task 3/4; R3→Task 4; R4→Task 7; R5→Task 7/8;
  R6→Task 7/12; R7→Task 7/12; R8→Task 6/9; R9→Task 11; R10→Task 12; R11→Task 10;
  R12→Task 2 (network config) + 4 (portfolio flip) + 11/12 (reuse, <300). AC1/AC2/AC3→Task 5;
  AC4→Task 8 (+ honest lifecycle 4/7); AC5→Task 8/12; AC6→Task 13; AC7→Task 14. The probe
  (spec Verification step 1) → Task 1; the live delegation run → Task 5; the rewards reads +
  claim carry → Task 8. All covered.
- **Placeholder scan:** no TBD/TODO; every interface block carries concrete signatures; the
  IVPToken invariants, the `rewardsHash` epoch gate, the proof-fetch `null` branch, the 50%
  rNat burn, and the reconcilers are specified with test code.
- **Type consistency:** `DelegationDeployment`/`DelegationReads`/`DelegationAdapter`/
  `DelegationIntent`/`DelegationError`/`RewardsDeployment`/`RewardsReads`/`RewardsAdapter`/
  `FtsoReward`/`ClaimKind`/`ClaimError` names are used identically across Tasks 2–12;
  `UnsignedCall`/`PlanStep`/`Result`/`OperationRecord`/`Position`/`reconcileTo`/`waitSince`/
  `advance` reuse existing core types (not redefined); WNat is the reused `wrappedNative`
  snapshot, never a second literal.
- **Real-first honoured:** the probe (Task 1) + the live delegation round trip (Task 5) and
  the live rewards reads (Task 8) precede the mocks (Tasks 6/9); `delegationVerified` flips true
  only after a confirmed `delegatesOf` read; `rewardsVerified` stays false (carried) until a
  real claim — never flipped from a read.

## Execution Handoff

Inline execution (this session), real-first, checkpointing after each task. Time-bounded
points: **Task 1** may surface a funding blocker (account C2FLR for the wrap+delegate round
trip) that pauses the plan for an Abu `! ...` faucet action; **Task 5** runs the live
wrap/delegate/undelegate/unwrap and needs Abu's go to sign; **Task 8**'s reward reads are
keyless but the FTSO claim is **carried** (`rewardsVerified:false`) until a reward is earned
across ≥1 reward epoch and its proof lands — the milestone closes (Task 14) with the delegation
live-verified and the claim carried, exactly as M7 carried its Firelight claim. Delegation
(Tasks 3–6) and rewards (Tasks 7–9) are independent after the shared Task 0–2 setup and can be
built in either order.
