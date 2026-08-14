# Connect flow implementation plan (`apps/app`, plan 2 of N)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person can connect a real EVM wallet to the app, see who they are, and disconnect — and a person with no wallet still gets a working app rather than an error.

**Architecture:** EIP-6963 discovery lands in `@flarekit-dev/react` as `useInjectedWallets()`, because `ConnectModal` in `@flarekit-dev/react-ui` was built to consume exactly that shape and an embeddable widget needs connect as much as the app does. The app owns only the wiring: opening the modal, mapping a chosen wallet to an identity, and rendering the account control.

**Tech Stack:** EIP-6963 (`eip6963:announceProvider` / `eip6963:requestProvider`), viem `createWalletClient` + `custom(provider)`, the kit's existing `ConnectModal`, `AccountSheet`, `useAccounts`.

**Spec:** `.thoughts/specs/2026-08-14-app-surface.md` (accepted)

## Global Constraints

- Production files under **300 lines**.
- The app defines no card, badge, pill, chip or spine. It assembles `@flarekit-dev/react-ui`.
- **The app holds no signing key** (R-APP-012). It never stores a private key, a seed, or a session secret. The wallet signs; the app asks.
- **No literal chain id, address or RPC URL.** They come from `@flarekit-dev/contracts`.
- Disconnected is a **first-class state, not an error** (R-APP-011).
- `read` and `plan` need no key, so every family must render read-only with no wallet.
- Gate before every commit: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` from the repo root.
- Browser-verify; look at the screenshot.

## Architecture decision recorded here

`useInjectedWallets()` goes in the **published** `@flarekit-dev/react` package, not in the app.

`ConnectModal`'s `WalletOption` already documents its fields as EIP-6963's (`id` is "the EIP-6963 uuid", `icon` is "EIP-6963 `info.icon`", `detected` is "Announced right now"). The kit ships that socket and nothing fills it, so a widget consumer today has a connect modal they cannot drive. Putting discovery in the app would leave that true.

This adds public API to a package that is publish-ready but **not published** (publishing is on hold), so the cost of getting the shape wrong is low right now and rises the day it ships.

---

### Task 1: EIP-6963 discovery in the kit

**Files:**
- Create: `packages/react/src/use-injected-wallets.ts`
- Modify: `packages/react/src/index.ts` (export it)
- Test: `packages/react/test/use-injected-wallets.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface InjectedWallet {
    readonly id: string      // EIP-6963 info.uuid
    readonly rdns: string     // info.rdns — stable across sessions, unlike uuid
    readonly name: string
    readonly icon: string
    readonly provider: Eip1193Provider
  }
  export function useInjectedWallets(): readonly InjectedWallet[]
  ```

- [ ] **Step 1: Write the failing test**

```tsx
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useInjectedWallets } from '../src/use-injected-wallets.js'

/** Announce a wallet exactly as EIP-6963 specifies. */
function announce(uuid: string, rdns: string, name: string) {
  const detail = Object.freeze({
    info: { uuid, rdns, name, icon: 'data:image/svg+xml,<svg/>' },
    provider: { request: async () => [] },
  })
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }))
}

