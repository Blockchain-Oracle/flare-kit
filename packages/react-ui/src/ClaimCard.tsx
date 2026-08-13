import { type ClaimPlanResult, type DexToken, type RewardsReads, amount, formatExact } from '@flarekit-dev/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { StateChip, ToneChip } from './primitives/StateChip.js'
import { SegmentedTabs } from './primitives/SegmentedTabs.js'
import { OperationTimeline } from './OperationTimeline.js'
import { IN_FLIGHT, PRE_PLAN } from './card-chrome.js'
import {
  type ClaimKind,
  type ProofSourceView,
  type RewardsClaimOperation,
  CLAIM_STEP_EVIDENCE,
  claimCardState,
  claimKindLabel,
  claimTypeLabel,
  ctaForClaim,
  ftsoMissingProofEpoch,
  rnatBurn,
} from './claim-card-state.js'
import { claimStateNote } from './claim-card-notes.js'

/**
 * ClaimCard (M10-R10, +M11 staking). ONE component parameterised by `ClaimKind`, rendering the
 * four claim kinds DISTINCTLY (R-REWARD-002) — each carries its OWN facts and is never collapsed
 * into a generic claim. Built on the published core + `useRewards`; the hook is host-owns-operation
 * (like `useBridge`), so each kind's `operation` is supplied by the host (`ftso`/`rnat`/
 * `flaredrop`/`staking`), tracked independently. Sign only via `onSubmit`; the card never holds a key.
 *
 * The 4th kind (staking) is NON-EXPIRING: it never renders an epoch-expiry boundary (the 25-epoch
 * line is FTSO-delegation-only); an observed `claimable 0n` is the honest empty, never a fabrication.
 *
 * Honesty (M10): the FTSO proof source is the UNOFFICIAL mirror (`official:false`), marked and
 * never rendered as protocol truth; an absent proof is DECLARED unavailable and an empty read
 * is the honest empty — never a fabricated amount; the rNat `withdrawAll` shows the 50%
 * early-exit BURN as real value destruction BEFORE signing; FlareDrop reads concluded
 * (2026-01-30) with no new-drop affordance.
 */

const DEFAULT_FLAREDROP_ENDED = '2026-01-30'
const RNAT_DECIMALS = 18

