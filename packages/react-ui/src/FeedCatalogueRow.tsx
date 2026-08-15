import type { CatalogueEntry, FeedId, FeedReading } from '@flarekit-dev/core'
import { formatExact, truncateHash } from '@flarekit-dev/core'
import { AssetLogo } from './primitives/AssetLogo.js'
import { ToneChip } from './primitives/StateChip.js'
import { Timestamp } from './primitives/Timestamp.js'
import { AVAILABILITY_VISUAL, type FeedAvailability, TRUST_VISUAL } from './ftso-visuals.js'

/**
 * One row of FTSO-01.
 *
 * Split out of `FeedCatalogue.tsx` at the seam between the table and the screen
 * around it: the row carries the two judgements a reader acts on — what kind of
 * feed this is, and whether it answered — while the surface carries provenance
 * and the sentences the table cannot say in a cell.
 *
 * The value cell is the one that has to be right. It renders the reading's
 * **own** decimals and its **own** timestamp, taken from the same response the
 * number came in. There is no per-feed exponent anywhere near this file to be
 * tempted by: FLR/USD is 8 decimals here and 6 on the anchor path.
 */

export interface FeedCatalogueRowProps {
  entry: CatalogueEntry
  /** The reading for this feed, when one came back in the last value read. */
  reading?: FeedReading
  /**
   * Whether a value read was attempted at all — true even when it failed.
   * Absence of a reading means three different things, and they are three
   * different sentences on screen.
   */
  asked: boolean
  /** The attempted read did not come back. Not the same as nobody asking. */
  readFailed?: boolean
  onSelect?: (feedId: FeedId) => void
}

export function FeedCatalogueRow({
  entry,
  reading,
  asked,
  readFailed = false,
  onSelect,
}: FeedCatalogueRowProps) {
  const trust = TRUST_VISUAL[entry.trust]
  const availability: FeedAvailability = reading
    ? 'supported'
    : readFailed
      ? 'not_answered'
      : asked
        ? 'degraded'
        : 'not_read'
  const visual = AVAILABILITY_VISUAL[availability]
  // The base asset of the pair carries the mark; "BTC/USD" → BTC.
  const baseAsset = entry.name.split('/')[0] ?? entry.name

  return (
    <tr data-feed={entry.name} data-trust={entry.trust} data-availability={availability}>
      <td>
        <span className="fk-ftso-feed">
          <AssetLogo symbol={baseAsset} size={20} />
          <span className="fk-ftso-feed-text">
            {onSelect ? (
              <button type="button" className="fk-linkish" onClick={() => onSelect(entry.feedId)}>
                <span className="fk-mono">{entry.name}</span>
              </button>
            ) : (
              <span className="fk-mono">{entry.name}</span>
            )}
            {/* Truncated per DESIGN.md: a bytes21 id is hash-shaped and has no
                break opportunity — whole, it sets the column width and pushes the
                value off the panel. Full value on the title and on the detail. */}
            <span className="fk-table-account" title={entry.feedId}>
              {truncateHash(entry.feedId)}
            </span>

            {/* One feed carrying a former name, never two feeds — `getFeedsById`
                silently resolves the retired id to this one. Demoted per the
                re-cut: a quiet former-name line, not a warning chip + paragraph.
                The full explanation lives on the FeedDetail surface. */}
            {entry.formerName ? (
              <span className="fk-ftso-former">
                Formerly <span className="fk-mono">{entry.formerName}</span>
              </span>
            ) : null}
          </span>
        </span>
      </td>

      <td>
        {/* The class alone, no prose. What `Custom` means is a property of the
            class rather than of this row, so the table says it once beneath
            itself instead of repeating a paragraph per feed. */}
        <ToneChip tone={trust.tone} glyph={trust.glyph}>
          {trust.word}
        </ToneChip>
      </td>

      <td data-numeric="true">
        {reading ? (
          <>
            <span className="fk-ftso-value">{formatExact(reading.price)}</span>
            <span className="fk-table-account">
              {reading.decimals} dp · block latency
              <br />
              <Timestamp seconds={reading.timestampSeconds} />
            </span>
          </>
        ) : (
          <span className="fk-unread">
            {readFailed ? 'the read failed' : asked ? 'no value came back' : 'not read'}
          </span>
        )}
      </td>

      <td>
        <ToneChip tone={visual.tone} glyph={visual.glyph}>
          {visual.word}
        </ToneChip>
        {/* Listed but silent. For a custom feed that points at the registered
            updater contract rather than at the protocol, which is a different
            thing to go and check. */}
        {availability === 'degraded' && entry.trust === 'custom' ? (
          <span className="fk-fdc-note">Its updater contract answered nothing in this read.</span>
        ) : null}
      </td>
    </tr>
  )
}
