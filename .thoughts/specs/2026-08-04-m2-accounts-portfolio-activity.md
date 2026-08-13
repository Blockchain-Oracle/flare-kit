# Spec: M2 — accounts, signing authority, portfolio and activity

Date: 2026-08-04
Milestone: M2 of `.thoughts/decisions/2026-08-04-build-everything-real-first.md`
Depends on: M1 (mint and redeem, live) — complete

## Objective

A person connects an EVM account and an XRPL account at the same time, sees
everything those two identities hold with the source and freshness of every
number visible, and finds any operation they have ever started — including one
still in flight — without the product ever flattening a multi-chain journey
into a single hash or presenting an indexed guess as canonical truth.

This is the first milestone that is not one operation. It is the layer that
makes the operations findable.

## What it covers

Accepted requirements: **R-WALLET-001 … 009** and **R-DATA-001 … 009**
(`.thoughts/specs/2026-08-03-flare-application-layer.md` §5 and §13).

Accepted surfaces: **SH-02**, **SH-03**, **SH-10**, **USER-01**, **USER-02**,
**USER-03** (`.thoughts/design/2026-08-03-product-surface-map.md`).

## What it deliberately does not cover

Portfolio is specified (R-DATA-002) to include vault positions, bridge messages,
delegation and staking. **None of those capabilities exist yet.** M2 builds the
portfolio's structure and shows what is real today — native balances, the FAsset,
and pending operations — with the remaining position types declared as unbuilt
rather than rendered empty. An empty vault row implies a vault you do not have.

`SH-11` unsigned-payload inspection, `SH-09` authority and grants, and `USER-04`
participation are out of scope here and belong to later milestones.

## The two ideas this milestone turns on

**1. A number without a source is not evidence.** Every value on a portfolio or
activity surface carries where it came from and when it was observed. A balance
read directly from a contract, a balance from an indexer, and a balance from a
cache are three different claims, and R-DATA-005 requires they stay distinct
source classes. So the unit of portfolio data is not a number — it is an
`Observation`.

**2. Read-only is a mode, not a degradation.** R-WALLET-003 and SH-02 both make
an explicitly supplied read-only identity a first-class way to use the product.
A judge with no wallet must be able to watch a real operation. Read-only is
therefore never reached by failing to connect; it is chosen, and it says plainly
what it cannot do.

## Requirements

- **M2-R1** — `Observation<T>` in core: value, source class, provider, network,
  observed-at, and staleness. Every portfolio and activity value is one.
  Source classes are distinct: `chain` (direct read), `indexer`, `provider`,
  `cache`, `local` (our own operation record).
- **M2-R2** — `AccountContext`: simultaneous EVM and XRPL identity, each with a
  custody class (`external-wallet`, `read-only`, `agent-key`) and its own
  connection state. Neither is required for the other to be usable.
- **M2-R3** — Account binding. A quote, approval and execution each record the
  account and chain they were made for; a mismatch **invalidates** the action
  and says so, rather than silently rebinding it (R-WALLET-008).
- **M2-R4** — `readPortfolio` returns observations across both identities: C2FLR
  and XRP native balances, the FAsset balance, and open operations from the
  registry. Position types not yet built are declared unbuilt, never shown as
  zero.
- **M2-R5** — `ActivityFeed` is operation-centric: every entry is a durable
  operation with its state, its evidence, and its underlying events reachable.
  A mint's XRPL payment, FDC round and Flare execution stay three identifiers,
  never one (R-DATA-003).
- **M2-R6** — Explorer links are generated from the operation's actual network
  and identifier, covering Flare and XRPL separately (R-DATA-007).
- **M2-R7** — `AccountSheet` (SH-02), `NetworkResolutionSheet` (SH-03),
  `PortfolioTable` (USER-01), `ActivityTable` (USER-02), `SourceDrawer`
  (USER-03) and `PendingTray` (SH-10), each rendering every state in its
  required-state list against the mock and the live kit.
- **M2-R8** — No seed phrase or private key is logged, persisted or transported
  (R-WALLET-004). A test asserts the storage codec and every export path reject
  them, extending the guard already in `storage.ts`.

## Required states

| Surface | States |
|---|---|
| AccountSheet (SH-02) | disconnected, connecting, rejected, unavailable wallet, wrong network, account changed, restored session, read-only supplied, invalid read-only identity, both ready |
| NetworkResolutionSheet (SH-03) | wrong network, wrong account, switch rejected, unsupported combination, restored, expired |
| PortfolioTable (USER-01) | loading, ready, no assets, read-only mode, partial account coverage, stale, source conflict |
| ActivityTable (USER-02) | loading, empty, ready, backfilling, partial coverage, export error |
| SourceDrawer (USER-03) | ready, canonical/indexed conflict, provider unavailable |
| PendingTray (SH-10) | loading, empty, active, action required, partial, degraded source, restored |

## Acceptance criteria

- **M2-AC1** — Mock: every state above is reachable.
- **M2-AC2** — Live on Coston2 and XRPL Testnet: the portfolio shows the real
  C2FLR, XRP and FTestXRP balances of the funded accounts, each labelled with
  its source and observation time. Evidence recorded.
- **M2-AC3** — The two completed operations from M1 appear in activity, each
  with its own state and its own identifiers — the mint's XRPL payment, FDC
  round and Flare execution shown as three, not one.
- **M2-AC4** — A stale or unavailable source renders as stale or unavailable,
  never as zero and never as a confident number.
  Clarified 2026-08-04 after review: `no assets` is a **confident claim about
  an account**, so it is reachable only when every attached identity's every
  read landed. A portfolio holding any unread source is never empty, and a
  family whose reads only partly landed is `partial`, not `covered`.
- **M2-AC5** — Read-only identity: the portfolio and activity render fully, and
  every write control states that it cannot sign.
- **M2-AC6** — An account mismatch between a quote and the connected account
  blocks execution and names both accounts.

## Verification

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
node packages/core/scripts/live-portfolio.mjs     # M2-AC2 and M2-AC3, evidence recorded
```

## Checklist

- [x] M2-R1 Observation with distinct source classes
- [x] M2-R2 simultaneous EVM + XRPL account context with custody classes
- [x] M2-R3 account binding; mismatch invalidates. `useActionBinding` records
      the accounts at quote time and `assertStillValid()` gates both
      `useDirectMint.start` and `useRedeem.start`, so M2-AC6 is reachable from
      the hooks every surface uses — driven end to end in
      `packages/react/test/binding-gate.test.tsx`. `NetworkResolutionSheet`
      (SH-03) renders the mismatch it produces.
- [x] M2-R4 readPortfolio across both identities; unbuilt declared
- [x] M2-R5 operation-centric activity, events never flattened
- [x] M2-R6 explorer links per network and identifier
- [x] M2-R7 six surfaces, every state — driven in a browser and screenshotted;
      evidence and the six defects the screenshots caught are in
      `.thoughts/verification/2026-08-04-m2-surfaces.md`
- [x] M2-R8 no secret is logged, persisted or transported
- [x] M2-AC2 live portfolio against the funded accounts, evidence recorded —
      `.thoughts/verification/2026-08-04-coston2-live-portfolio.md`. Read with
      no signing key, through the read-only identity path. M2-AC3 covered by
      the same run: every M1 identifier looked up live, the mint's three kept
      as three.
