# Official reference products: reuse map and overlap map

Status: source-traced on 2026-07-22 and completeness-refreshed on 2026-07-24. These repositories are accelerators and baselines, not production-security endorsements. Revisions are pinned in the [source manifest](../raw/2026-07-22-flare-source-manifest.md) and [completeness addendum](../raw/2026-07-24-flare-ecosystem-completeness-sources.md).

## Fast comparison

| Reference | Strong reusable seam | Demo-grade hazard | Product-overlap warning |
|---|---|---|---|
| `fce-extension-scaffold` | Full register/build/run/test lifecycle; operation routing; result envelope | In-memory example state; minimal vendored contract interfaces | “Hello TEE” alone is not a product. |
| `fce-orderbook` | Vault → internal balance → holds/matches → signed withdrawal; polished trading UI | Direct requests trust a claimed `sender`; only balances optionally persist; orders/history are volatile; amount narrowing to `uint64` | A continuous private CLOB is already implemented. |
| `fce-shielded-transfers` | Wallet-signed/domain-bound encrypted requests, ECIES replies, nonces, separate signing/encryption keys, signed withdrawal | Restart destroys balances, nonces, histories and key bindings while tokens remain in the vault | Generic shielded payments/payroll is too close. |
| `fce-weather-insurance` | Full FCC `ActionResult` reconstruction, async external fetch, signed on-chain settlement | Private inputs are later returned in plaintext calldata; action ID is not consumed; secret map is volatile | Weather insurance is already an end-to-end reference. |
| `fce-weather-insurance-x402-agent` | Shared manual/agent actions, x402 gateway, client-wallet tools and an MCP surface over the FCC app | In-app buys confirm, but the separate dev MCP has no auth, uses a deployment key and signs buys immediately | FCC+x402+agent orchestration is already demonstrated; the MCP is explicitly not a production authority model. |
| `fce-sign` | TEE key update/signing plumbing | One global volatile key; anyone can update it or request signatures; no owner/policy/nonce/domain | A “TEE wallet” thin wrapper is not differentiated or safe. |
| `fce-direct-sign` | Direct proxy/action transport | Shared API key is transport authentication, not wallet/user authorization | Direct signing alone is a plumbing demo. |
| `fce-weather-api` | Secret-bearing external API access and normalization | Sample request puts the credential in a query string over HTTP; volatile state | Generic “hide API key in TEE” is weak by itself. |
| `fassets-demo-dapp` | Direct mint, tags, FXRP transfer/redemption and FDC completion UI | It is intentionally broad protocol UX, not a vertical product | Reproducing its screens is not new work. |
| `fasset-agent-ui` + FAsset Bots/Indexer | Agent-vault, collateral, Core Vault, reward, alert and lifecycle operations | Private/source operator dashboard over self-hosted services; bots are now archived | Existing operator jobs are substantial but are not a reusable consumer widget kit. |
| `flare-ai-kit` | Existing agent/tool integrations around Flare data/action surfaces | AI wrapper can become superficial Flare integration | Generic AI/RAG/agent products are crowded by prior winners too. |

## Application and agent authority baselines

The x402 weather repository is the clearest current example of reusing one application action set across manual and AI clients:

- server tools perform read-only pool/policy/geocoding operations;
- wallet tools execute in the browser through the connected wallet;
- buy tools render an inline confirmation before signing; and
- the same repository exposes an external MCP over a server-held development wallet.

The MCP documentation explicitly says it is localhost/dev-only, has no authentication, derives the wallet from `DEPLOYMENT_PRIVATE_KEY`, signs buy tools immediately and must not be exposed publicly or pointed at mainnet. That split is an important source fact: “official example” does not imply one universal production-safe agent authority model. ([frontend agent](../../sources/flare-foundation/fce-weather-insurance-x402-agent/docs/frontend-agent.md), [MCP security](../../sources/flare-foundation/fce-weather-insurance-x402-agent/docs/mcp-server.md))

The broader non-FCC baseline is recorded in [Capability inventory](capability-inventory.md): source applications, published packages, CLIs and operator services must be classified separately before overlap or novelty is assessed.

## Reusable security patterns

### Authenticated encrypted direct request

The strongest current pattern is in `fce-shielded-transfers`:

1. Canonically encode a domain containing chain/vault, operation, actor, value and nonce.
2. Sign the canonical bytes with the user's wallet using a documented convention.
3. Encrypt the inner request to the TEE.
4. Inside the extension, decrypt, recover the signer, compare it to the claimed actor, and require a strictly increasing nonce.
5. Encrypt the response to a separately bound user encryption key.

Sources: [transfer handler](../../sources/flare-foundation/fce-shielded-transfers/internal/extension/transfer.go), [canonical types](../../sources/flare-foundation/fce-shielded-transfers/pkg/types/types.go), [key binding](../../sources/flare-foundation/fce-shielded-transfers/internal/extension/bind.go), [signature/ECIES helpers](../../sources/flare-foundation/fce-shielded-transfers/internal/extension/crypto.go).

Do not copy the orderbook's direct identity model: its place/cancel/read handlers accept an asserted address and the frontend merely inserts the connected wallet string. Anyone with proxy access can impersonate a ledger user. A proxy API key limits transport access; it is not a user signature. ([order handler](../../sources/flare-foundation/fce-orderbook/internal/extension/handlers.go), [request type](../../sources/flare-foundation/fce-orderbook/pkg/types/types.go), [frontend hook](../../sources/flare-foundation/fce-orderbook/frontend/src/hooks/usePlaceOrder.ts))

### Bounded TEE authorization for on-chain custody

