# flare-kit reference contracts (M9)

Self-hostable reference Solidity for the two M9 payment rails, plus Coston2 deploy
scripts. This is a **standalone Hardhat project**, deliberately **not** a pnpm
workspace member — flare-kit ships the reference so anyone can run their own
forwarder / relayer / x402 facilitator. flare-kit never becomes a hosted operator.

## Contracts

- **`GaslessPaymentForwarder.sol`** — EIP-712 meta-transaction forwarder for gasless
  FXRP. A payer approves the forwarder once (paying gas once), then signs
  `PaymentRequest(from,to,amount,nonce,deadline)` off-chain; an **authorized relayer**
  submits `executePayment(...)` and pays the gas. FXRP is resolved from the Flare
  Contract Registry (`getAssetManagerFXRP().fAsset()`), so no token address is
  hardcoded — the same bytecode works on any Flare network.

  **Adaptation from the reference example:** the developer-hub example defined the
  `authorizedRelayers` allowlist, `setRelayerAuthorization`, and the
  `UnauthorizedRelayer` error but never enforced the allowlist in `executePayment`.
  flare-kit's spec makes the allowlist load-bearing, so `executePayment` now reverts
  for an unauthorized caller. This is the only behavioural change.

- **`MockUSDT0.sol`** — a **labelled demo** ERC-20 with EIP-3009
  `transferWithAuthorization`, copied verbatim from the flare-hardhat-starter. It
  exists because **neither FXRP nor the real Coston2 USD₮0 implements EIP-3009**
  (re-probed 2026-08-12), and x402 settles by calling the token directly. The flow
  and settlement are real; only the asset is a stand-in. Every kit surface renders
  it as a demo token — never as USD₮0 or FXRP. `mint` is public (demo funding only).

- **`X402Facilitator.sol`** — verifies (`verifyPayment`) and settles
  (`settlePayment`) EIP-3009 authorizations against a supported token, copied
  verbatim. Deployed **fee-free** (`feeBps = 0`).

  **Honest disclosure:** the inherited `feeBps` / `feeRecipient` / `setFeeBps`
  fields are **inert** — `settlePayment` transfers the full `value` and never
  applies a fee. They are placeholders from the example, not a working fee model.
  M9 explicitly does not build a fee/quota model; the kit renders no fee.

## Deploy (Coston2)

The deployer/operator key is read from `../../.secrets/live-run.json`
(`evm.privateKey`) — never an env var, never logged, never committed. The AC1/AC3
payer address is read from `../../.secrets/m9-payer.json` (address only).

```bash
# from repo root (the project is standalone; run its scripts in place):
npm --prefix reference/contracts install
npm --prefix reference/contracts run compile
npm --prefix reference/contracts run deploy:gasless   # spends real C2FLR
npm --prefix reference/contracts run deploy:x402      # spends real C2FLR
```

`deploy:gasless` deploys the forwarder, authorizes the operator as the relayer, and
reads `fxrp()` back. `deploy:x402` deploys MockUSDT0 + the facilitator, registers
MockUSDT0 as supported, and mints a demo balance to the payer. Both record every
address into `deployments/coston2.json`, which `@flarekit-dev/contracts` reads.

Public constants (RPC, chainId 114, explorer) live in `hardhat.config.ts`.
