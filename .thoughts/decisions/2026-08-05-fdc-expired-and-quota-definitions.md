# Decision: the three FDC items M3 declared unbuilt

Date: 2026-08-05
Status: accepted — M4-R14
Supersedes the "Declared unbuilt" section of
`.thoughts/specs/2026-08-04-m3-fdc-surfaces.md:378-399`

M3 declared three items unbuilt for want of a **definition**, not for want of
effort. M4-R14's job was to supply each definition and then build it or
re-declare it with the definition attached. Two are built; one is re-declared.

## 1. FDC-04 `expired` — DEFINED AND BUILT

**Definition.** A proof is expired when **the Relay no longer holds the merkle
root for its voting round**.

M3 was right that a proof carries no expiry of its own, and that FAssets'
consumption window is a property of the mint rather than of the proof. But
`FdcVerification` verifies against `Relay.merkleRoots(protocolId,
votingRoundId)`, and those roots are **not** retained forever.

Measured on Coston2, 2026-08-05:

| voting round | protocol 200 (FDC) | protocol 100 (FTSO) |
|---|---|---|
| 1416600 | SET | SET |
| 1130919 | SET | SET |
| 900000 | **ZERO** | SET |
| 500000 | ZERO | ZERO |

So a root does disappear, the two protocols drop at different depths, and once
it is gone the proof can never be verified on chain again **by anyone**. That is
permanent, on-chain observable, and distinct from all three verification
outcomes — not-yet-asked, verified, did-not-verify.

Rendered as `att`, never `bad`: nothing failed and the proof was never wrong.
The chain stopped keeping the root it would be checked against. `undefined` on
the prop means nobody checked, which is not "still valid".

## 2. An `EVMTransaction` `value` — DEFINED AND BUILT

**Definition.** The unit belongs to the **source**, not to the family.

`testFLR`, `testETH` and `testSGB` sit on one family row, so no family-level
asset can be right for all three, which is why the table declared none and a
real amount rendered as a bare integer. `FamilySource` now carries `nativeUnit`,
and the family lists `nativeUnitResponseFields: ['value']` — "this is an amount,
ask the source what it is denominated in".

Without a source the field still renders as a bare integer. That is the honest
fallback: **a wrong ticker beside a real number is worse than no ticker.**

## 3. FDC-02 / FDC-03 `quota limited` — DEFINED, RE-DECLARED UNBUILT

**Definition.** The verifier refusing a request for rate or volume reasons
rather than for anything about the request itself — an HTTP 429, or a 4xx whose
body names a quota — leaving the request unsent and safely retryable later.

**Still not built, and deliberately.** No quota response has ever been observed
from either verifier: not across M3's build, not across four live submissions,
not across M4's runs. The state's *rendering* would be easy; what is missing is
any observed behaviour to render. Building it would mean inventing a provider
response shape, choosing a retry-after that nothing reported, and showing a
person a message no verifier has sent — which is faking provider behaviour, the
thing this project refuses.

**What would unblock it:** one observed quota response, captured with its status,
body and headers. The definition above is ready to build against the moment one
exists. Deliberately not pursued by hammering a public verifier to induce one.
