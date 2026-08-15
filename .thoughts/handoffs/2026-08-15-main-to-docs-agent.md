# Handoff — main-line agent → docs-and-branding agent

**Date:** 2026-08-15 · **From:** the session building the packages on `main` · **Status:** live

We cannot talk directly. Two Claude Code sessions have no wire between them — `claude -p` starts
a *new* headless instance with none of the running session's context. This file and the git
remote are the channel. Please append to it rather than replying elsewhere.

## What I changed that affects you

**`main` is pushed** — 48 commits, including all of M14. `origin/main` is current as of
`54b4517`. If you branched from an older `main`, rebasing onto it now is cheaper than later.

**I pushed your branch for you.** `docs-and-branding` had **104 unpushed commits** sitting only
on this laptop. It is now on `origin/docs-and-branding` at `73c1db3`. I pushed *committed work
only* — your three modified files (`apps/site/app/docs/docs.css`,
`apps/site/components/docs/preview.tsx`, `apps/site/test/preview.test.tsx`) were untouched and
are still yours, uncommitted, in the worktree.

**I did NOT merge your branch into main**, and will not. Abu's standing instruction of
2026-08-14 is that `docs-and-branding` is his to land himself.

## The thing you most need to know

The two branches have **diverged on package names**. `main` publishes `@flare-kit/*`; your
branch consumes `@flarekit-dev/*`. Whoever reconciles that is doing a real migration, not a
rename — flagging it now because it will bite at merge time, and neither of us should do it
unilaterally.

## What M14 added to main, in case your docs reference it

The direct-minting memo flow, live-verified on Coston2 2026-08-15. Three claims changed and any
docs repeating the old versions are now wrong:

1. **`proofOwner` binds the PROOF, not the PAYMENT.** Self-relay does not make the kit the
   executor — the XRPL transaction is public, so anyone can attest it under their own
   `proofOwner`, and one did, ~2 minutes after our payment validated. Self-relay buys
   *independence from* a relayer, not exclusivity over the mint.
2. **The pre-signature simulation runs against pre-mint state**, so "mint and immediately spend
   it" fails a check it would pass on chain.
3. **Coston2 executor availability is REAL_MVP**, not REAL_LATER.

New public surface: `useMemoInstruction`, `MemoInstructionComposer`, `MemoChain`,
`RecoveryComposer`, and in core `planMemoInstruction` / `planSelfRelay` / `planMemoRecovery`.

## Deployment

Abu asked for a Vercel deploy so the domain resolves. `apps/site` lives on YOUR branch, not
main, so the deploy target is yours. I am deploying from a **clean clone of the pushed branch**,
not from your worktree, specifically so nothing of yours is disturbed — no `.vercel/` directory
and no config file will appear in your working copy.

Vercel org: `blockchain-oracles-projects`. Project: `flare-kit-site`. If you take deployment
over, that is the project to use rather than making a second one.

## Please leave a reply below this line

_(append your state here — what you're mid-way through, anything on main you need changed)_

## Deployment done (2026-08-15)

Live and public: **https://flare-kit-site.vercel.app** — 200 on `/` and `/docs`.

- Vercel project `flare-kit-site` under `blockchain-oracles-projects`
- Root Directory `apps/site`, framework Next.js, pnpm workspace install from the repo root
- SSO deployment protection DISABLED so the URL is publicly reachable
- Deployed from a clean clone of `origin/docs-and-branding` at `73c1db3` — **your working
  copy was never touched**, so there is no `.vercel/` directory or config file in it

`flare-kit.xyz` and `www.flare-kit.xyz` are attached to the project but DNS is not pointed yet,
so they do not resolve. Abu has the records.

If you redeploy, deploy the branch's committed state, not a dirty worktree.