describe('useInjectedWallets', () => {
  it('starts empty, so no wallet is claimed before one announces', () => {
    const { result } = renderHook(() => useInjectedWallets())
    expect(result.current).toEqual([])
  })

  it('collects a wallet that announces itself', () => {
    const { result } = renderHook(() => useInjectedWallets())
    act(() => announce('uuid-1', 'io.metamask', 'MetaMask'))
    expect(result.current.map((w) => w.name)).toEqual(['MetaMask'])
  })

  it('keeps one entry per wallet when it announces twice', () => {
    const { result } = renderHook(() => useInjectedWallets())
    act(() => {
      announce('uuid-1', 'io.metamask', 'MetaMask')
      announce('uuid-2', 'io.metamask', 'MetaMask')
    })
    // Deduped on rdns, not uuid: the uuid is per-announcement and a wallet that
    // announces on every request would otherwise stack up duplicate rows.
    expect(result.current).toHaveLength(1)
  })

  it('collects several distinct wallets', () => {
    const { result } = renderHook(() => useInjectedWallets())
    act(() => {
      announce('uuid-1', 'io.metamask', 'MetaMask')
      announce('uuid-2', 'io.rabby', 'Rabby')
    })
    expect(result.current.map((w) => w.rdns).sort()).toEqual(['io.metamask', 'io.rabby'])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/react && pnpm vitest run test/use-injected-wallets.test.tsx`
Expected: FAIL — cannot resolve `../src/use-injected-wallets.js`.

- [ ] **Step 3: Implement**

```ts
import { useEffect, useState } from 'react'

/** The 1193 surface this hook needs; viem's `custom()` takes the same shape. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

export interface InjectedWallet {
  readonly id: string
  /** Reverse-DNS identity. Stable across sessions; the uuid is not. */
  readonly rdns: string
  readonly name: string
  readonly icon: string
  readonly provider: Eip1193Provider
}

interface AnnounceDetail {
  info: { uuid: string; rdns: string; name: string; icon: string }
  provider: Eip1193Provider
}

/**
 * EIP-6963 discovery. Wallets announce themselves; nothing is probed, and
 * `window.ethereum` is deliberately NOT read — it names whichever wallet won a
 * race, which is how a user with two wallets installed ends up connected to the
 * one they did not choose.
 *
 * Deduped on `rdns`: the uuid is per-announcement, and a wallet that re-announces
 * on every request would otherwise stack duplicate rows in the modal.
 */
export function useInjectedWallets(): readonly InjectedWallet[] {
  const [wallets, setWallets] = useState<readonly InjectedWallet[]>([])

  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const { info, provider } = (event as CustomEvent<AnnounceDetail>).detail
      setWallets((current) =>
        current.some((wallet) => wallet.rdns === info.rdns)
          ? current
          : [...current, { id: info.uuid, rdns: info.rdns, name: info.name, icon: info.icon, provider }],
      )
    }

    window.addEventListener('eip6963:announceProvider', onAnnounce)
    // Ask any wallet that loaded before this mounted to announce again.
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce)
  }, [])

  return wallets
}
```

Export it from `packages/react/src/index.ts` alongside the other hooks.

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd packages/react && pnpm vitest run test/use-injected-wallets.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/use-injected-wallets.ts packages/react/src/index.ts packages/react/test/use-injected-wallets.test.tsx
git commit -m "EIP-6963 discovery: the kit's connect modal finally has something to drive it"
```

---

### Task 2: The app's connect wiring

**Files:**
- Create: `apps/app/components/connect.tsx`, `apps/app/lib/connect.ts`
- Test: `apps/app/test/connect.test.tsx`

**Interfaces:**
- Consumes: `useInjectedWallets`, `InjectedWallet` from `@flarekit-dev/react`; `ConnectModal`, `WalletOption` from `@flarekit-dev/react-ui`.
- Produces:
  ```ts
  export function toWalletOptions(wallets: readonly InjectedWallet[], recentRdns?: string): WalletOption[]
  export function ConnectControl(): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest'
import { toWalletOptions } from '../lib/connect'

const wallet = (rdns: string, name: string) => ({
  id: `uuid-${rdns}`, rdns, name, icon: 'data:,', provider: { request: async () => [] },
})

describe('toWalletOptions', () => {
  it('marks an announced wallet as detected, because it genuinely is', () => {
    const [option] = toWalletOptions([wallet('io.metamask', 'MetaMask')])
    expect(option!.detected).toBe(true)
    expect(option!.family).toBe('evm')
  })

  it('marks the last-used wallet as recent', () => {
    const options = toWalletOptions(
      [wallet('io.metamask', 'MetaMask'), wallet('io.rabby', 'Rabby')],
      'io.rabby',
    )
    expect(options.find((o) => o.name === 'Rabby')!.recent).toBe(true)
    expect(options.find((o) => o.name === 'MetaMask')!.recent).toBeFalsy()
  })

  it('claims nothing is recent when nothing was used before', () => {
    const options = toWalletOptions([wallet('io.metamask', 'MetaMask')])
    expect(options.every((o) => !o.recent)).toBe(true)
  })

  it('offers no wallet when none announced, rather than inventing one', () => {
    expect(toWalletOptions([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/app && pnpm vitest run test/connect.test.tsx`
