# Verification: four FDC families, live on Coston2

Date: 2026-08-04
Network: Flare Testnet Coston2 (chain 114)
Account: `0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9`
Run by: `packages/core/scripts/live-fdc-run.mjs`

Satisfies M3-R11 and contributes to M3-AC3, M3-AC4 and M3-AC7.

**Not** M3-AC5. No `uint64`-max sentinel arrived in this run: the nonexistence
window closed on a ledger that has a real overflow block, so the response
carried ordinary values. The sentinel round trip is pinned by
`packages/core/test/fdc-bigint.test.ts` instead. What this run does establish
for M3-R6 is that every numeric response field decoded as `bigint` — the
per-family response bodies are printed in full below.

## Addresses

| Contract | Address |
|---|---|
| FdcHub | `0x48aC463d7975828989331F4De43341627b9c5f1D` |
| FdcRequestFeeConfigurations | `0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e` |
| Relay | `0xa10B672D1c62e5457b17af63d4302add6A99d7dE` |
| FlareSystemsManager | `0xA90Db6D10F856799b10ef2A77EBCbF460aC71e52` |
| FdcVerification | `0x906507E0B64bcD494Db73bd0459d1C667e14B933` |

Voting epoch: `90`s, first round began at
`1658430000`. Both read from FlareSystemsManager — they
revert on the deployed Relay despite appearing in `IRelay.sol`.

## The four families

