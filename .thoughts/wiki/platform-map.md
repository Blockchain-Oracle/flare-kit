# Flare platform map for this hackathon

Status: source-traced on 2026-07-22 and completeness-refreshed on 2026-07-24. This page answers “which Flare primitive owns which job?” See the pinned [source manifest](../raw/2026-07-22-flare-source-manifest.md) and [complete capability inventory](capability-inventory.md).

## Layer map

| Primitive | Job it actually does | Best hackathon use | What it does **not** prove/do |
|---|---|---|---|
| FTSOv2 | Decentralized on-chain/off-chain time-series feeds, especially asset prices | Trigger/guard valuation, risk, settlement and UI quotes | Does not verify a particular XRPL payment or keep a strategy private. |
| FDC | Consensus attestation of facts from supported external chains/APIs | Prove an XRPL/EVM payment, address validity, non-payment or Web2 JSON response to a contract | Not an arbitrary private computation engine; standard attestation type and source rules apply. |
| FAssets / FXRP | Over-collateralized representation of non-smart-contract assets on Flare; FDC verifies underlying activity | Make XRP usable by EVM contracts and redeemable back to XRP | Does not itself create a merchant lifecycle, strategy, account abstraction or privacy. |
| Smart Accounts | Deterministic personal Flare account controlled by XRPL payment authorization; can mint FXRP and dispatch Flare calls | XRP-native onboarding without requiring the user to manage an EVM wallet or FLR gas | Hash-only `0xFE` keeps call bytes off XRPL, but the executor later submits those bytes in public Flare calldata; it is not FCC confidentiality. |
| Secure random | Network-provided random value, timestamp and `isSecure` flag | Verifiable randomized selection, games, draws or protocol decisions | Consumers must check `isSecure`; it is not private randomness or a general oracle feed. |
| WNat / rewards | Wrap native tokens, delegate FTSO vote power and claim proof-backed rewards | User participation and incentive UX | Reward types, epochs, proofs and expiry differ; visible FlareDrop interfaces do not mean new FlareDrops still accrue. |
| Governance | Proposal discovery/state, vote-power delegation and voting | Governance portals, alerts and participation flows | Proposal families/networks differ and old snapshot reads may need archive data. |
| C/P-chain staking | C↔P movement, validator registration, staking and delegation | Validator/delegator tooling | Requires a two-transaction chain move, locked terms and P-chain-specific signing/state. |
| FCC / custom FCE | Hardware-attested private execution that returns signed results through the FCC instruction system | Secrets, private policies, secure matching/scoring/signing, or sensitive external API access | Does not make state durable automatically and does not remove TEE/platform/provider/proxy assumptions. |
| FDC2 / PMW system extension | FCC system applications for lower-latency attestations and protocol-managed external-chain wallets | Protocol infrastructure when the deployed system exposes the exact needed operation | A custom FCE does not automatically gain arbitrary provider augmentation or production wallet custody. |

Primary references: [FAssets overview](../../developer-hub/docs/fassets/01-overview.mdx), [FDC overview](../../developer-hub/docs/fdc/1-overview.mdx), [FTSO overview](../../developer-hub/docs/ftso/0-overview.mdx), [Smart Accounts overview](../../developer-hub/docs/smart-accounts/1-overview.mdx), [FCC spec](../../sources/flare-foundation/flare-specs/src/FCC/README.md).

Published packages, wallet layers, CLIs, APIs, operator services and external providers are intentionally separated from protocol primitives here. See [Capability inventory](capability-inventory.md) and [Ecosystem tools](ecosystem-tools.md) for those layers.

## Three complete product paths

### XRP-native application

```text
XRPL user signs Payment
  -> FDC proves the payment / direct mint executor finalizes it
  -> FXRP enters a deterministic PersonalAccount
  -> Smart Account dispatches a product contract call
  -> product contract records receipt / position / refund rights
```

Use this when the selling point is “an XRP holder can use the product without becoming a Flare power user.” The direct-mint route sends XRP to the Core Vault, and `executeDirectMinting` or `executeDirectMintingWithData` finalizes on Flare. ([FAssets minting](../../developer-hub/docs/fassets/02-minting.mdx), [Smart Accounts comparison](../../developer-hub/docs/smart-accounts/5-custom-instruction-comparison.mdx))

### Confidential asset decision

