# Handoff: M1 complete, M2 specified and unstarted

Date: 2026-08-04
Next authorized action: **M2-R1** — the `Observation` type
(`.thoughts/specs/2026-08-04-m2-accounts-portfolio-activity.md`).

## Where the project actually is

Authority, in order: `CLAUDE.md` → `DESIGN.md` →
`.thoughts/decisions/2026-08-04-build-everything-real-first.md` (supersedes
`SPEC.md` as a statement of total scope) → the per-milestone specs.

- **M0 complete.** Live chain-state reader, `createFlareKit`, resume script
  deleted. `reconcileDirectMint` drives a live mint the way it drives the mock.
- **M1 complete.** Mint and redeem, both live on Coston2 + XRPL Testnet, both
  in the UI, mock reproducing both. Evidence under `.thoughts/verification/`.
- **M2 specified, nothing built.**

Gate at handoff: `build:0 typecheck:0 lint:0`, **481 tests**, publint clean on
four packages.

## Live accounts (funded, keys in `.secrets/live-run.json`, gitignored)

| | |
|---|---|
| Coston2 EVM | `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9` — ~100 C2FLR, 24.8 FTestXRP |
| XRPL Testnet | `rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio` — ~84.95 XRP |

Enough for M2's live portfolio run without further funding.

## Process lessons that cost real time

**Anything typed from memory needs a test that re-derives it.** Two of the worst
bugs were hand-written hex: four fabricated mainnet addresses (caught by
`manifest-parity.test.ts`) and a wrong `getSettings()` selector (caught by a
test asserting it equals `toFunctionSelector('getSettings()')`). Both would have
failed only against a live chain.

**An interface file is not the deployed contract.** `firstVotingRoundStartTs()`
is declared on `IRelay` and reverts on the deployed Relay; it lives on
`FlareSystemsManager`. This cost a half-completed mint — the XRP was already
paid when the read reverted.

**Run `typecheck` AND `test` per small batch.** Five uses of the test-lock
escape hatch, every one caused by writing a large batch of tests and running
none until the end. Write two or three, run both checks, continue.

**Simulate as the identity that will send.** `alreadySettled` detection returned
false because the simulation had no account, and `verifyProofOwnership` reverts
before the already-confirmed check. A pre-flight that runs as the wrong sender
answers a different question.

**Never `cd` into `sources/`.** The harness resolves the project root from the
shell's working directory; `cd`-ing into a vendored clone makes the stage guard
report `orient` and block source writes. Use absolute paths.

## Open caveats, carried forward

- **No UI has been viewed in a browser.** Abu waived browser verification, so
  every component is green by test only. `MintFXRP`, `RedeemFXRP`,
  `OperationTimeline`, `RecoveryPanel`, `ConnectButton` have never been looked
  at by a human.
- **`BLOCKED` and `REJECTED` redemption outcomes** map to `action_required` with
  an operator, because what happens to the burned FAsset in each case was not
  verified. Deliberate: an unverified outcome is not rendered as success or
  failure.
- `packages/core/scripts/live-mint.mjs` still hand-rolls its sequence rather
  than driving `reconcile`. It works and produced the evidence, but it is not
  the pattern `live-redeem.mjs` sets.

## Conventions that are not obvious from the code

- Mock stays in `@flare-kit/core` (decision record §3), but is written **after**
  the live path and copies observed behaviour. `flare-kit.ts` contains no
  textual reference to it, enforced by a test.
- Every protocol fact in a comment carries its source file. Research briefs in
  `.thoughts/research/` are the durable record; the FDC one carries a correction
  block from a live probe.
- A file over 300 lines is split before writing, not after.