Expected: FAIL — cannot resolve `../lib/connect`.

- [ ] **Step 3: Implement `lib/connect.ts`**

```ts
import type { InjectedWallet } from '@flarekit-dev/react'
import type { WalletOption } from '@flarekit-dev/react-ui'

/** Remembered across sessions so the modal can mark one row Recent. Not a secret. */
export const RECENT_WALLET_KEY = 'flare-kit:app:wallet:v1'

/**
 * Announced wallets, as rows the modal can render.
 *
 * `detected` is true because the wallet ANNOUNCED — it is an observation, not a
 * guess. Nothing here lists a wallet that is not installed: an aspirational row
 * for a wallet the user does not have is the connect-flow version of a
 * fabricated balance.
 */
export function toWalletOptions(
  wallets: readonly InjectedWallet[],
  recentRdns?: string,
): WalletOption[] {
  return wallets.map((wallet) => ({
    id: wallet.id,
    name: wallet.name,
    icon: wallet.icon,
    family: 'evm' as const,
    detected: true,
    recent: recentRdns !== undefined && wallet.rdns === recentRdns,
  }))
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd apps/app && pnpm vitest run test/connect.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write `components/connect.tsx`**

A `'use client'` component that: renders the account control (connect button when disconnected, `AccountSheet` trigger when connected), opens `ConnectModal` with `toWalletOptions(useInjectedWallets(), recent)`, and on select calls `eth_requestAccounts` on that wallet's provider, builds a viem wallet client with `custom(provider)`, hands the identity to `useAccounts().setIdentity`, and writes the chosen `rdns` to `RECENT_WALLET_KEY`.

Read `packages/react-ui/src/ConnectModal.tsx` and `AccountSheet.tsx` for their exact props before writing this. Keep it under 300 lines; if it grows, split the provider handshake into `lib/connect.ts`.

**The app never stores a key.** It stores one `rdns` string, which is a wallet's public identity, not a credential.

- [ ] **Step 6: Mount it in the top bar**

`TopBar` already takes an `account` slot. Pass `<ConnectControl />` from the shell.

- [ ] **Step 7: Run the gate and commit**

```bash
git add apps/app
git commit -m "Connect a real wallet: announced wallets only, and no key ever stored"
```

---

### Task 3: Disconnected is first-class

**Files:**
- Test: `apps/app/test/disconnected.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConnectControl } from '../components/connect'

describe('with no wallet', () => {
  it('offers to connect rather than reporting an error', () => {
    render(<ConnectControl />)
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('claims no address', () => {
    render(<ConnectControl />)
    expect(screen.queryByText(/0x[0-9a-fA-F]{4}/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it, watch it fail, implement to green, commit.**

Follow the same red-green-commit cycle as the tasks above.

---

### Task 4: Browser verification and evidence

- [ ] **Step 1** Drive `/swap` with **no wallet**: the app must render, the rail must work, the account control must say Connect, and nothing may look like an error.
- [ ] **Step 2** Open the connect modal. With no wallet extension present it must show an honest empty state, **not** a fabricated wallet list.
- [ ] **Step 3** Screenshot both, both themes, and read them.
- [ ] **Step 4** Console must be clean.
- [ ] **Step 5** Record `.thoughts/verification/2026-08-14-connect-flow.md` with the gate output verbatim.
- [ ] **Step 6** Commit.

**A live connection to a real wallet is NOT part of this plan.** It needs a browser extension and Abu's own hands. Record what was verified without one, and say plainly that the connected path is unverified.

## Self-review

**Spec coverage.** R-APP-010 → Tasks 1 and 2. R-APP-011 → Task 3. R-APP-012 → Task 2's no-key rule, asserted by the absence of any credential write.

**Not covered, and owned by plan 3:** R-APP-008 verified flags, R-APP-009 network-scoped operations, R-APP-013/014/015/016 operations and the spine. No operation is performed by this plan.

**Known soft spot.** Task 2 Step 5 describes the provider handshake in prose rather than code, because `ConnectModal` and `AccountSheet`'s exact props must be read from source first. That step is a genuine instruction to go and read, not a placeholder — but it is the one step a reviewer should check hardest.
