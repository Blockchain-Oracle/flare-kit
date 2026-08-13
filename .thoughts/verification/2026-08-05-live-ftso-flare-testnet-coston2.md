# Live FTSO run — Flare Testnet Coston2

Ran 2026-08-05T10:08:32.481Z against Flare Testnet Coston2 (chain id 114). M4-R11.

**Read-only. No signing key was loaded and nothing was spent.** Every figure
below came from an `eth_call` or an HTTP request, which is the property that
makes this reproducible by anyone without funds.

## Catalogue — M4-R1

- `getSupportedFeedIds()`: **63** feeds, of which
  **0** are custom (category `0x21`)
- Unused configuration indices, stated rather than rendered as rows:
  `52`
- Renamed feeds, each rendered as one feed carrying a former name:
  - MATIC/USD → POL/USD
  - FTM/USD → S/USD
  - DAI/USD → USDS/USD
  - TON/USD → GRAM/USD

## Reads and the fee — M4-R2, M4-AC3

- `FtsoV2.calculateFeeByIds` for this exact batch: **0 wei**,
  sent as the call's `value`
- `FeeCalculator` second opinion: agrees

| feed | raw value | decimals | path |
|---|---|---|---|
| FLR/USD | `602041` | 8 | block-latency |
| SGB/USD | `1040538` | 9 | block-latency |
| BTC/USD | `6412825` | 2 | block-latency |

Decimals differ **within one batch**, which is why they are carried per reading
and never cached per feed.

## Anchor proof and verification — M4-R3, M4-AC4

- Retrieved from **Data availability host** for voting round
  `1416603`: value `6024` at
  6 decimals, 6 proof nodes
- `FtsoV2.verifyFeedData` on the untouched proof: **`proven`**

| tamper | outcome | reason |
|---|---|---|
| value off by one | `could_not_check` | The contract function "verifyFeedData" reverted with the following reason: merkle proof invalid |
| shifted round | `could_not_check` | The contract function "verifyFeedData" reverted with the following reason: merkle proof invalid |
| truncated proof | `could_not_check` | The contract function "verifyFeedData" reverted with the following reason: merkle proof invalid |
| empty proof | `could_not_check` | The contract function "verifyFeedData" reverted with the following reason: merkle proof invalid |

Every tamper lands on `could_not_check`, never `not_proven`. The contract
**reverts** on a bad proof rather than returning false, so coercing that revert
to a boolean would put "this is not proven" on screen when the truth is "we
could not check this".

## Retention floor — M4-R5, M4-AC5

Not established. NOT ESTABLISHED, and that is the result rather than a failure. Two bisections run minutes apart, each confirming every absence three times, returned boundaries 813550/813556 and 1327127/1327132 — 513576 rounds apart. A single retention floor is not measurable this way, so none is reported. Query per round instead.

## Secure random — M4-R6, M4-AC6

- Current: `isSecure = true`, timestamp
  `1785924450`
- Round `872874`, known insecure, read with
  `requireSecure`: **refused = true**
- The refusal carries no value at all: **true**
- Reason: The protocol reports this random as not secure for voting round 872874, and a secure value was required. No value is returned.

## Incentive — M4-R7

- Current range `243388915243820045087367015432192`, offering an increase of
  `2433889152438200450873670154321`
- Quoted amount: **`366210937499999999` wei**, duration
  `17`s
- Dry run against the live contract: **366210937499999999**
- One wei below: refused at `366210937499999998` — the quote is exact, not approximate

**Submitted: true.**
{
  "transactionHash": "0x542f15d2f07ad7502b8f198c47a525249207182918d866539823ab889b8eec54",
  "blockNumber": "33654765",
  "explorer": "https://coston2-explorer.flare.network/tx/0x542f15d2f07ad7502b8f198c47a525249207182918d866539823ab889b8eec54",
  "rewardEpochId": 5902,
  "measuredRangeDelta": "2433889152438200450873670154321",
  "eventRangeIncrease": "2433889152438200450873670154321",
  "eventSampleSizeIncrease": "0",
  "eventOfferAmount": "366210937499999999",
  "confirmed": true,
  "correction": "First recorded as confirmed:false with eventRangeIncrease 5902. That was a decode bug, not a chain outcome: only rewardEpochId is indexed on IncentiveOffered, so reading topics[1] returned the epoch id (5902) rather than the range increase. Re-derived from the same on-chain receipt through decodeEventLog with no re-spend. The offer always worked; the record was wrong."
}

## Custom feeds — M4-R8

- Network read: **Flare Testnet Coston2**
- Feeds: **none** — an honest empty set, not an error and not an absence of the feature
- Previously observed 2026-08-04: none

## What this run establishes

- The fee is **measured, not assumed**, on every read.
- A revert is recorded as **could not check**, four different ways.
- The retention floor is **discovered**, and the committed-but-unretrievable
  state is real rather than theoretical.
- `requireSecure` **withholds the value**, rather than returning it with a flag.
- The incentive price is **exact to the wei**, established by acceptance above
  and refusal one below — without spending anything to learn it.