| Family | Group / source | Fee | Round | Submission | Outcome |
|---|---|---|---|---|---|
| `XRPPayment` | `xrp` / `testXRP` | 1000 wei | 1415859 | [`0xbb8864c17c12640e…`](https://coston2-explorer.flare.network/tx/0xbb8864c17c12640e5cbd66a01f77057868eff71f5efeaa0222bd8a71db0ee94d) | verified `true`, 6 merkle nodes |
| `EVMTransaction` | `flr` / `testFLR` | 1000 wei | 1415859 | [`0x3ef78cbc9e432800…`](https://coston2-explorer.flare.network/tx/0x3ef78cbc9e432800a3e2b188f91b432397f7b282e1879c1c887656698bfb51be) | verified `true`, 6 merkle nodes |
| `Web2Json` | `web2` / `PublicWeb2` | 1000 wei | 1415859 | [`0x8b29d09dea6a7fe8…`](https://coston2-explorer.flare.network/tx/0x8b29d09dea6a7fe8b3901fa9c609b138214976ae3493a3f29ea9b494b7a90f20) | verified `true`, 6 merkle nodes |
| `XRPPaymentNonexistence` | `xrp` / `testXRP` | 1000 wei | 1415859 | [`0xd68ccbc149b65253…`](https://coston2-explorer.flare.network/tx/0xd68ccbc149b6525355a98c77c4656c2d89aa791451eaf60366f62c6e80001c4d) | verified `true`, 7 merkle nodes |

Protocol id `200`. Round `1415859` confirmed finalized by
`Relay.isFinalized` before any proof was requested.

### XRPPayment

M1’s own XRPL payment, re-attested.

- Verifier: `https://fdc-verifiers-testnet.flare.network/verifier/xrp/XRPPayment/prepareRequest`
- Request bytes (160): `0x5852505061796d656e740000000000000000000000000000000000000000000074657374…`
- Fee paid: `1000` wei — read from `getRequestFee` for these exact bytes
- Voting round: `1415859`
- Submission: https://coston2-explorer.flare.network/tx/0xbb8864c17c12640e5cbd66a01f77057868eff71f5efeaa0222bd8a71db0ee94d
- Outcome: proof retrieved, `FdcVerification.verifyXRPPayment` returned `true`
- Consumption: FAssets AssetManager.executeDirectMinting

Attested response, as decoded:

| Field | Value | Type |
|---|---|---|
| `blockNumber` | `19619920` | `bigint` |
| `blockTimestamp` | `1785823590` | `bigint` |
| `sourceAddress` | `rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio` | `string` |
| `sourceAddressHash` | `0xa918f534967b6d670c4c86631384f65fc078c03943797c5c3353c47705` | `string` |
| `receivingAddressHash` | `0xcf68c86c10983c93617102d84e2f94ea63edf51eaab2c158d8168d0a1f` | `string` |
| `intendedReceivingAddressHash` | `0xcf68c86c10983c93617102d84e2f94ea63edf51eaab2c158d8168d0a1f` | `string` |
| `spentAmount` | `25000012` | `bigint` |
| `intendedSpentAmount` | `25000012` | `bigint` |
| `receivedAmount` | `25000000` | `bigint` |
| `intendedReceivedAmount` | `25000000` | `bigint` |
| `hasMemoData` | `true` | `boolean` |
| `firstMemoData` | `0x464250526641001800000000a4b05cdb545fa7ca12be9f866d64e8a843` | `string` |
| `hasDestinationTag` | `false` | `boolean` |
| `destinationTag` | `0` | `bigint` |
| `status` | `0` | `bigint` |
| `lowestUsedTimestamp` | `1785823590` | `bigint` |


### EVMTransaction

Group `flr`, not `eth`. The vendored guides instruct `eth`, which returns INVALID for Coston2.

- Verifier: `https://fdc-verifiers-testnet.flare.network/verifier/flr/EVMTransaction/prepareRequest`
- Request bytes (320): `0x45564d5472616e73616374696f6e00000000000000000000000000000000000074657374…`
- Fee paid: `1000` wei — read from `getRequestFee` for these exact bytes
- Voting round: `1415859`
- Submission: https://coston2-explorer.flare.network/tx/0x3ef78cbc9e432800a3e2b188f91b432397f7b282e1879c1c887656698bfb51be
- Outcome: proof retrieved, `FdcVerification.verifyEVMTransaction` returned `true`
- Consumption: No deployed consumer. The proof is verified on chain through FdcVerification; consuming it requires a contract this project does not deploy.

Attested response, as decoded:

| Field | Value | Type |
|---|---|---|
| `blockNumber` | `33605685` | `bigint` |
| `timestamp` | `1785823603` | `bigint` |
| `sourceAddress` | `0xa4b05cdb545fa7ca12be9f866d64e8a843a31bd9` | `string` |
| `isDeployment` | `false` | `boolean` |
| `receivingAddress` | `0x48ac463d7975828989331f4de43341627b9c5f1d` | `string` |
| `value` | `1000` | `bigint` |
| `input` | `0x6238f35400000000000000000000000000000000000000000000000000` | `string` |
| `status` | `1` | `bigint` |
| `events` | 7 entries | `object` |
| `lowestUsedTimestamp` | `1785823603` | `bigint` |


### Web2Json

A static fixture. A value that moves between two provider fetches reaches no consensus.

- Verifier: `https://fdc-verifiers-testnet.flare.network/verifier/web2/Web2Json/prepareRequest`
- Request bytes (960): `0x576562324a736f6e0000000000000000000000000000000000000000000000005075626c…`
- Fee paid: `1000` wei — read from `getRequestFee` for these exact bytes
- Voting round: `1415859`
- Submission: https://coston2-explorer.flare.network/tx/0x8b29d09dea6a7fe8b3901fa9c609b138214976ae3493a3f29ea9b494b7a90f20
- Outcome: proof retrieved, `FdcVerification.verifyWeb2Json` returned `true`
- Consumption: No deployed consumer. The proof is verified on chain through FdcVerification; consuming it requires a contract this project does not deploy.

Attested response, as decoded:

| Field | Value | Type |
|---|---|---|
| `abiEncodedData` | `0x0000000000000000000000000000000000000000000000000000000000` | `string` |
| `lowestUsedTimestamp` | `18446744073709551615` | `bigint` |


### XRPPaymentNonexistence

Proving a negative over a closed historical window. The uint64-max sentinel producer.

- Verifier: `https://fdc-verifiers-testnet.flare.network/verifier/xrp/XRPPaymentNonexistence/prepareRequest`
- Request bytes (416): `0x5852505061796d656e744e6f6e6578697374656e63650000000000000000000074657374…`
- Fee paid: `1000` wei — read from `getRequestFee` for these exact bytes
- Voting round: `1415859`
- Submission: https://coston2-explorer.flare.network/tx/0xd68ccbc149b6525355a98c77c4656c2d89aa791451eaf60366f62c6e80001c4d
- Outcome: proof retrieved, `FdcVerification.verifyXRPPaymentNonexistence` returned `true`
- Consumption: No deployed consumer. The proof is verified on chain through FdcVerification; consuming it requires a contract this project does not deploy.

Attested response, as decoded:

| Field | Value | Type |
|---|---|---|
| `minimalBlockTimestamp` | `1785820772` | `bigint` |
| `firstOverflowBlockNumber` | `19619901` | `bigint` |
| `firstOverflowBlockTimestamp` | `1785823530` | `bigint` |
| `lowestUsedTimestamp` | `1785820772` | `bigint` |


## What this run establishes

- **The fee is read, never assumed.** Every request paid exactly what
  `getRequestFee` returned for its own bytes. The same call returns 20 FLR on
  Flare mainnet and 3 FLR for `ConfirmedBlockHeightExists`, so a constant would
  have been wrong on one of the two networks.
- **One state machine served four families.** `packages/core/src/fdc/client.ts`
  is the only implementation of prepare → submit → round → proof → verify in the
  repository (M3-R1); the family module is the only thing that changed between
  the four runs above.
- **Coston2 EVM attestations are served by `flr`, not `eth`.** The vendored
  guides instruct `/verifier/eth/`, which returns `INVALID` for a real Coston2
  transaction.
- **A missing proof is recorded as unknown.** Nothing above renders an
  unretrieved proof as a failed attestation or as a negative fact about the
  underlying chain (M3-R10).
- **`Relay.isFinalized` and "the proof can be fetched" are two moments.** An
  earlier run of this script, at round `1415855`, retrieved once immediately
  after `isFinalized` returned true and got no proof for all four requests; all
  four were retrievable minutes later. The merkle root is published on chain
  before the data availability provider has indexed the round. A timeline that
  treats finalization as proof-readiness will show a proof that is not yet
  there, so `AttestationTimeline` renders them as separate steps and this
  script polls rather than concluding from one absence.
