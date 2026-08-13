# Evidence: a real FTestXRP mint on Coston2, paid from XRPL Testnet

Date: 2026-08-04
Networks: Flare Testnet Coston2 (chain 114) and XRP Ledger Testnet
Outcome: **succeeded** — 25.000000 XRP in, 24.800000 FTestXRP credited

Satisfies SPEC.md **AC2** (a funded XRPL account mints, exactly one payment is
requested, FAsset is credited on Coston2) and demonstrates **AC8** for real.

## Accounts

| Role | Address |
|---|---|
| XRPL payer | `rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio` |
| FAsset recipient (Coston2) | `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9` |
| Core vault (XRPL destination) | `rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p` |

Signing keys live in `.secrets/live-run.json`, gitignored and `chmod 600`. They
were never printed, logged, or written into this record.

## Contracts

| Contract | Address |
|---|---|
| AssetManager (FTestXRP) | `0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA` |
| FTestXRP token | `0x0b6A3645c240605887a5532109323A3E12273dc7` |
| FdcHub | `0x48aC463d7975828989331F4De43341627b9c5f1D` |
| FdcRequestFeeConfigurations | `0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e` |
| Relay | `0xa10B672D1c62e5457b17af63d4302add6A99d7dE` |
| FlareSystemsManager | `0xA90Db6D10F856799b10ef2A77EBCbF460aC71e52` |

## The quote, stated before anything was signed

```
send            25.000000 XRP
receive         24.800000 FTestXRP
minting fee      0.100000 FTestXRP
executor fee     0.100000 FTestXRP
```

## The transactions

| Step | Hash / id | Link |
|---|---|---|
| XRPL payment | `3F8394997FD81D36C6DA3B626B4CE6D1FA594911FE97C150977B14E5B6AB6C03` | https://testnet.xrpl.org/transactions/3F8394997FD81D36C6DA3B626B4CE6D1FA594911FE97C150977B14E5B6AB6C03 |
| FDC attestation request | `0xb5bf29512bae84f3837303721dad7241a6dae64dcf39c1568123ef4fc5715cd0` | https://coston2-explorer.flare.network/tx/0xb5bf29512bae84f3837303721dad7241a6dae64dcf39c1568123ef4fc5715cd0 |
| `executeDirectMinting` | `0x8e3521d2261ddf7ab6866d3bccf111e5a6e34a233ecf9d883e2ceb26a642b20d` | https://coston2-explorer.flare.network/tx/0x8e3521d2261ddf7ab6866d3bccf111e5a6e34a233ecf9d883e2ceb26a642b20d |

XRPL result `tesSUCCESS`, ledger 19619920. FDC voting round **1415484**,
finalized, proof retrieved with 2 merkle nodes.

## The event, decoded from the receipt

```
DirectMintingExecuted
  transactionId    0x3f8394997fd81d36c6da3b626b4ce6d1fa594911fe97c150977b14e5b6ab6c03
  targetAddress    0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9
  executor         0x103b384064ae85577127097A7cCadfd6fb13f437
  mintedAmountUBA  24800000
  mintingFeeUBA      100000
  executorFeeUBA     100000
```

Every figure matches the quote to the drop. `targetAddress` was resolved by the
AssetManager from the 32-byte `DIRECT_MINTING` reference in our XRPL memo, which
confirms the memo encoding derived in
`.thoughts/research/2026-08-04-direct-minting-execution.md`.

Token transfer confirming the credit:
`24.800000 FTestXRP` from the zero address (a mint) at block 33605747.

*Not part of this mint:* the account also holds `10.000000 FTestXRP` received at
block 33605545 from `0xd5796ac3…`, an ordinary transfer that arrived when the
Coston2 faucet was used. The final balance of `34.800000` is those two events,
not a double mint.

## AC8 demonstrated by accident, which is the best way

A third-party executor — `0x103b384064ae85577127097A7cCadfd6fb13f437` — executed
the mint before we did. Because our memo used the 32-byte form, no executor was
named, `allowedExecutor == address(0)`, and anybody could execute immediately.

Our own `executeDirectMinting` then reverted with exactly
**`PaymentAlreadyConfirmed()`** — the error predicted in the research brief,
decoded by name because it is in the curated ABI.

That is AC8 happening in the wild: the contract cannot give us a no-op, so core
must read the confirmation state first and resolve to `succeeded` from chain
evidence. `planRecovery` does precisely that. The run *script* did not call it
and submitted anyway, which is a gap in the script, not in the library — noted
below.

## What went wrong on the first attempt

`firstVotingRoundStartTs()` and `votingEpochDurationSeconds()` are declared on
`IRelay.sol` in the periphery package but **revert on the deployed Relay**. They
are implemented on `FlareSystemsManager`. The first run reverted there, after
the XRP had already been paid.

Fixed in `packages/contracts/src/{addresses,fdc}.ts`, pinned by
`packages/contracts/test/fdc-epoch.test.ts`, and corrected in the research
brief. An interface file describes what a contract *may* implement, not what the
deployed one does.

## Follow-up

`scripts/resume-mint.mjs` should call `planRecovery` and stop when
`alreadySettled` is true, instead of submitting a transaction that reverts. The
library already answers this correctly; the script simply did not ask.
