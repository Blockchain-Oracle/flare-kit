/**
 * The contracts beside `FtsoV2`: what prices a read, what says how many decimals
 * a feed carries, what encodes an id, and the Relay's randomness.
 *
 * Split from `abis.ts` at the seam that FtsoV2 is the one facade a caller talks
 * to and these are what it delegates to or sits beside. All transcribed from the
 * vendored interface artifacts.
 */

/**
 * `IFeeCalculator` — a **second** fee oracle, and not the one that governs a
 * `FtsoV2` read.
 *
 * For the same 66 supported mainnet feeds, `FtsoV2.calculateFeeByIds` answers
 * `0` and this contract answers `3`. The cause is exact: `getCategoryFee(0x21)`
 * reverts — the custom category has no configured fee — so those three feeds
 * fall through to `defaultFee()`, which is 1 wei each. A live simulation settled
 * which one binds: `FtsoV2.getFeedsById` for all 66 succeeds with `value = 0`.
 *
 * So quote from the contract that guards the call you are about to make. This
 * exists because the surface shows *why* a fee is what it is — it is never the
 * number a feed read pays.
 *
 * The interface declares no singular `calculateFeeById`; that one is on FtsoV2.
 */
export const feeCalculatorAbi = [
  {
    type: 'function',
    name: 'calculateFeeByIds',
    stateMutability: 'view',
    inputs: [{ name: '_feedIds', type: 'bytes21[]' }],
    outputs: [{ name: '_fee', type: 'uint256' }],
  },
] as const

/**
 * Anchor-path decimals.
 *
 * `FLR/USD` is **6** here and **8** through `FtsoV2.getFeedsById` — the same
 * asset, two paths, two exponents, confirmed on both networks. The two readings
 * are not comparable as integers, and M4-AC2 fails the build if either value is
 * ever taken from the other path.
 */
export const ftsoFeedDecimalsAbi = [
  {
    type: 'function',
    name: 'getCurrentDecimals',
    stateMutability: 'view',
    inputs: [{ name: '_feedId', type: 'bytes21' }],
    outputs: [{ name: '_decimals', type: 'int8' }],
  },
] as const

/**
 * The on-chain codec, used only as the oracle M4-R10's test asserts byte-identity
 * against. The kit encodes and decodes offline — a feed id is deterministic, and
 * an RPC round trip per id would make a 63-row catalogue 63 network calls.
 */
export const ftsoFeedIdConverterAbi = [
  {
    type: 'function',
    name: 'getFeedId',
    stateMutability: 'view',
    inputs: [
      { name: '_category', type: 'uint8' },
      { name: '_name', type: 'string' },
    ],
    outputs: [{ name: '_feedId', type: 'bytes21' }],
  },
] as const

/**
 * Secure randomness, and the published root.
 *
 * These are on the **Relay**: the registry lists `RandomNumberV2` at the Relay's
 * own address on both networks, which is why `FtsoRegistry` carries no separate
 * field for it.
 *
 * `merkleRoots` is what makes M4-R5's committed-but-unretrievable state
 * observable rather than inferred — the root is still set for rounds whose
 * leaves the data-availability layer has already dropped. Asking it is the
 * difference between "the chain committed to a value we can no longer fetch"
 * and "there is no such round", which are not the same fact.
 */
export const randomNumberAbi = [
  {
    type: 'function',
    name: 'getRandomNumber',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '_randomNumber', type: 'uint256' },
      { name: '_isSecureRandom', type: 'bool' },
      { name: '_randomTimestamp', type: 'uint256' },
    ],
  },
  /**
   * Reaches back to about round 864606 on Coston2 — roughly 574 days, far past
   * the anchor-feed floor, so a round can have a retrievable random and an
   * unretrievable price at the same time.
   */
  {
    type: 'function',
    name: 'getRandomNumberHistorical',
    stateMutability: 'view',
    inputs: [{ name: '_votingRoundId', type: 'uint256' }],
    outputs: [
      { name: '_randomNumber', type: 'uint256' },
      { name: '_isSecureRandom', type: 'bool' },
      { name: '_randomTimestamp', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'merkleRoots',
    stateMutability: 'view',
    inputs: [
      { name: '_protocolId', type: 'uint256' },
      { name: '_votingRoundId', type: 'uint256' },
    ],
    outputs: [{ name: '_merkleRoot', type: 'bytes32' }],
  },
] as const
