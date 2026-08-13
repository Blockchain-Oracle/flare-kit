# Verification: the four M3 FDC surfaces, driven in a browser

Date: 2026-08-04
Surfaces: FDC-01 `AttestationCatalogue`, FDC-02 `AttestationRequestBuilder`,
FDC-03 `AttestationTimeline`, FDC-04 `ProofDetail`
Harness: `pnpm --filter @flare-kit/react-ui gallery`, Chromium at 1440×1100

Satisfies M3-AC9 and the CLAUDE.md rule that UI is never called done from a
typecheck. Screenshots under `m3-screens/`. States the surface table asks for
and this build does not render are declared at the end of the M3 spec, not here
— this file records what was driven, not what was skipped.

## What was driven

All **29 required states** rendered, from the labelled mock. Console clean —
zero errors, zero warnings — after a reload settled a stale HMR module.

| Screen | States rendered |
|---|---|
| FDC-01 | loading; BASE all nine live; docs/verifier disagreement; a group unreachable; no current family list; matrix stale |
| FDC-02 | BASE ready to submit; not canonicalised yet; fee unavailable; builder planned; proof-owner mismatch; invalid body; submitting |
| FDC-03 | submitted round open; finalized proof not yet published; consensus not reached; round timed out; proof ready and verified; verifier-only no consume step; proof did not verify; consumed |
| FDC-04 | BASE verified consumable; not verified yet; verifier-only; uint64-max sentinel; proof did not verify; already consumed; consumption failed; bound to another address |

## What looking at the pixels and the review gate caught that the tests did not

Seven defects. Three were found by reading the rendered screen rather than the
DOM, one by walking every protocol reading through the reconciler, two by the
review-gate subagents, and one — the worst — by reading a computed style off a
node that looked perfectly fine.

1. **The catalogue's "Consumed by" column was clipped.** At the gallery's width
   the consumer sentence truncated mid-word — "requires a contract this proj".
   That sentence is load-bearing: "no deployed consumer" is a claim this project
   makes out loud, and DESIGN.md forbids a narrow layout hiding it. The table
   went from five columns to three, with the consumer sentence, deprecation note
   and proof-owner rule moved under the family name where they have a
   paragraph's width.

2. **The `JsonApi` deprecation note rendered as a one-word-per-line sliver**,
   squeezed into the status column. Same root cause, same fix. It now reads as a
   sentence.

3. **`RecoveryPanel` told every attestation "Your payment is recorded."** That
   copy came from direct minting and is simply untrue of an attestation request,
   which moves no funds — the same class of untruth as rendering `submitted` as
   `succeeded`. The sentence is now derived from the evidence: it claims a
   payment only when the operation carries an `xrpl_tx`. `packages/react-ui/src/RecoveryPanel.tsx`.

4. **A proof that failed verification marked the wrong step.** Found by walking
   every protocol reading through `reconcileAttestation` and printing the step
   states. `verified: false` counted `verify` as **done** and put the failure
   marker on `consume` — so the spine read "verified, then consumption failed",
   the opposite of what happened, and named a step that never ran as the one
   that broke. It also silently suppressed the red "did not verify" note, which
   keys off `verify`'s state. `packages/core/src/fdc/operation.ts`, plus the
   assertion that would have caught it in `fdc-proof-surfaces.test.tsx`.

5. **An unknown outcome contradicted itself three ways.** Found by the design
   audit. `unknownReason` was UI-only: it never moved the record off
   `awaiting_external`, so a timed-out attestation showed "Waiting on the Flare
   Data Connector until 05:16:20" — a deadline already past — together with
   "Nothing for you to do yet" and "The request can be made again". Three claims
   that cannot all be true. An unknown now reconciles to `action_required`,
   clears the wait descriptor, and carries one recovery action, `request-again`,
   marked `movesNewValue: true` because a second request pays a second fee.
   `packages/core/src/fdc/operation.ts`.

6. **`mock-fdc.ts` re-implemented `claimedStatus` and `familyFor`.** Found by the
   simplifier. Two copies of the status rules, one of which nothing would have
   updated. Deleted in favour of the real ones.

7. **Every primary button in the package rendered flat.** Not an M3 defect —
   M1's and M2's too, since the reset landed. `styles.css` had
   `.fk :where(button) { background: none; color: inherit }`. `:where()` zeroes
   only what it wraps, so the selector still scored `(0,1,0)` from `.fk` — a tie
   with `.fk-btn-primary`, which the reset then won on source order because the
   component `@import`s sit above it. The result was no gradient, no cobalt and
   dark text, against DESIGN.md's *"no flat fills; every interactive surface
   earns its weight"* and the one gradient the design explicitly authorises.
   Rewriting the resets as `:where(.fk button)` scores `(0,0,0)` and lets any
   component class win regardless of order. `packages/react-ui/src/styles.css`.

   It surfaced only from reading `getComputedStyle().backgroundImage` on a
   rendered node — a verification-method failure as much as a CSS one.

None of the seven could fail the tests as written. The first two were legible DOM
with correct text content; the third was a true sentence about a different
capability; the fourth and fifth produced distinct shapes, which is all the
shape test asks for — distinct and wrong; the sixth agreed with the original
exactly until the day it would not.

The seventh is the one worth dwelling on: a flat button still looks like a
button, so no amount of looking at screenshots would ever have caught it.

Verified after the fixes, read back out of the DOM: the primary button carries
its `linear-gradient` and light text while the ghost and disabled variants stay
distinct; the three unknown states
show no wait block and no "nothing to do", each offers "Make the request again",
and the `verified: false` case renders the "did not verify on chain" note that
the step-marker bug had been suppressing.

## What the screen confirms

- **The `uint64`-max sentinel renders digit for digit.** Read back out of the
  DOM, `firstOverflowBlockNumber` and `firstOverflowBlockTimestamp` are both
  `18446744073709551615`, and the string `18446744073709552000` appears nowhere
  on the page. This is the only place the whole path — mock fixture through
  `bigint` through React — can be seen intact. The live run of the same day did
  **not** produce a sentinel, so this fixture is the only evidence of it.
- **Consumption is offered exactly where a consumer exists.** Read from the DOM
  across all eight FDC-04 cases: the two `EVMTransaction` / nonexistence cases
  render no consume control at all, and say "Verification only" with the reason.
  Not a disabled button — no button (M3-AC7).
- **`finalize` and `retrieve` render as separate steps.** In the
  "finalized, proof not yet published" case the spine shows `finalize` done and
  `retrieve` active. That is the state the live run actually produced, and a
  timeline that collapsed them would have shown a proof that was not there.
- **Every unknown reads as an unknown.** "consensus not reached", "round timed
  out" and "proof not yet published" each render an info-toned note carrying its
  own diagnostic sentence and the words "This says nothing about whether the
  attested data is true." None renders as a failure.
- **`planned` is never rendered as supported.** Five families carry the
  `Planned` chip plus the sentence "Served here; this kit ships no builder for
  it."

## Commands

```
pnpm --filter @flare-kit/react-ui gallery   # vite, http://localhost:5183/
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

Gate at the time of this run: **817 passing** — contracts 96 (+2 skipped),
core 545, react-ui 158, react 18.
