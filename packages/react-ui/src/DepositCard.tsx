// packages/react-ui/src/DepositCard.tsx
import { type Amount, type DepositOperation, type DepositPlanResult, type DepositQuoteResult, type DexToken, type VaultConfig, amount, formatExact } from '@flare-kit/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { EvidenceChip } from './primitives/EvidenceChip.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { OperationTimeline } from './OperationTimeline.js'
import { SwapLeg } from './SwapLeg.js'
import { CONCLUDED, IN_FLIGHT, PRE_PLAN, percentOf } from './card-chrome.js'
import { ctaForDeposit, noteForDeposit } from './deposit-card-state.js'

/**
 * DepositCard (M7-R8). A "you deposit" leg for the asset and a "you receive" leg
 * for the expected shares at the live rate, over the real ERC-4626 deposit path —
 * prop-driven so every state is reachable from props. The approve and deposit
 * steps render on the shared operation spine as the two real steps they are
 * (M7-R5). It refuses to invent: the receive amount is `—` until quoted and after
 * conclusion, the exact minimum is shown at full precision, and shares are stated
 * as a claim on the vault, never a fixed balance.
 *
 * Signs via `onSubmit` only — it holds no wallet client and no key.
 */

export interface DepositCardProps {
  readonly operation: DepositOperation
  readonly config: VaultConfig
  readonly quoteResult?: DepositQuoteResult
  /** Carries the gate reason when the plan refused — cap/insufficient/paused/expired. */
  readonly planResult?: DepositPlanResult
  readonly amountInText?: string
  readonly balance?: Amount
  readonly mockLabel?: string
  readonly networkLabel?: string
  readonly onAmountInChange?: (text: string) => void
  readonly onMax?: () => void
  readonly onSubmit?: () => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

function shareToken(config: VaultConfig): DexToken {
  const address = config.share.kind === 'lp' ? config.share.address : config.address
  return { symbol: config.share.symbol, address, decimals: config.share.decimals }
}

export function DepositCard(props: DepositCardProps) {
  const { operation: op, config, quoteResult, planResult, amountInText, balance, mockLabel, networkLabel } = props
  const asset: DexToken = config.asset
  const share = shareToken(config)
  const chrome = { assetSymbol: asset.symbol, assetDecimals: asset.decimals, shareSymbol: share.symbol }

  const quote = op.quote ?? (quoteResult?.kind === 'quote' ? quoteResult.quote : undefined)
  const concluded = CONCLUDED.has(op.state)
  const payValue =
    amountInText ?? (op.intent.assetsIn > 0n ? formatExact(amount(op.intent.assetsIn, asset.decimals, asset.symbol), { asset: false }) : '')
  const receiveValue = !concluded && quote ? formatExact(quote.expectedShares, { asset: false }) : '—'

  const cta = ctaForDeposit(op, quoteResult, planResult, chrome)
  const note = noteForDeposit(op, quoteResult, planResult, chrome)

  return (
    <Panel title="Deposit" subtitle={networkLabel} className={`fk fk-vault-card ${props.className ?? ''}`} data-theme={props.theme} data-op-state={op.state}>
      {mockLabel ? <Note tone="info" title="Mock">{`Driven by ${mockLabel}. No funds move.`}</Note> : null}

      <SwapLeg
        role="pay"
        label="You deposit"
        value={payValue}
        editable={PRE_PLAN.has(op.state)}
        token={asset}
        {...(balance ? { balance } : {})}
        {...(props.onAmountInChange ? { onAmountInChange: props.onAmountInChange } : {})}
        {...(props.onMax ? { onMax: props.onMax } : {})}
      />
      <SwapLeg role="receive" label="You receive" value={receiveValue} editable={false} token={share} />

      {quote && !concluded ? (
        <Details aria-label="Deposit details">
          <DetailRow label="Rate" value={<span className="fk-mono">{`${formatExact(amount(quote.rate, asset.decimals, asset.symbol))} / ${share.symbol}`}</span>} />
          <DetailRow label="You receive" value={<span className="fk-mono">{formatExact(quote.expectedShares)}</span>} />
          <DetailRow label="Minimum shares" value={<span className="fk-mono">{formatExact(quote.minShares)}</span>} sub={`Protected at ${percentOf(quote.slippageBips)} — the rate can move before the tx confirms.`} />
        </Details>
      ) : null}

      {note ? <Note tone={note.tone} title={note.title}>{note.body}</Note> : null}

      {IN_FLIGHT.has(op.state) && op.steps.length > 0 ? <OperationTimeline operation={op} {...(props.theme ? { theme: props.theme } : {})} /> : null}

      {op.evidence.length > 0 ? (
        <div className="fk-vault-evidence">
          {op.evidence.map((item) => (
            <EvidenceChip key={`${item.kind}:${item.value}`} item={item} />
          ))}
        </div>
      ) : null}

      <div className="fk-panel-action">
        <Button variant="primary" block disabled={cta.disabled} onClick={props.onSubmit}>{cta.label}</Button>
      </div>
    </Panel>
  )
}
