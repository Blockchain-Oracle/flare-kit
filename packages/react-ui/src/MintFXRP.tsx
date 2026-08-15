import { type Amount, evidence, formatExact, subAmounts } from '@flarekit-dev/core'
import { useDirectMint, useFlareKit } from '@flarekit-dev/react'
import { useId, useMemo, useState } from 'react'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { EvidenceChip } from './primitives/EvidenceChip.js'
import { Note } from './primitives/Note.js'
import { Timestamp } from './primitives/Timestamp.js'
import { AssetLogo } from './primitives/AssetLogo.js'
import { Panel } from './primitives/Panel.js'
import { ToneChip } from './primitives/StateChip.js'

/**
 * The mint composer.
 *
 * The primary button's label carries the state machine, following the
 * convention users already have muscle memory for. What is different here is
 * that the button is genuinely unavailable below the protocol minimum: the
 * quote refuses, so there is nothing to sign (AC7).
 */

function minutes(ms: number): string {
  return `${Math.round(ms / 60_000)} min`
}

export interface MintFXRPProps {
  recipient: string
  xrplAccount: string
  /**
   * Seeds the amount field — **M4-R13 C1**.
   *
   * The amount was internal `useState` with no way in, so from props alone the
   * only reachable states were `loading` and an empty form. Below-minimum,
   * insufficient, large-mint delay, no-executor and blocked were reachable only
   * by typing, which is why the jsdom tests pass and why **AC7's refusal — the
   * one that prevents a total unrecoverable loss — had never been rendered in a
   * browser.**
   *
   * Uncontrolled: it is the initial value, not a controlled binding, so typing
   * still owns the field and no hybrid appears.
   */
  defaultAmountXrp?: string
  /** The payer's XRPL balance, when the host knows it. */
  xrplBalance?: Amount
  executor?: string
  /**
   * The clock, for the quote's own expiry — **M4-R13 C3**. Omit and expiry is
   * simply not evaluated; a surface that guessed the time would be inventing
   * one. Every audited M3/M4 surface takes this.
   */
  now?: number
  /** True while the host is still fetching protocol state. */
  loading?: boolean
  onSubmit?: (amountXrp: string) => void
  theme?: 'light' | 'dark'
  className?: string
}

