# Spec: M1 — FAssets redeem, closing the round trip

Date: 2026-08-04
Milestone: M1 of `.thoughts/decisions/2026-08-04-build-everything-real-first.md`
Depends on: M0 (live kit, live chain-state reader) — complete

## Objective

A holder of FTestXRP converts it back to XRP on the XRP Ledger, watches the
agent pay, and — if the agent does not pay by the deadline — claims collateral
instead, without ever being told the operation failed while its outcome is
still unknown.

Together with the mint this closes XRP → FTestXRP → XRP.

## What the protocol actually does

Read from `sources/flare-foundation/fassets` on 2026-08-04.

```solidity
function redeem(uint256 _lots, string _redeemerUnderlyingAddressString, address payable _executor)
    external payable returns (uint256 _redeemedAmountUBA);
```

Redemption inverts the mint, and three properties make it a different problem:

1. **It is lot-based, not amount-based.** `lotSize()` is 10.000000 XRP on
   Coston2, so a user redeems whole lots. A UI that accepts a free amount is
   lying about what the protocol will do.
2. **The agent pays you.** The user burns FAsset immediately; the XRP arrives
   later from an agent's own underlying address. The awaited actor is therefore
   a named agent, not the protocol.
3. **Success is signalled by absence.** From `RedemptionRequestInfo.sol`:
   *"on payment confirmation the request is deleted, so there is no success
   status."* A missing request means completed, never failed.

`RedemptionRequested` carries everything the surface must show:
`agentVault`, `requestId`, `paymentAddress`, `valueUBA`, `feeUBA`,
`firstUnderlyingBlock`, `lastUnderlyingBlock`, `lastUnderlyingTimestamp`,
`paymentReference`, `executor`, `executorFeeNatWei`.

The redeemer receives `valueUBA - feeUBA` in XRP.

## Requirements

- **M1-R1** — `@flare-kit/contracts` exports the redemption ABI fragments:
  `redeem`, `redemptionRequestInfo`, `confirmRedemptionPayment`,
  `redemptionPaymentDefault`, `finishRedemptionWithoutPayment`, and the
  `Redemption*` events. Curated from the interfaces, as with minting.
- **M1-R2** — `quoteRedeem` is pure over a protocol snapshot: lots in, exact
  XRP out, fee, the agent's payment deadline, and whether the amount is a whole
  number of lots. It refuses anything the protocol would refuse.
- **M1-R3** — `RedeemChainState` and `planRedeemRecovery` mirror the mint's
  matrix: what moved, what remains, and whether an action moves new value.
- **M1-R4** — A missing `redemptionRequestInfo` resolves to `succeeded` from
  the `RedemptionPerformed` evidence, never to failed.
- **M1-R5** — Past `lastUnderlyingTimestamp` with no payment, the surface
  offers `redemptionPaymentDefault` and states plainly that the user receives
  **collateral rather than XRP**, with the premium named.
- **M1-R6** — `createFlareKit` gains `quoteRedeem`, `startRedeem` and reconciles
  redemptions through the same reducer. The mock reproduces it afterwards.
- **M1-R7** — `RedeemFXRP` renders every required state against both kits.

## The second attestation type

`redemptionPaymentDefault` consumes `IReferencedPaymentNonexistence.Proof` — a
*different* FDC attestation type from `XRPPayment`. Proving a payment did not
happen is not the same request as proving one did, and the request body differs.
This is new work, not a reuse of `fdc.ts` as written.

## Required states

| Screen | States |
|---|---|
| RedeemFXRP | loading, ready, not a whole lot, insufficient FAsset balance, no agent with capacity, quote expired, typed error |
| Redemption timeline | requested, awaiting agent, paid, confirmed, past deadline, defaulted-to-collateral, rejected, blocked |
| RedeemRecoveryPanel | wait (before deadline), claim collateral (after), no safe action |

## Acceptance criteria

- **M1-AC1** — Mock: every state above is reachable and a redemption completes
  in seconds.
- **M1-AC2** — Live on Coston2: redeeming 1 lot burns FTestXRP and XRP arrives
  at the XRPL address, with evidence recorded.
- **M1-AC3** — A redemption whose agent has not yet paid reads as awaiting a
  named agent with its deadline stated, never as failed.
- **M1-AC4** — Past the deadline, `redemptionPaymentDefault` is offered, and the
  interface states that collateral arrives instead of XRP before the user commits.
- **M1-AC5** — A completed redemption whose request has been deleted resolves to
  `succeeded`, not to failed or missing.

## Verification

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
node packages/core/scripts/live-redeem.mjs 1     # M1-AC2, evidence recorded
```

## Checklist

- [x] M1-R1 redemption ABI
- [x] M1-R2 quoteRedeem, pure and lot-aware
- [x] M1-R3 redeem recovery matrix
- [x] M1-R4 absence resolves to succeeded
- [x] M1-R5 collateral-instead-of-XRP stated before commitment (quote + action)
- [x] M1-R6 live kit redeems; mock reproduces
- [x] M1-R7 RedeemFXRP every state (against the mock; not viewed in a browser)
- [x] M1-AC2 live round trip on Coston2, evidence recorded
