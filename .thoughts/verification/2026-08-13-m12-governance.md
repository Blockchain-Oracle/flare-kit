# M12 governance — LIVE keyless reads (AC1) + plan/invariant proof (AC2)

- Ran: 2026-08-13T12:11:52.335Z · account `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9`
- Networks: **Coston2** (114, write/verify target) + **Flare mainnet** (14, proposal read lens)
- Keyless read pass: below. **Broadcast round trip subsequently RAN on Abu's explicit go — see "Live broadcast round trip" at the end.**
- `governanceVerified`: **true on Coston2** (flipped by the live round trip below), **false on Flare** (mainnet is a read lens, never flips). The keyless read section below records the pre-flip state at the time it ran.

## Coston2 governance state (honest observed / undefined — nothing fabricated)

- block **34007182** · GovernanceVotePower `0x8e4A2c063E1C82C9f5cb96489c0d2b6d78dF0538`
- governance vote power: **0** (0 wei) · position **observed**
- current delegate: `0x0000000000000000000000000000000000000000` (zero? true)
- eligibility: isProposer=false canPropose=false isMember=undefined (PollingFtso.isMember REVERTS for a non-member — probe CONCERN A; never coerced to false)
- native: **146.634056736830560487 C2FLR**
- observed: 0 governance VP, delegate 0x0000000000000000000000000000000000000000 — a real blank-slate read (0 VP, zero delegate), not a fabricated fill

## Coston2 proposal discovery

- discovered: **0** — honest-empty: getLastProposal id 0 + bounded PollingFoundation scan found none — Coston2 hosts no proposal (blank), never invented

## Flare mainnet — the real FTSO proposal (read lens, discovered live)

- block **67309105** · discovered **1** proposal(s) via getLastProposal + bounded PollingFoundation scan
- **FTSO proposal #1** — state **defeated** (index 3 mapped via the FTSO enum: 3 = Defeated, NOT the foundation enum's Succeeded)
  - proposer `0xb5Dd6cA7b14bd7d2B6E296983D0AA0D373979CFE`
  - votes: **for 2354.308387975507843417** (2354308387975507843417 wei) · **against 0** (0 wei)
  - threshold **6600 BIPS** · majority **5000 BIPS** · totalVotePower **5217.782567582675528275** (5217782567582675528275 wei)
  - window: 2024-12-05T15:44:59.000Z → 2024-12-07T15:44:59.000Z
  - FTSO deployed shape carries no votePowerBlock / hasVoted / per-voter votes → rendered "—" (undefined), never fabricated

## planGovernance gate + invariants against the LIVE Coston2 reads (AC2-plan)

- **verified gate**: governanceVerified=false → refused `unverified` — no signable plan is emitted while unverified, proven against real reads
- **valid under a verified OVERRIDE** (not a source flip): plan OK, calls `["delegate"]` — the mechanism is built and dormant
- **self-delegation** (to = account) → refused `self_delegation`
- **invalid (zero) target** → refused `invalid_target`
- **undelegate with no current delegate** (live zero delegate) → refused `no_delegate`

- honest-read expectations all passed: **true**
- Broadcast path: wired (`broadcast` / `delegate` / `flip` / `undelegate` subcommands) behind a DOUBLE guard — the `--broadcast` flag AND `LIVE_GOV_BROADCAST` token, both required. The keyless read pass entered none of them; the secrets file was not opened and no key was read during it.

## Live broadcast round trip — Abu's GO (Task 6 Steps 2–4)

- Ran: 2026-08-13 · network **Coston2** (chainId 114) · signer `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9`
- **Target delegate** (`GOV_DELEGATE_TARGET`): `0xDddF991858311597bFD3D125cb342a0d4B56ea0a` — the m9-payer **public** dev address (non-self, non-zero). Read from `.secrets/m9-payer.json` public `address` field only; its private key was never read.
- **Wrap needed? NO.** A keyless read-only `eth_call` simulate confirmed `delegate(target)` succeeds at 0 governance VP — the `GovernanceVotePower.delegate` pointer sets regardless of balance — so no `WNat.deposit()` wrap was performed. The account's governance VP was 0 throughout (delegating 0-weight moves the delegate pointer only).

### Step 1 — delegate(target)
- tx `0xc0da39abf699242a1306c7ac659c59d7df98612940e8b4036ec6d0075d1419d7` · status success · block 34007574
- explorer: https://coston2-explorer.flare.network/tx/0xc0da39abf699242a1306c7ac659c59d7df98612940e8b4036ec6d0075d1419d7
- **read-back**: `getDelegateOfAtNow(account)` → `0xDddF991858311597bFD3D125cb342a0d4B56ea0a` (== target). `reconcileGovernance` → `succeeded` **only from this read-back**, never the submission.

### Step 2 — flip governanceVerified (Coston2 only)
- `packages/contracts/src/governance.ts`: coston2 `governanceVerified: true` (flare stays `false` — read lens). Flipped only AFTER the confirmed delegate read-back.
- `packages/core/src/portfolio.ts`: the `governance` row is removed from `UNBUILT_POSITION_TYPES` (M12-R10 / M12-AC3) — governance is now a BUILT, observed position via `governancePosition`, exactly as delegation's row was removed in M10-R12.
- Tests after the flip: `@flare-kit/contracts` **183 passed, 2 skipped** (the 2 skips are the pre-existing FAssets vendored-clone skips; the **M12 governance parity block RAN LIVE** — the four governance addresses match the live `getAllContracts()` registry on both networks and GovernorReject is absent). `@flare-kit/core` **1005 passed**. Contracts + core rebuilt so dist carries the flip + the surfaced position.

### Step 3 — undelegate()
- tx `0x5537335d5fcabebcb512b9ece76f258b15cba773fd6a3785e0697e76e75bea7d` · status success · block 34007843
- explorer: https://coston2-explorer.flare.network/tx/0x5537335d5fcabebcb512b9ece76f258b15cba773fd6a3785e0697e76e75bea7d
- **read-back**: `getDelegateOfAtNow(account)` → `0x0000000000000000000000000000000000000000` (zero address). Round trip **closed — no residual delegation**.

### Secrets
- The private key was read ONLY inside the guarded broadcast branch to construct the local signer; it was never logged, printed, in `--json`, or in any evidence file. Verified: neither the live-run key nor the m9-payer key appears in this file or the read JSON; the only 64-hex strings in evidence are the two public tx hashes above.
