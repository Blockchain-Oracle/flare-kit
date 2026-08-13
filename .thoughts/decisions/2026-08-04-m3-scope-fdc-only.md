# Decision: M3 is FDC only, and `createFdcClient` becomes generic

Date: 2026-08-04
Milestone: M3 — FDC surfaces
Status: adopted, decided by Abu before the spec was written

`.thoughts/decisions/2026-08-04-build-everything-real-first.md:82` names M3 as
"FDC and FTSO surfaces" — ten surfaces across two protocols. `.thoughts/state.json`
`next_authorized_action` deliberately left the split to Abu. `.thoughts/brief.md`
recorded it as genuine unknown #1, and unknown #2 recorded that the FDC
generalisation shape was unspecified. Both were put to Abu and both are answered
here. This supersedes the combined reading of the decision doc; it does not
supersede the doc itself, which still owns milestone ordering.

## 1. M3 takes FDC only; FTSO becomes M4

**Decision.** M3 builds FDC-01 through FDC-04. FTSO-01 through FTSO-06 move to
M4 intact — same surface map rows, same requirements, no rescoping.

**Why FDC first and not FTSO first.** The two halves are not independent.
`.thoughts/design/2026-08-03-product-surface-map.md:267` requires FTSO-03 to
retrieve and verify a scaling-feed proof, and
`developer-hub/docs/ftso/scaling/2-getting-started.mdx:61-81` puts that proof on
**the same DA host as FDC at a different API version** —
`ctn2-data-availability.flare.network` path `/api/v0/ftso/anchor-feeds-with-proof`,
where FDC uses `/api/v1/fdc/proof-by-request-round`
(`packages/contracts/src/fdc.ts:161`). FTSO-03's proof retrieval is therefore
downstream of whatever shape FDC's generalises into. Building FDC first means
FTSO-03 inherits a settled path. Building FTSO first means it invents a second
one that FDC then has to be reconciled with, and `CLAUDE.md` forbids carrying two
versions of the same flow.

**Why this is not a deadline decision.** `CLAUDE.md` states that a deadline never
drives a quality or architecture decision and that plans are never framed as
"what's feasible in N days." This split is not motivated by milestone size. Ten
surfaces in one milestone would have been accepted if the halves were
independent; they are not. The ordering argument is architectural and would hold
with unlimited time.

**What M3 does not inherit.** The FTSO unknowns stay open and move with the
surfaces — the `payable` `getFeedById` fee question
(`developer-hub/docs/ftso/1-getting-started.mdx:54`), the Fast Update incentive's
cost and eligibility, and the absence of any custom-feed producer on Coston2.
None of them block FDC.

## 2. `createFdcClient` becomes generic; families become typed modules

**Decision.** `createFdcClient` is widened to be generic over its request and
response body types, and each attestation family ships its own typed module
carrying that family's encode/decode. The existing XRPPayment types in
`packages/core/src/fdc.ts` become the first such module — a **migration**, not an
addition beside the old shape.

**Why not parallel per-family clients.**
`.thoughts/specs/2026-08-03-flare-application-layer.md:491` (R-FDC-008) requires
that FAssets and Smart Accounts not duplicate the request state machine. Round
derivation, submission, Relay finality and proof retrieval are identical across
every family; only the bodies differ. Siblings would copy the state machine once
per family, which is the exact duplication R-FDC-008 exists to prevent, and
`CLAUDE.md`'s "delete dead code as you migrate" forbids keeping the XRPPayment
client alongside its own generalisation.

**What the per-family modules must carry.** Each family owns the parts that are
genuinely per-family and cannot live in the generic core: the attestation type
name and its UTF-8 padding, the JSON→Solidity key renaming, and the
`uint64`/`JSON.parse` corruption hazard handled per field.
`.thoughts/research/2026-08-04-fdc-xrp-payment-attestation.md` documents all
three; it is not to be re-researched.

**Scope of families in M3.** Deciding the shape is not the same as implementing
nine families. Which families M3 actually drives against the live verifier is a
spec question, answered in the M3 spec, and any family not driven live is
declared unbuilt rather than stubbed —
`.thoughts/decisions/2026-08-04-m2-open-questions.md` establishes that pattern.

## Carried forward, unchanged

`.thoughts/handoffs/2026-08-04-m2-complete-m3-ready.md:213-215` keeps `BLOCKED`
and `REJECTED` redemption outcomes mapped to `action_required` because the fate
of the burned FAsset was never verified. M3 does not touch it.