Both orderbook and shielded-transfer references use an on-chain vault plus a TEE-signed withdrawal. The stronger signature domain includes the vault, user/recipient, token, amount and one-use withdrawal ID; the contract verifies the signer and consumes the ID. This confines a TEE decision to a specific withdrawal instead of giving it arbitrary contract power. ([shielded TEE withdrawal](../../sources/flare-foundation/fce-shielded-transfers/internal/extension/withdraw.go), [vault verification](../../sources/flare-foundation/fce-shielded-transfers/contracts/ShieldedVault.sol), [orderbook withdrawal](../../sources/flare-foundation/fce-orderbook/contracts/InstructionSender.sol))

For every product, bind at least:

- chain ID and verifying contract/vault;
- action type and version;
- user/beneficiary;
- token and maximum amount;
- request/instruction ID and application nonce;
- expiry/deadline;
- hash of the private evidence/policy where useful.

Consume the authorization exactly once and make signer rotation/pause explicit.

### Minimal reveal

`fce-weather-insurance` correctly shows how to reconstruct and verify a full FCC `ActionResult`, including action ID, submission tag, status, chain and product domain. But its private-buy result also returns the decrypted coordinates, date, threshold, premium and payout, and the relay function publishes them as calldata. Privacy ends at relay. ([TEE handler](../../sources/flare-foundation/fce-weather-insurance/internal/extension/extension.go), [relay verification](../../sources/flare-foundation/fce-weather-insurance/contracts/InstructionSender.sol))

A confidential result should normally contain only something like:

```text
{ requestId, decision, boundedAmount, beneficiary, deadline, evidenceHash }
```

Never return the secret input merely because the result itself is signed.

## Stateful reference trap

Several examples call `getRandomTeeIds(extensionId, 1)` independently for related operations while their state exists only in one process. Correctness then implicitly assumes one active machine, sticky selection, or unavailable replication. The weather API example is the notable one that selects a machine and reuses it.

For a stateful app:

- pin every lifecycle step to the same `teeId`; or
- make the state reconstructible/replicated; and
- describe machine replacement and signer rotation before accepting deposits.

Random selection is fine for stateless interchangeable compute, not for a private ledger or a commitment stored on one machine. Sources: [orderbook sender](../../sources/flare-foundation/fce-orderbook/contracts/InstructionSender.sol), [shielded sender](../../sources/flare-foundation/fce-shielded-transfers/contracts/InstructionSender.sol), [weather sender](../../sources/flare-foundation/fce-weather-insurance/contracts/InstructionSender.sol), [pinned weather API sender](../../sources/flare-foundation/fce-weather-api/contract/InstructionSender.sol).

## Persistence findings

- Shielded transfers: no persistent store or graceful restart; balances, histories, nonces and encryption-key bindings disappear. Tokens remain in the on-chain vault. ([ledger](../../sources/flare-foundation/fce-shielded-transfers/internal/extension/ledger.go), [architecture](../../sources/flare-foundation/fce-shielded-transfers/docs/architecture.md))
- Orderbook: optional unencrypted JSON balance persistence exists, disabled by default. Orders are not restored, so held balances are released to available on load. Mutation paths ignore save errors. ([persistence](../../sources/flare-foundation/fce-orderbook/pkg/balance/persist.go), [manager](../../sources/flare-foundation/fce-orderbook/pkg/balance/manager.go), [restart tests](../../sources/flare-foundation/fce-orderbook/internal/extension/bugs_test.go))
- Weather insurance: the extension calls itself stateless but keeps private policy commitments/terms in a fresh memory map. Restart or a different random TEE can make later settlement impossible. ([extension state](../../sources/flare-foundation/fce-weather-insurance/internal/extension/extension.go))
- Sign demo: the single key starts empty after restart. ([sign extension](../../sources/flare-foundation/fce-sign/go/internal/extension/extension.go))

## Candidate-specific source choices

| Candidate | Reuse | Must be newly built / demonstrated |
|---|---|---|
| VeilGuard | Shielded authentication + bounded vault authorization + weather-style result verification | No orderbook. Authenticated encrypted rule; FTSO evaluation; durable/pinned rule lifecycle; minimal reveal; actual FXRP protection action. |
| XRP Checkout | FAssets/Smart Account starters; general receipt/refund patterns | Hosted invoice, merchant API/SDK, pending→paid→refund/reconciliation lifecycle, distinct distribution/user test. Avoid a private ledger unless privacy is truly core. |
| ZeroDay Escrow | Shielded encrypted request + weather result verification + replay-protected vault | Narrow deterministic validator, evidence hash, one-use request, minimal pass/fail/amount result, FXRP payout, no exploit plaintext in calldata. |
| Agent Allowance | `fce-sign` only as low-level key-operation reference | Per-owner/agent isolation, wallet-signed policy updates, merchant/amount/time rules, durable counters, simulation, replay protection and bounded on-chain allowance. |
| DarkRFQ | Select orderbook accounting primitives and shielded authentication | One-shot invited RFQ, fixed deadline, sealed maker quotes, deterministic best execution, only winner revealed, atomic settlement—not a continuous CLOB. |

## Non-negotiable fork checklist

1. Wallet-sign every direct mutation; never trust a claimed sender.
2. Domain-separate signatures and bind chain, contract, operation, user, nonce and expiry.
3. Consume each TEE authorization/action ID once.
4. Use big-integer/`uint256` accounting end to end; do not narrow token amounts to `uint64`.
5. Persist and seal money-critical state, or keep it on-chain/stateless.
6. Pin a stateful lifecycle to one machine or implement tested replication/recovery.
7. Keep result calldata minimal; public relay means public data.
8. Treat API keys as transport controls only.
9. Plan TEE signer rotation, pause and failure recovery.
10. Test restart during each phase, replay, duplicate callback, stale nonce, failed polling and multi-machine routing.
