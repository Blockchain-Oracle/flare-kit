// packages/react-ui/src/WithdrawCard.tsx
import type { ReactNode } from 'react'
import { type DexToken, type ExitRoute, type VaultConfig, type VaultPositionResult, type WithdrawOperation, type WithdrawPlanResult, type WithdrawQuoteResult, formatExact } from '@flare-kit/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { EvidenceChip } from './primitives/EvidenceChip.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { PercentPills } from './primitives/PercentPills.js'
import { SegmentedTabs } from './primitives/SegmentedTabs.js'
import { ToneChip } from './primitives/StateChip.js'
import { Countdown } from './primitives/Countdown.js'
import { OperationTimeline } from './OperationTimeline.js'
import { SwapLeg } from './SwapLeg.js'
import { IN_FLIGHT, PRE_PLAN, feeBipsLabel, percentOf } from './card-chrome.js'
import { ctaForWithdraw, noteForWithdraw, timelinePhase } from './withdraw-card-state.js'

/**
 * WithdrawCard (M7-R9). The load-bearing surface of this milestone: it reads the
 * signer's live share balance on open (self-reconciling, no Resume button), offers
 * partial withdrawal by percent, and — where the vault offers both — an explicit
 * route choice (instant, higher fee, immediate; or delayed, lower fee, a wait),
 * never collapsed. The request → wait → claim lifecycle renders on the operation
 * spine as a durable timeline: WAITING shows the concrete claimable time with a
 * live Countdown, flips to a CLAIMABLE badge when reached, then a Claim step →
 * CONCLUDED with the actual assets. A withdrawal request is never rendered as
 * assets received; an unavailable read is never a confident "no position" (M6 F1).
 *
 * Signs via `onSubmit` only — it holds no wallet client and no key.
 */