```text
user deposits/escrows FXRP in contract
  -> instruction-sender emits private-compute request
  -> FCC TEE evaluates hidden input/policy
  -> signed result is retrieved and verified/consumed
  -> escrow/vault settles only the authorized bounded action
```

Use this for a two-bounty entry. The FCC result must be structurally necessary to the asset outcome; merely charging an FXRP fee for an unrelated private app is superficial. Keep custody and replay protection on-chain, and constrain the TEE result to a narrow action/amount/deadline/domain. ([FCC architecture](fcc.md), [FCE instruction workflow](../../sources/flare-foundation/flare-specs/src/FCC/FCE/Workflows/Instructions.md))

### Cross-chain fact application

```text
event/payment happens off Flare
  -> FDC request + provider consensus
  -> proof retrieved
  -> Flare contract verifies proof and executes deterministic logic
```

Use this when the secret is not the value proposition and the job is proving an external fact. Prefer standard attestation types over custom FCC machinery if they solve the problem. ([FDC getting started](../../developer-hub/docs/fdc/2-getting-started.mdx), [attestation types](../../developer-hub/docs/fdc/3-attestation-types.mdx))

## Asset integration facts that affect UX

- Coston2 faucet FXRP lets a judge exercise the Flare-side product without waiting for an XRPL mint. The full XRP-native flow should still be shown separately if it is central. ([FXRP overview](../../developer-hub/docs/fxrp/overview.mdx))
- Direct XRP minting is currently Core-Vault based. Recipient/executor can be encoded by destination tag or memo; FDC proof is supplied when finalizing on Flare. ([minting](../../developer-hub/docs/fassets/02-minting.mdx))
- Direct minting has minimum fees, hourly/daily throttles and a large-mint delay. A frontend must model `delayed` as a retryable state, not a failed payment. ([minting rate limits](../../developer-hub/docs/fassets/02-minting.mdx))
- Redemption burns FAssets and creates an underlying payment obligation; completion/default paths are asynchronous. The UI must show a state machine, not promise instant XRP. ([redemption](../../developer-hub/docs/fassets/04-redemption.mdx))
- Smart Account `0xFE` commits `keccak256(userOp)` in a fixed 42-byte XRPL memo; the executor later supplies the full operation. `0xFF` carries it inline and is capped by XRPL memo size. Both ultimately validate the same sender/nonce rules. ([custom instruction comparison](../../developer-hub/docs/smart-accounts/5-custom-instruction-comparison.mdx))
- A failed custom direct-mint operation rolls back FXRP minting while the XRP stays at the Core Vault; the recovery opcodes (`0xE0`, `0xE1`, `0xE2`) are product-facing recovery states, not edge trivia. ([Smart Accounts reference](../../developer-hub/docs/smart-accounts/reference/IMasterAccountController.mdx))

## Integration selection rules

1. Use FTSO for a price; do not fetch a public price inside an FCE merely to claim privacy.
2. Use FDC for a supported external fact; use FCC only when the input/logic must remain secret or a secret key must be isolated.
3. Use plain Coston2 FXRP for the fastest judge path, then layer the XRPL/Smart Account route only where it proves the product's distribution advantage.
4. Use `0xFE` for XRPL memo capacity/off-XRPL payload delivery, not as a substitute for confidential compute.
5. Resolve protocol addresses from the current official registry/periphery deployment data. Never hardcode an address copied from a reference app without verifying network and bytecode.
6. Design asynchronous states explicitly: `awaiting XRP`, `proof pending`, `mint delayed`, `FXRP credited`, `FCC decision pending`, `settled`, `redeeming`, `paid on XRPL`, `default/recovery`.

## Network posture

- Coston2 is the normal application testnet and the safest default for an interactive hackathon demo.
- Songbird is the canary network named by STP.13 for the initial FCC/FDC2/PMW rollout; custom extension availability still needs organizer confirmation.
- Flare mainnet should be a roadmap target unless every dependency, address and operational role is already production-ready.

The current FCC docs themselves describe a locally simulated TEE connected to real Coston2 and require public proxy reachability plus indexer access. Deployment claims should name exactly which pieces were on-chain, simulated, tunneled or hosted. ([FCC getting started](../../developer-hub/docs/fcc/guides/00-getting-started.mdx), [reality research](../research/2026-07-22-flare-summer-signal-reality.md))
