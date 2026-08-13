# Decision: two M2 questions the spec left open

Date: 2026-08-04
Milestone: M2 — accounts, signing authority, portfolio and activity
Status: adopted, decided during build rather than escalated

`.thoughts/brief.md` recorded two unknowns that block writing M2 code. Both are
answered by artifacts that already exist, so neither is a taste decision and
neither stops the build. Recorded here so the reasoning survives a context
reset.

## 1. `indexer` and `provider` source classes have no producer in M2

**Decision.** `Observation` carries all five source classes from the day it is
written. Only `chain` and `local` have a live producer in M2. `indexer`,
`provider` and `cache` are declared with **no configured producer** — never
rendered as an empty or zero source, and never quietly downgraded to `chain`.
M2 builds **no** indexer adapter.

**Why this and not an adapter.** M2-R4 enumerates exactly what `readPortfolio`
returns: "C2FLR and XRP native balances, the FAsset balance, and open
operations from the registry." An indexer is not in that list. The spec's own
`## What it deliberately does not cover` establishes the pattern for this
milestone — build the structure, show what is real today, declare the rest
unbuilt rather than render it empty. Goldsky and SubQuery are named in
`.thoughts/wiki/ecosystem-tools.md` but both are qualified there and no adapter
exists in the tree; building one would be a second milestone's work smuggled
into this one.

**Why the classes exist anyway.** R-DATA-005 requires the classes stay
distinct, and the type is the thing that keeps them distinct. Adding an indexer
later must not change `Observation`'s shape or every consumer's narrowing.

**How the required states are still reached.** USER-01 needs `stale` and
`source conflict`; USER-03 needs `canonical/indexed conflict` and `provider
unavailable`. M2-AC1 scopes those to the mock, and CLAUDE.md already governs
how: mock mode is explicit, labelled, and never a fallback triggered by a
failure. The mock produces indexer and provider observations under its own
label. The live kit produces `chain` and `local` only.

## 2. `ConnectButton` versus `AccountSheet` (SH-02)

**Decision.** `AccountSheet` replaces `ConnectButton`. `ConnectButton.tsx` is
deleted, its export removed, and its state tests move to `AccountSheet` and
grow to the ten states SH-02 requires. Wrong-network and wrong-account repair
leaves the connection surface entirely and becomes `NetworkResolutionSheet`
(SH-03), which is the surface the map assigns it to.

**Why replacement and not coexistence.** The two are the same screen at two
sizes, not a trigger and a panel. `ConnectButton` already renders two account
rows, a live region and four conditional notes — it is a connection sheet that
was named after a button. Its six statuses (`disconnected`, `connecting`,
`rejected`, `wrong_network`, `ready`, `read_only`) are a strict subset of
SH-02's ten, which add unavailable wallet, account changed, restored session
and invalid read-only identity. CLAUDE.md: "Delete dead code as you migrate.
When a flow is rebuilt, remove the old implementation. Never keep two versions
of the same screen."

**Why deletion is safe.** Nothing consumes `ConnectButton` except its own
tests and the package barrel. There is no `apps/` directory, every package is
at `0.1.0`, and `.changeset/` holds only `config.json` — nothing has been
published, so no external caller breaks.

**What is preserved.** The custody-is-stated-never-implied rule, the
read-only-is-a-mode framing, and the "two chain families, one session" header
comment all carry into `AccountSheet`. Custody stops being a display-only
`string` and becomes M2-R2's `CustodyClass`.

## Consequence for the checklist

Neither decision changes M2's requirement list. M2-R7's `AccountSheet` line now
also means "and `ConnectButton` is gone."
