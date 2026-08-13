/**
 * Fast Updates: the block-latency feed surface, its configuration, and the
 * incentive market that widens it.
 *
 * Split from `abis.ts` because this is a different protocol surface from the
 * anchor/scaling path — different contracts, different cadence, and the only
 * part of M4 that spends money.
 */

/**
 * `IFastUpdatesConfiguration`.
 *
 * `getFeedIds()` returns 64 entries on both networks and is **not** the feed
 * list: it is a storage array with recycled slots. `getUnusedIndices()` is
 * `[52]`, and index 52 carries an all-zero feed id whose decoded name is empty.
 * Enumeration uses `FtsoV2.getSupportedFeedIds()` instead, which returns the 63
 * real ones and additionally covers custom feeds on mainnet.
 *
 * Only `getUnusedIndices` is read: it lets the catalogue *show* the hole as a
 * known artefact of the configuration rather than silently omitting it, so a
 * reader is not left wondering why 63 feeds face a 64-entry array (M4-R1).
 */
export const fastUpdatesConfigurationAbi = [
  {
    type: 'function',
    name: 'getUnusedIndices',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '_indices', type: 'uint256[]' }],
  },
] as const

/**
 * `IFastUpdateIncentiveManager` — M4-R7, the only surface in this milestone that
 * spends.
 *
 * Three measured facts shape how it is used:
 *
 * 1. **The price is a function of the offer, not a constant.** Bisected live on
 *    Coston2: a `rangeIncrease` of `getRange()/100` is rejected at
 *    `366210937499999998` wei and accepted at `366210937499999999` — about
 *    0.3662 C2FLR. Identical minimum on mainnet. So a quote is computed for the
 *    exact offer about to be made, never looked up.
 * 2. **The effect decays.** On mainnet tx `0x440e8845…a101cdb` (block 66637469),
 *    `getRange()` at the preceding block versus that block differs by exactly
 *    the `rangeIncrease` in that transaction's own `IncentiveOffered` event —
 *    but the range is back to base hours later. Confirmation must therefore read
 *    the offer's **own block**, and a later read showing no effect is not a
 *    failed offer.
 * 3. **An incentive is not a purchase of both dimensions.**
 *    `sampleSizeIncrease` was `0` in that real offer, and rendering a zero as
 *    though something was bought would be inventing a result.
 */
export const fastUpdateIncentiveManagerAbi = [
  {
    type: 'function',
    name: 'offerIncentive',
    stateMutability: 'payable',
    inputs: [
      {
        name: '_offer',
        type: 'tuple',
        components: [
          { name: 'rangeIncrease', type: 'uint256' },
          { name: 'rangeLimit', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
  },
  /** The number the block-pinned confirmation compares across two blocks. */
  {
    type: 'function',
    name: 'getRange',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getExpectedSampleSize',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getCurrentSampleSizeIncreasePrice',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  /** How long the widening lasts. Stated on the surface, never implied. */
  {
    type: 'function',
    name: 'getIncentiveDuration',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  /**
   * The fixed-point precision the offer price divides by. Load-bearing: the
   * required amount is
   * `rangeIncrease * rangeIncreasePrice / (getPrecision() * 64)`, established by
   * bisecting four different offers against the live contract and matching all
   * four exactly. Pricing against `getRange()` instead — the obvious reading —
   * overstates the amount by about 5,500x.
   */
  {
    type: 'function',
    name: 'getPrecision',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'rangeIncreaseLimit',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'rangeIncreasePrice',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  /**
   * The offer's own record of what it bought. M4-R7 confirms against this event
   * rather than against the caller's intent, so the confirmation is the chain's
   * account of the transaction and not a restatement of the request.
   */
  {
    type: 'event',
    name: 'IncentiveOffered',
    inputs: [
      { name: 'rewardEpochId', type: 'uint24', indexed: true },
      { name: 'rangeIncrease', type: 'uint256', indexed: false },
      { name: 'sampleSizeIncrease', type: 'uint256', indexed: false },
      { name: 'offerAmount', type: 'uint256', indexed: false },
    ],
  },
] as const
