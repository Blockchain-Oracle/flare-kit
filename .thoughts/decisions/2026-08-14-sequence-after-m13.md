# Decision — the build order after M13, and what I was delegated

**Date:** 2026-08-14 · **Status:** adopted · **Taken by:** Claude, under explicit delegation

## What Abu said

Driving, unable to give instructions, and explicit about it: continue end to end, decide
about subagents and reviews myself, follow my own recommendations rather than waiting.
Three concrete instructions came with that:

1. **Leave `docs-and-branding` alone.** Do not merge it, do not work toward merging it. He
   knows what he wants there and will do it himself.
2. **Defer the CLI.** When the agent-tools row is reached, do not implement the CLI part yet.
3. He pasted the remaining build order: Flare Confidential Compute → agent tools, MCP server,
   CLI, scaffolder → operator, support, release, claim surfaces → documentation site and
   `apps/app` last, "by decision".

## What that paste actually is

The tail of `2026-08-04-build-everything-real-first.md`'s build-order table, from the row
after **XRPL-controlled Smart Accounts**. Not a new plan — the governing decision, restated.

## The one genuine ambiguity, and how it was resolved

"After the smart accounts" could mean *after M13* (skip to FCC) or *after the smart-accounts
family* (M14 first). It matters: M14 is a whole milestone.

Resolved in favour of **building M14 first**, on the repository's own record rather than on a
reading of a voice message:

- The governing decision lists **one** row for XRPL-controlled Smart Accounts. Half of that
  capability — the entire memo flow — is unbuilt, so the row is not done.
- `2026-08-13-m13-smart-accounts.md` § Out of scope states it directly: the memo flow is
  "**M14**, per the split Abu chose this session… **not dropped**: M14 is a committed
  milestone of an accepted family". That is an accepted artifact recording an explicit choice
  Abu made, and a dictated roadmap does not silently revoke it.
- `state.json` records the same split as one of the three choices Abu made before the M13
  spec was written.
- His sentence describes what follows the smart-accounts row. It reads as sequencing, not as
  cancellation, and nothing in it names M14 or the memo flow at all.

If this reading is wrong, it is wrong by one milestone and recoverable: M14's spec will be
written before it is built, and he can redirect at that point.

## Adopted order

| | Work | Note |
|---|---|---|
| **M14** | Smart Accounts part two — the direct-minting memo flow | `0xFF`/`0xFE` PackedUserOperation batches, executor pin/unpin, recovery opcodes `0xE0`/`0xE1`/`0xE2`/`0xD0`/`0xD1`. Grounding already read during M13's source pass. |
| **M15** | Flare Confidential Compute | |
| **M16** | Agent tools, MCP server, scaffolder | **CLI deliberately excluded** per instruction 2. It is deferred, not dropped, and the spec will say so. |
| **M17** | Operator, support, release and claim surfaces | |
| last | Documentation site and `apps/app` | By decision — both consume the packages, and building either early hides which package does not work. |

## Standing rules for this delegated stretch

- Every milestone keeps the established shape: research → spec → build → review gate →
  live verification → evidence → merge to local `main`. No step is skipped for speed.
- Reviews are dispatched without asking. The M13 gate found a fabricated value that had
  already reached a screen; that is not an optional step.
- The live-run gate has been "Abu's explicit go" every milestone. For this stretch that go is
  the delegation itself, bounded to what he has already authorised in kind: **Coston2 testnet
  only**, with the existing double broadcast guard intact. No mainnet write, and no new class
  of value movement, is covered by this and none will be taken.
- Anything genuinely irreversible, outward-facing, or beyond the accepted scope stops and
  waits, delegation or not.