export interface WithdrawCardProps {
  readonly config: VaultConfig
  readonly operation?: WithdrawOperation
  /** The live share-balance position read on open — position / no_position / unavailable. */
  readonly positionResult?: VaultPositionResult
  readonly quoteResult?: WithdrawQuoteResult
  /** Carries the gate reason when the plan refused — paused/cap/insufficient/expired/not-verified. */
  readonly planResult?: WithdrawPlanResult
  /** The selected route while editing; an active operation's own route always wins. */
  readonly route?: ExitRoute
  /** Real fee per route in bips, for the route choice — `null` renders `—`, never a guess. */
  readonly fees?: { readonly instant: number | null; readonly delayed: number | null }
  readonly percent?: number
  /** The concrete claimable time (unix seconds) for the waiting Countdown. */
  readonly claimableAt?: number
  /** Host clock (unix seconds) — a prop, never `Date.now()`. */
  readonly now: number
  readonly mockLabel?: string
  readonly networkLabel?: string
  readonly onPercentChange?: (percent: number) => void
  readonly onRouteChange?: (route: ExitRoute) => void
  readonly onSubmit?: () => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

function shareToken(config: VaultConfig): DexToken {
  const address = config.share.kind === 'lp' ? config.share.address : config.address
  return { symbol: config.share.symbol, address, decimals: config.share.decimals }
}

export function WithdrawCard(props: WithdrawCardProps) {
  const { config, operation: op, positionResult, quoteResult, planResult, percent, now, mockLabel, networkLabel } = props
  const share = shareToken(config)
  const route: ExitRoute = op?.intent.route ?? props.route ?? config.exitModes[0]!
  const chrome = { assetSymbol: config.asset.symbol, shareSymbol: share.symbol }

  const cta = ctaForWithdraw(op, positionResult, quoteResult, planResult, route, chrome)
  const note = noteForWithdraw(op, quoteResult, planResult, route, chrome)
  const phase = timelinePhase(op, route)
  const editing = !op || PRE_PLAN.has(op.state)
  const quote = quoteResult?.kind === 'quote' ? quoteResult.quote : undefined
  const shell = (children: ReactNode) => (
    <Panel title="Withdraw" subtitle={networkLabel} className={`fk fk-vault-card ${props.className ?? ''}`} data-theme={props.theme} data-op-state={op?.state}>
      {mockLabel ? <Note tone="info" title="Mock">{`Driven by ${mockLabel}. No funds move.`}</Note> : null}
      {children}
    </Panel>
  )

  // A failed balance read is UNAVAILABLE — never a confident "no position" (M6 F1).
  if (editing && positionResult?.kind === 'unavailable') {
    return shell(
      <Note tone="att" title="Couldn't read your balance">
        {`We could not read your ${share.symbol} balance on chain: ${positionResult.reason} This is not a zero — retry when the network settles.`}
      </Note>,
    )
  }
  if (editing && positionResult?.kind === 'no_position') {
    return shell(<Note tone="info" title="No position">{`You hold no ${share.symbol} to withdraw.`}</Note>)
  }

  const position = positionResult?.kind === 'position' ? positionResult.position : undefined
  const routeTabs =
    config.exitModes.length > 1
      ? config.exitModes.map((m) => ({ id: m, label: `${m === 'instant' ? 'Instant' : 'Delayed'} · ${feeBipsLabel(props.fees?.[m])}` }))
      : []

  return shell(
    <>
      {position ? (
        <>
          <SwapLeg role="receive" label="You hold" value={formatExact(position.shares, { asset: false })} editable={false} token={share} />
          <Details>
            <DetailRow label="Current value" value={<span className="fk-mono">{position.assetsValue ? formatExact(position.assetsValue) : '—'}</span>} />
          </Details>
        </>
      ) : null}

      {editing && position ? (
        <>
          <PercentPills value={percent ?? 0} {...(props.onPercentChange ? { onChange: props.onPercentChange } : {})} />
          {routeTabs.length > 0 ? (
            <div className="fk-vault-route">
              <SegmentedTabs tabs={routeTabs} value={route} label="Exit route" {...(props.onRouteChange ? { onChange: (id) => props.onRouteChange?.(id as ExitRoute) } : {})} />
            </div>
          ) : null}
          {quote ? (
            <Details aria-label="Withdrawal details">
              <DetailRow label="You receive" value={<span className="fk-mono">{formatExact(quote.expectedAssets)}</span>} sub={`Net of the ${route} fee, at the vault's current rate.`} />
              <DetailRow label={`${route === 'instant' ? 'Instant' : 'Delayed'} fee`} value={<span className="fk-mono">{formatExact(quote.feeAssets)}</span>} />
              <DetailRow label="Minimum received" value={<span className="fk-mono">{formatExact(quote.minAssets)}</span>} sub={`Protected at ${percentOf(quote.slippageBips)}.`} />
            </Details>
          ) : null}
        </>
      ) : null}

      {note ? <Note tone={note.tone} title={note.title}>{note.body}</Note> : null}

      {/* `nowMs`, because this card's own `now` is unix SECONDS (the Countdown's unit) and
          RecoveryPanel measures action windows in milliseconds. Without it the panel fell
          back to `Date.now()` — and of every card in the package this is the one that most
          matters, because its recovery actions are genuinely time-gated by the claim window,
          so the wall clock was deciding what a user is told they can do. Found by the M13
          test-quality review, which flagged the leak on the M13 composer; this is the same
          bug on the surface where it was already live. */}
      {op && IN_FLIGHT.has(op.state) && op.steps.length > 0 ? <OperationTimeline operation={op} stepEvidence={{}} nowMs={now * 1000} {...(props.theme ? { theme: props.theme } : {})} /> : null}

      {phase?.kind === 'waiting' && props.claimableAt ? (
        <div className="fk-vault-timeline" data-phase="waiting">
          <Countdown label="Claimable in" targetUnix={props.claimableAt} now={now} />
        </div>
      ) : null}
      {phase?.kind === 'claimable' ? (
        <div className="fk-vault-timeline" data-phase="claimable">
          <ToneChip tone="ok" glyph="done">Claimable now</ToneChip>
        </div>
      ) : null}

      {op && op.evidence.length > 0 ? (
        <div className="fk-vault-evidence">
          {op.evidence.map((item) => (
            <EvidenceChip key={`${item.kind}:${item.value}`} item={item} />
          ))}
        </div>
      ) : null}

      <div className="fk-panel-action">
        <Button variant="primary" block disabled={cta.disabled} onClick={props.onSubmit}>{cta.label}</Button>
      </div>
    </>,
  )
}
