import type { IncentiveEffect } from '@flarekit-dev/core'
import { amount, evidence } from '@flarekit-dev/core'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { EvidenceChip } from './primitives/EvidenceChip.js'
import { Note } from './primitives/Note.js'
import { ToneChip } from './primitives/StateChip.js'

/**
 * What a Fast Update incentive actually bought, according to the chain — the
 * confirmation half of FTSO-05.
 *
 * Split from `IncentiveComposer` at the seam `incentive.ts` and
 * `incentive-effect.ts` already split on in core: quoting reads current state to
 * decide what to send, confirming reads historical state at a fixed block to
 * establish what happened.
 *
 * Two things here are easy to render as lies and are not:
 *
 * - **A decayed effect is not a failed offer.** The widening lasts a stated
 *   duration and mainnet's range was back to base hours after a real offer. A
 *   read taken later showing no effect says the incentive expired, never that
 *   the transaction failed.
 * - **`confirmed: false` is an unknown, not a negative.** The measurement is
 *   `getRange()` at the offer's own block minus the block before it, and another
 *   offer landing in the same block moves that number. So a mismatch means the
 *   delta could not be attributed, not that nothing was bought.
 */

export interface IncentiveEffectPanelProps {
  effect: IncentiveEffect
  /** How long the widening lasts, from the quote that priced it. */
  durationSeconds?: bigint
  /** Whether the duration has elapsed. Computed by the caller against a clock. */
  expired?: boolean
  /** The network's own token — `C2FLR` on Coston2, `FLR` on mainnet. */
  nativeAsset: string
  now: number
  className?: string
}

export function IncentiveEffectPanel({
  effect,
  durationSeconds,
  expired = false,
  nativeAsset,
  now,
  className,
}: IncentiveEffectPanelProps) {
  const paid = amount(effect.eventOfferAmount, 18, nativeAsset)

  return (
    <div className={`fk-ftso-effect${className ? ` ${className}` : ''}`} data-expired={expired}>
      <div className="fk-ftso-verdict">
        <ToneChip
          tone={effect.confirmed ? 'ok' : 'att'}
          glyph={effect.confirmed ? 'done' : 'unknown'}
        >
          {effect.confirmed ? 'Effect confirmed on chain' : 'Effect could not be attributed'}
        </ToneChip>
        {expired ? (
          <ToneChip tone="neutral" glyph="unknown">
            Widening has since expired
          </ToneChip>
        ) : null}
      </div>

      <Details aria-label="Measured effect">
        <DetailRow
          label="Range delta measured"
          value={<span className="fk-mono">{effect.measuredRangeDelta.toString()}</span>}
          sub="getRange() at the offer's own block, minus the block before it."
        />
        <DetailRow
          label="Range increase bought"
          value={<span className="fk-mono">{effect.eventRangeIncrease.toString()}</span>}
          sub="From this transaction's own IncentiveOffered event."
        />
        <DetailRow
          label="Sample size increase"
          value={<span className="fk-mono">{effect.eventSampleSizeIncrease.toString()}</span>}
          /* Frequently zero, and rendered as exactly that. An incentive buys a
             range widening; it does not necessarily buy a larger sample, and
             dressing a zero up as a purchase would invent a result. */
          sub={
            effect.eventSampleSizeIncrease === 0n
              ? 'Zero. This offer widened the range and bought no additional sampling — that is a normal shape, not a shortfall.'
              : 'Bought alongside the range widening.'
          }
        />
        <DetailRow label="Paid" value={paid} sub={`${effect.eventOfferAmount.toString()} wei`} />
        <DetailRow
          label="Measured at block"
          value={<span className="fk-mono">{effect.blockNumber.toString()}</span>}
          sub="Pinned to the offer's own block on both sides, because the effect decays."
        />
        {durationSeconds === undefined ? null : (
          <DetailRow
            label="Widening lasts"
            value={<span className="fk-mono">{durationSeconds.toString()} s</span>}
            sub="Stated rather than implied. After this the range returns to base."
          />
        )}
      </Details>

      <div className="fk-ftso-proof">
        <span className="fk-ftso-claim-head">Transaction</span>
        <EvidenceChip
          item={evidence({
            kind: 'flare_tx',
            label: 'offerIncentive',
            value: effect.transactionHash,
            observedAt: now,
          })}
        />
      </div>

      {!effect.confirmed ? (
        <Note tone="att" title="This is not a failed offer">
          The transaction is on chain and its event says what was bought. The measured range delta
          did not match it, which happens when another offer lands in the same block — so the effect
          could not be attributed to this transaction alone. Nothing here says the offer failed.
        </Note>
      ) : null}

      {expired ? (
        <Note tone="info" title="The widening has expired">
          Incentives are limited in duration by design. The range has returned to base, and a read
          taken now showing no effect is the incentive ending rather than the offer failing.
        </Note>
      ) : null}
    </div>
  )
}
