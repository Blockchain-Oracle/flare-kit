import { type Amount, evidence, formatExact } from '@flarekit-dev/core'
import { useFlareKit, useRedeem } from '@flarekit-dev/react'
import { useId, useMemo, useState } from 'react'
import { AssetLogo } from './primitives/AssetLogo.js'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { EvidenceChip } from './primitives/EvidenceChip.js'
import { Note } from './primitives/Note.js'
import { Timestamp } from './primitives/Timestamp.js'
import { Panel } from './primitives/Panel.js'
import { ToneChip } from './primitives/StateChip.js'

/**
 * The redemption composer.
 *
 * Two things separate it from `MintFXRP`, and both are on screen rather than
 * implied. It takes **lots**, because the protocol does and a free amount field
 * would misrepresent it. And it says, before the user commits, that an **agent**
 * pays them — and what happens if that agent does not.
 */

export interface RedeemFXRPProps {
  redeemerUnderlyingAddress: string
  /**
   * Seeds the lots field — **M4-R13 C1**, the same gap as `MintFXRP`. Without it
   * "not a whole lot", "insufficient" and the agent-pays note are reachable only
   * by typing, so none of them has been looked at in a browser.
   *
   * Uncontrolled: the initial value, not a controlled binding.
   */
  defaultLots?: number
  /** The holder's FAsset balance, when the host knows it. */
  fAssetBalance?: Amount
  /**
   * The clock, for the quote's own expiry — **M4-R13 C3**. `RedeemQuote` had no
   * `expiresAt` at all until this pass, so FX-07's required `quote expired` was
   * not expressible in core, let alone here. Omit and expiry is not evaluated.
   */
  now?: number
  loading?: boolean
  onSubmit?: (lots: number) => void
  theme?: 'light' | 'dark'
  className?: string
}

