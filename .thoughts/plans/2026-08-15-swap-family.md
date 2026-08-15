# Swap family implementation plan (`apps/app`, plan 3 of N)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One family — Swap — wired end to end in the app, establishing the pattern every remaining family follows.

**Architecture:** The missing `useSwap` hook lands in the published `@flarekit-dev/react`, not in the app. The app's panel then assembles `SwapCard` + `TokenSelector` over it, renders read-only with no wallet, and refuses to compose on a network whose `dexVerified` flag is false.

**Tech Stack:** `@flarekit-dev/core` swap lifecycle (`createSwap`, `buildSwapPlan`, `applyQuote`, `applyTransition`), `@flarekit-dev/react-ui` (`SwapCard`, `TokenSelector`), viem.

**Spec:** `.thoughts/specs/2026-08-14-app-surface.md` (accepted)

## The finding that shapes this plan

**Three families have no hook: swap, pools, vaults.**

Verified 2026-08-15 against `packages/react/src/` — every other family has one
(`use-bridge`, `use-staking`, `use-delegation`, `use-rewards`, `use-governance`,
`use-smart-account`, `use-portfolio`, `use-activity`, the FDC and FTSO hooks,
`use-gasless`, `use-x402`). Swap, liquidity and vaults have complete core
lifecycles and styled components, and nothing in between.

This is the same shape as the EIP-6963 gap found in plan 2: **the kit ships a
socket with nothing to fill it.** A consumer who installs `@flarekit-dev/react-ui`
for `SwapCard` today has no supported way to drive it, and would have to
re-implement the quote/submit/reconcile loop themselves — which is the loop the
kit exists to own.

So `useSwap` goes in the published package. Building it inside the app would
leave that true for everyone else, and would put a lifecycle in a screen, which
CLAUDE.md forbids twice over.

`usePool` and `useVault` are the same gap and are **out of scope here** — they
get their own plan once this one proves the pattern. They are named so they are
not forgotten.

## Global Constraints

- Production files under **300 lines**.
- The app defines no card, badge, pill, chip or spine. It assembles the kit.
- **No literal address, chain id, token or RPC URL** — all from `@flarekit-dev/contracts`.
- The app holds no key. `read` and `plan` need none; the wallet signs.
- `submitted` is never rendered as `succeeded`; an unknown outcome is never failed.
- Exact values in the mono face, full precision, carrying their asset.
- A capability whose verified flag is false is a **read lens**: it reads, refuses to compose, and says why.
- Gate before every commit: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`.
- Browser-verify and look at the screenshot.

---

### Task 1: `useSwap` in the kit

**Files:**
- Create: `packages/react/src/use-swap.ts`
- Modify: `packages/react/src/index.ts`
- Test: `packages/react/test/use-swap.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface UseSwapResult {
    readonly operation: SwapOperation | undefined
    readonly quoteResult: SwapQuoteResult | undefined
    readonly isSettled: boolean
    readonly canWrite: boolean
    readonly error: SerializedError | undefined
    quote(input: { amountIn: string }): void
    plan(): SwapPlanResult | undefined
    submit(): void
  }
  export function useSwap(input: UseSwapInput): UseSwapResult
  ```

Read `packages/react/src/use-governance.ts` FIRST and mirror its shape: keyless
reads, a pure synchronous `plan` that returns `undefined` before a read lands, a
`canWrite` that is true only when a `walletClient` is injected **and** a read has
landed, and separate internal slots for a write refusal and a poll-tick failure
so a successful poll cannot wipe a standing refusal.

- [ ] **Step 1: Write the failing test**

```tsx
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSwap } from '../src/use-swap.js'

describe('useSwap', () => {
  it('plans nothing before a quote has landed, rather than planning off a guess', () => {
    const { result } = renderHook(() => useSwap(READ_ONLY_INPUT))
    expect(result.current.plan()).toBeUndefined()
  })

  it('cannot write without a wallet, even once a quote has landed', () => {
    const { result } = renderHook(() => useSwap(READ_ONLY_INPUT))
    expect(result.current.canWrite).toBe(false)
  })

  it('refuses to compose on a deployment whose dex is not verified', () => {
    const { result } = renderHook(() => useSwap(UNVERIFIED_INPUT))
    const planned = result.current.plan()
    expect(planned === undefined || planned.ok === false).toBe(true)
  })
})
```

Build `READ_ONLY_INPUT` and `UNVERIFIED_INPUT` from the mock the gallery already
uses — read `packages/react-ui/gallery/m5-swap-sections.tsx` for how the swap
lifecycle is driven, and `packages/react/test/use-governance.test.tsx` for the
harness shape. **Do not invent fixture values**; derive them from the mock.

- [ ] **Step 2: Run it and watch it fail.** `cd packages/react && pnpm vitest run test/use-swap.test.tsx` — expect "cannot resolve ../src/use-swap.js".

- [ ] **Step 3: Implement**, mirroring `use-governance.ts`. Export from `index.ts`.

- [ ] **Step 4: Run it green.** Add cases as the shape settles — quote lands, submit moves to `submitted`, reconcile advances to `succeeded` only from a read.

- [ ] **Step 5: Gate, then commit**

```bash
git commit -m "useSwap: the swap card finally has a supported way to be driven"
```

---

### Task 2: The swap panel

**Files:**
- Create: `apps/app/components/panels/swap-panel.tsx`
- Modify: `apps/app/app/[family]/page.tsx` (route `swap` to it)
- Test: `apps/app/test/swap-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SwapPanel } from '../components/panels/swap-panel'

