# M10 — Delegation & Claims: full evidence (Coston2, 2026-08-12)

Ships the **DelegationCard** (FTSO vote-power delegation) and the **ClaimCard** (three distinct
claim kinds) on the live Coston2 Flare contracts — **no contract deploy**; the existing WNat,
RewardManager v2, RNat and DistributionToDelegators are resolved from `FlareContractRegistry` and
snapshotted. Signer / dev key `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9` (`.secrets/live-run.json`,
never logged).

## Gate (AC7)
`pnpm build && pnpm typecheck && pnpm lint && pnpm test` — all green:
- build ✅ · typecheck ✅ · lint ✅ · test ✅
- contracts 168 passed / 2 skipped · core 899 · react 49 · react-ui 360 · relayer 7 · x402-server 12.

## AC1/AC2/AC3 — live delegation round trip (reversible)
A full wrap → delegate → undelegate → unwrap round trip landed on Coston2; `succeeded` is sourced
**only** from the on-chain `delegatesOf`/balance read. FTSO provider
`0xB63C1E02a41e975f4d826BD06eccaFaCd5038B5D` (top registered Coston2 voter, resolved read-only from
`VoterRegistry.getRegisteredVoters(5931)`).

| phase | tx | block | on-chain result |
|---|---|---|---|
| wrap | `0x68d6bb3551a445b68a60fe365cf5a9d31bc7b4919488d583143c826c27a5c572` | 33966630 | WNat 0 → 5.0 |
| delegate | `0x7b8fa4e1e0460680cb59d5da9291c4a7b9252553e956d801617ca9c54a22681a` | 33966710 | `delegatesOf` = [{provider, 10000 bips}], mode 1 (PERCENTAGE); signer `votePowerOf` 0 (delegated away) |
| undelegate | `0x70ed6dbb3b5dc698126f24a7187770d5848b8a7b0c1f85c152aab96f12167d3b` | 33966725 | `delegatesOf` = [] |
| unwrap | `0x8b4903ad95bce514ae1b1fb6e0a465099c16c34f9d3d6f22e5fc706869ab13f0` | 33967141 | WNat 5.0 → 0, native restored (41.86 → 46.75 C2FLR) |

Explorer: `https://coston2-explorer.flare.network/tx/<hash>`. Lifecycle (AC3): the delegate op
traversed `awaiting_external(flare) → succeeded`, `succeeded` reached **only** from the `delegatesOf`
read. `delegationVerified` flipped `false → true` in `packages/contracts/src/delegation.ts` **only
after** that confirmed read (the `flip` phase is code-guarded to refuse until the delegate phase
records `succeeded`). Data: `.thoughts/verification/2026-08-12-m10-live-delegation.json`; narrative
+ the two live-run findings: `2026-08-12-m10-delegation.md`.

**Two Flare/dev findings fixed during the run** (both invisible to the dry-run):
1. dev-script record-shape crash (`plan.steps` vs `plan.plan.steps`) — caught before signing, no tx lost.
2. **`WNat.withdraw` gas under-estimation** — `withdraw` writes a cold vote-power-checkpoint SSTORE that
   `eth_estimateGas` under-counts right after an undelegate, so a simulate-clean tx OOG-reverts (twice,
   300 blocks apart) as `status:"reverted"`. Fixed with an explicit gas limit (`gas: 800_000n`). Carry
   to M11 staking: simulate-clean ≠ execution-clean on vote-power writes.

## AC4/AC5 — reward reads live (keyless), claim self-reconciling; empties honest
Ran the rewards adapter `read` live on Coston2 — every surface renders an **honest empty/legacy**
state, never a zero dressed as an amount:
- currentRewardEpoch 5930; `claimableEpochs` = 28 signed epochs 5902–5929 (gated on `rewardsHash != 0`).
- **FTSO delegation reward:** the account earned nothing → `no-entitlement`; empty `getStateOfRewards`
  renders a dash, never a faked 0.
- **rNat:** `getBalancesOf` **reverts "no RNat account"** → mapped to `hasProject:false` honest-empty
  (a contract revert → declared-empty; a transport error would rethrow — unknown ≠ empty).
- **FlareDrop:** `getClaimableMonths` **reverts "already finished"** → `concluded` (ended 2026-01-30),
  a legacy read-only archive, never a "new drop."
- **Proof source:** the unofficial community mirror `https://gitlab.com/timivesel/ftsov2-testnet-rewards`,
  `official:false` on every surface; all 28 epochs probed → the account has no tuples → **declared
  proof-unavailable**, never a fabricated proof/amount.

**Carried FTSO claim (the M7 Firelight shape):** because nothing was earned, the FTSO
delegation-reward claim is **carried** — `node packages/core/scripts/live-delegation.mjs claim` is
coded + gated (it hit `no-entitlement`, broadcast nothing). It settles + flips `rewardsVerified:true`
only when a real reward and its Merkle proof land in a later epoch. `rewardsVerified` stays **false**
past M10. Evidence: `.thoughts/verification/2026-08-12-m10-rewards.md`.

## AC6 — surfaces, browser-verified, both themes, a11y
Both cards drive **all 26 states** from props at a fixed `MOCK_EPOCH` clock in the gallery; verified
in a real browser (Playwright, both themes). The official `window.__auditA11y` (contrast composited
with opacity, focus, target size — the M4-R12 method) reports **zero violations on the M10-new
`fk-delegation`/`fk-claim` elements, light and dark**. Honesty renders confirmed on screen
(`.thoughts/verification/m10-screens/`):
- DelegationCard compose = the real observed position (5 WC2FLR delegated 10000 bips to
  `0xB63C1E02…38B5D` · PERCENTAGE), all exact values in the **mono face** with full precision + asset.
- DelegationCard `mode-conflict`: **"Undelegate first"** with the AMOUNT-mode explanation + a disabled
  CTA — never a silent no-op.
- DelegationCard `unavailable`: every value **`—`**, "Position unavailable … unknown — **not zero**".
- ClaimCard rNat: **"Early exit burns 50% — destroys 2.000000000000000000 rNat … real value
  destruction, shown before you sign"** (locked 4 → 2 destroyed), the burn even in the CTA.
- ClaimCard FTSO: proof-source URL + **"unofficial mirror"** label, "Expires next 5902 · **25-epoch
  window**", the epoch-5929 amount in mono, `claimType` surfaced as "FEE · provider" (no fabricated fee).
- ClaimCard FlareDrop: **"Concluded · 2026-01-30"**, no new-drop affordance.

Pre-existing a11y (out of M10 scope, noted for a design-system pass): the shared `fk-segtab`
SegmentedTabs primitive (styled in `swap.css` since M5, used by M5/M7/M10) has a dark-theme tab
contrast issue; and the M5 TokenSelector search input / M7 vault amount label predate M10.
`delegation.css` does not touch `fk-segtab`.

## Portfolio (M10-R12)
`portfolio.ts` flips its declared-unbuilt `delegation` placeholder to a real observed position
(`delegationPosition`: observed | unavailable — an unread source is `unavailable`, never a confident
zero); `stake` stays declared-unbuilt.

## Carries recorded at close
1. **FTSO delegation-reward claim** — `rewardsVerified:false`, awaits an earned reward + its
   (unofficial-mirror) Merkle proof in a later epoch, then `live-delegation.mjs claim` settles it.
2. Still-open from prior milestones: the M7 Firelight delayed claim (unlock ~2026-08-13) and the M8
   cross-chain MINT.
