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

---

# Task 12 — milestone close (2026-08-13)

## Full gate (repo root, tests forced fresh past the turbo cache)

```
pnpm build      → OK (4/4)
pnpm typecheck  → OK (9/9)
pnpm lint       → OK
npx turbo run test --force → 9/9 tasks successful
```

| Package | Tests |
| --- | --- |
| `@flare-kit/core` | 1029 passed |
| `@flare-kit/react-ui` | 423 passed |
| `@flare-kit/contracts` | 183 passed, 2 skipped |
| `@flare-kit/react` | 79 passed |
| `@flare-kit/x402-server` | 12 passed |
| `@flare-kit/relayer` | 7 passed |
| **Total** | **1733 passed, 2 skipped, 0 failed** |

The 2 skips are the **pre-existing** FAssets vendored-clone gates in `manifest-parity.test.ts`, unrelated to
M12 and untouched by it. The **M12 governance parity blocks RAN LIVE** on both networks — verified by
running `@flare-kit/contracts` outside the turbo cache, because a content-hash cache hit is exactly the
wrong outcome for a test whose value is that it reads the live registry:

```
✓ M12 governance parity ('coston2') — snapshot vs a live getAllContracts read   495ms
✓ M12 governance parity ('flare')   — snapshot vs a live getAllContracts read   553ms
```

Both matched the snapshotted addresses; `GovernorReject` confirmed absent on both networks.

`publint`: **All good!** across `@flare-kit/core`, `@flare-kit/contracts`, `@flare-kit/react`,
`@flare-kit/react-ui`.

**No new dependency.** `git diff 4c93a16..HEAD -- '**/package.json' 'package.json'` is empty for the whole
milestone — governance is viem-only, as designed.

## Browser verification (Playwright, 1440×1000, both themes)

The Chrome extension was not connected, so the gallery was driven with Playwright instead. All three M12
mount points (`m12-governance`, `m12-proposals`, `m12-proposal-detail`) rendered in **both themes** with
**zero console errors and zero warnings** (the only console entry is a favicon 404). Screens:
`.thoughts/verification/m12-screens/*-t12.png` (six, one per section per theme, re-captured after the
review-gate fixes landed).

What the screens confirm visually — not merely by assertion:

- The honesty triad renders as **three distinct things**: `0.000000000000000000 VP` (an observed zero),
  `None` (an observed zero-address delegate), and `—` (an `isMember` read that reverted). A fabricated zero
  would have collapsed the first and third.
- The catalogue's four availability states are each distinct, and the unavailable copy states the point
  outright: *"Nothing is listed above rather than a list that would look identical to one the chain answered
  empty."*
- The detail renders the live mainnet values exactly: for **2354.308387975507843417 VP**, against
  **0.000000000000000000 VP**, threshold **6600 BIPS**, majority **5000 BIPS**, `totalVotePower`
  **5217.782567582675528275 VP** carrying its "not a definitive circulating supply" disclaimer rather than
  being relabelled. FTSO-absent fields render `—` **with the reason stated**.
- `Cast vote` is present but disabled and explained as carried. Proposing is declared unbuilt.

### Accessibility (`window.__auditA11y`, computed against rendered pixels, both themes)

Light 3 findings, dark 5 — **zero M12 contrast or target-size violations**. The three `target-size`
failures are all `m5-token-selector` inputs (336×19); M12's 14 delegate inputs were measured individually
via `getBoundingClientRect` at **410×39** and pass. The one M12-touching entry is the shared `fk-btn`
gradient, classed `not-measurable` (a gradient has no single background colour, so it needs a hand check
against its stops) — flagged identically across other milestones' sections and not a violation.

## Review gate (plan Task 12, Step 3)

Three independent reviewers over the whole M12 diff (`4c93a16..b5f4f02`), then a scoped re-review of the
fix wave. **1 Critical and 5 Important found and fixed**, plus 9 minors, 10 simplifications and 4 carried
actions. Two findings were reached **independently by two reviewers with no shared context**.

| | Finding | Why it mattered |
| --- | --- | --- |
| **Critical** | `proposals.ts` swallowed a failed FTSO discovery read and returned `[]` | `[]` is a *claim* here — the surface rendered "The discovery read succeeded and came back empty — nothing failed" while mainnet's one real proposal existed and had never been read. On mainnet the foundation scan is always empty, so `getLastProposal` is the only read that ever yields a proposal: one transient RPC error produced a confident falsehood. Discovery now throws; `undefined` (unavailable) and `[]` (confirmed-empty) stay distinct end to end. |
| **Important** | no `already_delegated` guard | Re-delegating to the *current* delegate made the read-back match immediately from pre-existing state, so the op reached `succeeded` regardless of whether the transaction landed — `submitted` rendered as `succeeded`, defeated from the plan side rather than the reconciler. Refused at the plan now, where the pre-state is known. |
| **Important** | the reconciler fixture jumped an illegal state edge | `applyTransition` drops its patch on an illegal hop, so the fixture stranded at `draft` with `steps: []` and four `steps.every(...)` assertions were **vacuously true** — including the one commented "proof the reconcileTo patch was applied, not dropped". The assertion guarding this codebase's named failure mode had been destroyed by that exact mechanism. Verified fixed by deliberately breaking the walker, confirming the four now fail, and reverting. |
| **Important** | the delegate tx hash was fetched and discarded | The declared `flare_tx` evidence slot was never filled by the shipped path; only the card's hand-injected test fixture showed a chip. Against the standing rule that every operation persists its state **and evidence**. |
| **Important** | `useProposals` never returned to `loading` on a dep change | Switching networks re-stamped the previous network's rows with the new label. First fix was incomplete — the component gates loading on `proposals === undefined`, so rows stayed listed and the rendered output was unchanged; closed properly by resetting all four slots together. |
| **Important** | a hardcoded "Read from Flare mainnet" note title | The same defect class already fixed once in this milestone (`d5c7ae4`, the caption), surviving one line below in a visible title. |

Also corrected: an **honesty defect in this evidence file's generator** — `live-governance.mjs` rendered a
line implying the new `already_delegated` invariant was proven live, when on a blank slate `invalid_target`
fires first and that guard is never reached.

## Outcome

M12 closes **built and live-verified**, not carried: `governanceVerified` is `true` on Coston2, the
delegate/undelegate round trip is closed with no residual delegation, and the proposal surface is an honest
mainnet read lens. The `castVote` / `propose` / `execute` legs are **carried, declared, and never faked** —
no `Active` proposal is executable on the write/verify network and the account holds no mainnet governance
vote power, so no live cast is producible.
