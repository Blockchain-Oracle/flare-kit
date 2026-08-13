import type { FeedFeeQuote } from '@flarekit-dev/core'
import { Note } from './Note.js'

/**
 * What a read cost, never hidden behind a disclosure.
 *
 * Every read method on `FtsoV2` is `payable`. The fee is zero on both networks
 * today, and that is a *measured* result rather than a property of the surface:
 * it is governance-settable per category and per feed, and
 * `FastUpdater.fetchAllCurrentFeeds()` already costs 1 wei right now because the
 * unused slot falls through to `defaultFee()`. So the number is shown even when
 * it is zero, because "we checked and it was free" and "we assumed it was free"
 * are different claims and only one of them is true here.
 *
 * A primitive rather than a paragraph, because the catalogue and the feed detail
 * both render it and two copies would drift on the sentence that matters — which
 * of the two disagreeing oracles was actually paid.
 */

export interface FeeNoteProps {
  quote: FeedFeeQuote
  className?: string
}

export function FeeNote({ quote, className }: FeeNoteProps) {
  return (
    <Note tone="info" title="What this read cost" {...(className ? { className } : {})}>
      <span className="fk-mono">{quote.wei.toString()} wei</span>, quoted from{' '}
      <span className="fk-mono">FtsoV2.calculateFeeByIds</span> for these exact ids and sent as the
      call's value.
      {/* Two oracles answer "what does this cost" and on mainnet they disagree,
          because FeeCalculator.getCategoryFee(0x21) reverts and those feeds fall
          through to defaultFee(). The disagreement is shown rather than
          resolved: what gets paid is quoted from the contract that guards the
          call, and the other number explains why a fee is what it is. */}
      {quote.secondOpinionWei === undefined ? null : (
        <>
          {' '}
          <span className="fk-mono">FeeCalculator</span> answers{' '}
          <span className="fk-mono">{quote.secondOpinionWei.toString()} wei</span> for the same ids.
          The two are scoped to different call paths; neither is wrong, and what was paid is the one
          that guards <span className="fk-mono">getFeedsById</span>.
        </>
      )}
    </Note>
  )
}
