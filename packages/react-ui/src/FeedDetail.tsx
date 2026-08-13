import type {
  AnchorFeedWithProof,
  CatalogueEntry,
  FeedReadResult,
  Observation,
  VerificationResult,
} from '@flare-kit/core'
import { amount, formatExact, isObserved, quoteAssetOf } from '@flare-kit/core'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { FeeNote } from './primitives/FeeNote.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { SourceChip } from './primitives/SourceChip.js'
import { ToneChip } from './primitives/StateChip.js'
import { Timestamp } from './primitives/Timestamp.js'
import { TRUST_VISUAL, VERIFICATION_VISUAL } from './ftso-visuals.js'

/**
 * FTSO-02 — one feed, read two ways, and the two never collapsed into one.
 *
 * This surface exists to hold a line: **a direct block-latency read and a proven
 * anchor value are not the same fact.** One is the current consensus value with
 * no proof attached; the other is a value committed in a voting round's merkle
 * root, retrievable and verifiable, and older. A screen that showed a single
 * "price" would be picking one and hiding the choice.
 *
 * They are not even comparable as integers. FLR/USD is 8 decimals at block
 * latency and 6 on the anchor path, on both networks — so each claim renders
 * with the exponent that arrived in its own response, and the two sit side by
 * side as a pair of claims rather than being resolved down to one number.
 */

export interface FeedDetailProps {
  feed: CatalogueEntry
  /** The block-latency read. Payable, and it carries its own fee quote. */
  reading?: Observation<FeedReadResult>
  /**
   * The anchor claim for a specific voting round, with its merkle proof and the
   * provenance of the host that served it — M4-R9.
   */
  anchor?: Observation<AnchorFeedWithProof>
  /** What the chain said about that proof. Three-valued; never a boolean. */
  verification?: VerificationResult
  now: number
  loading?: boolean
  stale?: boolean
  onRefresh?: () => void
  theme?: 'light' | 'dark'
  className?: string
}

export function FeedDetail({
  feed,
  reading,
  anchor,
  verification,
  now,
  loading = false,
  stale = false,
  onRefresh,
  theme,
  className,
}: FeedDetailProps) {
  const read = reading && isObserved(reading) ? reading.value : undefined
  // Matched by the feed the reading belongs to after rename resolution, never
  // by position: `getFeedsById` resolves a retired id to its current feed.
  const latency = read?.readings.find((entry) => entry.feedId === feed.feedId)
  const trust = TRUST_VISUAL[feed.trust]

  const anchored = anchor && isObserved(anchor) ? anchor.value : undefined
  const anchorPrice = anchored
    ? amount(BigInt(anchored.body.value), anchored.body.decimals, quoteAssetOf(anchored.name))
    : undefined

  return (
    <Panel
      title={<span className="fk-mono">{feed.name}</span>}
      subtitle={
        <span className="fk-mono fk-ftso-id" title={feed.feedId}>
          {feed.feedId}
        </span>
      }
      aside={
        <ToneChip tone={trust.tone} glyph={trust.glyph}>
          {trust.word}
        </ToneChip>
      }
      {...(theme ? { theme } : {})}
      {...(className ? { className } : {})}
    >
      {feed.formerName ? (
        <Note tone="info" title="This feed was renamed">
          It was <span className="fk-mono">{feed.formerName}</span>. The old id still resolves here,
          so this is one feed with a former name rather than two feeds.
        </Note>
      ) : null}

      {loading && !reading && !anchor ? (
        <div className="fk-ftso-claims" aria-busy="true">
          <span className="fk-sr" role="status">
            Reading this feed
          </span>
          <span className="fk-skeleton" />
          <span className="fk-skeleton" />
        </div>
      ) : null}

      {/* A pair of claims, side by side: show both, resolve neither.
          Deliberately *not* `.fk-conflict`, which carries the attention tint —
          two paths differing is the expected state here, not something wrong,
          and painting the happy path in warning colours would make the tint
          meaningless everywhere else it is used. */}
      {reading !== undefined || anchor !== undefined ? (
        <div className="fk-ftso-claims">
          <div className="fk-ftso-claim">
            <span className="fk-ftso-claim-head">Block latency</span>
            {latency ? (
              <>
                <span className="fk-ftso-value">{formatExact(latency.price)}</span>
                <span className="fk-fdc-note">
                  <span className="fk-mono">{latency.decimals}</span> decimals, from{' '}
                  <span className="fk-mono">getFeedsById</span>. No proof attached — this is the
                  current consensus value, not a committed one.
                </span>
                <Timestamp seconds={latency.timestampSeconds} />
              </>
            ) : (
              <span className="fk-unread">
                {read
                  ? 'this feed was not in that read'
                  : reading
                    ? 'the read failed'
                    : 'not read'}
              </span>
            )}
          </div>

          <div className="fk-ftso-claim">
            <span className="fk-ftso-claim-head">Anchor, voting round</span>
            {anchored && anchorPrice ? (
              <>
                <span className="fk-ftso-value">{formatExact(anchorPrice)}</span>
                <span className="fk-fdc-note">
                  <span className="fk-mono">{anchored.body.decimals}</span> decimals, committed in
                  round{' '}
                  <span className="fk-mono">{anchored.body.votingRoundId}</span> with{' '}
                  <span className="fk-mono">{anchored.body.turnoutBIPS}</span> BIPS turnout and{' '}
                  <span className="fk-mono">{anchored.proof.length}</span> proof nodes.
                </span>
                {verification ? (
                  <ToneChip
                    tone={VERIFICATION_VISUAL[verification.outcome].tone}
                    glyph={VERIFICATION_VISUAL[verification.outcome].glyph}
                  >
                    {VERIFICATION_VISUAL[verification.outcome].word}
                  </ToneChip>
                ) : (
                  <span className="fk-unread">not checked on chain</span>
                )}
              </>
            ) : (
              <span className="fk-unread">no anchor value retrieved</span>
            )}
          </div>
        </div>
      ) : null}

      {/* `info`, not `att`: this explains an expected difference. Marking it as
          attention would announce it as an alert and spend the warning colour on
          the normal case. */}
      {latency && anchored ? (
        <Note tone="info" title="These two numbers are not the same claim">
          They are different exponents (<span className="fk-mono">{latency.decimals}</span> against{' '}
          <span className="fk-mono">{anchored.body.decimals}</span>) taken at different moments from
          different paths. A difference between them is expected and is not
          evidence that either is wrong — so neither is presented as the price, and nothing here
          reconciles them into one.
        </Note>
      ) : null}

      <Details aria-label="Provenance">
        {reading ? (
          <DetailRow
            label="Block-latency source"
            value={<SourceChip observation={reading} now={now} />}
          />
        ) : null}
        {anchor ? (
          <DetailRow label="Anchor source" value={<SourceChip observation={anchor} now={now} />} />
        ) : null}
        {verification?.reason ? (
          <DetailRow
            label="Verifier said"
            value={<span className="fk-mono fk-fdc-value">{verification.reason}</span>}
          />
        ) : null}
      </Details>

      {read ? <FeeNote quote={read.fee} /> : null}

      {reading && !isObserved(reading) ? (
        <Note tone="att" title="The current value could not be read">
          {reading.reason}
        </Note>
      ) : null}

      {stale ? (
        <Note tone="info" title="This reading is past its freshness budget">
          It is shown rather than cleared, carrying the time it was taken — replacing a good value
          with a spinner is how a price stops being trusted.
          {onRefresh ? (
            <button type="button" className="fk-linkish" onClick={onRefresh}>
              Read it again
            </button>
          ) : null}
        </Note>
      ) : null}
    </Panel>
  )
}
