import type { IncentiveEffect, IncentiveQuote, OperationState } from '@flare-kit/core'
import { amount, evidence, formatExact, truncateAddress } from '@flare-kit/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { EvidenceChip } from './primitives/EvidenceChip.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { StateChip, ToneChip } from './primitives/StateChip.js'
import { IncentiveEffectPanel } from './IncentiveEffectPanel.js'

/**
 * FTSO-05 — quote, sign and submit a Fast Update incentive.
 *
 * The only surface in this milestone that spends, so everything that changes a
 * signing decision is on screen rather than behind a disclosure: the exact
 * amount, who pays, what it buys, and for how long.
 *
 * The quote is for **this offer and no other**. The price is
 * `rangeIncrease × rangeIncreasePrice / (getPrecision() × 64)` — fitted to four
 * live bisections on Coston2 and matching all four exactly. The obvious reading,
 * pricing against `getRange()`, overstates by about 5,500x, which on mainnet
 * would ask somebody to sign away 2000 FLR for a 0.37 FLR purchase. That is why
 * changing the range increase re-quotes rather than scaling a cached number, and
 * why the arithmetic is shown rather than asserted.
 */

export interface IncentiveComposerProps {
  /** The price for the exact offer about to be made. */
  quote?: IncentiveQuote
  /** Whether this deployment will take an offer at all. */
  eligible?: boolean
  /** Why not, in the deployment's own terms. Required when `eligible` is false. */
  ineligibleReason?: string
  /** Past its freshness budget: the range moves, so the price moves with it. */
  quoteStale?: boolean
  /** Who signs. Absent means no payer is connected and nothing can be sent. */
  payer?: string
  /** The submission's lifecycle state, once one exists. */
  state?: OperationState
  transactionHash?: string
  /** What the chain says the offer bought. */
  effect?: IncentiveEffect
  /** Whether the widening's duration has elapsed. */
  effectExpired?: boolean
  /** The network's own token — `C2FLR` on Coston2, `FLR` on mainnet. */
  nativeAsset: string
  loading?: boolean
  now: number
  onSubmit?: () => void
  onRequote?: () => void
  theme?: 'light' | 'dark'
  className?: string
}

