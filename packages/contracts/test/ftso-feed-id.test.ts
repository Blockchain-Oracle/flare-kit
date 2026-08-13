import { describe, expect, it } from 'vitest'
import { encodeFunctionData, getAbiItem } from 'viem'
import {
  FEED_CATEGORY,
  FeedNameTooLongError,
  decodeFeedId,
  encodeFeedId,
  isCustomFeedId,
  isRenderableFeedId,
} from '../src/ftso/feed-id.js'
import { ftsoV2Abi } from '../src/ftso/abis.js'
import { ftsoFeedIdConverterAbi } from '../src/ftso/support-abis.js'
import { ftsoRegistryFor } from '../src/ftso/addresses.js'

/**
 * M4-R10. The codec is written as the requirement, not as a mirror of the
 * implementation: these are the exact bytes the deployed `FtsoFeedIdConverter`
 * returned on 2026-08-04 for both networks, captured so the assertion runs
 * offline and cannot pass merely because the code agrees with itself.
 *
 * `developer-hub/docs/ftso/guides/create-custom-feed.mdx:75,147` documents the
 * custom-feed id as `0x21 + keccak256(name)`. If anyone ever "fixes" the codec
 * to match the guide, these fail.
 */
const CONVERTER_TRUTH: ReadonlyArray<readonly [number, string, string]> = [
  [FEED_CATEGORY.crypto, 'FLR/USD', '0x01464c522f55534400000000000000000000000000'],
  [FEED_CATEGORY.crypto, 'BTC/USD', '0x014254432f55534400000000000000000000000000'],
  [FEED_CATEGORY.custom, 'sFLR/USD', '0x2173464c522f555344000000000000000000000000'],
  [FEED_CATEGORY.custom, 'stXRP/USD', '0x2173745852502f5553440000000000000000000000'],
]

describe('feed id codec', () => {
  it('is byte-identical to FtsoFeedIdConverter for both live categories', () => {
    for (const [category, name, expected] of CONVERTER_TRUTH) {
      expect(encodeFeedId(category, name)).toBe(expected)
    }
  })

  it('round-trips every known feed id back to its category and name', () => {
    for (const [category, name, id] of CONVERTER_TRUTH) {
      expect(decodeFeedId(id)).toEqual({ category, name })
    }
  })

  it('produces exactly 21 bytes regardless of name length', () => {
    for (const name of ['A', 'FLR/USD', 'X'.repeat(20)]) {
      expect(encodeFeedId(FEED_CATEGORY.crypto, name)).toHaveLength(2 + 42)
    }
  })

  it('refuses a name that would not fit rather than truncating it', () => {
    expect(() => encodeFeedId(FEED_CATEGORY.crypto, 'X'.repeat(21))).toThrow(FeedNameTooLongError)
    // Multi-byte characters consume more than one of the twenty bytes, so the
    // limit is bytes and not characters. Truncating here would produce a valid
    // looking id for a feed that does not exist.
    expect(() => encodeFeedId(FEED_CATEGORY.crypto, '€'.repeat(7))).toThrow(FeedNameTooLongError)
  })
})

describe('ids that must never become a row', () => {
  /**
   * Two live cases, both of which revert when read. Rendering either would put a
   * blank row on the catalogue that fails the moment anyone touches it.
   */
  it('rejects FastUpdatesConfiguration index 52, the all-zero unused slot', () => {
    expect(isRenderableFeedId(`0x${'00'.repeat(21)}`)).toBe(false)
  })

  it('rejects the category-0x00 entry mainnet getCustomFeeds() returns', () => {
    // Captured live 2026-08-04 from FtsoV2.getCustomFeeds() on Flare. It is
    // absent from getSupportedFeedIds() and reverts on getFeedById.
    expect(isRenderableFeedId('0x000000000000000000000000d1002f3820ad32145b')).toBe(false)
  })

  it('accepts every real feed', () => {
    for (const [, , id] of CONVERTER_TRUTH) expect(isRenderableFeedId(id)).toBe(true)
  })

  it('separates custom feeds from protocol feeds by category', () => {
    expect(isCustomFeedId(encodeFeedId(FEED_CATEGORY.custom, 'sFLR/USD'))).toBe(true)
    expect(isCustomFeedId(encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD'))).toBe(false)
  })
})

describe('FTSO abis', () => {
  // A hand-curated ABI is only worth having if it encodes, so this encodes
  // against it rather than eyeballing the shape.
  it('encodes a verifyFeedData call with its nested proof body', () => {
    const data = encodeFunctionData({
      abi: ftsoV2Abi,
      functionName: 'verifyFeedData',
      args: [
        {
          proof: [`0x${'ab'.repeat(32)}`],
          body: {
            votingRoundId: 1_415_900,
            id: encodeFeedId(FEED_CATEGORY.crypto, 'FLR/USD'),
            value: 6060,
            turnoutBIPS: 9999,
            decimals: 6,
          },
        },
      ],
    })
    expect(data.startsWith('0x')).toBe(true)
  })

  it('declares the feed value as signed, because a feed value can be', () => {
    const item = getAbiItem({ abi: ftsoV2Abi, name: 'verifyFeedData' })
    const body = item.inputs[0].components.find((c) => c.name === 'body')
    const value = body?.components.find((c) => c.name === 'value')
    expect(value?.type).toBe('int32')
  })

  it('omits the InWei reads, which drop the decimals', () => {
    const names = ftsoV2Abi.map((entry) => entry.name)
    expect(names).not.toContain('getFeedByIdInWei')
    expect(names).not.toContain('getFeedsByIdInWei')
  })

  /**
   * The correction recorded in the M4 spec: `getCustomFeeds()` is declared in no
   * vendored interface, returns a malformed entry and omits a real feed. If it
   * ever appears in this ABI, someone is about to enumerate custom feeds from
   * the wrong source.
   */
  it('omits getCustomFeeds, which is not the custom feed list', () => {
    expect(ftsoV2Abi.map((entry) => entry.name)).not.toContain('getCustomFeeds')
  })

  it('keeps the on-chain converter available as the oracle, not as the codec', () => {
    expect(getAbiItem({ abi: ftsoFeedIdConverterAbi, name: 'getFeedId' })).toBeDefined()
  })
})

describe('ftso registry', () => {
  it('resolves a distinct FTSO deployment for each supported network', () => {
    const coston2 = ftsoRegistryFor(114)
    const flare = ftsoRegistryFor(14)
    expect(coston2.chainId).toBe(114)
    expect(flare.chainId).toBe(14)
    expect(coston2.ftsoV2).not.toBe(flare.ftsoV2)
  })

  it('carries every address the FTSO surfaces read', () => {
    for (const chainId of [114, 14]) {
      const registry = ftsoRegistryFor(chainId)
      for (const [field, address] of Object.entries(registry)) {
        if (field === 'chainId') continue
        expect(address, `${field} on ${chainId}`).toMatch(/^0x[0-9a-fA-F]{40}$/)
      }
    }
  })
})
