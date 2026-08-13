/**
 * `FtsoV2Interface`, as vendored — the protocol's own facade.
 *
 * Transcribed from `flare-npm-periphery-package/coston2/artifacts/contracts/
 * FtsoV2Interface.sol/FtsoV2Interface.json`, never from the deployment:
 * `FtsoV2` is an ERC1967 proxy whose published explorer ABI is seven entries and
 * omits everything below.
 *
 * The contracts *beside* FtsoV2 — the fee calculator, the decimals registry, the
 * id converter and the Relay's random number — are in `support-abis.ts`, split
 * to stay under CLAUDE.md's line cap and along the seam that this file is the
 * one facade a caller talks to and that file is what it delegates to.
 * Fast Updates are in `fast-update-abis.ts`.
 */

/**
 * Note what is **not** here.
 *
 * `getCustomFeeds()` is declared in no vendored interface artifact on either
 * network, yet the deployment answers it — and its mainnet answer is wrong. It
 * returns a category-`0x00` entry that reverts when read and omits
 * `stFLR/USD`, which `getSupportedFeedIds()` does list. It is to custom feeds
 * what `FastUpdatesConfiguration.getFeedIds()` is to feeds: a storage array with
 * a hole, not a list. The kit derives the custom set by filtering
 * `getSupportedFeedIds()` on the category byte and never calls it.
 *
 * `getFeedByIdInWei` and `getFeedsByIdInWei` are omitted deliberately: they
 * return `value × 10^18` with the decimals dropped, which destroys the
 * asset-and-full-precision property DESIGN.md requires.
 */
export const ftsoV2Abi = [
  {
    type: 'function',
    name: 'getSupportedFeedIds',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '_feedIds', type: 'bytes21[]' }],
  },
  /**
   * The fee that governs a read on **this** contract. `FeeCalculator` answers
   * the same question differently for custom feeds; see `support-abis.ts`.
   */
  {
    type: 'function',
    name: 'calculateFeeById',
    stateMutability: 'view',
    inputs: [{ name: '_feedId', type: 'bytes21' }],
    outputs: [{ name: '_fee', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'calculateFeeByIds',
    stateMutability: 'view',
    inputs: [{ name: '_feedIds', type: 'bytes21[]' }],
    outputs: [{ name: '_fee', type: 'uint256' }],
  },
  /** One timestamp for the batch, one decimals per feed. */
  {
    type: 'function',
    name: 'getFeedsById',
    stateMutability: 'payable',
    inputs: [{ name: '_feedIds', type: 'bytes21[]' }],
    outputs: [
      { name: '_values', type: 'uint256[]' },
      { name: '_decimals', type: 'int8[]' },
      { name: '_timestamp', type: 'uint64' },
    ],
  },
  /**
   * Renamed feeds. Live and non-empty on Coston2: `MATIC/USD → POL/USD`,
   * `FTM/USD → S/USD`, `DAI/USD → USDS/USD`, `TON/USD → GRAM/USD`. M4-R10
   * presents each as one feed carrying a former name, never as two feeds.
   */
  {
    type: 'function',
    name: 'getFeedIdChanges',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '_feedIdChanges',
        type: 'tuple[]',
        components: [
          { name: 'oldFeedId', type: 'bytes21' },
          { name: 'newFeedId', type: 'bytes21' },
        ],
      },
    ],
  },
  /**
   * Anchor-feed proof verification.
   *
   * This **reverts** on a bad proof — it does not return `false`. Live on
   * Coston2: a valid proof returns `true`; a value off by one, a shifted round,
   * a truncated proof and an empty proof array all revert `merkle proof
   * invalid`. `FdcVerification.verifyEVMTransaction(garbage)` on the same chain
   * returns `false` without reverting.
   *
   * The two protocols therefore cannot share a boolean verification
   * abstraction. Catching this revert and coercing it to `false` would render
   * "we could not check this" as "this is not proven" — an unknown shown as a
   * negative fact, which CLAUDE.md forbids.
   *
   * `value` is `int32`: signed, because a feed value legitimately can be.
   */
  {
    type: 'function',
    name: 'verifyFeedData',
    stateMutability: 'view',
    inputs: [
      {
        name: '_feedData',
        type: 'tuple',
        components: [
          { name: 'proof', type: 'bytes32[]' },
          {
            name: 'body',
            type: 'tuple',
            components: [
              { name: 'votingRoundId', type: 'uint32' },
              { name: 'id', type: 'bytes21' },
              { name: 'value', type: 'int32' },
              { name: 'turnoutBIPS', type: 'uint16' },
              { name: 'decimals', type: 'int8' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const
