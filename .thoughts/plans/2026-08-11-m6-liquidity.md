# M6 Liquidity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship real add-liquidity and position/remove-liquidity to the live BlazeSwap V2 FXRP↔USD₮0 pool on Coston2, as two React cards over the existing operation lifecycle.

**Architecture:** Mirror the M5 swap stack exactly. `@flare-kit/contracts` extends `dex.ts` with the V2 `addLiquidity`/`removeLiquidity` router calls and an LP `totalSupply` read. `@flare-kit/core` gains `liquidity-quote.ts` (pool reads → ratio-locked add quote, per-asset remove quote, position, minimums) and `liquidity.ts` (immutable intents → unsigned plans with approve-when-short → canonical states, reusing the M1 engine in `operation.ts`/`states.ts`). The real path is verified live before the mock is written. `@flare-kit/react-ui` adds `AddLiquidityCard` and `PositionCard`, each a prop-driven surface with a pure state→chrome split, reusing `SwapLeg` and the `OperationTimeline` spine.

**Tech Stack:** TypeScript, pnpm workspaces + Turborepo, viem (peer), vitest, @testing-library/react, tsup (dual ESM/CJS). BlazeSwap V2 (Uniswap V2 router interface) on Coston2 (chainId 114).

## Global Constraints

*(Every task's requirements implicitly include this section. Values copied verbatim from CLAUDE.md, the M6 spec, and `.thoughts/state.json`.)*

- **Never fake protocol reality.** No invented reserves, LP amounts, tx hashes or outcomes. `submitted` is never rendered as `succeeded`. An unknown outcome is never rendered as failed. Unknown output renders `—`, never `0`.
- **Production source files stay under 300 lines.** Split before writing. Generated/vendored exempt.
- **Reuse, do not re-code.** One shared component per pattern; reuse `SwapLeg`, `OperationTimeline`, `Panel`, `Button`, `AssetLogo`, `EvidenceChip`, `DetailRow`, `Note`, `SegmentedTabs`.
- **Network is configuration.** Addresses come from `@flare-kit/contracts` only; never hardcoded elsewhere.
- **Public values are constants, not env vars.** The only secret is the signing key in `.secrets/`, never logged, printed in `--json`, or put in receipts/evidence.
- **Operations are non-blocking and self-reconciling.** Every operation persists state and evidence and reconciles against the chain on open. No Resume button. A position is read from the on-chain LP balance, not session state.
- **Exact values render in the mono face** with tabular numerals, carrying their asset and full precision. A number in the body face is a bug.
- **Real integration first; the mock is written afterwards and copies observed behaviour.** Mock mode is explicit and labelled, never a failure fallback, and refuses anything it never observed.
- **State only moves along the legal table in `states.ts`.** `applyTransition` silently drops its patch on an illegal hop — attach quote/plan/steps only on a legal hop, never by jumping states.

### Harness mechanics (read before Task 0)

- **Scope + test lock:** The stage guard reads SPEC.md's `## Files` section for the write-allowlist. Writing SPEC.md also unlocks each test file **once per SPEC.md write** (it compares each test file's mtime to SPEC.md's). So: declare every M6 file in SPEC.md **first** (Task 0), and **batch each test file's edits** so one file is written once per unlock. Never touch SPEC.md just to unlock.
- **The `## Files` section ends at the next heading of ANY depth.** Append the M6 block at the very end of the section, immediately before `## Integrations`. Do not introduce a `###` subheading inside it.
- **Never `cd` into `sources/`, `developer-hub/`, or any package directory** — the stage guard infers the project root from the shell cwd and will block source writes. Always run from the repo root with `pnpm --filter`.
- **`react-ui` imports `@flare-kit/core` and `@flare-kit/react` from `dist`.** A core change is invisible to react-ui tests until core is rebuilt: run `pnpm --filter @flare-kit/core build` before running react-ui tests that use new core exports.
- **No git.** This repo is not under version control, so there is no commit step. Each task's checkpoint is its **gate run** (`pnpm --filter <pkg> test`, plus `typecheck`/`build` where noted); milestone tasks additionally record evidence under `.thoughts/verification/`.

---

## File Structure

**Modify:**
- `SPEC.md` — append the M6 file manifest block (Task 0).
- `packages/contracts/src/dex.ts` — add router `addLiquidity`/`removeLiquidity`, ERC-20 `totalSupply` (Task 1).
- `packages/core/src/index.ts` — export the three new core modules (Task 5).
- `packages/react-ui/src/index.ts` — export the two cards (+ `PercentPills` if built) (Tasks 7–8).
- `packages/react-ui/gallery/Gallery.tsx` — wire in the M6 section list (Task 9).

**Create (core):**
- `packages/core/src/liquidity-quote.ts` — pool reads, add/remove quotes, position, minimums (Task 3).
- `packages/core/src/liquidity.ts` — intents, plans, operation states, typed errors (Task 4).
- `packages/core/src/mock-liquidity.ts` — the mock reader, after the real path (Task 6).
- `packages/core/scripts/probe-liquidity.mjs` — read-only reserves/supply probe for fixtures (Task 2).
- `packages/core/scripts/live-liquidity.mjs` — the real add→remove round trip (Task 5).

**Create (react-ui):**
- `packages/react-ui/src/AddLiquidityCard.tsx` + `packages/react-ui/src/add-liquidity-state.ts` (Task 7).
- `packages/react-ui/src/PositionCard.tsx` + `packages/react-ui/src/position-card-state.ts` (Task 8).
- `packages/react-ui/src/primitives/PercentPills.tsx` — only if not already covered (Task 8).
- `packages/react-ui/src/liquidity.css` (Task 7).
- `packages/react-ui/gallery/m6-liquidity-sections.tsx` (Task 9).

**Create (tests):** one per module under each package's `test/` (Tasks 1, 3, 4, 6, 7, 8).

**Create (evidence):** `.thoughts/verification/2026-08-11-m6-liquidity.md` (+ `.json`, `+ m6-screens/**`) (Tasks 5, 9, 10).

---

## Task 0: Declare M6 files in SPEC.md manifest

Unlocks the scope guard for the M6 paths and the per-file test lock. No test — the deliverable is the manifest edit.

**Files:**
- Modify: `SPEC.md` (append to the `## Files` section, immediately before `## Integrations`)

- [ ] **Step 1: Append the M6 manifest block**

Insert these lines at the end of the `## Files` section (just before the line `## Integrations`):

```markdown
- `packages/core/src/liquidity-quote.ts` — M6-R3. Pool reserves + LP supply → the
  ratio-locked add quote (paired amount, expected LP, pool share), the per-asset
  remove quote, and the live position read; minimums from slippage. Split from the
  operation at the quote/execute seam, as `swap-quote.ts` is.
- `packages/core/src/liquidity.ts` — M6-R2. The add/remove operation: immutable
  intents, the unsigned plans (approve-when-short + addLiquidity/removeLiquidity
  with amountAMin/amountBMin), and the canonical-state transitions, reusing the M1
  lifecycle engine.
- `packages/core/src/mock-liquidity.ts` — M6-R5. The mock reader, written after the
  real path, reproducing observed reserves, LP math and failure shapes.
- `packages/core/scripts/probe-liquidity.mjs` — a read-only probe (no key) of the
  FXRP/USD₮0 pool's reserves, token0 and LP totalSupply, recorded as the fixtures
  the quote tests use.
- `packages/core/scripts/live-liquidity.mjs` — the M6-AC1 evidence run: a real
  add→remove round trip on Coston2 through the kit, signing with a dev key.
- `packages/react-ui/src/AddLiquidityCard.tsx`, `packages/react-ui/src/add-liquidity-state.ts`
  — M6-R6. Two ratio-locked supply legs, pool share, the risk statement, and the
  approve(s)→add steps on the operation spine.
- `packages/react-ui/src/PositionCard.tsx`, `packages/react-ui/src/position-card-state.ts`
  — M6-R7. The live LP-balance position, current composition, partial removal by
  percent, and the LP-approve→remove steps on the spine.
- `packages/react-ui/src/primitives/PercentPills.tsx` — M6-R9, the partial-removal
  control, built once if no existing primitive covers it.
- `packages/react-ui/src/liquidity.css` — the liquidity surfaces' CSS, values from
  tokens.
- `.thoughts/verification/2026-08-11-m6-liquidity.md` — the M6 evidence: the live
  add→remove round trip's hashes, balances and explorer links, and the browser run.
```

- [ ] **Step 2: Verify the section boundary is intact**

Run: `grep -n "^## \|liquidity" SPEC.md | sed -n '1,40p'`
Expected: the new `- packages/core/src/liquidity*` lines appear under `## Files` and above `## Integrations`; no new `##`/`###` heading was introduced inside the section.

- [ ] **Step 3: Checkpoint**

Run: `pnpm --filter @flare-kit/contracts lint` (a cheap confirmation the tree still parses; no test yet). Not a git repo — the deliverable is the unlocked manifest.

---

## Task 1: Extend `dex.ts` with the V2 liquidity ABIs

**Files:**
- Modify: `packages/contracts/src/dex.ts` (`UNIV2_ROUTER_ABI`, `ERC20_ABI`)
- Test: `packages/contracts/test/dex-liquidity.test.ts`

**Interfaces:**
- Produces: `UNIV2_ROUTER_ABI` gains `addLiquidity` and `removeLiquidity`; `ERC20_ABI` gains `totalSupply`. The LP token is the pair address itself, so LP reads reuse `ERC20_ABI` (`allowance`/`approve`/`balanceOf`/`totalSupply`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/contracts/test/dex-liquidity.test.ts
import { describe, expect, it } from 'vitest'
import { ERC20_ABI, UNIV2_ROUTER_ABI } from '../src/dex.js'

const names = (abi: readonly { name?: string }[]) => abi.map((f) => f.name)

describe('dex liquidity ABIs (M6-R1)', () => {
  it('the router ABI can add and remove liquidity', () => {
    expect(names(UNIV2_ROUTER_ABI)).toContain('addLiquidity')
    expect(names(UNIV2_ROUTER_ABI)).toContain('removeLiquidity')
    const add = UNIV2_ROUTER_ABI.find((f) => f.name === 'addLiquidity')!
    expect(add.inputs.map((i) => i.name)).toEqual([
      'tokenA', 'tokenB', 'amountADesired', 'amountBDesired',
      'amountAMin', 'amountBMin', 'to', 'deadline',
    ])
    expect(add.outputs.map((o) => o.name)).toEqual(['amountA', 'amountB', 'liquidity'])
  })

  it('the ERC-20 ABI can read an LP total supply for the share math', () => {
    expect(names(ERC20_ABI)).toContain('totalSupply')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @flare-kit/contracts test dex-liquidity`
Expected: FAIL — `addLiquidity`/`totalSupply` not found.

- [ ] **Step 3: Add the ABI fragments**

In `packages/contracts/src/dex.ts`, add to `UNIV2_ROUTER_ABI` (after `swapExactTokensForTokens`):

```ts
  {
    name: 'addLiquidity',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'amountADesired', type: 'uint256' },
      { name: 'amountBDesired', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
      { name: 'liquidity', type: 'uint256' },
    ],
  },
  {
    name: 'removeLiquidity',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
    ],
  },
```

And add to `ERC20_ABI` (after `balanceOf`):

```ts
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @flare-kit/contracts test dex-liquidity && pnpm --filter @flare-kit/contracts typecheck`
Expected: PASS.

- [ ] **Step 5: Build contracts (core/react-ui consume it from dist)**

Run: `pnpm --filter @flare-kit/contracts build`
Expected: dual ESM/CJS emitted, no error.

---

## Task 2: Probe the live pool for fixtures (read-only, no key)

Real-first: measure reserves, `token0`, and LP `totalSupply` before writing quote math, so the quote tests assert against observed numbers. No funds and no key needed — reads only.

**Files:**
- Create: `packages/core/scripts/probe-liquidity.mjs`

**Interfaces:**
- Produces: the observed constants `{ reserve0, reserve1, token0, totalSupply, pair }` for FXRP/USD₮0 on Coston2, printed and appended to `.thoughts/verification/2026-08-11-m6-liquidity.json` under `probe`. Task 3 copies these into its test fixtures and Task 6 into the mock.

- [ ] **Step 1: Write the probe script**

```js
// packages/core/scripts/probe-liquidity.mjs
/**
 * Read-only probe of the FXRP/USD₮0 pool on Coston2 (M6, real-first). No key.
 * Prints reserves, token0 and LP totalSupply so the quote tests and the mock
 * carry measured numbers, never invented ones.
 *
 *   node scripts/probe-liquidity.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createPublicClient, http } from 'viem'
import { UNIV2_FACTORY_ABI, UNIV2_PAIR_ABI, ERC20_ABI, chainFor, dexFor } from '@flare-kit/contracts'

const ROOT = '/Users/abu/dev/hackathon/flare'
const CHAIN_ID = 114
const chain = chainFor(CHAIN_ID)
const dex = dexFor(CHAIN_ID)
const client = createPublicClient({ transport: http(chain.rpcUrl) })

const a = dex.tokens.FXRP.address
const b = dex.tokens.USDT0.address
const pair = await client.readContract({ address: dex.factory, abi: UNIV2_FACTORY_ABI, functionName: 'getPair', args: [a, b] })
const [reserve0, reserve1] = await client.readContract({ address: pair, abi: UNIV2_PAIR_ABI, functionName: 'getReserves' })
const token0 = await client.readContract({ address: pair, abi: UNIV2_PAIR_ABI, functionName: 'token0' })
const totalSupply = await client.readContract({ address: pair, abi: ERC20_ABI, functionName: 'totalSupply' })

const probe = {
  at: new Date().toISOString(),
  pair,
  token0,
  reserve0: reserve0.toString(),
  reserve1: reserve1.toString(),
  totalSupply: totalSupply.toString(),
  fxrp: a,
  usdt0: b,
}
console.log(JSON.stringify(probe, null, 2))
mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true })
writeFileSync(`${ROOT}/.thoughts/verification/2026-08-11-m6-probe.json`, JSON.stringify(probe, null, 2))
```

- [ ] **Step 2: Run it and record the numbers**

Run: `pnpm --filter @flare-kit/core build && node packages/core/scripts/probe-liquidity.mjs`
Expected: prints a JSON object with non-zero `reserve0`, `reserve1`, `totalSupply`, a real `pair` (`0xDD59…`), and `token0` equal to either the FXRP or USD₮0 address. **Copy these exact values into Task 3's fixtures and Task 6's mock constants.**

- [ ] **Step 3: Checkpoint**

The deliverable is `.thoughts/verification/2026-08-11-m6-probe.json` with observed values. No unit test for a dev script.

---

## Task 3: `liquidity-quote.ts` — the honest quote, position, and minimums

**Files:**
- Create: `packages/core/src/liquidity-quote.ts`
- Test: `packages/core/test/liquidity-quote.test.ts`

**Interfaces:**
- Consumes: `SwapReader` from `./swap-quote.js`; `readAllowance` from `./swap-quote.js`; `amount`, `Amount` from `./amounts.js`; `UNIV2_FACTORY_ABI`, `UNIV2_PAIR_ABI`, `ERC20_ABI`, `dexFor`, `DexToken`, `Address` from `@flare-kit/contracts`.
- Produces: `AddLiquidityQuote`, `AddLiquidityQuoteResult`, `RemoveLiquidityQuote`, `RemoveLiquidityQuoteResult`, `Position`, `PositionResult`; `quoteAddLiquidity`, `quoteRemoveLiquidity`, `readPosition`, `readLpAllowance`. Task 4 consumes `AddLiquidityQuote`/`RemoveLiquidityQuote` as its operation quote types.

- [ ] **Step 1: Write the failing test** *(replace the `RESERVE_*`/`TOTAL_SUPPLY` literals with Task 2's probed values before running — the values below are structural placeholders sized to the observed thin pool)*

```ts
// packages/core/test/liquidity-quote.test.ts
import { describe, expect, it } from 'vitest'
import { dexFor } from '@flare-kit/contracts'
import { formatExact } from '../src/amounts.js'
import { type SwapReader } from '../src/swap-quote.js'
import { quoteAddLiquidity, quoteRemoveLiquidity, readPosition, readLpAllowance } from '../src/liquidity-quote.js'

const COSTON2 = 114
const dex = dexFor(COSTON2)
const POOL = '0xDD598473f738df117Ee331bc07172481db60acBE'
// Observed on Coston2 (Task 2 probe). token0 is FXRP here.
const R_FXRP = 23_623775n
const R_USDT0 = 27_782833n
const TS = 25_000000n // LP totalSupply — replace with the probed value

function reader(handlers: Record<string, (args: readonly unknown[]) => unknown>): SwapReader {
  return {
    async readContract({ functionName, args = [] }) {
      const h = handlers[functionName]
      if (!h) throw new Error(`unexpected call ${functionName}`)
      return h(args)
    },
  }
}

const pool = {
  getPair: () => POOL,
  token0: () => dex.tokens.FXRP!.address,
  getReserves: () => [R_FXRP, R_USDT0, 0],
  totalSupply: () => TS,
}

describe('quoteAddLiquidity (M6-R3)', () => {
  const base = { reader: reader(pool), chainId: COSTON2, tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, now: 1_000 }

  it('pairs tokenB at the live reserve ratio and floors both by slippage', async () => {
    const r = await quoteAddLiquidity(base)
    expect(r.kind).toBe('quote')
    if (r.kind !== 'quote') return
    // amountB = 1_000000 * R_USDT0 / R_FXRP
    expect(r.quote.amountB.value).toBe((1_000000n * R_USDT0) / R_FXRP)
    // minA/minB are the 0.50% slippage floors that become amountAMin/amountBMin
    expect(r.quote.minA.value).toBe((1_000000n * 9950n) / 10000n)
    expect(r.quote.minB.value).toBe((r.quote.amountB.value * 9950n) / 10000n)
    // expected LP = min(amountA*ts/rA, amountB*ts/rB); pool share in bips > 0
    expect(r.quote.expectedLp).toBe((1_000000n * TS) / R_FXRP)
    expect(r.quote.poolShareBips).toBeGreaterThan(0)
  })

  it('reports no_pool — never a zero ratio — when the pair does not exist', async () => {
    const r = await quoteAddLiquidity({ ...base, reader: reader({ getPair: () => '0x0000000000000000000000000000000000000000' }) })
    expect(r.kind).toBe('no_pool')
    if (r.kind === 'no_pool') expect(r.message).toMatch(/no .*pool/i)
  })
})

describe('quoteRemoveLiquidity (M6-R3)', () => {
  it('returns each asset pro-rata to the LP burned, floored by slippage', async () => {
    const r = await quoteRemoveLiquidity({ reader: reader(pool), chainId: COSTON2, tokenAKey: 'FXRP', tokenBKey: 'USDT0', liquidity: TS / 10n, slippageBips: 100, now: 1 })
    expect(r.kind).toBe('quote')
    if (r.kind !== 'quote') return
    expect(r.quote.amountA.value).toBe(((TS / 10n) * R_FXRP) / TS)
    expect(r.quote.amountB.value).toBe(((TS / 10n) * R_USDT0) / TS)
    expect(r.quote.minA.value).toBe((r.quote.amountA.value * 9900n) / 10000n)
  })
})

describe('readPosition (M6-R7)', () => {
  it('reads the on-chain LP balance and its current composition', async () => {
    const owner = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9'
    const r = await readPosition({ reader: reader({ ...pool, balanceOf: () => TS / 4n }), chainId: COSTON2, tokenAKey: 'FXRP', tokenBKey: 'USDT0', owner })
    expect(r.kind).toBe('position')
    if (r.kind !== 'position') return
    expect(r.position.lpBalance).toBe(TS / 4n)
    expect(r.position.amountA.value).toBe(((TS / 4n) * R_FXRP) / TS)
    expect(formatExact(r.position.amountA)).toMatch(/FXRP$/)
  })

  it('reports no_position when the owner holds no LP', async () => {
    const r = await readPosition({ reader: reader({ ...pool, balanceOf: () => 0n }), chainId: COSTON2, tokenAKey: 'FXRP', tokenBKey: 'USDT0', owner: '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' })
    expect(r.kind).toBe('no_position')
  })
})

describe('readLpAllowance (M6-R4)', () => {
  it('reads what the LP token has granted the router', async () => {
    const value = await readLpAllowance(reader({ ...pool, allowance: () => 7n }), COSTON2, 'FXRP', 'USDT0', '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9')
    expect(value).toBe(7n)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @flare-kit/core test liquidity-quote`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `liquidity-quote.ts`**

```ts
// packages/core/src/liquidity-quote.ts
import {
  ERC20_ABI,
  UNIV2_FACTORY_ABI,
  UNIV2_PAIR_ABI,
  type Address,
  type DexToken,
  dexFor,
} from '@flare-kit/contracts'
import { type Amount, amount } from './amounts.js'
import type { SwapReader } from './swap-quote.js'

/**
 * The honest liquidity quote (M6-R3). Adding is ratio-locked: the paired amount
 * is read from the live reserves so a supply never leaves a silent excess, and
 * the expected LP is the pool's own mint formula, never a guess. Removing returns
 * each asset pro-rata to the LP burned. Fees are embedded in the reserves, so a
 * position's value change IS its share of a grown pool — there is no claimable
 * fee to invent. A pair with no pool is a first-class `no_pool`, never a zero.
 */

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export interface AddLiquidityQuote {
  readonly tokenA: DexToken
  readonly tokenB: DexToken
  readonly amountA: Amount
  /** The matching amount of tokenB at the live reserve ratio. */
  readonly amountB: Amount
  readonly minA: Amount
  readonly minB: Amount
  /** LP tokens the pool would mint for this supply. */
  readonly expectedLp: bigint
  /** The resulting share of the pool, in basis points of the post-mint supply. */
  readonly poolShareBips: number
  readonly slippageBips: number
  readonly pair: Address
  readonly observedAt: number
}

export interface RemoveLiquidityQuote {
  readonly tokenA: DexToken
  readonly tokenB: DexToken
  readonly liquidity: bigint
  readonly amountA: Amount
  readonly amountB: Amount
  readonly minA: Amount
  readonly minB: Amount
  readonly slippageBips: number
  readonly pair: Address
  readonly observedAt: number
}

export interface Position {
  readonly tokenA: DexToken
  readonly tokenB: DexToken
  readonly lpBalance: bigint
  readonly amountA: Amount
  readonly amountB: Amount
  readonly poolShareBips: number
  readonly pair: Address
}

export type AddLiquidityQuoteResult =
  | { readonly kind: 'quote'; readonly quote: AddLiquidityQuote }
  | { readonly kind: 'no_pool'; readonly message: string }
  | { readonly kind: 'unavailable'; readonly reason: string }

export type RemoveLiquidityQuoteResult =
  | { readonly kind: 'quote'; readonly quote: RemoveLiquidityQuote }
  | { readonly kind: 'no_pool'; readonly message: string }
  | { readonly kind: 'unavailable'; readonly reason: string }

export type PositionResult =
  | { readonly kind: 'position'; readonly position: Position }
  | { readonly kind: 'no_position'; readonly message: string }
  | { readonly kind: 'unavailable'; readonly reason: string }

interface PoolReading {
  readonly pair: Address
  /** Reserves oriented so `reserveA` is tokenA's. */
  readonly reserveA: bigint
  readonly reserveB: bigint
  readonly totalSupply: bigint
}

interface PoolInput {
  readonly reader: SwapReader
  readonly chainId: number
  readonly tokenAKey: string
  readonly tokenBKey: string
}

const bi = (v: unknown): bigint => (typeof v === 'bigint' ? v : BigInt(v as never))

/** Reads the pool once and orients its reserves to (tokenA, tokenB). `null` = no pool. */
async function readPool(input: PoolInput): Promise<PoolReading | 'no_pool' | { unavailable: string }> {
  const dex = dexFor(input.chainId)
  const a = dex.tokens[input.tokenAKey]
  const b = dex.tokens[input.tokenBKey]
  if (!a || !b) return { unavailable: `No ${!a ? input.tokenAKey : input.tokenBKey} on this network.` }
  let pair: unknown
  try {
    pair = await input.reader.readContract({ address: dex.factory, abi: UNIV2_FACTORY_ABI, functionName: 'getPair', args: [a.address, b.address] })
  } catch (error) {
    return { unavailable: reasonOf(error, 'Could not reach the factory') }
  }
  if (typeof pair !== 'string' || pair === ZERO_ADDRESS) return 'no_pool'
  try {
    const [reserves, token0, totalSupply] = await Promise.all([
      input.reader.readContract({ address: pair as Address, abi: UNIV2_PAIR_ABI, functionName: 'getReserves' }),
      input.reader.readContract({ address: pair as Address, abi: UNIV2_PAIR_ABI, functionName: 'token0' }),
      input.reader.readContract({ address: pair as Address, abi: ERC20_ABI, functionName: 'totalSupply' }),
    ])
    const [r0, r1] = reserves as [unknown, unknown, unknown]
    const aIsToken0 = String(token0).toLowerCase() === a.address.toLowerCase()
    return {
      pair: pair as Address,
      reserveA: aIsToken0 ? bi(r0) : bi(r1),
      reserveB: aIsToken0 ? bi(r1) : bi(r0),
      totalSupply: bi(totalSupply),
    }
  } catch (error) {
    return { unavailable: reasonOf(error, 'Could not read the pool') }
  }
}

const floor = (v: bigint, slippageBips: number): bigint => (v * BigInt(10_000 - slippageBips)) / 10_000n

export async function quoteAddLiquidity(input: PoolInput & { amountADesired: bigint; slippageBips: number; now: number }): Promise<AddLiquidityQuoteResult> {
  const dex = dexFor(input.chainId)
  const a = dex.tokens[input.tokenAKey]!
  const b = dex.tokens[input.tokenBKey]!
  if (input.amountADesired <= 0n) return { kind: 'unavailable', reason: 'Enter an amount to supply.' }
  const pool = await readPool(input)
  if (pool === 'no_pool') return { kind: 'no_pool', message: `No ${a.symbol} / ${b.symbol} pool exists on this network yet.` }
  if ('unavailable' in pool) return { kind: 'unavailable', reason: pool.unavailable }
  if (pool.reserveA <= 0n || pool.totalSupply <= 0n) return { kind: 'no_pool', message: `The ${a.symbol} / ${b.symbol} pool holds no liquidity to price against.` }

  const amountB = (input.amountADesired * pool.reserveB) / pool.reserveA
  const lpFromA = (input.amountADesired * pool.totalSupply) / pool.reserveA
  const lpFromB = (amountB * pool.totalSupply) / pool.reserveB
  const expectedLp = lpFromA < lpFromB ? lpFromA : lpFromB
  const denom = pool.totalSupply + expectedLp
  const poolShareBips = denom > 0n ? Number((expectedLp * 10_000n) / denom) : 0
  return {
    kind: 'quote',
    quote: {
      tokenA: a,
      tokenB: b,
      amountA: amount(input.amountADesired, a.decimals, a.symbol),
      amountB: amount(amountB, b.decimals, b.symbol),
      minA: amount(floor(input.amountADesired, input.slippageBips), a.decimals, a.symbol),
      minB: amount(floor(amountB, input.slippageBips), b.decimals, b.symbol),
      expectedLp,
      poolShareBips,
      slippageBips: input.slippageBips,
      pair: pool.pair,
      observedAt: input.now,
    },
  }
}

export async function quoteRemoveLiquidity(input: PoolInput & { liquidity: bigint; slippageBips: number; now: number }): Promise<RemoveLiquidityQuoteResult> {
  const dex = dexFor(input.chainId)
  const a = dex.tokens[input.tokenAKey]!
  const b = dex.tokens[input.tokenBKey]!
  if (input.liquidity <= 0n) return { kind: 'unavailable', reason: 'Choose how much to withdraw.' }
  const pool = await readPool(input)
  if (pool === 'no_pool') return { kind: 'no_pool', message: `No ${a.symbol} / ${b.symbol} pool exists on this network yet.` }
  if ('unavailable' in pool) return { kind: 'unavailable', reason: pool.unavailable }
  if (pool.totalSupply <= 0n) return { kind: 'no_pool', message: `The ${a.symbol} / ${b.symbol} pool holds no liquidity.` }

  const outA = (input.liquidity * pool.reserveA) / pool.totalSupply
  const outB = (input.liquidity * pool.reserveB) / pool.totalSupply
  return {
    kind: 'quote',
    quote: {
      tokenA: a,
      tokenB: b,
      liquidity: input.liquidity,
      amountA: amount(outA, a.decimals, a.symbol),
      amountB: amount(outB, b.decimals, b.symbol),
      minA: amount(floor(outA, input.slippageBips), a.decimals, a.symbol),
      minB: amount(floor(outB, input.slippageBips), b.decimals, b.symbol),
      slippageBips: input.slippageBips,
      pair: pool.pair,
      observedAt: input.now,
    },
  }
}

export async function readPosition(input: PoolInput & { owner: Address }): Promise<PositionResult> {
  const dex = dexFor(input.chainId)
  const a = dex.tokens[input.tokenAKey]!
  const b = dex.tokens[input.tokenBKey]!
  const pool = await readPool(input)
  if (pool === 'no_pool') return { kind: 'no_position', message: `No ${a.symbol} / ${b.symbol} pool exists on this network yet.` }
  if ('unavailable' in pool) return { kind: 'unavailable', reason: pool.unavailable }
  let lp: unknown
  try {
    lp = await input.reader.readContract({ address: pool.pair, abi: ERC20_ABI, functionName: 'balanceOf', args: [input.owner] })
  } catch (error) {
    return { kind: 'unavailable', reason: reasonOf(error, 'Could not read the LP balance') }
  }
  const lpBalance = bi(lp)
  if (lpBalance <= 0n) return { kind: 'no_position', message: `You hold no ${a.symbol} / ${b.symbol} liquidity.` }
  const denom = pool.totalSupply > 0n ? pool.totalSupply : 1n
  return {
    kind: 'position',
    position: {
      tokenA: a,
      tokenB: b,
      lpBalance,
      amountA: amount((lpBalance * pool.reserveA) / denom, a.decimals, a.symbol),
      amountB: amount((lpBalance * pool.reserveB) / denom, b.decimals, b.symbol),
      poolShareBips: Number((lpBalance * 10_000n) / denom),
      pair: pool.pair,
    },
  }
}

/** The LP token's allowance to the router — the remove plan needs an approve when it is short. */
export async function readLpAllowance(reader: SwapReader, chainId: number, tokenAKey: string, tokenBKey: string, owner: Address): Promise<bigint> {
  const dex = dexFor(chainId)
  const a = dex.tokens[tokenAKey]
  const b = dex.tokens[tokenBKey]
  if (!a || !b) throw new Error('Unknown token on this network.')
  const pair = await reader.readContract({ address: dex.factory, abi: UNIV2_FACTORY_ABI, functionName: 'getPair', args: [a.address, b.address] })
  if (typeof pair !== 'string' || pair === ZERO_ADDRESS) throw new Error('No pool to withdraw from.')
  const value = await reader.readContract({ address: pair as Address, abi: ERC20_ABI, functionName: 'allowance', args: [owner, dex.router] })
  return bi(value)
}

function reasonOf(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > 0 ? `${fallback}: ${message.slice(0, 120)}` : fallback
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @flare-kit/core test liquidity-quote && pnpm --filter @flare-kit/core typecheck`
Expected: PASS. If the file nears 300 lines, it is already split at the quote seam — do not split further.

- [ ] **Step 5: Checkpoint** — gate green for the module; no commit (not a git repo).

---

## Task 4: `liquidity.ts` — intents, plans, operation states

**Files:**
- Create: `packages/core/src/liquidity.ts`
- Test: `packages/core/test/liquidity.test.ts`

**Interfaces:**
- Consumes: `OperationRecord`, `OperationStep`, `TransitionResult`, `applyTransition`, `createOperation` from `./operation.js`; `ApproveStep` from `./swap.js`; `AddLiquidityQuote`, `RemoveLiquidityQuote`, `AddLiquidityQuoteResult`, `RemoveLiquidityQuoteResult` from `./liquidity-quote.js`; `Address`, `DexRegistry`, `dexFor` from `@flare-kit/contracts`.
- Produces: `AddLiquidityIntent`, `RemoveLiquidityIntent`, `AddLiquidityPlan`, `RemoveLiquidityPlan`, `AddLiquidityOperation`, `RemoveLiquidityOperation`; `createAddLiquidity`, `createRemoveLiquidity`, `buildAddPlan`, `buildRemovePlan`, `startQuoting` (re-export), `applyAddQuote`, `applyRemoveQuote`. Tasks 7–8 consume the operations + plans; Task 5 consumes the plan builders.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/liquidity.test.ts
import { describe, expect, it } from 'vitest'
import { dexFor } from '@flare-kit/contracts'
import { amount } from '../src/amounts.js'
import { buildAddPlan, buildRemovePlan, createAddLiquidity, applyAddQuote, startQuoting } from '../src/liquidity.js'
import type { AddLiquidityQuote, RemoveLiquidityQuote } from '../src/liquidity-quote.js'

const COSTON2 = 114
const dex = dexFor(COSTON2)
const RECIP = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as const
const FXRP = dex.tokens.FXRP!
const USDT0 = dex.tokens.USDT0!

const addQuote: AddLiquidityQuote = {
  tokenA: FXRP, tokenB: USDT0,
  amountA: amount(1_000000n, 6, 'FXRP'),
  amountB: amount(1_176000n, 6, 'USD₮0'),
  minA: amount(995000n, 6, 'FXRP'),
  minB: amount(1_170120n, 6, 'USD₮0'),
  expectedLp: 500000n, poolShareBips: 40, slippageBips: 50,
  pair: '0xDD598473f738df117Ee331bc07172481db60acBE', observedAt: 1000,
}

describe('buildAddPlan (M6-R4)', () => {
  const intent = { tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, recipient: RECIP, deadline: 2200 }

  it('approves each token only when its allowance is short, and never folds them into the add', () => {
    const plan = buildAddPlan(intent, addQuote, 0n, 0n, dex)
    expect(plan.approveA?.amount).toBe(1_000000n)
    expect(plan.approveB?.amount).toBe(1_176000n)
    expect(plan.add.functionName).toBe('addLiquidity')
    expect(plan.add.amountAMin).toBe(995000n)
    expect(plan.add.amountBMin).toBe(1_170120n)
  })

  it('omits an approval that is already covered', () => {
    const plan = buildAddPlan(intent, addQuote, 10n ** 30n, 0n, dex)
    expect(plan.approveA).toBeUndefined()
    expect(plan.approveB).toBeDefined()
  })
})

describe('applyAddQuote (M6-R2)', () => {
  it('goes to awaiting_approval with the plan when an allowance is short, ready when not', () => {
    const intent = { tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, recipient: RECIP, deadline: 2200 }
    let op = createAddLiquidity({ chainId: COSTON2, intent, now: 1000, id: 'op_add' })
    op = startQuoting(op, 1000).record
    const short = applyAddQuote(op, { result: { kind: 'quote', quote: addQuote }, allowanceA: 0n, allowanceB: 0n, now: 1000 }).record
    expect(short.state).toBe('awaiting_approval')
    expect(short.plan?.approveA).toBeDefined()
    let op2 = createAddLiquidity({ chainId: COSTON2, intent, now: 1000, id: 'op_add2' })
    op2 = startQuoting(op2, 1000).record
    const ready = applyAddQuote(op2, { result: { kind: 'quote', quote: addQuote }, allowanceA: 10n ** 30n, allowanceB: 10n ** 30n, now: 1000 }).record
    expect(ready.state).toBe('ready')
  })

  it('falls back to awaiting_input on a no_pool reading — no plan, no invented price', () => {
    const intent = { tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, recipient: RECIP, deadline: 2200 }
    let op = createAddLiquidity({ chainId: COSTON2, intent, now: 1000, id: 'op_add3' })
    op = startQuoting(op, 1000).record
    const out = applyAddQuote(op, { result: { kind: 'no_pool', message: 'no pool' }, allowanceA: 0n, allowanceB: 0n, now: 1000 }).record
    expect(out.state).toBe('awaiting_input')
    expect(out.plan).toBeUndefined()
  })
})

describe('buildRemovePlan (M6-R4)', () => {
  it('approves the LP token only when short and sets both minimums', () => {
    const removeQuote: RemoveLiquidityQuote = {
      tokenA: FXRP, tokenB: USDT0, liquidity: 250000n,
      amountA: amount(590000n, 6, 'FXRP'), amountB: amount(694000n, 6, 'USD₮0'),
      minA: amount(584100n, 6, 'FXRP'), minB: amount(687060n, 6, 'USD₮0'),
      slippageBips: 100, pair: '0xDD598473f738df117Ee331bc07172481db60acBE', observedAt: 1,
    }
    const intent = { tokenAKey: 'FXRP', tokenBKey: 'USDT0', liquidity: 250000n, slippageBips: 100, recipient: RECIP, deadline: 2200 }
    const plan = buildRemovePlan(intent, removeQuote, 0n, dex)
    expect(plan.approveLp?.amount).toBe(250000n)
    expect(plan.remove.functionName).toBe('removeLiquidity')
    expect(plan.remove.amountAMin).toBe(584100n)
    expect(plan.remove.liquidity).toBe(250000n)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @flare-kit/core test liquidity.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `liquidity.ts`**

```ts
// packages/core/src/liquidity.ts
import { type Address, type DexRegistry, dexFor } from '@flare-kit/contracts'
import {
  type OperationRecord,
  type OperationStep,
  type TransitionResult,
  applyTransition,
  createOperation,
} from './operation.js'
import type { ApproveStep } from './swap.js'
import type {
  AddLiquidityQuote,
  AddLiquidityQuoteResult,
  RemoveLiquidityQuote,
  RemoveLiquidityQuoteResult,
} from './liquidity-quote.js'

/**
 * The add/remove liquidity operation (M6-R2). It reuses the M1 lifecycle engine:
 * an immutable intent, a re-quotable quote, an unsigned plan and the canonical
 * states. Adding may need up to two approvals (both tokens) and removing needs the
 * LP-token approval — each appears exactly when its allowance is short and is never
 * folded into the addLiquidity/removeLiquidity call. amountAMin/amountBMin are the
 * quote's slippage floors, enforced on chain: a ratio that drifts past them reverts
 * and is rendered as slippage-exceeded, not a kit failure. State only ever moves
 * along the legal table in states.ts (applyTransition drops a patch on an illegal
 * hop, so quote+plan attach on the one legal hop out of `quoting`).
 */

export interface AddLiquidityIntent {
  readonly tokenAKey: string
  readonly tokenBKey: string
  /** Raw units of tokenA the provider wants to supply. tokenB is paired at ratio. */
  readonly amountADesired: bigint
  readonly slippageBips: number
  readonly recipient: Address
  readonly deadline: number
}

export interface RemoveLiquidityIntent {
  readonly tokenAKey: string
  readonly tokenBKey: string
  /** Absolute LP-token amount to burn. A percent affordance in the UI resolves to this. */
  readonly liquidity: bigint
  readonly slippageBips: number
  readonly recipient: Address
  readonly deadline: number
}

export interface AddLiquidityCall {
  readonly functionName: 'addLiquidity'
  readonly tokenA: Address
  readonly tokenB: Address
  readonly amountADesired: bigint
  readonly amountBDesired: bigint
  readonly amountAMin: bigint
  readonly amountBMin: bigint
  readonly to: Address
  readonly deadline: bigint
}

export interface RemoveLiquidityCall {
  readonly functionName: 'removeLiquidity'
  readonly tokenA: Address
  readonly tokenB: Address
  readonly liquidity: bigint
  readonly amountAMin: bigint
  readonly amountBMin: bigint
  readonly to: Address
  readonly deadline: bigint
}

export interface AddLiquidityPlan {
  readonly router: Address
  readonly approveA?: ApproveStep
  readonly approveB?: ApproveStep
  readonly add: AddLiquidityCall
}

export interface RemoveLiquidityPlan {
  readonly router: Address
  readonly approveLp?: ApproveStep
  readonly remove: RemoveLiquidityCall
}

export type AddLiquidityOperation = OperationRecord<AddLiquidityIntent, AddLiquidityQuote, AddLiquidityPlan>
export type RemoveLiquidityOperation = OperationRecord<RemoveLiquidityIntent, RemoveLiquidityQuote, RemoveLiquidityPlan>

export { startQuoting } from './swap.js'

export function createAddLiquidity(input: { chainId: number; intent: AddLiquidityIntent; now: number; id?: string }): AddLiquidityOperation {
  return createOperation<AddLiquidityIntent, AddLiquidityQuote, AddLiquidityPlan>({
    capability: 'add_liquidity',
    network: input.chainId,
    intent: input.intent,
    now: input.now,
    ...(input.id ? { id: input.id } : {}),
  })
}

export function createRemoveLiquidity(input: { chainId: number; intent: RemoveLiquidityIntent; now: number; id?: string }): RemoveLiquidityOperation {
  return createOperation<RemoveLiquidityIntent, RemoveLiquidityQuote, RemoveLiquidityPlan>({
    capability: 'remove_liquidity',
    network: input.chainId,
    intent: input.intent,
    now: input.now,
    ...(input.id ? { id: input.id } : {}),
  })
}

const approve = (token: Address, spender: Address, amount: bigint): ApproveStep => ({ token, spender, amount })

/** The unsigned add plan. An approve appears iff that token's allowance is short. */
export function buildAddPlan(intent: AddLiquidityIntent, quote: AddLiquidityQuote, allowanceA: bigint, allowanceB: bigint, dex: DexRegistry): AddLiquidityPlan {
  const needA = allowanceA < intent.amountADesired
  const needB = allowanceB < quote.amountB.value
  return {
    router: dex.router,
    ...(needA ? { approveA: approve(quote.tokenA.address, dex.router, intent.amountADesired) } : {}),
    ...(needB ? { approveB: approve(quote.tokenB.address, dex.router, quote.amountB.value) } : {}),
    add: {
      functionName: 'addLiquidity',
      tokenA: quote.tokenA.address,
      tokenB: quote.tokenB.address,
      amountADesired: intent.amountADesired,
      amountBDesired: quote.amountB.value,
      amountAMin: quote.minA.value,
      amountBMin: quote.minB.value,
      to: intent.recipient,
      deadline: BigInt(intent.deadline),
    },
  }
}

/** The unsigned remove plan. The LP-token approve appears iff its allowance is short. */
export function buildRemovePlan(intent: RemoveLiquidityIntent, quote: RemoveLiquidityQuote, lpAllowance: bigint, dex: DexRegistry): RemoveLiquidityPlan {
  const needLp = lpAllowance < intent.liquidity
  return {
    router: dex.router,
    ...(needLp ? { approveLp: approve(quote.pair, dex.router, intent.liquidity) } : {}),
    remove: {
      functionName: 'removeLiquidity',
      tokenA: quote.tokenA.address,
      tokenB: quote.tokenB.address,
      liquidity: intent.liquidity,
      amountAMin: quote.minA.value,
      amountBMin: quote.minB.value,
      to: intent.recipient,
      deadline: BigInt(intent.deadline),
    },
  }
}

function addSteps(needA: boolean, needB: boolean): OperationStep[] {
  const steps: OperationStep[] = []
  if (needA) steps.push({ id: 'approve-a', type: 'approve', actor: 'your_wallet', state: 'pending', attempts: 0 })
  if (needB) steps.push({ id: 'approve-b', type: 'approve', actor: 'your_wallet', state: 'pending', attempts: 0 })
  steps.push({ id: 'add', type: 'add_liquidity', actor: 'your_wallet', state: 'pending', attempts: 0 })
  return steps
}

function removeSteps(needLp: boolean): OperationStep[] {
  const steps: OperationStep[] = []
  if (needLp) steps.push({ id: 'approve-lp', type: 'approve', actor: 'your_wallet', state: 'pending', attempts: 0 })
  steps.push({ id: 'remove', type: 'remove_liquidity', actor: 'your_wallet', state: 'pending', attempts: 0 })
  return steps
}

export interface ApplyAddQuoteInput {
  readonly result: AddLiquidityQuoteResult
  readonly allowanceA: bigint
  readonly allowanceB: bigint
  readonly now: number
}

export function applyAddQuote(record: AddLiquidityOperation, input: ApplyAddQuoteInput): TransitionResult<AddLiquidityIntent, AddLiquidityQuote, AddLiquidityPlan> {
  if (input.result.kind !== 'quote') {
    return applyTransition(record, { to: 'awaiting_input', at: input.now })
  }
  const dex = dexFor(record.network)
  const quote = input.result.quote
  const needA = input.allowanceA < record.intent.amountADesired
  const needB = input.allowanceB < quote.amountB.value
  const plan = buildAddPlan(record.intent, quote, input.allowanceA, input.allowanceB, dex)
  return applyTransition(record, {
    to: needA || needB ? 'awaiting_approval' : 'ready',
    at: input.now,
    patch: { quote, plan, steps: addSteps(needA, needB) },
  })
}

export interface ApplyRemoveQuoteInput {
  readonly result: RemoveLiquidityQuoteResult
  readonly lpAllowance: bigint
  readonly now: number
}

export function applyRemoveQuote(record: RemoveLiquidityOperation, input: ApplyRemoveQuoteInput): TransitionResult<RemoveLiquidityIntent, RemoveLiquidityQuote, RemoveLiquidityPlan> {
  if (input.result.kind !== 'quote') {
    return applyTransition(record, { to: 'awaiting_input', at: input.now })
  }
  const dex = dexFor(record.network)
  const quote = input.result.quote
  const needLp = input.lpAllowance < record.intent.liquidity
  const plan = buildRemovePlan(record.intent, quote, input.lpAllowance, dex)
  return applyTransition(record, {
    to: needLp ? 'awaiting_approval' : 'ready',
    at: input.now,
    patch: { quote, plan, steps: removeSteps(needLp) },
  })
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @flare-kit/core test liquidity.test && pnpm --filter @flare-kit/core typecheck`
Expected: PASS. Confirm `liquidity.ts` is under 300 lines.

- [ ] **Step 5: Checkpoint** — gate green; no commit.

---

## Task 5: Export core, then verify the real add→remove round trip (AC1/AC2)

Real-first: the live path is proven **before** the mock is written. Requires the dev key in `.secrets/live-run.json` and the signer holding FXRP + USD₮0 on Coston2 (signer `0xA4b0…` holds both from the M5 swap run).

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/scripts/live-liquidity.mjs`
- Create: `.thoughts/verification/2026-08-11-m6-liquidity.md` (+ `.json` written by the script)

**Interfaces:**
- Consumes: `quoteAddLiquidity`, `quoteRemoveLiquidity`, `readPosition`, `readLpAllowance` (Task 3); `buildAddPlan`, `buildRemovePlan` (Task 4); `readAllowance`, `formatExact` (existing); `UNIV2_ROUTER_ABI`, `ERC20_ABI`, `dexFor`, `chainFor` (contracts).

- [ ] **Step 1: Export the new core modules**

In `packages/core/src/index.ts`, add beside the existing swap exports:

```ts
export * from './liquidity-quote.js'
export * from './liquidity.js'
```

(The `mock-liquidity.js` export is added in Task 6, after the real path is proven.)

- [ ] **Step 2: Build core**

Run: `pnpm --filter @flare-kit/core build`
Expected: no error; `dist/index.js` now exports the liquidity functions.

- [ ] **Step 3: Write `live-liquidity.mjs`**

```js
// packages/core/scripts/live-liquidity.mjs
/**
 * A real add→remove liquidity round trip on Coston2 through the live V2 router
 * (M6-AC1/AC2). Dev-only: viem signs the approvals and the add/remove, which the
 * shipped package never does — core produces the honest quotes and the unsigned
 * plans, a wallet signs them. Everything deciding the trade goes through the kit.
 * Writes evidence to .thoughts/verification/. Never prints a key.
 *
 *   node scripts/live-liquidity.mjs [amountFxrp=1] [slippageBips=300] [removePct=100]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ERC20_ABI, UNIV2_ROUTER_ABI, chainFor, dexFor } from '@flare-kit/contracts'
import {
  buildAddPlan, buildRemovePlan, formatExact,
  quoteAddLiquidity, quoteRemoveLiquidity, readAllowance, readLpAllowance, readPosition,
} from '../dist/index.js'

const ROOT = '/Users/abu/dev/hackathon/flare'
const CHAIN_ID = 114
const A_KEY = 'FXRP'
const B_KEY = 'USDT0'
const AMOUNT_A = BigInt(Math.round(Number(process.argv[2] ?? '1') * 1e6)) // FXRP 6dp
const SLIPPAGE_BIPS = Number(process.argv[3] ?? '300')
const REMOVE_PCT = BigInt(process.argv[4] ?? '100')

const secrets = JSON.parse(readFileSync(`${ROOT}/.secrets/live-run.json`, 'utf8'))
const chain = chainFor(CHAIN_ID)
const dex = dexFor(CHAIN_ID)
const evidence = { startedAt: new Date().toISOString(), network: chain.name, chainId: CHAIN_ID, router: dex.router, pair: [A_KEY, B_KEY], steps: [] }
const log = (step, data = {}) => { evidence.steps.push({ step, at: new Date().toISOString(), ...data }); console.log(`[${step}]`, JSON.stringify(data)) }
const save = () => { mkdirSync(`${ROOT}/.thoughts/verification`, { recursive: true }); writeFileSync(`${ROOT}/.thoughts/verification/2026-08-11-coston2-live-liquidity.json`, JSON.stringify(evidence, null, 2)) }
const explorerTx = (hash) => `${chain.explorerUrl}/tx/${hash}`

const account = privateKeyToAccount(secrets.evm.privateKey)
const viemChain = { id: CHAIN_ID, name: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: { default: { http: [chain.rpcUrl] } } }
const publicClient = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) })
const walletClient = createWalletClient({ account, chain: viemChain, transport: http(chain.rpcUrl) })
const a = dex.tokens[A_KEY]
const b = dex.tokens[B_KEY]

const sign = async (address, abi, functionName, args, label) => {
  const hash = await walletClient.writeContract({ address, abi, functionName, args })
  log(`${label}-submitted`, { tx: hash, link: explorerTx(hash) })
  const rcpt = await publicClient.waitForTransactionReceipt({ hash })
  log(`${label}-confirmed`, { status: rcpt.status, block: Number(rcpt.blockNumber) })
  if (rcpt.status !== 'success') throw new Error(`${label} reverted`)
  return hash
}

try {
  const now = Math.floor(Date.now() / 1000)
  log('signer', { address: account.address, pair: `${a.symbol}/${b.symbol}` })

  // --- ADD ---
  const addResult = await quoteAddLiquidity({ reader: publicClient, chainId: CHAIN_ID, tokenAKey: A_KEY, tokenBKey: B_KEY, amountADesired: AMOUNT_A, slippageBips: SLIPPAGE_BIPS, now })
  if (addResult.kind !== 'quote') { log('no-add-quote', { kind: addResult.kind, message: addResult.message ?? addResult.reason }); save(); process.exit(1) }
  log('add-quote', { amountA: formatExact(addResult.quote.amountA), amountB: formatExact(addResult.quote.amountB), expectedLp: addResult.quote.expectedLp.toString(), poolShareBips: addResult.quote.poolShareBips })

  const intent = { tokenAKey: A_KEY, tokenBKey: B_KEY, amountADesired: AMOUNT_A, slippageBips: SLIPPAGE_BIPS, recipient: account.address, deadline: now + 1200 }
  const allowanceA = await readAllowance(publicClient, CHAIN_ID, A_KEY, account.address)
  const allowanceB = await readAllowance(publicClient, CHAIN_ID, B_KEY, account.address)
  const addPlan = buildAddPlan(intent, addResult.quote, allowanceA, allowanceB, dex)
  log('add-plan', { needApproveA: Boolean(addPlan.approveA), needApproveB: Boolean(addPlan.approveB) })

  const lpBefore = (await readPosition({ reader: publicClient, chainId: CHAIN_ID, tokenAKey: A_KEY, tokenBKey: B_KEY, owner: account.address }))
  const lpBeforeBal = lpBefore.kind === 'position' ? lpBefore.position.lpBalance : 0n

  if (addPlan.approveA) await sign(addPlan.approveA.token, ERC20_ABI, 'approve', [addPlan.approveA.spender, addPlan.approveA.amount], 'approve-a')
  if (addPlan.approveB) await sign(addPlan.approveB.token, ERC20_ABI, 'approve', [addPlan.approveB.spender, addPlan.approveB.amount], 'approve-b')
  await sign(addPlan.router, UNIV2_ROUTER_ABI, 'addLiquidity', [addPlan.add.tokenA, addPlan.add.tokenB, addPlan.add.amountADesired, addPlan.add.amountBDesired, addPlan.add.amountAMin, addPlan.add.amountBMin, addPlan.add.to, addPlan.add.deadline], 'add')

  const afterAdd = await readPosition({ reader: publicClient, chainId: CHAIN_ID, tokenAKey: A_KEY, tokenBKey: B_KEY, owner: account.address })
  if (afterAdd.kind !== 'position') { log('no-position-after-add', {}); save(); process.exit(1) }
  const minted = afterAdd.position.lpBalance - lpBeforeBal
  // AC2: the predicted LP matches the actual LP minted (balance delta), within rounding.
  log('add-settled', { lpMinted: minted.toString(), predictedLp: addResult.quote.expectedLp.toString(), composition: [formatExact(afterAdd.position.amountA), formatExact(afterAdd.position.amountB)] })

  // --- REMOVE (of what this run added) ---
  const toBurn = (minted * REMOVE_PCT) / 100n
  const removeResult = await quoteRemoveLiquidity({ reader: publicClient, chainId: CHAIN_ID, tokenAKey: A_KEY, tokenBKey: B_KEY, liquidity: toBurn, slippageBips: SLIPPAGE_BIPS, now })
  if (removeResult.kind !== 'quote') { log('no-remove-quote', { kind: removeResult.kind }); save(); process.exit(1) }
  const removeIntent = { tokenAKey: A_KEY, tokenBKey: B_KEY, liquidity: toBurn, slippageBips: SLIPPAGE_BIPS, recipient: account.address, deadline: now + 1200 }
  const lpAllowance = await readLpAllowance(publicClient, CHAIN_ID, A_KEY, B_KEY, account.address)
  const removePlan = buildRemovePlan(removeIntent, removeResult.quote, lpAllowance, dex)
  log('remove-plan', { needApproveLp: Boolean(removePlan.approveLp), liquidity: toBurn.toString() })

  if (removePlan.approveLp) await sign(removePlan.approveLp.token, ERC20_ABI, 'approve', [removePlan.approveLp.spender, removePlan.approveLp.amount], 'approve-lp')
  await sign(removePlan.router, UNIV2_ROUTER_ABI, 'removeLiquidity', [removePlan.remove.tokenA, removePlan.remove.tokenB, removePlan.remove.liquidity, removePlan.remove.amountAMin, removePlan.remove.amountBMin, removePlan.remove.to, removePlan.remove.deadline], 'remove')

  const afterRemove = await readPosition({ reader: publicClient, chainId: CHAIN_ID, tokenAKey: A_KEY, tokenBKey: B_KEY, owner: account.address })
  log('remove-settled', { lpBalanceAfter: afterRemove.kind === 'position' ? afterRemove.position.lpBalance.toString() : '0' })
  log('done', {})
  save()
  console.log('\nM6-AC1 complete: add→remove round trip.')
} catch (error) {
  log('error', { message: error instanceof Error ? error.message : String(error) })
  save()
  console.error('live-liquidity failed:', error instanceof Error ? error.message : error)
  process.exit(1)
}
```

- [ ] **Step 4: Run the round trip**

Run: `node packages/core/scripts/live-liquidity.mjs 1 300 100`
Expected: `add-quote` → `approve-*`/`add` all `status: success` → `add-settled` with `lpMinted` ≈ `predictedLp` (AC2) → `remove-plan` → `approve-lp`/`remove` success → `M6-AC1 complete`. If the pool moved and a min was breached, the tx reverts with a slippage message — re-run (that is the honest slippage path, not a bug).

- [ ] **Step 5: Write the evidence page**

Create `.thoughts/verification/2026-08-11-m6-liquidity.md` in the shape of `2026-08-09-coston2-live-swap.md`: date, network, signer, router, pair, the add quote (paired amount, expected LP, pool share), the four/five tx hashes with explorer links, `lpMinted` vs `predictedLp` (AC2), the LP balance before/after, and what AC1/AC2/AC4 each establish. Reference the raw `2026-08-11-coston2-live-liquidity.json`.

- [ ] **Step 6: Checkpoint** — deliverable is the recorded live evidence. AC1, AC2, AC4 established.

---

## Task 6: `mock-liquidity.ts` — the mock, after the real path

**Files:**
- Create: `packages/core/src/mock-liquidity.ts`
- Modify: `packages/core/src/index.ts` (add the export)
- Test: `packages/core/test/mock-liquidity.test.ts`

**Interfaces:**
- Consumes: `SwapReader` from `./swap-quote.js`; `dexFor` from `@flare-kit/contracts`; the observed constants from Task 2 and the live run.
- Produces: `createMockLiquidityReader(config?)`, `MOCK_LIQUIDITY` (observed reserves + totalSupply). Drives the REAL `quoteAddLiquidity`/`quoteRemoveLiquidity`/`readPosition` with no network.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/mock-liquidity.test.ts
import { describe, expect, it } from 'vitest'
import { quoteAddLiquidity, readPosition } from '../src/liquidity-quote.js'
import { createMockLiquidityReader, MOCK_LIQUIDITY } from '../src/mock-liquidity.js'

const COSTON2 = 114

describe('mock liquidity reader (M6-R5)', () => {
  it('drives the real add quote off observed reserves and supply', async () => {
    const r = await quoteAddLiquidity({ reader: createMockLiquidityReader(), chainId: COSTON2, tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, now: 1 })
    expect(r.kind).toBe('quote')
    if (r.kind !== 'quote') return
    expect(r.quote.amountB.value).toBe((1_000000n * MOCK_LIQUIDITY.reserveB) / MOCK_LIQUIDITY.reserveA)
    expect(r.quote.expectedLp).toBeGreaterThan(0n)
  })

  it('surfaces a chosen LP balance as a position', async () => {
    const r = await readPosition({ reader: createMockLiquidityReader({ lpBalance: MOCK_LIQUIDITY.totalSupply / 4n }), chainId: COSTON2, tokenAKey: 'FXRP', tokenBKey: 'USDT0', owner: '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' })
    expect(r.kind).toBe('position')
  })

  it('refuses a call it never observed rather than inventing a value', async () => {
    const reader = createMockLiquidityReader()
    await expect(reader.readContract({ address: '0x0', abi: [], functionName: 'getAmountsIn', args: [] })).rejects.toThrow(/unexpected/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @flare-kit/core test mock-liquidity`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mock-liquidity.ts`** *(replace `reserveA`/`reserveB`/`totalSupply` with the Task 2 probe values; `reserveA` is FXRP's)*

```ts
// packages/core/src/mock-liquidity.ts
import { type Address, dexFor } from '@flare-kit/contracts'
import type { SwapReader } from './swap-quote.js'

/**
 * The liquidity mock (M6-R5), written after the real path. It is a labelled reader
 * the REAL quote/position functions run against, so a test or a demo drives the true
 * code path with no network. Mock mode is explicit — a caller opts in by constructing
 * this reader; nothing ever falls back to it. It refuses any call it never observed.
 *
 * Reserves and totalSupply are the real Coston2 FXRP/USD₮0 pool, read on chain via
 * scripts/probe-liquidity.mjs. token0 is FXRP.
 */

export const MOCK_LIQUIDITY = {
  reserveA: 23_623775n, // FXRP (6dp) — replace with probe value
  reserveB: 27_782833n, // USD₮0 (6dp) — replace with probe value
  totalSupply: 25_000000n, // LP — replace with probe value
} as const

const MOCK_PAIR: Address = '0xdd598473f738df117ee331bc07172481db60acbe'
const ZERO: Address = '0x0000000000000000000000000000000000000000'
const AMPLE = 1n << 128n

export interface MockLiquidityConfig {
  readonly poolExists?: boolean
  readonly allowance?: bigint
  readonly lpBalance?: bigint
  readonly reserves?: { readonly reserveA: bigint; readonly reserveB: bigint; readonly totalSupply: bigint }
}

export function createMockLiquidityReader(config: MockLiquidityConfig = {}): SwapReader {
  const dex = dexFor(114)
  const fxrp = dex.tokens.FXRP!.address
  const reserves = config.reserves ?? MOCK_LIQUIDITY
  return {
    async readContract({ functionName, args = [] }) {
      switch (functionName) {
        case 'getPair':
          return config.poolExists === false ? ZERO : MOCK_PAIR
        case 'token0':
          return fxrp
        case 'getReserves':
          return [reserves.reserveA, reserves.reserveB, 0]
        case 'totalSupply':
          return reserves.totalSupply
        case 'allowance':
          return config.allowance ?? AMPLE
        case 'balanceOf':
          return config.lpBalance ?? 0n
        default:
          throw new Error(`mock liquidity reader: unexpected call ${functionName}`)
      }
    },
  }
}
```

- [ ] **Step 4: Export and run tests**

Add to `packages/core/src/index.ts`: `export * from './mock-liquidity.js'`
Run: `pnpm --filter @flare-kit/core build && pnpm --filter @flare-kit/core test mock-liquidity && pnpm --filter @flare-kit/core typecheck`
Expected: PASS.

- [ ] **Step 5: Checkpoint** — gate green; no commit.

---

## Task 7: `AddLiquidityCard` — two ratio-locked supply legs

**Files:**
- Create: `packages/react-ui/src/add-liquidity-state.ts`
- Create: `packages/react-ui/src/AddLiquidityCard.tsx`
- Create: `packages/react-ui/src/liquidity.css`
- Modify: `packages/react-ui/src/index.ts`
- Test: `packages/react-ui/test/add-liquidity-card.test.tsx`

**Interfaces:**
- Consumes: `AddLiquidityOperation`, `AddLiquidityQuoteResult`, `AddLiquidityQuote`, `Amount`, `OperationState`, `formatExact` from `@flare-kit/core`; `SwapLeg`, `Panel`, `Button`, `Note`, `OperationTimeline`, `DetailRow`/`Details`, `StateChip`/`ToneChip` from local `./`.
- Produces: `AddLiquidityCard`, `AddLiquidityCardProps`; `ctaForAdd`, `noteForAdd` (in `add-liquidity-state.ts`). Mirrors `swap-card-state.ts`.

- [ ] **Step 1: Write the failing test** *(reachable-from-props, mirroring `swap-card.test.tsx`)*

```tsx
// packages/react-ui/test/add-liquidity-card.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  type AddLiquidityOperation, type AddLiquidityQuote,
  amount, applyAddQuote, createAddLiquidity, startQuoting,
} from '@flare-kit/core'
import { AddLiquidityCard } from '../src/AddLiquidityCard.js'

const COSTON2 = 114
const NOW = 1_760_000_000_000
const RECIP = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as const
const FXRP = { symbol: 'FXRP', address: '0x0b6A3645c240605887a5532109323A3E12273dc7', decimals: 6 } as const
const USDT0 = { symbol: 'USD₮0', address: '0xC1A5B41512496B80903D1f32d6dEa3a73212E71F', decimals: 6 } as const

const quote: AddLiquidityQuote = {
  tokenA: FXRP, tokenB: USDT0,
  amountA: amount(1_000000n, 6, 'FXRP'), amountB: amount(1_176000n, 6, 'USD₮0'),
  minA: amount(995000n, 6, 'FXRP'), minB: amount(1_170120n, 6, 'USD₮0'),
  expectedLp: 500000n, poolShareBips: 40, slippageBips: 50,
  pair: '0xDD598473f738df117Ee331bc07172481db60acBE', observedAt: NOW,
}

function inState(allowanceA: bigint, allowanceB: bigint): AddLiquidityOperation {
  const intent = { tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, recipient: RECIP, deadline: Math.floor(NOW / 1000) + 1200 }
  let op = createAddLiquidity({ chainId: COSTON2, intent, now: NOW, id: 'op_add' })
  op = startQuoting(op, NOW).record
  return applyAddQuote(op, { result: { kind: 'quote', quote }, allowanceA, allowanceB, now: NOW }).record
}

describe('AddLiquidityCard (M6-R6)', () => {
  const base = { tokenA: FXRP, tokenB: USDT0, networkLabel: 'Coston2' }

  it('shows the paired amount and expected pool share, in the mono face', () => {
    render(<AddLiquidityCard operation={inState(10n ** 30n, 10n ** 30n)} quoteResult={{ kind: 'quote', quote }} {...base} />)
    expect(screen.getByText(/1\.176000 USD₮0/)).toBeTruthy()
    expect(screen.getByText(/0\.40%|0\.4%/)).toBeTruthy()
  })

  it('when both allowances are short it names both approvals, never one hidden', () => {
    render(<AddLiquidityCard operation={inState(0n, 0n)} quoteResult={{ kind: 'quote', quote }} {...base} />)
    expect(screen.getByText(/Approve/i)).toBeTruthy()
  })

  it('states no pool with a reason, never a zero', () => {
    const intent = { tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, recipient: RECIP, deadline: 1 }
    let op = createAddLiquidity({ chainId: COSTON2, intent, now: NOW, id: 'op_np' })
    op = startQuoting(op, NOW).record
    op = applyAddQuote(op, { result: { kind: 'no_pool', message: 'No FXRP / WC2FLR pool exists on this network yet.' }, allowanceA: 0n, allowanceB: 0n, now: NOW }).record
    render(<AddLiquidityCard operation={op} quoteResult={{ kind: 'no_pool', message: 'No FXRP / WC2FLR pool exists on this network yet.' }} {...base} />)
    expect(screen.getByText(/no .*pool/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @flare-kit/core build && pnpm --filter @flare-kit/react-ui test add-liquidity-card`
Expected: FAIL — `AddLiquidityCard` not found.

- [ ] **Step 3: Implement `add-liquidity-state.ts`** (the pure state→chrome map, mirroring `swap-card-state.ts`)

```ts
// packages/react-ui/src/add-liquidity-state.ts
import type { AddLiquidityOperation, AddLiquidityQuoteResult, OperationState } from '@flare-kit/core'
import type { NoteTone } from './primitives/Note.js'

/** How an add-liquidity operation's state becomes the card's CTA and note. */

export const PRE_PLAN: ReadonlySet<OperationState> = new Set(['draft', 'awaiting_input', 'quoting'])
export const IN_FLIGHT: ReadonlySet<OperationState> = new Set(['executing', 'submitted', 'confirming', 'awaiting_external', 'action_required', 'partially_succeeded', 'succeeded'])
export const CONCLUDED: ReadonlySet<OperationState> = new Set(['succeeded', 'partially_succeeded', 'failed', 'expired', 'cancelled'])

export interface Cta { readonly label: string; readonly disabled: boolean }

export function ctaForAdd(op: AddLiquidityOperation, result: AddLiquidityQuoteResult | undefined): Cta {
  const active = op.steps.find((s) => s.state === 'active')
  switch (op.state) {
    case 'ready': return { label: 'Review supply', disabled: false }
    case 'awaiting_approval': return { label: 'Approve tokens', disabled: false }
    case 'executing':
    case 'submitted':
    case 'confirming': return { label: active?.type === 'approve' ? 'Approving…' : 'Adding liquidity…', disabled: true }
    case 'succeeded': return { label: 'Liquidity added', disabled: true }
    case 'failed': return { label: 'Add did not complete', disabled: true }
    case 'expired': return { label: 'Re-quote', disabled: false }
    case 'quoting': return { label: 'Reading the pool…', disabled: true }
    default:
      if (result?.kind === 'no_pool') return { label: 'No pool', disabled: true }
      if (result?.kind === 'unavailable') return { label: 'Pool unavailable', disabled: true }
      return { label: 'Enter an amount', disabled: true }
  }
}

export interface CardNote { readonly tone: NoteTone; readonly title: string; readonly body: string }

export function noteForAdd(op: AddLiquidityOperation, result: AddLiquidityQuoteResult | undefined): CardNote | null {
  if (op.state === 'succeeded') {
    return { tone: 'ok', title: 'Liquidity added', body: 'Your LP position is recorded on the transaction below. Its composition will change with the pool price.' }
  }
  if (op.error) {
    const retryable = op.error.recovery === 'safe_to_retry'
    return { tone: retryable ? 'att' : 'bad', title: op.error.code === 'SLIPPAGE_EXCEEDED' ? 'The ratio moved' : 'Add did not complete', body: op.error.message }
  }
  if (op.state === 'awaiting_approval') {
    return { tone: 'info', title: 'Approve both tokens first', body: 'Supplying liquidity is not a deposit. You provide both assets at the pool ratio; each approval is its own transaction.' }
  }
  if (!op.quote && result?.kind === 'no_pool') return { tone: 'att', title: 'No pool', body: result.message }
  if (!op.quote && result?.kind === 'unavailable') return { tone: 'info', title: 'Pool unavailable', body: result.reason }
  if (op.state === 'ready') return { tone: 'info', title: 'A position, not a deposit', body: 'The two amounts are paired at the live pool ratio; their split changes as the price moves.' }
  return null
}

export function percentOf(bips: number): string {
  return `${(bips / 100).toFixed(2)}%`
}
```

- [ ] **Step 4: Implement `AddLiquidityCard.tsx`** (mirrors `SwapCard`: `Panel` → two `SwapLeg`s with `role="pay"` → `Details` rows for paired amount / expected LP / pool share / minimums → `Note` → `OperationTimeline` when in-flight → `Button` CTA)

```tsx
// packages/react-ui/src/AddLiquidityCard.tsx
import { type AddLiquidityOperation, type AddLiquidityQuoteResult, type Amount, type DexToken, formatExact } from '@flare-kit/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { OperationTimeline } from './OperationTimeline.js'
import { SwapLeg } from './SwapLeg.js'
import { CONCLUDED, IN_FLIGHT, PRE_PLAN, ctaForAdd, noteForAdd, percentOf } from './add-liquidity-state.js'

export interface AddLiquidityCardProps {
  readonly operation: AddLiquidityOperation
  readonly tokenA: DexToken
  readonly tokenB: DexToken
  readonly quoteResult?: AddLiquidityQuoteResult
  readonly amountAText?: string
  readonly balanceA?: Amount
  readonly balanceB?: Amount
  readonly mockLabel?: string
  readonly networkLabel?: string
  readonly onAmountAChange?: (text: string) => void
  readonly onSelectA?: () => void
  readonly onSelectB?: () => void
  readonly onMax?: () => void
  readonly onSubmit?: () => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

export function AddLiquidityCard(props: AddLiquidityCardProps) {
  const { operation: op, tokenA, tokenB, quoteResult, amountAText, balanceA, balanceB, mockLabel, networkLabel } = props
  const quote = op.quote
  const cta = ctaForAdd(op, quoteResult)
  const note = noteForAdd(op, quoteResult)
  const showSpine = IN_FLIGHT.has(op.state)
  const concluded = CONCLUDED.has(op.state)
  const pairedText = quote && !concluded ? formatExact(quote.amountB, { asset: false }) : '—'

  return (
    <Panel title="Add liquidity" subtitle={networkLabel} className={`fk fk-liq ${props.className ?? ''}`} data-theme={props.theme}>
      {mockLabel ? <Note tone="info" title="Mock" body={`Driven by ${mockLabel}. No funds move.`} /> : null}
      <SwapLeg role="pay" label="You supply" value={amountAText ?? (quote ? formatExact(quote.amountA, { asset: false }) : '')} editable={PRE_PLAN.has(op.state)} token={tokenA} balance={balanceA} onSelect={props.onSelectA} onAmountInChange={props.onAmountAChange} onMax={props.onMax} />
      <SwapLeg role="pay" label="And" value={pairedText} editable={false} token={tokenB} balance={balanceB} onSelect={props.onSelectB} />
      {quote && !concluded ? (
        <Details>
          <DetailRow label="Paired at pool ratio" value={<span className="fk-mono">{formatExact(quote.amountB)}</span>} />
          <DetailRow label="Expected pool share" value={<span className="fk-mono">{percentOf(quote.poolShareBips)}</span>} />
          <DetailRow label="Minimum supplied" value={<span className="fk-mono">{formatExact(quote.minA)} · {formatExact(quote.minB)}</span>} sub={`Protected at ${percentOf(quote.slippageBips)} — the ratio can drift before the tx confirms.`} />
        </Details>
      ) : null}
      {note ? <Note tone={note.tone} title={note.title} body={note.body} /> : null}
      {showSpine ? <OperationTimeline operation={op} /> : null}
      <Button variant="primary" disabled={cta.disabled} onClick={props.onSubmit}>{cta.label}</Button>
    </Panel>
  )
}
```

- [ ] **Step 5: Add `liquidity.css` and export**

Create `packages/react-ui/src/liquidity.css` with a `.fk-liq` stack rule mirroring `.fk-swap` in `swap.css` (flex column, gap from the `--fk-gap` token — read `swap.css` and copy the container rule, renaming the scope class). Import it wherever `swap.css` is imported (the `styles.css` aggregator).
Add to `packages/react-ui/src/index.ts`: `export * from './AddLiquidityCard.js'`

- [ ] **Step 6: Run tests + typecheck + line count**

Run: `pnpm --filter @flare-kit/react-ui test add-liquidity-card && pnpm --filter @flare-kit/react-ui typecheck`
Expected: PASS. Confirm `AddLiquidityCard.tsx` < 300 lines (the state split keeps it small).

- [ ] **Step 7: Checkpoint** — gate green; no commit.

---

## Task 8: `PositionCard` — live position, partial removal

**Files:**
- Create: `packages/react-ui/src/position-card-state.ts`
- Create: `packages/react-ui/src/PositionCard.tsx`
- Create: `packages/react-ui/src/primitives/PercentPills.tsx` (only if no existing primitive covers a 25/50/75/100 + exact control — check `primitives/` first)
- Modify: `packages/react-ui/src/index.ts`
- Test: `packages/react-ui/test/position-card.test.tsx`

**Interfaces:**
- Consumes: `RemoveLiquidityOperation`, `Position`, `PositionResult`, `RemoveLiquidityQuoteResult`, `formatExact` from `@flare-kit/core`; `Panel`, `Button`, `Note`, `DetailRow`/`Details`, `OperationTimeline`, `SwapLeg` from `./`.
- Produces: `PositionCard`, `PositionCardProps`; `ctaForRemove`, `noteForRemove` (in `position-card-state.ts`); `PercentPills`, `PercentPillsProps` if built.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/react-ui/test/position-card.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { type Position, amount } from '@flare-kit/core'
import { PositionCard } from '../src/PositionCard.js'

const FXRP = { symbol: 'FXRP', address: '0x0b6A3645c240605887a5532109323A3E12273dc7', decimals: 6 } as const
const USDT0 = { symbol: 'USD₮0', address: '0xC1A5B41512496B80903D1f32d6dEa3a73212E71F', decimals: 6 } as const

const position: Position = {
  tokenA: FXRP, tokenB: USDT0, lpBalance: 6_250000n,
  amountA: amount(5_900000n, 6, 'FXRP'), amountB: amount(6_945000n, 6, 'USD₮0'),
  poolShareBips: 250, pair: '0xDD598473f738df117Ee331bc07172481db60acBE',
}

describe('PositionCard (M6-R7)', () => {
  it('shows the current composition of both assets in the mono face', () => {
    render(<PositionCard position={position} networkLabel="Coston2" />)
    expect(screen.getByText(/5\.900000 FXRP/)).toBeTruthy()
    expect(screen.getByText(/6\.945000 USD₮0/)).toBeTruthy()
  })

  it('renders an honest no-position state, never an empty guess', () => {
    render(<PositionCard position={null} networkLabel="Coston2" tokenA={FXRP} tokenB={USDT0} />)
    expect(screen.getByText(/no .*liquidity|no position/i)).toBeTruthy()
  })

  it('never claims a fee balance — V2 fees are embedded in reserves', () => {
    render(<PositionCard position={position} networkLabel="Coston2" />)
    expect(screen.queryByText(/claim.*fee/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @flare-kit/react-ui test position-card`
Expected: FAIL — `PositionCard` not found.

- [ ] **Step 3: Implement `position-card-state.ts`**

```ts
// packages/react-ui/src/position-card-state.ts
import type { OperationState, RemoveLiquidityOperation } from '@flare-kit/core'
import type { NoteTone } from './primitives/Note.js'

export const IN_FLIGHT: ReadonlySet<OperationState> = new Set(['executing', 'submitted', 'confirming', 'awaiting_external', 'action_required', 'partially_succeeded', 'succeeded'])

export interface Cta { readonly label: string; readonly disabled: boolean }

export function ctaForRemove(op: RemoveLiquidityOperation | undefined): Cta {
  if (!op) return { label: 'Select an amount to withdraw', disabled: true }
  const active = op.steps.find((s) => s.state === 'active')
  switch (op.state) {
    case 'ready': return { label: 'Review withdrawal', disabled: false }
    case 'awaiting_approval': return { label: 'Approve LP token', disabled: false }
    case 'executing':
    case 'submitted':
    case 'confirming': return { label: active?.type === 'approve' ? 'Approving…' : 'Withdrawing…', disabled: true }
    case 'succeeded': return { label: 'Withdrawn', disabled: true }
    case 'failed': return { label: 'Withdrawal did not complete', disabled: true }
    default: return { label: 'Choose how much to withdraw', disabled: true }
  }
}

export interface CardNote { readonly tone: NoteTone; readonly title: string; readonly body: string }

export function noteForRemove(op: RemoveLiquidityOperation | undefined): CardNote | null {
  if (op?.state === 'succeeded') return { tone: 'ok', title: 'Withdrawn', body: 'The exact amounts returned are on the transaction below.' }
  if (op?.error) {
    const retryable = op.error.recovery === 'safe_to_retry'
    return { tone: retryable ? 'att' : 'bad', title: op.error.code === 'SLIPPAGE_EXCEEDED' ? 'The ratio moved' : 'Withdrawal did not complete', body: op.error.message }
  }
  if (op?.state === 'awaiting_approval') return { tone: 'info', title: 'Approve the LP token first', body: 'Removing liquidity spends your LP token; the approval is its own transaction, then the withdrawal.' }
  return { tone: 'info', title: 'Fees are already in your balance', body: 'A V2 position earns by growing its share of the pool — there is no separate fee to claim.' }
}
```

- [ ] **Step 4: Implement `PositionCard.tsx`** (a `Panel`; the `no-position` branch when `position == null`; otherwise two `SwapLeg`s with `role="receive"` showing the current composition, a `PercentPills` control for the removal amount, `Details` with pool share, `Note`, `OperationTimeline` when a remove op is in-flight, and the `Button` CTA)

```tsx
// packages/react-ui/src/PositionCard.tsx
import { type DexToken, type Position, type RemoveLiquidityOperation, type RemoveLiquidityQuoteResult, formatExact } from '@flare-kit/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { OperationTimeline } from './OperationTimeline.js'
import { SwapLeg } from './SwapLeg.js'
import { PercentPills } from './primitives/PercentPills.js'
import { IN_FLIGHT, ctaForRemove, noteForRemove } from './position-card-state.js'

export interface PositionCardProps {
  readonly position: Position | null
  readonly networkLabel?: string
  /** Present only in the no-position state, to name the pair being offered. */
  readonly tokenA?: DexToken
  readonly tokenB?: DexToken
  readonly removeOperation?: RemoveLiquidityOperation
  readonly removeQuoteResult?: RemoveLiquidityQuoteResult
  readonly percent?: number
  readonly mockLabel?: string
  readonly onPercentChange?: (percent: number) => void
  readonly onSubmit?: () => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

export function PositionCard(props: PositionCardProps) {
  const { position, networkLabel, removeOperation: op, percent, mockLabel } = props

  if (!position) {
    const pair = props.tokenA && props.tokenB ? `${props.tokenA.symbol} / ${props.tokenB.symbol}` : 'this pool'
    return (
      <Panel title="Your liquidity" subtitle={networkLabel} className={`fk fk-liq ${props.className ?? ''}`} data-theme={props.theme}>
        <Note tone="info" title="No position" body={`You hold no ${pair} liquidity yet. Add some to open a position.`} />
      </Panel>
    )
  }

  const cta = ctaForRemove(op)
  const note = noteForRemove(op)
  const showSpine = op ? IN_FLIGHT.has(op.state) : false
  const rq = props.removeQuoteResult?.kind === 'quote' ? props.removeQuoteResult.quote : undefined

  return (
    <Panel title="Your liquidity" subtitle={networkLabel} className={`fk fk-liq ${props.className ?? ''}`} data-theme={props.theme}>
      {mockLabel ? <Note tone="info" title="Mock" body={`Driven by ${mockLabel}. No funds move.`} /> : null}
      <SwapLeg role="receive" label="You hold" value={formatExact(position.amountA, { asset: false })} editable={false} token={position.tokenA} />
      <SwapLeg role="receive" label="And" value={formatExact(position.amountB, { asset: false })} editable={false} token={position.tokenB} />
      <Details>
        <DetailRow label="Pool share" value={<span className="fk-mono">{(position.poolShareBips / 100).toFixed(2)}%</span>} />
      </Details>
      <PercentPills value={percent ?? 0} onChange={props.onPercentChange} />
      {rq ? (
        <Details>
          <DetailRow label="You would receive" value={<span className="fk-mono">{formatExact(rq.amountA)} · {formatExact(rq.amountB)}</span>} sub={`At least ${formatExact(rq.minA)} · ${formatExact(rq.minB)} after slippage.`} />
        </Details>
      ) : null}
      {note ? <Note tone={note.tone} title={note.title} body={note.body} /> : null}
      {showSpine && op ? <OperationTimeline operation={op} /> : null}
      <Button variant="primary" disabled={cta.disabled} onClick={props.onSubmit}>{cta.label}</Button>
    </Panel>
  )
}
```

- [ ] **Step 5: Implement `PercentPills.tsx`** (if `primitives/` has no equivalent — check first)

```tsx
// packages/react-ui/src/primitives/PercentPills.tsx
const PRESETS = [25, 50, 75, 100] as const

export interface PercentPillsProps {
  readonly value: number
  readonly onChange?: (percent: number) => void
}

export function PercentPills({ value, onChange }: PercentPillsProps) {
  return (
    <div className="fk-pct" role="group" aria-label="Portion to withdraw">
      {PRESETS.map((p) => (
        <button key={p} type="button" className="fk-pct-pill" aria-pressed={value === p} data-active={value === p} onClick={() => onChange?.(p)}>
          {p === 100 ? 'Max' : `${p}%`}
        </button>
      ))}
    </div>
  )
}
```

Add its `.fk-pct`/`.fk-pct-pill` rules to `liquidity.css` (a pill row; active state carries shape+weight, never colour alone, per DESIGN.md).

- [ ] **Step 6: Export and run tests**

Add to `packages/react-ui/src/index.ts`: `export * from './PositionCard.js'` and `export * from './primitives/PercentPills.js'`
Run: `pnpm --filter @flare-kit/react-ui test position-card && pnpm --filter @flare-kit/react-ui typecheck`
Expected: PASS. Confirm both files < 300 lines.

- [ ] **Step 7: Checkpoint** — gate green; no commit.

---

## Task 9: Gallery — every AC5 state, both themes, a11y-verified

**Files:**
- Create: `packages/react-ui/gallery/m6-liquidity-sections.tsx`
- Modify: `packages/react-ui/gallery/Gallery.tsx` (import + include `M6_LIQUIDITY_SECTIONS`)
- Evidence: `.thoughts/verification/m6-screens/**`

**Interfaces:**
- Consumes: the same core state-machine builders the tests use (`createAddLiquidity`, `startQuoting`, `applyAddQuote`, `advanceSteps`, `applyTransition`, `createRemoveLiquidity`, `applyRemoveQuote`, `serializeError`, `FlareKitError`, `MOCK_EPOCH`); `AddLiquidityCard`, `PositionCard` from `../src/index.js`.

- [ ] **Step 1: Build the M6 gallery sections** (mirror `m5-swap-sections.tsx`: each AC5 state built by walking the real state machine with a fixture reading; states reachable purely from props)

```tsx
// packages/react-ui/gallery/m6-liquidity-sections.tsx
import {
  FlareKitError, MOCK_EPOCH,
  type AddLiquidityOperation, type AddLiquidityQuote, type Position,
  advanceSteps, amount, applyAddQuote, applyTransition, createAddLiquidity, serializeError, startQuoting,
} from '@flare-kit/core'
import { AddLiquidityCard, PositionCard } from '../src/index.js'

const NOW = MOCK_EPOCH
const NOW_S = Math.floor(NOW / 1000)
const RECIP = '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9' as const
const FXRP = { symbol: 'FXRP', address: '0x0b6A3645c240605887a5532109323A3E12273dc7', decimals: 6 } as const
const USDT0 = { symbol: 'USD₮0', address: '0xC1A5B41512496B80903D1f32d6dEa3a73212E71F', decimals: 6 } as const

const quote: AddLiquidityQuote = {
  tokenA: FXRP, tokenB: USDT0,
  amountA: amount(1_000000n, 6, 'FXRP'), amountB: amount(1_176000n, 6, 'USD₮0'),
  minA: amount(995000n, 6, 'FXRP'), minB: amount(1_170120n, 6, 'USD₮0'),
  expectedLp: 500000n, poolShareBips: 40, slippageBips: 50,
  pair: '0xDD598473f738df117Ee331bc07172481db60acBE', observedAt: NOW,
}
const QUOTE = { kind: 'quote', quote } as const
const NO_POOL = { kind: 'no_pool', message: 'No FXRP / WC2FLR pool exists on this network yet.' } as const

function addIn(allowanceA: bigint, allowanceB: bigint): AddLiquidityOperation {
  const intent = { tokenAKey: 'FXRP', tokenBKey: 'USDT0', amountADesired: 1_000000n, slippageBips: 50, recipient: RECIP, deadline: NOW_S + 1200 }
  let op = createAddLiquidity({ chainId: 114, intent, now: NOW, id: 'op_add' })
  op = startQuoting(op, NOW).record
  return applyAddQuote(op, { result: QUOTE, allowanceA, allowanceB, now: NOW }).record
}
const hop = (op: AddLiquidityOperation, to: AddLiquidityOperation['state'], patch: object, evidence?: object[]): AddLiquidityOperation =>
  applyTransition(op, { to, at: NOW, patch, ...(evidence ? { evidence: evidence as never } : {}) }).record

const NEEDS_BOTH = addIn(0n, 0n)
const READY = addIn(10n ** 30n, 10n ** 30n)
const ADDING = hop(hop(READY, 'executing', { steps: advanceSteps(READY.steps, { done: 0, current: 'active' }, NOW) }), 'submitted', { steps: advanceSteps(READY.steps, { done: 0, current: 'active' }, NOW) })
const ADDED = hop(ADDING, 'succeeded', { steps: advanceSteps(ADDING.steps, { done: ADDING.steps.length, current: 'done' }, NOW) }, [{ kind: 'flare_tx', label: 'Add', value: '0xadd0000000000000000000000000000000000000000000000000000000000add', observedAt: NOW }])
const RATIO_MOVED = hop(hop(READY, 'executing', { steps: advanceSteps(READY.steps, { done: 0, current: 'active' }, NOW) }), 'expired', {
  steps: advanceSteps(READY.steps, { done: 0, current: 'failed' }, NOW),
  error: serializeError(new FlareKitError('SLIPPAGE_EXCEEDED', { domain: 'protocol', message: 'The pool ratio moved past your minimums before the add confirmed. Nothing moved — re-quote to continue.', recovery: 'safe_to_retry', valueMoved: 'no' })),
})
const NO_POOL_OP = addIn(0n, 0n) // reading below overrides the note

const position: Position = { tokenA: FXRP, tokenB: USDT0, lpBalance: 6_250000n, amountA: amount(5_900000n, 6, 'FXRP'), amountB: amount(6_945000n, 6, 'USD₮0'), poolShareBips: 250, pair: quote.pair }
const base = { tokenA: FXRP, tokenB: USDT0, networkLabel: 'Coston2' } as const

export const M6_LIQUIDITY_SECTIONS = [
  {
    id: 'm6-add-liquidity',
    title: 'M6 · AddLiquidityCard (states reachable from props)',
    cases: [
      { name: 'quote — paired at ratio, expected pool share, minimums', node: <AddLiquidityCard operation={READY} quoteResult={QUOTE} balanceA={amount(24_800000n, 6, 'FXRP')} balanceB={amount(11_224352n, 6, 'USD₮0')} {...base} /> },
      { name: 'needs approval — both tokens, neither hidden', node: <AddLiquidityCard operation={NEEDS_BOTH} quoteResult={QUOTE} balanceA={amount(24_800000n, 6, 'FXRP')} balanceB={amount(11_224352n, 6, 'USD₮0')} {...base} /> },
      { name: 'adding — add tx in flight on the spine', node: <AddLiquidityCard operation={ADDING} quoteResult={QUOTE} {...base} /> },
      { name: 'success — Liquidity added, with the add tx evidence', node: <AddLiquidityCard operation={ADDED} quoteResult={QUOTE} {...base} /> },
      { name: 'no pool — stated with its reason, never a 0 ratio', node: <AddLiquidityCard operation={NO_POOL_OP} quoteResult={NO_POOL} {...base} /> },
      { name: 'ratio moved — distinct, re-quotable, never a kit failure', node: <AddLiquidityCard operation={RATIO_MOVED} quoteResult={QUOTE} {...base} /> },
    ],
  },
  {
    id: 'm6-position',
    title: 'M6 · PositionCard',
    cases: [
      { name: 'position — current composition of both assets, pool share', node: <PositionCard position={position} percent={50} networkLabel="Coston2" /> },
      { name: 'no position — honest empty state, never a guess', node: <PositionCard position={null} tokenA={FXRP} tokenB={USDT0} networkLabel="Coston2" /> },
    ],
  },
]
```

- [ ] **Step 2: Wire the section into `Gallery.tsx`**

Read `Gallery.tsx` to see how `M5_SWAP_SECTIONS` is imported and concatenated into the sections list, then add `M6_LIQUIDITY_SECTIONS` the same way.

- [ ] **Step 3: Drive it in a browser and screenshot both themes**

Run the gallery (`pnpm --filter @flare-kit/react-ui dev` or the project's gallery command), open each M6 case, toggle the theme with the gallery's own toggle (never from a script — computed values only recompute through the real toggle), and screenshot every case in light and dark to `.thoughts/verification/m6-screens/`. Confirm: paired amount and pool share in the mono face; the no-pool reason shown; the ratio-moved state distinct; no claimable-fee text on the position.

- [ ] **Step 4: Run the a11y audit in the gallery**

In the gallery devtools console: `window.__auditA11y()` (from `gallery/a11y-audit.ts`, which composites opacity, checks contrast, focus and target size). Expected: `[]` (no findings) in both themes for every M6 case. Fix any finding against computed styles, the M4-R12 method.

- [ ] **Step 5: Checkpoint** — deliverable is the screenshots + a clean a11y audit (AC5).

---

## Task 10: Full gate, evidence, and milestone close-out

**Files:**
- Modify: `.thoughts/verification/2026-08-11-m6-liquidity.md` (fold in the browser run + AC5)
- Modify: `.thoughts/state.json` (mark M6 done, set the next authorized action)

- [ ] **Step 1: Run the full gate, with output shown**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
Expected: all green. Capture the test count and paste the tail of the output into the evidence page. Fix anything red before proceeding — a deadline never lowers this bar.

- [ ] **Step 2: Confirm the honesty + reuse invariants by hand**

- No file added in M6 exceeds 300 lines (`AddLiquidityCard.tsx`, `PositionCard.tsx`, `liquidity.ts`, `liquidity-quote.ts`).
- No address is hardcoded outside `dex.ts` (`grep -rn "0x[0-9a-fA-F]\{40\}" packages/core/src/liquidity*.ts packages/react-ui/src/*Liquidity* packages/react-ui/src/PositionCard.tsx` returns only test/gallery fixtures, never production source).
- The two cards sign via `onSubmit` only — neither imports a wallet client.
- `mock-liquidity.ts` throws on any unobserved call.

- [ ] **Step 3: Finalise the evidence page**

`.thoughts/verification/2026-08-11-m6-liquidity.md` now carries: the live add→remove hashes + explorer links + LP-minted-vs-predicted (AC1/AC2/AC4), the gallery screenshots reference (AC5), the a11y result, and the full-gate output tail.

- [ ] **Step 4: Update `state.json` to M6 done**

Set `completed_milestones.M6`, move the milestone marker forward, and rewrite `next_authorized_action` to the next DEX-bucket capability (Vaults — ERC-4626), preserving the real-first order. Do this with a JSON load/mutate/dump script (as the M6 bump was done), never a hand edit, to protect the `rules_that_are_not_obvious` notes.

- [ ] **Step 5: Checkpoint** — M6 complete: live-verified, gated, browser-verified, evidence recorded.

---

## Self-Review

**Spec coverage** (each M6 requirement → task):
- M6-R1 (contracts extend) → Task 1. M6-R2 (core operation) → Task 4. M6-R3 (honest quote/minimums/position) → Task 3. M6-R4 (approvals never hidden) → Tasks 3–4 (allowance reads + plan builders), asserted in Task 4 tests + Task 5 live. M6-R5 (real-first mock) → Task 6 (after Task 5's live run). M6-R6 (AddLiquidityCard) → Task 7. M6-R7 (PositionCard) → Task 8. M6-R8 (network is config) → held by `dexFor`, exercised on Coston2 in Task 5 (mainnet path is the same code). M6-R9 (reuse, <300) → Tasks 7–8 reuse `SwapLeg`/spine/primitives, line-count checked in Task 10. M6-R10 (PoolCatalogue declared-unbuilt) → **not built by design**; it is a declared-unbuilt state, so no task builds it — noted here so the omission is deliberate, not a gap.
- AC1 → Task 5. AC2 → Task 5 (predicted-vs-minted) + Task 3 (quote math). AC3 → Tasks 3/7 (no_pool). AC4 → Tasks 4/5/7–8 (approve steps). AC5 → Task 9.

**Placeholder scan:** the only intentionally-deferred values are the observed pool numbers (`R_FXRP`/`R_USDT0`/`TS`, `MOCK_LIQUIDITY`), which Task 2 fills from the live probe before Tasks 3/6 run — flagged in-line at each site. No "TODO"/"handle errors"/"similar to Task N" remain; every code step carries real code.

**Type consistency:** `AddLiquidityQuote`/`RemoveLiquidityQuote`/`Position` (Task 3) are consumed unchanged by Tasks 4/7/8/9. `ApproveStep` is imported from `./swap.js` (Task 4), matching the existing export. `buildAddPlan(intent, quote, allowanceA, allowanceB, dex)` and `applyAddQuote(op, { result, allowanceA, allowanceB, now })` signatures match between Task 4's definition and Tasks 5/7/9's use. `readPosition` returns `{ kind: 'position' | 'no_position' | 'unavailable' }` consistently across Tasks 3/5/6. `PercentPills`/`onPercentChange` names match between Tasks 8's component and card.

---

## Execution Handoff

Plan complete and saved to `.thoughts/plans/2026-08-11-m6-liquidity.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, with review between tasks and fast iteration. Real-first ordering matters here: Task 5 (the live round trip) gates Task 6 (the mock), so the reviewer confirms the chain evidence before the mock copies it.
2. **Inline Execution** — execute the tasks in this session with checkpoints for review.

Which approach?
