# M4-R13 — MintFXRP, RedeemFXRP, RecoveryPanel, state by state

Audited 2026-08-05 against DESIGN.md, CLAUDE.md, the surface map (FX-02, FX-07,
SH-06) and SPEC.md. Read from source and measured in the browser through
computed styles. Every finding below is **pre-existing M1** unless noted.

## Fixed in this pass

| # | Finding | Why it mattered |
|---|---|---|
| **C7** | `.g-section h2` in the gallery beat `.fk-panel-title` on specificity | **Every M3 and M4 panel screenshot ever taken showed the wrong heading** — mono 12px uppercase faint instead of Bricolage 1.06rem/700 — and it uppercased asset symbols, so `FMockXRP` rendered `FMOCKXRP`, an identifier losing its casing. One character: `>`. Verified fixed by computed style. |
| **C6** | An **expired** recovery window rendered as *"nothing is at risk while it completes"* | `availableActions` filters on blocked, early **and expired**; the fall-through only ever inspected the first two. A closed window became an affirmative safety claim about a state never established — on the one surface whose job is telling somebody what they can still do. Now three distinct branches: expired, blocked, early. |
| **C4** | A paused asset manager rendered as *"Amount too small"* | `canProceed` is false for three reasons and only one is the user's amount. Two are protocol-wide outages, and the copy sent people off to edit a number that was never the problem — an unavailable source shown as user error, hiding the outage. |
| **C2** | The XRPL **memo** was not on screen at all | It is the field that binds the mint to the recipient; without it an irreversible payment routes elsewhere. Absent from the last screen before signing. Now an `EvidenceChip`, because the payer must paste it into their own wallet. |
| **C5** | Four exact values rendered in the body face | Including the figure AC7's whole refusal turns on. `.fk-note-body` inherits the sans face. |
| **I6** | `RecoveryPanel` root carried no `fk` class | Every token is declared on `.fk`. Dropped standalone into a host page, every `var(--fk-*)` resolved to nothing. It only looked right because the gallery root happens to carry `fk`. |
| **I4** | `RecoveryPanel` read `Date.now()` during render | A time-gated action never appeared until something else forced a re-render, and no time-gated state was reachable in a test. Now `nowMs`, the M3/M4 convention. |

## Ruling — I9, WALLET on the composers

**Delegated, and now recorded rather than silently omitted.** `MintFXRP` and
`RedeemFXRP` take `recipient` and `xrplAccount` as **required** strings: the host
resolves an account before either composer renders, so "not connected" is not
expressible by construction. `WALLET` belongs to SH-02 `AccountSheet` and SH-03
`NetworkResolutionSheet`, which own connection, wrong-network and wrong-account.

The audit was right that the surface map requires such an exception to be
recorded in the design contract, and that no record existed. This is it.

**One real gap remains inside that ruling:** `useDirectMint` returns `binding`
and both composers discard it, so a wallet switched *between* quoting and
pressing is only discovered at the press, surfacing as the generic "That did not
start". Carried, not fixed.

## Carried, with reasons

- **C1 — quote-dependent states unreachable from props.** The amount is internal
  `useState` with no seed prop, so from props alone only `loading` and an empty
  form are reachable. Below-minimum, insufficient, large-mint delay, no-executor
  and blocked are reachable **only by typing**, which is why the jsdom tests pass
  and why **AC7's refusal has never been looked at in a browser**. Fix is an
  optional `defaultAmountXrp` / `defaultLots` seed plus a gallery case each.
  This is the one that unlocks looking at the rest.
- **C3 — `quote expired`.** `DirectMintQuote` carries `expiresAt` and a 60s TTL;
  neither composer renders it or holds a clock, so a stale quote stays on screen
  with the button enabled. `RedeemQuote` has **no `expiresAt` field at all**, so
  for redeem it is not expressible in core, let alone the UI.
- **I1** — three gallery cases named for states their props cannot express
  ("with an executor named" is byte-identical to "ready"; both "ready" cases are
  empty forms). Same pattern as FTSO's "provider conflict": the name tells the
  next reviewer the state was checked.
- **I3** — `RecoveryPanel` renders 3 of SH-06's 9 required data fields, though
  `preconditions`, `signs`, `broadcasts` and `nextState` are all on the type.
- **I5** — the `movesNewValue: true` branch has never been rendered anywhere:
  no test, no gallery, no production path. It is SH-06's duplicate-value danger.
- **I11** — `insufficient` compares bigints without checking asset or decimals;
  a mismatched balance makes `subAmounts` **throw during render**.
- **I2, I7, I8, I10** and nine minors, including that `Max` sets the entire XRPL
  balance, which is unsendable once base reserve and fee are taken.

## What the audit did not find

No `submitted` rendered as `succeeded`. No unknown rendered as failed on either
composer. All `DetailRow` values correctly mono. No horizontal overflow at 420px.
No contrast findings — M4-R12 had already cleared that ground.
