# Decision: no first-party proof consumer — verifier-only is the end state

Date: 2026-08-04
Status: **adopted by Abu**
Supersedes: the spec inference recorded in
`.thoughts/specs/2026-08-04-m3-fdc-surfaces.md` ("Out of scope → No first-party
Solidity and no demo consumer contract"), which until now was an inference and
not a decision.

## The question

Three of the four M3 attestation families reached on-chain *verification* through
`FdcVerification` and stopped there, because nothing this project deploys
consumed them. Was verifier-only the right permanent end state, or should the kit
ship a demo consumer contract?

## What was checked first

The premise was wrong. FAssets consumes **all seven chain families** on the
AssetManager diamond. `XRPPaymentNonexistence` among them, via
`IRedeemExtended.xrpRedemptionPaymentDefault` — a redeemer's proof that an agent
did not pay.

Verified on the deployed Coston2 AssetManager
`0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA`, 2026-08-04:
`redeemWithTagSupported()` returns `true`, and selector `0xafe4226a` is
registered on the diamond — it reverts on arguments, not on a missing function.

So it is **two** families with no deployed consumer, not three:
`EVMTransaction` and `Web2Json`.

## The decision

**Verifier-only is the permanent end state for those two, and this project never
ships a demo consumer contract.** Abu, on being shown the above: *"i wouldn't
want a toy integration of course."*

Two reasons, the second being the real one:

1. A demo consumer would prove nothing about real integration, and it would put a
   Solidity toolchain, a deployment and a first-party address to maintain into a
   repository whose stated discipline is that it has none.
2. **For those two families the consumer is the integrator's contract by
   definition.** A proof of an arbitrary EVM transaction, or of an arbitrary JSON
   endpoint filtered through a caller's own jq and encoded to a caller's own ABI
   signature, has no meaning until somebody's own logic gives it one. Deploying
   something that consumed it would be *inventing* meaning the protocol
   deliberately leaves open — the same instinct as faking a balance, one level up.

## What follows from it

- `ProofDetail` derives verifier-only from `family.hasDeployedConsumer`, never
  from whether a caller passed a handler. A screen that has not wired
  consumption says exactly that, and does not claim none exists.
- The two general families' `consumer` field names the integrator, not an
  absence: the row is a statement about where responsibility passes, not a gap.
- **Verifier-only must not read as a cul-de-sac.** The kit owes the handoff:
  the ABI-ready proof struct as copyable calldata, and the Solidity type to write
  against. That is the difference between "nothing takes this" and "this is the
  last step we own". Built as `ProofHandoff` on FDC-04.

## Not decided here

Whether a *documentation* example — a `.sol` snippet in the docs site, compiled
by nobody, deployed nowhere — is worth writing. That is a docs-site question and
the docs site is deliberately last.
