# M10 live delegation round trip — evidence (Coston2, 2026-08-12)

**AC1 / AC2 / AC3 proven** on live Coston2. Signer `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9`
(dev key, `.secrets/live-run.json`, never logged). WNat `0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273`.
FTSO provider `0xB63C1E02a41e975f4d826BD06eccaFaCd5038B5D` — resolved read-only from
`VoterRegistry.getRegisteredVoters(5931)` ranked by `votePowerOf` (the most-delegated registered
Coston2 voter, ~583.83 WNat), so the delegated vote power is meaningful.

`succeeded` is sourced **only** from the on-chain `delegatesOf` read — never from the send. The
registry `delegationVerified` flag flipped `false → true` **only after** the confirmed `delegatesOf`
read (`delegation.ts`; the `flip` phase is code-guarded to refuse until the delegate phase records
`succeeded`).

## The reversible round trip

| phase | tx | block | on-chain result |
|---|---|---|---|
| wrap (AC1) | `0x68d6bb3551a445b68a60fe365cf5a9d31bc7b4919488d583143c826c27a5c572` | 33966630 | WNat `balanceOf` 0 → 5.0 |
| delegate (AC2) | `0x7b8fa4e1e0460680cb59d5da9291c4a7b9252553e956d801617ca9c54a22681a` | 33966710 | `delegatesOf` = [{provider, 10000 bips}], `delegationModeOf` = 1 (PERCENTAGE); signer `votePowerOf` 0 (100% delegated away — correct) |
| undelegate | `0x70ed6dbb3b5dc698126f24a7187770d5848b8a7b0c1f85c152aab96f12167d3b` | 33966725 | `delegatesOf` = [] (empty) |
| unwrap (AC1) | `0x8b4903ad95bce514ae1b1fb6e0a465099c16c34f9d3d6f22e5fc706869ab13f0` | 33967141 | WNat 5.0 → 0, native restored (41.86 → 46.75 C2FLR) |

Explorer: `https://coston2-explorer.flare.network/tx/<hash>`. Full data:
`.thoughts/verification/2026-08-12-m10-live-delegation.json`.

**AC3 (lifecycle honesty):** the delegate op traversed `awaiting_external(flare) → succeeded`, with
`succeeded` reached **only** once `reconcileDelegation` saw the target in `delegatesOf`
(`preSendState: awaiting_external`, `opState: succeeded`). A still-empty `delegatesOf` would have
kept it `awaiting_external`, never `succeeded`.

## Two live-run findings (fixed during the run — the dry-run could not surface either)

1. **Record-shape crash (dev script).** `live-delegation.mjs`'s record helper read `plan.steps`, but
   callers pass the `buildDelegationPlan` *result* `{kind:'plan', plan:{steps,…}}`, so `record.steps`
   was `undefined` and `reconcileDelegation` threw. Fixed to `plan.plan.steps`. No tx was lost (the
   crash was before the `signCall`). The product `reconcileDelegation` was correct.

2. **`WNat.withdraw` gas under-estimation (Flare protocol gotcha).** The unwrap `withdraw` reverted at
   **execution** twice (`0xa6cfcc59…`, `0x42fb790a…`, 300 blocks apart) while `simulateContract`
   **passed** both times. Root cause: `withdraw` burns WNat and writes a **cold vote-power checkpoint
   SSTORE** that `eth_estimateGas` (run against warm/latest state) under-prices → the mined tx
   OOG-reverts (surfaces as `status: "reverted"`, not a decode error — the selector/args are valid).
   Fix: an explicit generous gas limit (`gas: 800_000n`) — succeeded first try (`0x8b4903ad…`, gasUsed
   well under the limit, remainder refunded). **Lesson (carry to M11 staking):** for any WNat /
   vote-power-checkpoint-writing call, simulate-clean ≠ execution-clean — set an explicit gas limit.

## Scope note

The optional AMOUNT-mode (`delegateExplicit`) exercise was **intentionally omitted**:
`delegationModeOf` never resets from PERCENTAGE/AMOUNT back to NOTSET, so exercising AMOUNT on the
single funded signer would permanently block the PERCENTAGE round trip (the primary AC). It belongs
on a throwaway account. Consequence: AMOUNT mode was **not observed live**, so the delegation mock
(Task 6) reproduces the observed PERCENTAGE path and **declares AMOUNT unobserved** rather than
fabricating a `succeeded` AMOUNT delegation.
