# Decision: build everything, real integration first

Date: 2026-08-04
Status: **accepted by Abu, 2026-08-04**
Supersedes: the working assumption that `SPEC.md` milestone 1 (the FXRP mint
path alone) was the agreed scope of this project. No decision record ever
ratified that scope; it was inherited from a prior session and treated as
settled.

## The trigger

Abu asked where `planRecovery` was actually used. The answer, from the code:

```
planRecovery  ←  reconcileDirectMint  ←  mock.ts
```

One caller, terminating in the mock. `DirectMintChainState` — the input the
whole recovery matrix reasons about — is produced only by the mock's
`chainAt()`. There is no live producer, no `createFlareKit`, and therefore no
screen that can run against a network. Three checklist items had been reported
complete that were not.

Abu's response, verbatim in substance: everything that we decided to do gets
done; nothing is left behind; real integration is the priority and the mock is
only for showcasing in the docs.

## Decisions

### 1. Everything gets built

The scope is the accepted product, not a slice of it:

- `.thoughts/specs/2026-08-03-flare-application-layer.md` — 21 capability families
- `.thoughts/design/2026-08-03-product-surface-map.md` — 18 surface families, 137 distinct surfaces

Nothing is dropped for time. Where something cannot be built to the bar it
ships declared unbuilt, per CLAUDE.md — it is never quietly omitted.

### 2. Real integration first; the mock is derived from it

For every capability: build and verify the live path against the chain, then
make the mock reproduce what the real implementation does.

This reverses what happened in the first build. The mock was written first and
the hooks, components and every state test were built on top of it, so the
"self-reconciling operations, no Resume button" property held only in
simulation. A `scripts/resume-mint.mjs` was then written to finish a stalled
live mint — which is literally the Resume button CLAUDE.md forbids, built
because the automatic path did not exist.

### 3. The mock stays in `@flare-kit/core`

Abu questioned whether the mock belongs in the shipped library at all, given it
exists for documentation previews.

It stays, for one concrete reason: the mock does not reimplement the lifecycle,
it drives the real reducer (`reconcileDirectMint`). Co-location is what makes
drift impossible. Split into its own package, the mock would either duplicate
the state machine — and then diverge from it — or force core to export its
internals anyway. It is tree-shakeable, so a production consumer pays nothing.

This also matches the existing spec: `R-MOCK-001` states core exports the
in-memory implementation, and the package table assigns "mock mode" to core.

What changes is the guarantee around it. `R-MOCK-004` says mock mode is never a
fallback triggered by a failure. That becomes structural and tested: the live
kit has no code path that constructs a mock, under any error.

### 4. Milestone sequence

Each milestone ships something that works against a real network.

| | Scope |
|---|---|
| **M0** | Close the live gap: chain-state reader, `createFlareKit`, remove the resume script |
| **M1** | FAssets: mint and redeem, live, full round trip |
| **M2** | Accounts, signing authority, portfolio and activity |
| **M3** | FDC and FTSO surfaces |
| **M4** | Swaps, liquidity, vaults |
| **M5** | Bridges, messaging, OFTs |
| **M6** | Gasless, relayers, payments |
| **M7** | Governance, delegation, staking, rewards |
| **M8** | XRPL-controlled Smart Accounts |
| **M9** | Flare Confidential Compute |
| **M10** | Agent tools, MCP server, CLI, scaffolder |
| **M11** | Operator, support, release and claim surfaces |
| **M12** | Documentation site and `apps/app` |

Cross-cutting and continuous: persistence and recovery, security and trust
communication, observability, documentation quality.

### 5. The docs site and the application come last

Both consume the packages. Building either early hides which package does not
work, which is exactly how the first build produced four components that could
not reach a network. Abu stated this independently and it is now a rule.

## Consequences

- `SPEC.md` is superseded as a statement of total scope. It remains accurate as
  the specification of the FXRP mint path, which becomes M1.
- Each milestone gets its own spec under `.thoughts/specs/`, written before its
  implementation.
- A milestone is complete only when its live path is exercised against a real
  network and the evidence is recorded under `.thoughts/verification/`.
- "Done" claims require the live path, not a passing test against a mock.

## Provenance

- Abu, 2026-08-04, in session: on scope — "every integration must be done…
  things should not be left undone"; on ordering — "I expected you to even do
  the real integration first before thinking about mock. Mock is not a
  priority. It's just for showcasing on our docs"; on the application — "it's
  probably the last stuff that we're going to even worry about because it comes
  from the package."
- The `planRecovery` call graph and the absence of `createFlareKit`, both read
  from the repository on 2026-08-04.
- `.thoughts/verification/2026-08-04-coston2-live-mint.md` — the live run that
  exposed the gap.
