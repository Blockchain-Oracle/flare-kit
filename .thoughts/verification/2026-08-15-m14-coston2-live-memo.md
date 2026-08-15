# M14-AC4 — the live Coston2 memo-instruction round trip

**Date:** 2026-08-15 · **Network:** Coston2 (114) · **Status:** SUCCEEDED, with one claim corrected

Machine record: `.thoughts/verification/2026-08-15-coston2-live-memo.json`
Driver: `packages/core/scripts/live-memo-instruction.mjs`

## What was driven

One `0xFF` memo instruction — the whole `PackedUserOperation` inline, 810 bytes — carried by an
XRPL payment to the Core Vault, attested with `XRPPayment`, executed as a consequence of a
direct mint, moving 0.4 FTestXRP out of the personal account.

| | |
|---|---|
| XRPL owner | `rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio` |
| Personal account | `0x89023176a776CDB1d339a7649116B1a6f3DeFfcb` (deployed) |
| Core Vault | `rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p` |
| XRPL payment | `A71BFFCA8B786B222A1196914CDB799D1E5B042B38B073D02AFF44641BC55DD6` — 2 000 000 drops, validated |
| Memo | `0xFF`, 810 bytes, opcode + 10-byte header + ABI-encoded operation |
| Attestation | `XRPPayment`, round **1426220**, request `0x56541f78…1b87`, fee 1000 wei |
| `proofOwner` | `0xa4b05cdb545fa7ca12be9f866d64e8a843a31bd9` — our own EOA |
| `UserOperationExecuted` | `0x4d7ad65562937bf42b11a80b1f9b040c3a52a47e5425d078d194ac14249607c9`, block 34089050, nonce 0 |

## The numbers, predicted before the payment and matched after

The pre-flight recorded the gate's arithmetic; the read-back matched it exactly.

| | Predicted | Observed |
|---|---|---|
| Payment | 2 000 000 UBA | 2 000 000 |
| Minting fee | 100 000 (the minimum, not the 0.25% proportional 5 000) | 100 000 |
| Credited to the account | 1 900 000 | 1 900 000 |
| Transferred by the operation | 400 000 | 400 000 |
| Account balance | 500 000 + 1 900 000 − 400 000 = 2 000 000 | 2 000 000 |
| Account nonce | 0 → 1 | 1 |

## The correction: `proofOwner` binds the PROOF, not the PAYMENT

The spec's reasoning for self-relaying said a kit that self-relays **knows** the outcome rather
than inferring it from an event that may never arrive. The live run shows that claim is too
strong, and the timing is unambiguous:

| Time (UTC) | Event |
|---|---|
| 10:29:07 | our XRPL payment submitted |
| 10:30:10 | our `XRPPayment` attestation requested, `proofOwner` bound to us |
| **10:31:07** | **`0x103b384064ae85577127097a7ccadfd6fb13f437` called `executeDirectMinting`** (selector `0x78d0299e`) |
| 10:32:43 | our relay attempt — the payment was already consumed, so nothing was sent |

Binding `proofOwner` makes **our proof** unusable by anyone else. It does not make **the
payment** ours. The XRPL transaction is public, so a third party may request its *own*
attestation of the same transaction under its own `proofOwner` and submit that — which is what
happened, roughly a minute before our own voting round could finalize.

**We cannot win this race on Coston2 by construction.** Our attestation request can only be made
after the payment validates, and the round must then finalize and be indexed; the watching
relayer starts from the same moment and is not waiting on our round.

### What self-relay is actually worth

Not exclusivity — **independence**. It means the flow never *requires* a third-party relayer to
exist, which matters on any deployment where none is watching, and it means nobody can submit
the proof we paid for. Those are real and they are what the code delivers. The kit knowing the
outcome first is not among them.

The design handled the race correctly and without being told to: `isTransactionIdUsed` returned
true, the relay phase refused to send, recorded the condition as normal rather than as a
failure, and the read-back established the truth from chain evidence. That is `M14-R10`'s
absorption of `PaymentAlreadyConfirmed` working on the first live encounter with it.

## A second correction: Coston2 executor availability

SPEC.md's integrations table carried `Executor execution — REAL_LATER — third-party executor
availability on Coston2 is unverified`. It is now verified: `0x103b3840…f437` executed a direct
mint within **two minutes** of the XRPL payment validating. The honest-awaiting-external state
M13 shipped for this is still correct as a fallback, but it is no longer the expected path.

## What the run also caught, before spending anything

The first pre-flight **refused**, and correctly: the operation as first written moved 1.0
FTestXRP while the account held 0.5, and the pre-signature simulation reverted.

That exposed a real limitation of `M14-R7`. The simulation runs against the account as it stands
*before* the payment, while on chain `_distributeFAssets` credits the account *before*
`MemoInstructions.execute` runs. So "mint and immediately spend it" — the most natural operation
on this flow — fails the simulation and would have succeeded. The refusal is wrong in the SAFE
direction, but its message asserted the operation would roll back, which is false for that case.
Fixed: the refusal now states the possibility, and this run was resized to 0.4 so the simulation
validates what it claims to validate.

## Verification commands

```bash
node packages/core/scripts/live-memo-instruction.mjs                      # keyless pre-flight
LIVE_MEMO_BROADCAST=<token> node .../live-memo-instruction.mjs pay --broadcast
LIVE_MEMO_BROADCAST=<token> node .../live-memo-instruction.mjs attest --broadcast
LIVE_MEMO_BROADCAST=<token> node .../live-memo-instruction.mjs relay --broadcast
node packages/core/scripts/live-memo-instruction.mjs verify               # keyless read-back
```

Explorer: https://coston2-explorer.flare.network/tx/0x4d7ad65562937bf42b11a80b1f9b040c3a52a47e5425d078d194ac14249607c9