describe('the swap panel', () => {
  it('renders read-only with no wallet, not an error', () => {
    render(<SwapPanel />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('states the network it is reading', () => {
    render(<SwapPanel />)
    expect(screen.getByText(/coston2/i)).toBeInTheDocument()
  })

  it('claims no balance it has not read', () => {
    render(<SwapPanel />)
    // An unread balance renders as an em dash, never as zero.
    expect(screen.queryByText(/^0(\.0+)?$/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement.** Assemble `SwapCard` + `TokenSelector` over `useSwap`. Tokens come from `dexFor(chainId).tokens`, never literals. Pass `networkLabel` from the selected network. Under 300 lines; if it grows, the token-selection state goes to `apps/app/lib/swap-panel-state.ts`.

- [ ] **Step 4: Run it green. Step 5: Gate. Step 6: Commit.**

---

### Task 3: The pair gate

**CORRECTED 2026-08-15, before implementation.** This task originally assumed a
`dexVerified` boolean and there is no such flag. Read
`packages/contracts/src/dex.ts`: the only flag is **`addLiquidityVerified`**, and
it is specific to the `addLiquidity` signature — BlazeSwap/Coston2 carries a
non-standard `feeBips` signature, and a mainnet router using the standard one
would revert against the calldata this kit builds. It says nothing about swap.

Swap's honesty mechanism is **stronger than a flag**: `canonicalPair` is the pair
the R1 probe verified holds liquidity, and *"every other pair is still gated by a
live `getPair` check before it quotes."* So the guarantee is per-pair and live,
not per-network and remembered.

The task is therefore to render THAT truth, not a fabricated flag.

**Files:**
- Test: `apps/app/test/swap-panel.test.tsx` (extend)

- [ ] **Step 1: Write the failing test** — a pair whose `getPair` check has not
  come back must not present a quote, and the panel must say which pair it is
  offering by default and why.

```tsx
it('offers the probe-verified canonical pair by default', () => {
  render(<SwapPanel />)
  // From dexFor(chainId).canonicalPair — never a hardcoded symbol.
  expect(screen.getByText(/USD₮0|FXRP/)).toBeInTheDocument()
})

it('presents no quote for a pair whose liquidity has not been read', () => {
  render(<SwapPanel />)
  expect(screen.queryByText(/minimum received/i)).toBeNull()
})
```

Read `packages/core/src/swap-quote.ts` and the M5 verification evidence for the
real behaviour before asserting on copy.

- [ ] **Step 2-4: red, green, gate. Step 5: Commit.**

---

### Task 4: Browser verification

- [ ] **Step 1** Drive `/swap` with no wallet, both networks, both themes.
- [ ] **Step 2** Screenshot each and **read them**.
- [ ] **Step 3** Console clean.
- [ ] **Step 4** Record `.thoughts/verification/2026-08-15-swap-family.md` with the gate output verbatim.
- [ ] **Step 5** Commit.

**A live swap is NOT in this plan.** It moves value and needs Abu's explicit go.
Record the composed-and-signed path as unverified.

## Self-review

**Spec coverage.** R-APP-008 (verified flags) → Task 3. R-APP-011 (read-only with
no wallet) → Task 2. R-APP-013 (assembles the kit) → Task 2. R-APP-016 (mono,
full precision) → inherited from `SwapCard`.

**Not covered:** R-APP-009 (network-scoped operations) and R-APP-014
(self-reconciliation across reload) need two families to be meaningful, and get
their own plan.

**Known soft spot.** Task 1's test fixtures are described rather than written,
because they must be derived from the gallery's mock rather than invented. That
is the step a reviewer should check hardest — an invented fixture would make the
hook pass against a world that does not exist.
