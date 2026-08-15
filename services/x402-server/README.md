# @flarekit-dev/x402-server

The flare-kit reference x402 server — a **single-endpoint fixture**, not a marketplace
(none exists on Flare or in the kit). `GET /api/demo` returns `402 Payment Required`;
with an `X-Payment` header it verifies + settles the EIP-3009 authorization via the
`X402Facilitator` and serves an **obviously-synthetic** payload.

## Honest by construction

- The paid asset is **MockUSDT0, labelled a demo token** at every turn (`asset:
  "mUSDT0 (demo)"`, `demoToken` from the registry). It is never dressed as USD₮0 or FXRP.
- **Settlement ≠ resource.** The settlement (a real facilitator transaction, in
  `X-Payment-Response`) and the resource (HTTP 200 + body) are two independent facts.
- The resource is **synthetic with no fabricated data** — the tutorial's made-up
  `flarePrice` is deliberately not copied.
- The auth crypto is imported from `@flarekit-dev/core` (`recoverAuthorizationSigner`,
  `eip3009Domain`) — no re-declaration.

## Endpoints

- `GET /health` — config (token, facilitator, payee, price). No key.
- `GET /api/demo` — `402` without `X-Payment`; verify → settle → synthetic resource with it.

## Running

```bash
X402_PRIVATE_KEY=0x... X402_NETWORK=coston2 X402_PORT=8789 \
  pnpm --filter @flarekit-dev/x402-server start
```

The operator key is read from `X402_PRIVATE_KEY` only — never logged, never in a
response. Public values (RPC, chain id, addresses, the demo price) are constants.