const shorten = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`

export interface ClaimCardProps {
  readonly kind: ClaimKind
  /** The host-held operation for THIS kind (from `useRewards`); its state owns the lifecycle. */
  readonly operation?: RewardsClaimOperation
  readonly planResult?: ClaimPlanResult
  /** The account's claimable position (Task 7 reads); one shape, sliced per kind. */
  readonly reads?: RewardsReads
  /** The FTSO proof source — the UNOFFICIAL mirror on Coston2 (`official:false`). */
  readonly proofSource?: ProofSourceView
  /** The reward recipient (FTSO / FlareDrop / staking), shown in the mono face. */
  readonly recipient?: string
  /** Whether the staking claim wraps its payout to WNat (vs paid native) — display context. */
  readonly wrap?: boolean
  /** The rNat withdraw intent (the 50%-burn `withdrawAll` path) is selected. */
  readonly withdrawAll?: boolean
  readonly onWithdrawChange?: (withdraw: boolean) => void
  /** The native token FTSO rewards are paid in; amounts render carrying its asset. */
  readonly nativeToken?: DexToken
  /** The documented 25-epoch delegation-reward expiry window (display context only). */
  readonly expiryEpochs?: number
  /** The date the FlareDrop concluded (Coston2: 2026-01-30). */
  readonly flareDropEndedAt?: string
  readonly mockLabel?: string
  readonly networkLabel?: string
  readonly onSubmit?: () => void
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

/** CLAIM-01 — the FTSO delegation reward facts: the UNOFFICIAL-mirror proof source, the
 *  on-chain expire-next boundary + 25-epoch window, the recipient, and one row per reward
 *  (epoch → amount + reward-type). Every value in the mono `fk-row-v` face. */
function FtsoBody(props: Pick<ClaimCardProps, 'reads' | 'proofSource' | 'recipient' | 'nativeToken' | 'expiryEpochs'>) {
  const rewards = props.reads?.ftso ?? []
  const source = props.proofSource ?? rewards[0]?.source
  const decimals = props.nativeToken?.decimals ?? 18
  const asset = props.nativeToken?.symbol ?? 'FLR'
  return (
    <Details aria-label="FTSO delegation rewards" className="fk-claim-position">
      {source ? (
        <DetailRow
          label="Proof source"
          value={
            <span className="fk-claim-source">
              <span className="fk-mono">{source.url}</span>
              <ToneChip tone={source.official ? 'neutral' : 'att'}>{source.official ? 'official' : 'unofficial mirror'}</ToneChip>
            </span>
          }
        />
      ) : null}
      {props.reads ? (
        <DetailRow label="Expires next (epoch)" value={`${props.reads.expireNextEpoch} · ${props.expiryEpochs ?? 25}-epoch window`} />
      ) : null}
      {props.recipient ? <DetailRow label="Recipient" value={<span className="fk-mono">{shorten(props.recipient)}</span>} /> : null}
      {rewards.map((reward) => (
        <DetailRow
          key={reward.epoch}
          label={<span className="fk-mono">Epoch {reward.epoch}</span>}
          value={`${formatExact(amount(reward.amount, decimals, asset))} · ${claimTypeLabel(reward.claimType)}`}
        />
      ))}
    </Details>
  )
}

/** CLAIM-02 — the rNat claim/withdraw affordance + the locked / unlocked / rNat split (mono,
 *  full precision). The 50%-burn warning itself is rendered by the shared card body. */
function RnatBody(props: { reads?: RewardsReads; withdrawAll: boolean; editable: boolean; onWithdrawChange?: (withdraw: boolean) => void }) {
  const rnat = props.reads?.rnat
  const unlocked = (rnat?.rnat ?? 0n) - (rnat?.locked ?? 0n)
  return (
    <>
      <SegmentedTabs
        label="RNat action"
        value={props.withdrawAll ? 'withdraw' : 'claim'}
        tabs={[
          { id: 'claim', label: 'Claim' },
          { id: 'withdraw', label: 'Withdraw all' },
        ]}
        {...(props.editable && props.onWithdrawChange ? { onChange: (id: string) => props.onWithdrawChange?.(id === 'withdraw') } : {})}
      />
      {rnat?.hasProject ? (
        <Details aria-label="RNat balances" className="fk-claim-position">
          <DetailRow label="rNat (total)" value={amount(rnat.rnat, RNAT_DECIMALS, 'rNat')} />
          <DetailRow label="Locked" value={amount(rnat.locked, RNAT_DECIMALS, 'rNat')} />
          <DetailRow label="Unlocked" value={amount(unlocked, RNAT_DECIMALS, 'rNat')} />
          <DetailRow label="Wrapped (wNat)" value={amount(rnat.wNat, RNAT_DECIMALS, 'WNat')} />
        </Details>
      ) : null}
    </>
  )
}

/** CLAIM-03 — the concluded FlareDrop archive: the conclusion date is always stated (no new
 *  drop), and a real historical month, if any, is shown claimable. FlareDrop's read carries no
 *  amount, so none is fabricated. */
function FlareDropBody(props: { reads?: RewardsReads; recipient?: string; endedAt: string }) {
  const months = props.reads?.flaredrop.claimableMonths ?? []
  return (
    <Details aria-label="FlareDrop distribution" className="fk-claim-position">
      <DetailRow label="Status" value={`Concluded · ${props.endedAt}`} />
      {props.recipient ? <DetailRow label="Recipient" value={<span className="fk-mono">{shorten(props.recipient)}</span>} /> : null}
      <DetailRow label="Claimable months" value={months.length > 0 ? months.join(', ') : 'None'} />
    </Details>
  )
}

/** CLAIM-04 — the NON-EXPIRING staking (validator) reward. It carries a real claimable delta
 *  (`total − claimed`), the recipient and the wrap target, and — distinctly — a "does not expire"
 *  affordance: this kind NEVER carries an epoch boundary (the 25-epoch line is M10's
 *  ftso-delegation rule). An observed `claimable 0n` is the honest empty (a delayed leg), never a
 *  fabricated amount. Every amount renders in the mono `fk-row-v` face at full precision + asset. */
function StakingBody(props: { reads?: RewardsReads; recipient?: string; wrap: boolean; nativeToken?: DexToken }) {
  const staking = props.reads?.staking
  const decimals = props.nativeToken?.decimals ?? 18
  const asset = props.nativeToken?.symbol ?? 'FLR'
  return (
    <Details aria-label="Staking rewards" className="fk-claim-position">
      <DetailRow label="Reward type" value="Staking · validator" />
      {props.recipient ? <DetailRow label="Recipient" value={<span className="fk-mono">{shorten(props.recipient)}</span>} /> : null}
      <DetailRow label="Wrap" value={props.wrap ? 'Wrap to WNat' : 'Native'} />
      <DetailRow label="Expiry" value="Does not expire" />
      <DetailRow label="Claimable" value={amount(staking?.claimable ?? 0n, decimals, asset)} />
      <DetailRow label="Earned (total)" value={amount(staking?.total ?? 0n, decimals, asset)} />
      <DetailRow label="Claimed" value={amount(staking?.claimed ?? 0n, decimals, asset)} />
    </Details>
  )
}

/** The whole read never landed (dead RPC / first load): the exact-value rows are `—` (unknown,
 *  not empty) and the shared note states it — NEVER "Nothing earned yet" on a failed read.
 *  Mirrors the DelegationCard's `unavailable` panel; distinct from an observed empty. */
function UnavailableBody({ kind }: { kind: ClaimKind }) {
  return (
    <Details aria-label={`${claimKindLabel(kind)} — unavailable`} className="fk-claim-position">
      <DetailRow label="Claimable" value="—" />
      <DetailRow label="Last read" value="—" />
    </Details>
  )
}

export function ClaimCard(props: ClaimCardProps) {
  const { kind, operation: op, planResult, reads, theme } = props
  const withdrawAll = props.withdrawAll ?? false
  const endedAt = props.flareDropEndedAt ?? DEFAULT_FLAREDROP_ENDED

  const state = claimCardState({ kind, operation: op, planResult, reads, withdrawAll })
  const cta = ctaForClaim({ kind, state, planResult, withdrawAll })
  const editable = !op

  const proofEpoch =
    planResult?.kind === 'error' && planResult.error.kind === 'proof-unavailable' ? planResult.error.epoch : ftsoMissingProofEpoch(reads)
  const stateNote = claimStateNote(state, { epoch: proofEpoch, endedAt })

  // The 50% early-exit burn — real value destruction, shown BEFORE signing (never hidden by
  // the not-verified gate, which refuses the sign but must not conceal the cost).
  const locked = reads?.rnat.locked ?? 0n
  const showBurn = kind === 'rnat' && withdrawAll && locked > 0n && !op
  const burnAmount = amount(rnatBurn(locked), RNAT_DECIMALS, 'rNat')

  const aside = (
    <div className="fk-claim-head">
      {props.networkLabel ? <span className="fk-claim-net">{props.networkLabel}</span> : null}
      {props.mockLabel ? <ToneChip tone="att">{props.mockLabel}</ToneChip> : null}
      {op && !PRE_PLAN.has(op.state) ? <StateChip state={op.state} {...(op.state === 'succeeded' ? { label: 'Claimed' } : {})} /> : null}
    </div>
  )

  return (
    <Panel
      title={<span className="fk-sr">{claimKindLabel(kind)}</span>}
      aside={aside}
      data-op-state={op?.state}
      data-claim-kind={kind}
      data-claim-state={state}
      className={`fk-claim-card${props.className ? ` ${props.className}` : ''}`}
      {...(theme ? { theme } : {})}
    >
      {state === 'unavailable' ? (
        <UnavailableBody kind={kind} />
      ) : kind === 'ftso-delegation' ? (
        <FtsoBody reads={reads} proofSource={props.proofSource} recipient={props.recipient} nativeToken={props.nativeToken} expiryEpochs={props.expiryEpochs} />
      ) : kind === 'rnat' ? (
        <RnatBody reads={reads} withdrawAll={withdrawAll} editable={editable} onWithdrawChange={props.onWithdrawChange} />
      ) : kind === 'staking' ? (
        <StakingBody reads={reads} recipient={props.recipient} wrap={props.wrap ?? false} nativeToken={props.nativeToken} />
      ) : (
        <FlareDropBody reads={reads} recipient={props.recipient} endedAt={endedAt} />
      )}

      {showBurn ? (
        <Note tone="bad" title="Early exit burns 50%">
          Withdrawing before your rNat unlocks destroys <span className="fk-mono">{formatExact(burnAmount)}</span> — half your still-locked rNat —
          permanently. This is real value destruction, shown before you sign.
        </Note>
      ) : null}

      {stateNote ? (
        <Note tone={stateNote.tone} title={stateNote.title}>
          {stateNote.body}
        </Note>
      ) : null}

      {op && op.steps.length > 0 && IN_FLIGHT.has(op.state) ? (
        <OperationTimeline operation={op} stepEvidence={CLAIM_STEP_EVIDENCE} className="fk-claim-spine" {...(theme ? { theme } : {})} />
      ) : null}

      <div className="fk-panel-action">
        <Button variant="primary" block disabled={cta.disabled} onClick={props.onSubmit}>
          {cta.label}
        </Button>
      </div>
    </Panel>
  )
}