export function RedeemFXRP({
  redeemerUnderlyingAddress,
  defaultLots,
  fAssetBalance,
  now,
  loading = false,
  onSubmit,
  theme,
  className,
}: RedeemFXRPProps) {
  const kit = useFlareKit()
  const { quote: quoteFor, start, error } = useRedeem()
  const [lotsText, setLotsText] = useState(defaultLots === undefined ? '' : String(defaultLots))
  const inputId = useId()

  const lots = Number(lotsText)
  const lotSize = kit.redeemState.lotSizeUBA
  const symbol = kit.redeemState.fAssetSymbol

  const quote = useMemo(() => {
    if (!lotsText.trim()) return undefined
    try {
      return quoteFor(
        { lots, redeemerUnderlyingAddress },
        fAssetBalance ? { fAssetBalance } : {},
      )
    } catch {
      return undefined
    }
  }, [lotsText, lots, quoteFor, redeemerUnderlyingAddress, fAssetBalance])

  const expired = quote !== undefined && now !== undefined && now > quote.expiresAt
  const canSubmit = Boolean(quote?.canProceed) && !loading && !expired

  const blocked = quote?.blockedReason

  const label = (() => {
    if (loading) return 'Loading'
    if (expired) return 'Quote expired'
    if (!lotsText.trim()) return 'Enter a number of lots'
    if (!quote) return 'Enter a number of lots'
    if (!quote.canProceed) return 'Cannot redeem this'
    return 'Review and redeem'
  })()

  return (
    <Panel
      title={`Redeem ${symbol}`}
      subtitle="An agent sends you XRP on the XRP Ledger"
      aside={
        // A mode label, not an outcome — so no mark. It carried `unknown`,
        // which since the P7 glyph change is a distinct dotted ring meaning
        // "outcome unknown", making a badge claim something it cannot know.
        kit.isMock ? <ToneChip tone="att">{kit.label}</ToneChip> : undefined
      }
      {...(theme ? { theme } : {})}
      {...(className ? { className } : {})}
    >
      <div className="fk-leg">
        <label className="fk-leg-label" htmlFor={inputId}>
          You redeem
        </label>
        <div className="fk-leg-main">
          <input
            id={inputId}
            className="fk-leg-amount fk-mono"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={lotsText}
            disabled={loading}
            onChange={(event) => setLotsText(event.target.value)}
            aria-describedby={blocked ? `${inputId}-note` : undefined}
            aria-invalid={Boolean(blocked)}
          />
          <span className="fk-leg-asset">
            <AssetLogo symbol={symbol} size={20} />
            <span className="fk-mono">lots</span>
          </span>
        </div>
        <div className="fk-leg-foot">
          {/* The protocol is lot-based, and saying so up front prevents the
              "why won't it take my number" state. Once a quote is showing it
              has said the same thing more precisely, so the hint stands down
              rather than repeating a value already on screen. */}
          {quote ? (
            <span />
          ) : (
            <span className="fk-leg-bal">
              One lot is{' '}
              <span className="fk-mono">
                {formatExact({
                  value: lotSize,
                  decimals: kit.redeemState.fAssetDecimals,
                  asset: symbol,
                })}
              </span>
            </span>
          )}
          {fAssetBalance ? (
            <span className="fk-leg-bal">
              Balance <span className="fk-mono">{formatExact(fAssetBalance)}</span>
            </span>
          ) : null}
        </div>
      </div>

      {loading ? (
        <Details aria-label="Loading the exact terms">
          <div className="fk-row">
            <span className="fk-skel" style={{ width: 90, height: 12 }} />
            <span className="fk-skel" style={{ width: 120, height: 12 }} />
          </div>
          <div className="fk-row">
            <span className="fk-skel" style={{ width: 70, height: 12 }} />
            <span className="fk-skel" style={{ width: 100, height: 12 }} />
          </div>
        </Details>
      ) : quote ? (
        <Details aria-label="Exact terms">
          <DetailRow label="You burn" value={quote.burned} />
          <DetailRow label="Redemption fee" value={quote.fee} />
          <DetailRow
            label="Quote expires"
            value={<Timestamp ms={quote.expiresAt} />}
            sub="These terms are computed from protocol state that moves. Past this they are re-quoted, not honoured."
          />
          <DetailRow label="You receive" value={quote.receives} />
          <DetailRow
            label="To"
            value={
              <EvidenceChip
                item={evidence({
                  kind: 'xrpl_destination',
                  label: 'to',
                  value: quote.redeemerUnderlyingAddress,
                  observedAt: quote.quotedAt,
                })}
              />
            }
          />
          <DetailRow label="Paid by" value="an agent, not the protocol" />
        </Details>
      ) : null}

      {blocked ? (
        <div id={`${inputId}-note`}>
          <Note tone="bad" title="This redemption cannot be requested">
            <span className="fk-mono-inline">{blocked}</span>
          </Note>
        </div>
      ) : null}

      {quote?.canProceed ? (
        <Note tone="info" title="An agent pays you, within a time limit">
          {quote.ifAgentDoesNotPay}
        </Note>
      ) : null}

      {/* An expired quote is not an error and not a refusal — the terms were
          right when they were computed and the protocol has moved since. `info`,
          and the action is disabled rather than the form being cleared. */}
      {expired ? (
        <Note tone="info" title="This quote is no longer current">
          It was computed at <Timestamp ms={quote?.quotedAt ?? 0} /> and expired at{' '}
          <Timestamp ms={quote?.expiresAt ?? 0} />. Change the amount, or re-open this, to get terms
          the protocol will still honour.
        </Note>
      ) : null}

      {error ? (
        <Note tone="bad" title="That did not start">
          {error.message}
        </Note>
      ) : null}

      <div className="fk-panel-action">
        <Button
          block
          disabled={!canSubmit}
          onClick={() => {
            if (!quote) return
            start({ lots, redeemerUnderlyingAddress })
            onSubmit?.(lots)
          }}
        >
          {label}
        </Button>
      </div>
    </Panel>
  )
}
