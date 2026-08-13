/**
 * The `bytes21` feed id codec, and the feed category vocabulary.
 *
 * A feed id is one category byte followed by the feed's ASCII name, right-padded
 * with zeros to 21 bytes. That is true for **every** category, custom feeds
 * included.
 *
 * `developer-hub/docs/ftso/guides/create-custom-feed.mdx:75,147` documents the
 * custom-feed id as `0x21 + keccak256("BTC/USD-HIST")`. It is wrong. Every
 * registered custom feed on Flare mainnet contradicts it, and
 * `FtsoFeedIdConverter.getFeedId(0x21, "sFLR/USD")` reproduces the registered id
 * byte-identically under the encoding below — verified live on both networks
 * 2026-08-04 for categories `0x01` and `0x21`. Treating the trailing 20 bytes as
 * an address yields a hex string with no code at it.
 *
 * M4-R10 pins this with a test asserting byte-identity against the deployed
 * converter, so the guide cannot quietly become true in the codebase.
 */

export type FeedId = `0x${string}`

/**
 * The category byte. These are the values the deployed registry actually uses;
 * the set is open, so a decoder must round-trip an unknown byte rather than
 * reject it.
 */
export const FEED_CATEGORY = {
  /** Crypto, in USD. Every one of Coston2's 63 feeds and 63 of mainnet's 66. */
  crypto: 0x01,
  /** Custom feeds, contributed and governance-registered. Mainnet only, three. */
  custom: 0x21,
} as const

export type FeedCategoryName = keyof typeof FEED_CATEGORY

/** 21 bytes: one category byte plus twenty for the name. */
const FEED_ID_BYTES = 21
const NAME_BYTES = FEED_ID_BYTES - 1
const HEX_CHARS = FEED_ID_BYTES * 2

export class FeedNameTooLongError extends Error {
  constructor(name: string, byteLength: number) {
    super(
      `Feed name "${name}" is ${byteLength} bytes; a feed id carries at most ${NAME_BYTES}.`,
    )
    this.name = 'FeedNameTooLongError'
  }
}

/**
 * A feed id from its category and name.
 *
 * The name is ASCII by construction — every registered feed is a `BASE/QUOTE`
 * pair — so a multi-byte character would silently consume more than one of the
 * twenty available bytes. `TextEncoder` makes that visible as a length error
 * rather than as a truncated name.
 */
export function encodeFeedId(category: number, name: string): FeedId {
  const bytes = new TextEncoder().encode(name)
  if (bytes.length > NAME_BYTES) throw new FeedNameTooLongError(name, bytes.length)

  let hex = category.toString(16).padStart(2, '0')
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return `0x${hex.padEnd(HEX_CHARS, '0')}`
}

export interface DecodedFeedId {
  readonly category: number
  /** Empty when the id carries no name — which is a real state, not a bug. */
  readonly name: string
}

/**
 * The inverse. Trailing zero bytes are padding, never content.
 *
 * An empty name is a **legitimate outcome**, not an error: mainnet's
 * `getCustomFeeds()` returns an entry at category `0x00` whose twenty name bytes
 * decode to nothing and on which `getFeedById` reverts. Callers use the empty
 * name to exclude such an entry from a feed list rather than rendering a blank
 * row, so this function reports it instead of throwing.
 */
export function decodeFeedId(id: string): DecodedFeedId {
  const hex = id.startsWith('0x') ? id.slice(2) : id
  const category = Number.parseInt(hex.slice(0, 2), 16)

  let name = ''
  for (let i = 2; i + 1 < hex.length; i += 2) {
    const code = Number.parseInt(hex.slice(i, i + 2), 16)
    if (code === 0) break
    name += String.fromCharCode(code)
  }
  return { category, name }
}

/**
 * Whether an id is one a feed surface may render.
 *
 * Two live cases fail this and both would otherwise become rows that revert when
 * read: `FastUpdatesConfiguration`'s unused index 52, which carries an all-zero
 * id, and the category-`0x00` entry mainnet's `getCustomFeeds()` returns.
 */
export function isRenderableFeedId(id: string): boolean {
  const { category, name } = decodeFeedId(id)
  return category !== 0 && name.length > 0
}

export function isCustomFeedId(id: string): boolean {
  return decodeFeedId(id).category === FEED_CATEGORY.custom
}
