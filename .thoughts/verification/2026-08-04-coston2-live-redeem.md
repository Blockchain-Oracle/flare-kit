# Evidence: a real FTestXRP redemption on Coston2, paid in XRP by an agent

Date: 2026-08-04
Networks: Flare Testnet Coston2 (chain 114) and XRP Ledger Testnet
Outcome: **succeeded** — 10.000000 FTestXRP burned, 9.950000 XRP received

Satisfies **M1-AC2**, **M1-AC3** and **M1-AC5** of
`.thoughts/specs/2026-08-04-m1-fassets-redeem.md`.

With `2026-08-04-coston2-live-mint.md`, this closes the round trip:
**XRP → FTestXRP → XRP**, both directions live.

## The quote, before anything was signed

```
burned     10.000000 FTestXRP
fee         0.050000 FTestXRP
receives    9.950000 XRP
if unpaid   claim 105% of value in collateral on Flare — collateral, not XRP
```

## What happened

| | |
|---|---|
| `redeem(1, rGEgt…, 0x0)` | [`0x29f01334…818680`](https://coston2-explorer.flare.network/tx/0x29f01334a32fb1725a21d823442fb83798012bf7dddeddcc849ee4e470818680) |
| Request id | `43165320` |
| Agent | `0x5b89514d1F060AdbEA8B7294AFf81ed8dbAa7fC5` |
| Agent's XRPL payment | [`F0E8851A9BE5B4214121…`](https://testnet.xrpl.org/transactions/F0E8851A9BE5B4214121) — 9.95 XRP from `r4GHJwGSaGmJ…` |
| Deadline | unix `1785829298` |

`RedemptionRequested` reported `valueUBA: 10000000`, `feeUBA: 50000` — matching
the quote to the drop. The `paymentReference` was
`0x4642505266410002…`, the `REDEMPTION` type tag, sibling to the `…0018`
direct-minting reference used by the mint.

## Balances

| | Before | After |
|---|---|---|
| FTestXRP on Coston2 | 34.800000 | 24.800000 |
| XRP on XRPL Testnet | 74.999988 | 84.949988 |

Burned exactly `10.000000`, received exactly `9.950000`.

## The state sequence, which is the real result

```
ready → submitted
awaiting_external (agent)  ×5   ← ~2.5 minutes, no actions offered
succeeded
```

Three properties held under a real counterparty:

- **M1-AC3.** While the agent had time, the operation read `awaiting_external`
  on a named agent and offered **no actions**. Any button there would have
  reverted; an action that cannot succeed is not a safe action.
- **M1-AC5.** Success arrived as an *absence*. The agent's payment deleted the
  request, `redemptionRequestInfo` stopped returning it,
  `readRedeemChainState` reported `MISSING`, and `planRedeemRecovery` resolved
  that to `succeeded`. Read naively that is indistinguishable from "not found".
- The script never decided a state. It signed and polled; every transition came
  from `kit.reconcileRedeem`.

## Defect found by this run

At `succeeded` the record still carried `awaiting: { actor: 'agent' }`. The
reconcilers set the awaiting descriptor but never clear it, so a settled
operation kept claiming it was waiting on someone. Cosmetic in the log, wrong on
a timeline.

Fixed in `operation.ts` by letting a patch clear `awaiting` and `recovery`
explicitly, with both reconcilers clearing them when the plan names no actor.
Covered by `test/operation-clearing.test.ts`.
