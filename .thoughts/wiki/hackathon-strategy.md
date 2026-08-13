# Summer Signal strategy after the source trace

> **Historical analysis — not current product routing.** The candidate ranking and recommendations below were superseded by the participant's accepted full Flare Application Layer direction on 2026-08-03. See the [canonical product decision](../decisions/2026-08-03-full-flare-application-layer-scope.md). Preserve this page as research evidence; do not use it to replace or narrow the complete kit.

Research date: 2026-07-22. This refines the earlier [idea scout](../research/2026-07-22-flare-summer-signal-idea-scout.md) using contract/runtime/reference-app source, not just product docs.

## What the code changed

The original top ideas remain possible, but the implementation trace changed their risk:

- A generic direct-mint/Smart Account UI is less novel than it first appears; the Viem starter already implements nearly the whole `0xFE`/`0xFF` protocol.
- The real Bounty 1 gap is a durable executor plus correlated cross-chain receipt/recovery layer attached to a vertical product.
- Stateful FCC products are riskier than a diagram suggests: several official examples lose critical private state on restart or choose random machines for related steps.
- A TEE-signed result is not automatically confidential. If secret fields are relayed as Flare calldata, they become public.
- ZeroDay Escrow can stay mostly stateless inside FCC: validate encrypted evidence, emit a minimal bounded authorization, and keep escrow/replay on-chain. That lowers state-recovery risk.
- VeilGuard needs durable/private rule lifecycle, authenticated inputs, a reliable price observation/evaluation model and credible settlement. It is still strong but no longer the easiest dual-bounty bet.

Sources: [interoperable assets](interoperable-assets.md), [FCC](fcc.md), [reference products](reference-products.md).

## Historical decision table

| Candidate | Best bounty fit | Product novelty | Infra risk | Source overlap | Most defensible new work |
|---|---|---:|---:|---:|---|
| ZeroDay Escrow | Both | High | Medium-high | Low product / medium architecture | Encrypted exploit/evidence package, deterministic validator, minimal one-use TEE authorization, FXRP escrow and disclosure workflow. |
| XRP Checkout + Receipt Rail | Bounty 1 | Medium-high if merchant-specific | Medium | Low product / high protocol | Hosted invoice + production Smart Account executor + XRPL→FDC→FXRP→merchant receipt correlation + refund/recovery/reconciliation. |
| VeilGuard | Both | High | High | Medium-high | Private authenticated rule, FTSO-bound evaluation, durable/pinned lifecycle and bounded FXRP settlement—not a CLOB. |
| Redemption Autopilot | Bounty 1 | Medium | Medium | Low | Finish the state-changing tag-aware default path missing from demos, with monitoring, proof finality and collateral payout UX. |
| DarkRFQ | Both | Medium | High | Very high | One-shot invited sealed RFQ only; continuous orderbook is disqualifying overlap. |
| Agent Allowance | Both | Medium-high | Very high | Very high | New multi-tenant authorization/policy/counter/recovery architecture; `fce-sign` is only plumbing. |

## Historical two-track recommendation

### Primary if FCC deployment access is confirmed: ZeroDay Escrow

Why it now edges VeilGuard:

- the confidential input has an obvious reason to remain secret;
- the on-chain outcome is a bounded FXRP payout;
- the TEE can be stateless per request, avoiding a private money ledger;
- official examples provide result verification/encryption/vault patterns but do not already ship the bug-bounty product;
- the judge demo is memorable and deterministic against a deliberately vulnerable target.

MVP boundary:

1. one intentionally vulnerable sample contract/program;
2. one narrow exploit/evidence format;
3. client-side encryption to the TEE;
4. wallet-signed request bound to bounty/chain/contract/nonce/deadline;
5. deterministic validation inside the FCE;
6. result `{requestId, valid, payout, researcher, evidenceHash, deadline}` only;
7. one-use FXRP escrow release;
8. post-payout opt-in disclosure or organizer reveal path.

Do not claim arbitrary exploit execution, a general sandbox, or permanent secrecy after disclosure.

### Fallback / parallel-safe route: XRP Checkout + Receipt Rail

This should not be “send XRP, receive FXRP.” The product is a merchant payment lifecycle:

```text
invoice created
 -> XRPL payment requested
 -> payment observed/confirmed
 -> FDC proof finalized
 -> FXRP minted to Smart Account
 -> invoice contract called atomically
 -> merchant receipt correlated across both chains
 -> refund/recovery/reconciliation available
```

The executor/receipt service is meaningful new Flare work because official material stops at scripts or an external-executor dependency. A hosted checkout, tiny SDK and merchant dashboard make it a product rather than infrastructure. Target three real testers (for example a donation page, digital-service seller and community merchant) before submission.

## VeilGuard go/no-go

Proceed only if all of these are solved in the first technical spike:

- custom FCE runs end-to-end with available indexer/proxy support;
- encrypted rule request has wallet authentication and replay protection;
- one rule survives a process restart or is reconstructible without revealing it;
- the same machine is pinned through the lifecycle;
- FTSO price semantics and evaluation cadence are explicit;
- settlement authorization binds token, amount, beneficiary, action and deadline;
- there is a deterministic judge mode using real FTSO conditions without pretending a mocked price is live.

If any remain unresolved after the spike, ZeroDay's stateless validation shape is safer.

## Submission-evidence ledger from day one

Keep a checked-in ledger with:

| Evidence | Record |
|---|---|
| Before state | Which official scaffold/commit was the starting point. |
| New work | Every new contract, handler, worker, recovery flow, indexer event, UI surface and test. |
| Flare dependence | Which user outcome breaks if FAssets/FDC/Smart Accounts/FCC/FTSO is removed. |
| Deployment | Network, chain ID, resolved registry addresses, contract addresses, extension/machine/code hash, public app/API. |
| Trust model | Secrets, TEE/provider/proxy assumptions, signer rotation, persistence/recovery, direct vs voted path. |
| Demo verification | Happy path plus replay, wrong signer, wrong domain, restart and recovery tests. |
| Distribution | Named testers, feedback, conversion/drop-off and any partner conversation. |

This maps directly to the hackathon's evidence-of-new-work, Flare-integration, technical-execution and future-potential criteria.

## Organizer questions that materially change the plan

Ask in the hackathon Telegram now:

1. Are shared Coston2 indexer credentials or a hosted custom-FCE environment available?
2. Which `FlareTeeManager`/deployment bundle is canonical for judging after recent diamond recuts?
3. Is custom-FCE judging expected on Coston2, Songbird, or a locally simulated TEE connected to Coston2?
4. Can one project be eligible to place in both pools?
5. What is the exact August 14 cutoff time/timezone?
6. Will judges have XRPL test wallets/Xaman ready, or should the demo provide a faucet/preloaded path?

The first three determine whether the FCC track is operationally viable; the last three affect submission/demo design.
