# @flarekit-dev/relayer

The flare-kit reference **fee-free** gasless relayer. A payer signs an EIP-712
`PaymentRequest` off-chain; this service recovers the signer, validates, simulates,
and submits `GaslessPaymentForwarder.executePayment(...)`, **paying the gas itself**.

It is a **self-hostable reference**, not a hosted product — flare-kit never becomes an
operator. A production relayer would add quota / auth / rate limiting; this one does
not, and it renders no fee because it charges none.

## No crypto drift

The relayer imports `recoverPaymentSigner` (and the domain/types) from
`@flarekit-dev/core` — the **same** vocabulary the client signs with. It re-declares no
EIP-712 domain or types, so the signature the client produces is exactly what this
service recovers and the forwarder verifies.

## Endpoints

- `GET /health` — config (network, chain id, forwarder, FXRP, relayer address). No key.
- `GET /nonce/:addr` — the payer's current forwarder nonce, for off-chain signing.
- `POST /execute` — `{ from, to, amount, deadline, signature }` (amount/deadline as
  decimal strings). Recovers the signer against the current on-chain nonce, checks
  balance / allowance / deadline, `staticCall`-simulates, then submits and returns
  `{ ok: true, txHash, blockNumber }` or `{ ok: false, code, error }` (HTTP 422 for a
  well-formed but rejected request).

## Running

```bash
pnpm build --filter @flarekit-dev/core --filter @flarekit-dev/contracts   # relayer imports from dist
RELAYER_PRIVATE_KEY=0x... RELAYER_NETWORK=coston2 RELAYER_PORT=8788 \
  pnpm --filter @flarekit-dev/relayer start
```

The operator key is read from `RELAYER_PRIVATE_KEY` only. It is **never logged, never
echoed, and never included in any response body**. The relayer address must be
authorized on the forwarder (`setRelayerAuthorization`, done by the deploy script).
