# Verification: live portfolio and activity on Coston2 + XRPL Testnet

Date: 2026-08-04
Milestone: M2 — accounts, signing authority, portfolio and activity
Covers: **M2-AC2** (live portfolio, sources labelled) and **M2-AC3** (M1
operations in activity, identifiers never flattened)

## Command

```bash
node packages/core/scripts/live-portfolio.mjs
```

Machine-readable evidence:
`.thoughts/verification/2026-08-04-coston2-live-portfolio.json`

## No key was used

A portfolio is a read. This script takes only `evm.address` and `xrpl.address`
out of `.secrets/live-run.json`, and refuses to start if either is not a plain
address. It builds its `AccountContext` with `supplyReadOnly`, so the run
exercises R-WALLET-003's read-only identity as a first-class path rather than a
degraded one — `readOnly: true` in the output is the kit reporting that
correctly, not a failure.

This also demonstrates the agent-facing rule from
`.thoughts/decisions/2026-08-03-agent-facing-surfaces.md`: read and plan tools
need no key at all.

## M2-AC2 — the real balances, each with its source

| Asset | Balance | Source class | Provider | Network |
|---|---|---|---|---|
| `C2FLR` | `99.672882949999999000 C2FLR` | `chain` | `https://coston2-api.flare.network/ext/C/rpc` | Flare Testnet Coston2 |
| `FTestXRP` | `24.800000 FTestXRP` | `chain` | `https://coston2-api.flare.network/ext/C/rpc` | Flare Testnet Coston2 |
| `XRP` | `84.949988 XRP` | `chain` | `https://xrpl-testnet-api.flare.network` | XRP Ledger Testnet |

Accounts: `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9`,
`rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio`.

Every value is an `Observation` with `source.class = 'chain'`, its provider URL,
its network as a proper noun, and an observation timestamp. Coverage came back
`evm=covered xrpl=covered`, so no source was silently missing. The four unbuilt
position types — vault, bridge message, delegation, stake — were declared with
their reasons and no value.

**The FTestXRP figure closes the M1 arithmetic exactly.** After the M1 mint the
account held `34.800000` (`24.800000` minted plus a `10.000000` faucet
transfer). The M1 redemption burned `10.000000`. `34.8 − 10.0 = 24.8`, which is
what was read live here. The two milestones' evidence agrees to the drop.

## M2-AC3 — three identifiers, still three

Every recorded identifier was looked up live rather than trusted from the M1
files:

```
fassets.direct-mint  xrpl_tx           validated, ledger 19619920
fassets.direct-mint  fdc_request       success, block 33605685
fassets.direct-mint  flare_tx          success, block 33605685
fassets.redeem       flare_tx          success, block 33608131
```

The kit then assembled activity, and the mint kept its journey intact:

- XRPL payment → `https://testnet.xrpl.org/transactions/3F8394997FD81D36C6DA3B626B4CE6D1FA594911FE97C150977B14E5B6AB6C03`
- FDC request → **no link**, because no block explorer indexes a Data Connector
  request. The identifier is still carried and copyable.
- Flare execution → `https://coston2-explorer.flare.network/tx/0xb5bf29512bae84f3837303721dad7241a6dae64dcf39c1568123ef4fc5715cd0`
- Executor → `https://coston2-explorer.flare.network/address/0x103b384064ae85577127097A7cCadfd6fb13f437`

Two chains, two explorers, one operation, and one identifier deliberately
carrying no link at all. That is R-DATA-003 and M2-R6 holding against live data.

## A discrepancy worth recording

`2026-08-04-coston2-live-mint.json` reports `outcome: "incomplete"`, while
`…-live-mint.md` reports **succeeded**. Both are accurate about different
things, and the `.json` is the more misleading of the two read alone:

- The **script** ended incomplete. A third-party executor
  (`0x103b3840…`) executed the mint first, so our own `executeDirectMinting`
  reverted with `PaymentAlreadyConfirmed()` and the run stopped there.
- The **protocol** succeeded. `DirectMintingExecuted` fired with
  `mintedAmountUBA = 24800000`, and the balance read above still reflects it.

So the operation's state was not taken from either file. It was taken from the
chain, which is precisely the reconciliation M2 was built to make routine —
`planRecovery` resolves this case correctly, and it was the M1 *script* that
did not call it.

## Honest limit of this run

The `succeeded` state on both entries is asserted from cross-checked evidence —
live receipt lookups, the `DirectMintingExecuted` event, and the balance
arithmetic above — **not** re-derived by running the kit's reconciler over a
restored operation record. A stronger run would rebuild both records through
`reconcile` / `reconcileRedeem` and let the kit decide the state. Worth doing
when the operation store is loaded from durable storage rather than
reconstructed in a script.

## Gate at time of writing

```
pnpm build && pnpm typecheck && pnpm lint && pnpm test
build:0  typecheck:0  lint:0
contracts 74 passed (2 skipped) · core 515 · react 18 · react-ui 113
```