export function MintFXRP({
  recipient,
  xrplAccount,
  defaultAmountXrp,
  xrplBalance,
  executor,
  now,
  loading = false,
  onSubmit,
  theme,
  className,
}: MintFXRPProps) {
  const kit = useFlareKit()
  const { quote: quoteFor, start, error } = useDirectMint()
  const [amount, setAmount] = useState(defaultAmountXrp ?? '')
  const inputId = useId()

  const quote = useMemo(() => {
    if (!amount.trim()) return undefined
    try {
      return quoteFor({
        amountXrp: amount.trim(),
        recipient,
        xrplAccount,
        ...(executor ? { executor } : {}),
      })
    } catch {
      // A malformed amount is a typing state, not an error to shout about.
      return undefined
    }
  }, [amount, quoteFor, recipient, xrplAccount, executor])

  const malformed = amount.trim().length > 0 && quote === undefined
  // A quote past its TTL is not a quote. It was staying on screen indefinitely
  // with the action enabled, so somebody could sign terms the protocol had
  // already moved away from. `now` omitted means expiry is not evaluated — a
  // surface that guessed the time would be inventing one.
  const expired = quote !== undefined && now !== undefined && now > quote.expiresAt

  // The two amounts must be the same unit before they can be compared at all.
  // This was a raw `.value > .value` with nothing constraining `xrplBalance` to
  // XRP: a mismatched balance compared wrong silently, and if it came out true
  // the shortfall line called `subAmounts`, which asserts the unit and **throws
  // during render**. A balance in the wrong asset is now simply not comparable,
  // which is the honest answer.
  const comparable =
    quote !== undefined &&
    xrplBalance !== undefined &&
    xrplBalance.asset === quote.input.asset &&
    xrplBalance.decimals === quote.input.decimals

  const insufficient =
    comparable && xrplBalance ? quote.input.value > xrplBalance.value : false

  const blocked = quote?.blockedReason
  const canSubmit = Boolean(quote?.canProceed) && !insufficient && !loading && !expired

  const label = (() => {
    if (loading) return 'Loading'
    if (!amount.trim()) return 'Enter an amount'
    if (malformed) return 'Enter an amount'
    if (insufficient) return 'Not enough XRP'
    // `canProceed` is false for three different reasons and only one of them is
    // the user's amount. Emergency pause and minting pause are protocol-wide
    // outages; telling somebody their amount is wrong hides the outage and sends
    // them off to edit a number that was never the problem.
    if (expired) return 'Quote expired'
    if (quote && !quote.canProceed) {
      return quote.belowMinimum ? 'Amount too small' : 'Minting is paused'
    }
    return 'Review and send'
  })()

  return (
    <Panel
      title={`Mint ${kit.protocolState.fAssetSymbol}`}
      subtitle="XRP on the XRP Ledger becomes an FAsset on Flare"
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
          You send
        </label>
        <div className="fk-leg-main">
          <input
            id={inputId}
            className="fk-leg-amount fk-mono"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.000000"
            value={amount}
            disabled={loading}
            onChange={(event) => setAmount(event.target.value)}
            aria-describedby={blocked ? `${inputId}-note` : undefined}
            aria-invalid={Boolean(blocked) || insufficient}
          />
          <span className="fk-leg-asset">
            <AssetLogo symbol="XRP" size={20} />
            <span className="fk-mono">XRP</span>
          </span>
        </div>
        {xrplBalance ? (
          <div className="fk-leg-foot">
            <span className="fk-leg-bal">
              Balance <span className="fk-mono">{formatExact(xrplBalance)}</span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => setAmount(xrplBalance.value === 0n ? '0' : formatExact(xrplBalance, { asset: false }))}>
              Max
            </Button>
          </div>
        ) : null}
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
          <DetailRow
            label="Quote expires"
            value={<Timestamp ms={quote.expiresAt} />}
            sub="These terms are computed from protocol state that moves. Past this they are re-quoted, not honoured."
          />
          <DetailRow label={`You receive`} value={quote.mintedEstimate} />
          <DetailRow label="Protocol fee" value={quote.mintingFee} />
          <DetailRow label="Executor fee" value={quote.executorFee} />
          <DetailRow label="Minimum" value={quote.minimumPayment} />
          {/* The memo binds the mint to the recipient; without it the payment
              routes elsewhere and is not recoverable. It was not on this screen
              at all — and the payer has to paste it into their own wallet, so it
              is an EvidenceChip rather than text. */}
          <DetailRow
            label="Memo"
            value={
              <EvidenceChip
                item={evidence({
                  kind: 'payment_reference',
                  label: 'memo',
                  value: quote.memo,
                  observedAt: quote.quotedAt,
                })}
              />
            }
            sub="Paste this into your XRPL wallet with the payment. Without it the mint routes elsewhere."
          />
          {/* One anatomy everywhere: truncated, with the full value on the copy
              control. These rendered raw — a 42-character address wrapping
              mid-string into a blob, with no way to copy it. `EvidenceChip` was
              already doing exactly this job three surfaces away. */}
          <DetailRow
            label="XRPL destination"
            value={
              <EvidenceChip
                item={evidence({
                  kind: 'xrpl_destination',
                  label: 'destination',
                  value: quote.xrplDestination,
                  observedAt: quote.quotedAt,
                })}
              />
            }
          />
          <DetailRow
            label="Recipient"
            value={
              <EvidenceChip
                item={evidence({
                  kind: 'recipient_address',
                  label: 'recipient',
                  value: quote.recipient,
                  observedAt: quote.quotedAt,
                })}
              />
            }
          />
          <DetailRow
            label="Executor"
            value={
              quote.executor ? (
                <EvidenceChip
                  item={evidence({
                    kind: 'executor_address',
                    label: 'executor',
                    value: quote.executor,
                    observedAt: quote.quotedAt,
                  })}
                />
              ) : (
                'anyone, after the exclusivity window'
              )
            }
          />
          <DetailRow
            label="Expected"
            value={`${minutes(quote.expectedDuration.minMs)} to ${minutes(quote.expectedDuration.maxMs)}`}
          />
        </Details>
      ) : null}

      {blocked ? (
        <div id={`${inputId}-note`}>
          <Note
            tone="bad"
            title={
              quote && !quote.canProceed && !quote.belowMinimum
                ? 'Minting is paused on this deployment'
                : 'This amount cannot be sent'
            }
          >
            <span className="fk-mono-inline">{blocked}</span>
          </Note>
        </div>
      ) : null}

      {insufficient && xrplBalance && quote ? (
        <Note tone="att" title="Not enough XRP">
          {/* The balance is already on screen directly above. Repeating it here
              would waste the one line this note has, so it states the shortfall
              instead — the number the payer does not already have. */}
          You need {formatExact(subAmounts(quote.input, xrplBalance))} more than this account
          holds.
        </Note>
      ) : null}

      {quote?.willBeDelayed ? (
        <Note tone="info" title="This amount will be delayed before it executes">
          Amounts at or above the protocol's large-minting threshold wait before they can be
          executed. Your payment is safe throughout, and the timeline states when it opens.
        </Note>
      ) : null}

      {!quote?.executor && quote?.canProceed ? (
        <Note tone="info" title="No executor named">
          Nobody is obliged to complete this mint for you. You will be able to complete it
          yourself once the payment is proved.
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
            start({
              amountXrp: amount.trim(),
              recipient,
              xrplAccount,
              ...(executor ? { executor } : {}),
            })
            onSubmit?.(amount.trim())
          }}
        >
          {label}
        </Button>
      </div>
    </Panel>
  )
}
