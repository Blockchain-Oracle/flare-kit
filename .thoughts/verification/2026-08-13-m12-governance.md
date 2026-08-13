# M12 governance — LIVE keyless reads (AC1) + plan/invariant proof (AC2)

- Ran: 2026-08-13T12:11:52.335Z · account `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9`
- Networks: **Coston2** (114, write/verify target) + **Flare mainnet** (14, proposal read lens)
- Broadcast: **none** — KEYLESS read pass. The delegate/undelegate round trip is HELD on Abu's go (see Carry).
- `governanceVerified`: **false** on both networks (unchanged — no live round trip has confirmed it).

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

## Carry

- The delegate/undelegate round trip is HELD on Abu's explicit go. It is cheap and reversible (no funding floor) but moves real governance vote power, so it runs only on the double guard. governanceVerified stays FALSE on both networks; the governance-delegation write is declared-unbuilt, nothing faked. It flips (Coston2 only) exclusively after a live delegate lands and getDelegateOfAtNow reads back the target, then undelegate restores the zero address.
- honest-read expectations all passed: **true**
- Broadcast path: wired (`broadcast` subcommand) behind a DOUBLE guard — the `--broadcast` flag AND `LIVE_GOV_BROADCAST` token, both required. This run entered neither; the secrets file was never opened and no key was read.
