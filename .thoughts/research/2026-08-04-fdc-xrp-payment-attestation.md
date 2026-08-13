# Research: the XRPPayment attestation, end to end

Date: 2026-08-04
Status: facts, verified against vendored sources. No inference.
For: SPEC.md R4 (`packages/core/src/fdc.ts`, `packages/core/src/fassets/direct-mint.ts`)

Three research subagents were dispatched for this and went idle twice without
delivering. These facts were read directly from the vendored clones instead.

## The type is `XRPPayment`, not `Payment`

FAssets direct minting consumes `IXRPPayment.Proof`, a distinct attestation
type from the chain-agnostic `Payment`.

- `fassets/contracts/userInterfaces/IDirectMinting.sol` — `executeDirectMinting(IXRPPayment.Proof)`
- `fassets/contracts/assetManager/library/TransactionAttestation.sol:86` — `fdcVerification.verifyXRPPayment(_proof)`
- `developer-hub/docs/fdc/attestation-types/xrp-payment.mdx` — "XRPPayment is XRPL
  only and replaces the `inUtxo` / `utxo` request fields with `proofOwner`."

Getting this wrong is not a small error: a `Payment` proof will not verify
against the AssetManager, and the request body shape differs.

## Request body

| Field | Solidity | Note |
|---|---|---|
| `transactionId` | `bytes32` | the XRPL transaction hash |
| `proofOwner` | `address` | **the verifier lower-cases this value** |

`proofOwner` is how the FXRP recipient is bound. It travels in the attestation
request, not in the XRPL memo — which is why a mint can be proved and executed
by a third party without the recipient being able to change under it.

Source: `developer-hub/docs/fdc/attestation-types/xrp-payment.mdx`, Request table.

## Response body

15 fields, transcribed verbatim into
`packages/contracts/src/direct-minting-abi.ts`. The ones the product renders:
`blockNumber`, `blockTimestamp`, `sourceAddress` (the XRPL `r`-address as a
string), `receivedAmount` (drops), `hasDestinationTag` / `destinationTag`,
`hasMemoData` / `firstMemoData`, and `status`.

`lowestUsedTimestamp` is the transaction's `blockTimestamp`.

Source: `flare-foundry-periphery-package/src/coston2/IXRPPayment.sol`, and the
Response table in the attestation-type doc.

## Finality on XRPL

3 confirmations, roughly 12 seconds. The verifier rejects a request whose
ledger lacks the required depth — so an SDK must wait for XRPL finality before
requesting attestation, and a rejection at that point is "too early", not
"failed".

Source: `xrp-payment.mdx`, Finality table.

## The flow

1. **Prepare.** `POST {verifierBase}/verifier/xrp/XRPPayment/prepareRequest`
   Headers: `X-API-KEY`, `Content-Type: application/json`
   Body: `{ attestationType, sourceId, requestBody }`
   Returns `abiEncodedRequest`.
2. **Submit.** `FdcHub.requestAttestation(bytes)` — `payable`, emits
   `AttestationRequest(bytes data, uint256 fee)`. Fee from
   `FdcHub.fdcRequestFeeConfigurations()` →
   `IFdcRequestFeeConfigurations.getRequestFee(bytes)`.
3. **Derive the round** from the submitting transaction's block timestamp.
4. **Wait** for that round to finalize.
5. **Retrieve.** `POST {daBase}/api/v1/fdc/proof-by-request-round`
   Body: `{ votingRoundId, requestBytes }` → `{ response, proof }`.
6. **Execute.** `executeDirectMinting(proof)`.

Sources: `flare-foundry-periphery-package/src/coston2/IFdcHub.sol`,
`IFdcRequestFeeConfigurations.sol`, `developer-hub/docs/fdc/guides/fdc-by-hand.mdx`.

## Correction, from a live probe on 2026-08-04

`firstVotingRoundStartTs()` and `votingEpochDurationSeconds()` appear in
`flare-foundry-periphery-package/src/coston2/IRelay.sol`, and this brief
originally said to read them from `Relay`. **Both revert on the deployed
Relay.** They are implemented on `FlareSystemsManager`, resolved through the
FlareContractRegistry:

| Network | FlareSystemsManager | firstVotingRoundStartTs | votingEpochDurationSeconds |
|---|---|---|---|
| Coston2 | `0xA90Db6D10F856799b10ef2A77EBCbF460aC71e52` | 1658430000 | 90 |
| Flare | `0x89e50DC0380e597ecE79c8494bAAFD84537AD0D4` | 1658430000 | 90 |

Only `isFinalized(protocolId, votingRoundId)` is on Relay, and it works.

An interface file in a periphery package describes what a contract *may*
implement, not what the deployed one *does*. This cost a half-completed mint:
the XRP was paid and the attestation requested before the read reverted.

## Voting round derivation

```
votingRoundId = floor((transactionTimestamp - firstVotingRoundStartTs) / votingEpochDurationSeconds)
firstVotingRoundStartTs      = 1658430000
votingEpochDurationSeconds   = 90
```

Source: `developer-hub/docs/fdc/guides/fdc-by-hand.mdx`, "Waiting for the voting
round to finalize".

## Encoding of `attestationType` and `sourceId`

UTF-8 of the name, right-padded with zeros to 32 bytes (`toUtf8HexString`).
Verified against two worked examples in the docs:

- `AddressValidity` → `0x4164647265737356616c69646974790000000000000000000000000000000000`
- `testXRP` → `0x7465737458525000000000000000000000000000000000000000000000000000`
- `EVMTransaction` → `0x45564d5472616e73616374696f6e000000000000000000000000000000000000`

Source ids: `XRP` on mainnet, `testXRP` on XRPL testnet.

## JSON to Solidity struct mapping

The DA layer's JSON key names do **not** match the struct field names:

| JSON | Solidity |
|---|---|
| `proof` | `Proof.merkleProof` |
| `response` | `Proof.data` |

## Hazard: uint64 fields silently corrupt under `JSON.parse`

The FDC-by-hand guide documents that the interactive client shows
`lowestUsedTimestamp: 18446744073709552000` and states plainly: *"the timestamp
is off by 385. This is a JavaScript rounding error."*

The true value is `uint64` max, `18446744073709551615`, which exceeds
`Number.MAX_SAFE_INTEGER`. Any client that does `JSON.parse(text)` and passes
the result to an ABI encoder will submit a **different proof from the one that
was attested**, and it will fail verification on chain for reasons that look
like nothing at all.

`packages/core/src/fdc.ts` must therefore parse the numeric proof fields as
`BigInt` out of the raw response text, never through `JSON.parse`'s default
number handling. This is the single most dangerous detail in the flow.

Source: `developer-hub/docs/fdc/guides/fdc-by-hand.mdx`, immediately after the
"Response body" block.

## Endpoints and keys

| Purpose | Coston2 / testnet | Flare / mainnet |
|---|---|---|
| Verifier | `https://fdc-verifiers-testnet.flare.network` | `https://fdc-verifiers-mainnet.flare.network` |
| Data availability | `https://ctn2-data-availability.flare.network` | `https://flr-data-availability.flare.network` |

Header: `X-API-KEY`. The documentation states the key
`00000000-0000-0000-0000-000000000000` may be used for both the testnet
verifier and the DA client. It is a published public value, not a secret, so it
belongs in `@flare-kit/contracts` as a constant default that a caller may
override — not in an environment variable.

Source: `fdc-by-hand.mdx` ("The interface requires authentication; the key
`00000000-...` can be used") and the reproduced `curl` command.

## Addresses this adds to the registry

| Contract | Coston2 | Flare |
|---|---|---|
| FdcRequestFeeConfigurations | `0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e` | `0x259852Ae6d5085bDc0650D3887825f7b76F0c4fe` |

These are not in the FAssets deployment manifest; they come from the FDC guide's
explorer links. FdcHub addresses in that same list agree with the manifest
values already in the registry, which is a useful cross-check.

Source: `developer-hub/docs/fdc/guides/fdc-by-hand.mdx`, the FdcHub and
FdcRequestFeeConfigurations address lists.
