# Decision: Bounty 1 Coverage and the Demo Product Shape

Date: 2026-08-03
Status: proposed, awaiting Abu
Supersedes: the research-era vertical-product shortlist in
`wiki/hackathon-strategy.md` sections "Historical two-track recommendation"
(ZeroDay Escrow, XRP Checkout, Redemption Autopilot). Those predate the
canonical full-kit decision and are retained only as history.

## The trigger

Abu observed that the design work had narrowed to swap and bridge, and that a
kit which demonstrates only asset movement does not answer Bounty 1.

## What Bounty 1 actually asks for

Prize pool $6,000; 1st $4,000, 2nd $2,000. "Build products that make assets
more useful across Flare and connected ecosystems." XRP, FXRP and FAssets are
named as **priority areas**.

Eight product directions are named. Our coverage today:

| Bounty direction | Specified | Component built | Demo path |
| --- | --- | --- | --- |
| FXRP onboarding flows | yes, FX-02 to FX-04 | **no** | **priority 1** |
| Cross-chain asset dashboards | yes, USER-01, USER-03 | **no** | priority 2 |
| Wallet experiences | yes, SH-02, SH-03 | **no** | priority 3 |
| Payment or merchant flows | yes, PAY-01/02, GAS-01/03 | **no** | stretch |
| DeFi integrations | yes, SWAP-01/03, LIQ-01/03 | swap only | partial |
| Asset movement UX | yes, BR-01/05 | swap, bridge | **done** |
| Portfolio tools | yes, USER-01, USER-02 | **no** | priority 2 |
| Liquidity interfaces | yes, LIQ-01/03 | **no** | stretch |

Every direction is already in the accepted 112-surface map. **The gap is not
specification, it is demonstration.** We have built two of eight, and the two
we built are the two the bounty is least specific about.

Worse for us: the bounty names XRP, FXRP and FAssets as the priority, and
**FXRP onboarding is the one direction we have not built a component for**,
despite it being the operation the whole product was designed around.

## The judging criteria, read literally

"Strong submissions should show a working product or integration, a clear user
problem, meaningful use of Flare infrastructure, and a practical path beyond
the hackathon."

Four criteria, and a component library alone scores badly on two of them:

- **A working product** — a library is not a product. A judge will not run
  `npm install` to evaluate us.
- **A clear user problem** — "developers repeat integration work" is a real
  problem but it is a *developer* problem, one level removed from the asset
  usefulness the bounty is about.
- **Meaningful use of Flare infrastructure** — strong for us. FAssets, FDC,
  the executor and XRPL are all load-bearing, not decorative.
- **A practical path beyond the hackathon** — very strong for us, and this is
  the criterion most submissions fail. Published npm packages, versioned docs,
  a scaffolder and conformance evidence are exactly what "beyond the hackathon"
  means.

## Decision

**The demo application is the submission. The kit is why the submission is
credible.** We do not choose between them; we order them.

The demo is a product with one sentence of user problem: **get XRP onto Flare
and put it to work, without losing track of it.** That sentence covers the
bounty's priority asset and its named directions in one flow rather than as a
feature list.

The demo's shape, in the order a visitor meets it:

1. **Connect** an XRPL account and an EVM account at the same time. This is a
   genuine differentiator; no comparable kit connects both chain families in
   one session.
2. **Onboard**: XRP to FXRP by direct mint, including the delay and the
   recovery that reuses the existing payment. This is the priority area and the
   hardest thing in the product.
3. **Portfolio**: one view across both identities, with source and freshness
   visible, and pending operations that survive reload.
4. **Put it to work**: swap or bridge, both already built, plus a vault deposit
   if time allows.
5. **Evidence**: the receipt and the operation history, correlated across
   XRPL, FDC and Flare.

That path hits FXRP onboarding, cross-chain dashboards, wallet experience,
asset movement and portfolio tools. Payments, merchant flows and liquidity
remain specified and stay stretch.

## Build order that follows from this

Components, in bounty-priority order rather than in the order I found them
interesting:

1. **MintFXRP** and the XRPL payment handoff. Priority asset, hardest flow,
   currently unbuilt.
2. **ConnectButton and AccountChip** with simultaneous EVM and XRPL.
3. **PortfolioTable** with source, freshness and pending work.
4. **RedeemFXRP**, closing the round trip.
5. **VaultCard**, if time allows.

SwapCard and BridgeCard are done and are not re-opened.

## Risks this decision accepts

- **Demo depends on a test network.** Already mitigated by the three-mode rule
  in `specs/2026-08-03-kit-distribution-surfaces.md` R-DEMO-003: mock,
  read-only and live, so a judge always sees something working.
- **Judges may not hold XRPL test wallets.** The research already raised this
  (`wiki/hackathon-strategy.md:112`). The demo must provide a guided funding
  path and a read-only route through a pre-existing operation, so evaluation
  never requires the judge to hold funds.
- **The kit could read as infrastructure rather than a product.** Mitigated by
  leading with the demo and treating the packages as the "beyond the hackathon"
  evidence rather than the pitch.

## The deadline is not an input

Abu closed this on 2026-08-03: "deadline doesn't give us the chance to do
mediocre stuff. Deadline or no deadline, we must cook."

This restates an existing law rather than adding one. The commission already
prohibits using the deadline "to justify shallow states, fake success or
middle-ground design," and the reconciled product context already states that
"the quality boundary is materiality, not a choice between hackathon and
enterprise."

So the build order above is a **priority order, not a triage list.** Items are
built in that sequence because the bounty weights them that way, not because
later items are expendable. Nothing ships at a lower standard because of time,
and the deadline is never cited as a reason to narrow scope, fake a state or
skip a recovery path. If something cannot be built to the bar, it ships
declared as unbuilt rather than built badly.

## Provenance

- Bounty text supplied by Abu in session on 2026-08-03.
- `wiki/hackathon-strategy.md:12` on the Bounty 1 gap requiring a vertical
  product; `:112` on judge wallet readiness.
- Accepted surface map for the specification coverage claims above.