export function IncentiveComposer({
  quote,
  eligible = true,
  ineligibleReason,
  quoteStale = false,
  payer,
  state,
  transactionHash,
  effect,
  effectExpired = false,
  nativeAsset,
  loading = false,
  now,
  onSubmit,
  onRequote,
  theme,
  className,
}: IncentiveComposerProps) {
  const offer = quote ? amount(quote.offerAmountWei, 18, nativeAsset) : undefined
  const overLimit = quote ? quote.rangeIncrease > quote.rangeLimit : false
  const canSubmit = Boolean(quote && eligible && payer && !quoteStale && !overLimit && onSubmit)

  /**
   * *Why* submission is refused, not just that it is — the same shape
   * `AttestationRequestBuilder` uses for the same job. A disabled button with
   * only a paragraph to explain it makes "your quote went stale" and "this
   * offer exceeds the contract's limit" the same state, and they need different
   * actions: one is a re-quote, the other is a different offer.
   */
  const blocked = !quote
    ? 'not_quoted'
    : !eligible
      ? 'not_eligible'
      : overLimit
        ? 'over_limit'
        : quoteStale
          ? 'stale_quote'
          : !payer
            ? 'no_payer'
            : 'none'

  return (
    <Panel
      title="Fast Update incentive"
      subtitle="Widen the update range for a limited time, at a price set by the offer itself."
      aside={
        state ? (
          <StateChip state={state} />
        ) : (
          <ToneChip tone={eligible ? 'ok' : 'att'} glyph={eligible ? 'done' : 'unknown'}>
            {eligible ? 'Accepting offers' : 'Not accepting offers'}
          </ToneChip>
        )
      }
      {...(theme ? { theme } : {})}
      {...(className ? { className } : {})}
      data-blocked={blocked}
    >
      {!eligible ? (
        <Note tone="att" title="This deployment will not take an offer right now">
          {ineligibleReason ?? 'The incentive manager reported no reason.'} Nothing below can be
          submitted, and the quote is shown only so the price is legible.
        </Note>
      ) : null}

      {loading && !quote ? (
        <div aria-busy="true">
          <span className="fk-sr" role="status">
            Quoting this offer
          </span>
          <span className="fk-skeleton" />
        </div>
      ) : null}

      {quote ? (
        <Details aria-label="The offer">
          <DetailRow
            label="You would pay"
            value={offer ?? <span className="fk-unread">not quoted</span>}
            sub={`${quote.offerAmountWei.toString()} wei, for this exact range increase and no other`}
          />
          <DetailRow
            label="Range increase"
            value={<span className="fk-mono">{quote.rangeIncrease.toString()}</span>}
            sub={`Against a limit of ${quote.rangeLimit.toString()} and a current range of ${quote.currentRange.toString()}.`}
          />
          <DetailRow
            label="Expected sample size"
            value={<span className="fk-mono">{quote.expectedSampleSize.toString()}</span>}
            sub="An incentive widens the range. It does not necessarily buy a larger sample."
          />
          <DetailRow
            label="Effect lasts"
            value={<span className="fk-mono">{quote.durationSeconds.toString()} s</span>}
            sub="Then the range decays back to base. This is a limited purchase, not a setting."
          />
          <DetailRow
            label="Priced by"
            value={
              <span className="fk-mono">rangeIncrease × rangeIncreasePrice ÷ (precision × 64)</span>
            }
            sub={`Precision is ${quote.precision.toString()}. The divisor is empirical — fitted to four live bisections — so the amount is dry-run against the contract before anything is signed.`}
          />
          <DetailRow
            label="Payer"
            value={
              payer ? (
                <span className="fk-mono" title={payer}>
                  {truncateAddress(payer)}
                </span>
              ) : (
                <span className="fk-unread">no payer connected</span>
              )
            }
            sub={payer ? 'Signs and funds the offer.' : 'Nothing can be submitted without one.'}
          />
        </Details>
      ) : null}

      {overLimit ? (
        <Note tone="bad" title="This increase is above the contract's limit">
          <span className="fk-mono">{quote?.rangeIncrease.toString()}</span> exceeds{' '}
          <span className="fk-mono">{quote?.rangeLimit.toString()}</span>. The call would revert, so
          it is refused here rather than sent.
        </Note>
      ) : null}

      {quoteStale ? (
        <Note tone="att" title="This price is no longer current">
          The offer amount is a function of the range, and the range moves. Submitting on a stale
          quote sends the wrong value and the contract rejects it one wei short.
          {onRequote ? (
            <button type="button" className="fk-linkish" onClick={onRequote}>
              Quote it again
            </button>
          ) : null}
        </Note>
      ) : null}

      {quote && !payer ? (
        <Note tone="info" title="No signer is connected">
          Quoting costs nothing and needs no key. Submitting moves{' '}
          <span className="fk-mono">{offer ? formatExact(offer) : ''}</span> and needs one.
        </Note>
      ) : null}

      <div className="fk-fdc-actions">
        <Button onClick={onSubmit} disabled={!canSubmit}>
          {offer ? `Offer ${formatExact(offer)}` : 'Offer incentive'}
        </Button>
        {onRequote ? (
          <Button variant="ghost" onClick={onRequote}>
            Re-quote
          </Button>
        ) : null}
      </div>

      {transactionHash ? (
        <div className="fk-ftso-proof">
          <span className="fk-ftso-claim-head">Submitted</span>
          <EvidenceChip
            item={evidence({
              kind: 'flare_tx',
              label: 'offerIncentive',
              value: transactionHash,
              observedAt: now,
            })}
          />
        </div>
      ) : null}

      {/* Submitted is never rendered as succeeded. The transaction is accepted;
          what it bought is a separate reading of a separate block. */}
      {state === 'submitted' || state === 'confirming' ? (
        <Note tone="info" title="Accepted, not yet confirmed">
          The offer is on chain. What it actually bought is measured against the range at its own
          block, and that reading has not been taken yet.
        </Note>
      ) : null}

      {effect ? (
        <IncentiveEffectPanel
          effect={effect}
          expired={effectExpired}
          nativeAsset={nativeAsset}
          now={now}
          {...(quote ? { durationSeconds: quote.durationSeconds } : {})}
        />
      ) : null}
    </Panel>
  )
}
