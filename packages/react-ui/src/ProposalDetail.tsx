import type { ProposalDetailView, ProposalSource, ProposalUnknown } from '@flare-kit/core'
import { amount } from '@flare-kit/core'
import { Button } from './primitives/Button.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Note } from './primitives/Note.js'
import { Panel } from './primitives/Panel.js'
import { ToneChip } from './primitives/StateChip.js'
import { PROPOSAL_SOURCE_LABEL, PROPOSAL_STATE_VISUAL } from './proposal-visuals.js'

/**
 * ProposalDetail (M12 T10) — one proposal, in full, honestly.
 *
 * Grounding (Task 6): the ONLY real proposal is mainnet FTSO id=1, Defeated. The
 * deployed FTSO shape carries NO `votePowerBlock`, NO `hasVoted`, NO
 * `accountVotes` — so those fields are `undefined` and render "—", NEVER a
 * fabricated block / 0 / false. `totalVotePower` is the contract's real trailing
 * uint, rendered at full precision and labelled as vote power — NOT relabelled a
 * definitive circulating supply for the FTSO source (that claim is unconfirmed).
 *
 * Two more honesty rules:
 *   - a failed detail read arrives as `ProposalUnknown` (no tallies) → every
 *     tally renders "—", never a fabricated number.
 *   - `castVote` is BUILT and gated but CARRIED this milestone (core's
 *     `planCastVote` never returns an executable plan: no Active proposal is
 *     reachable and the account holds no mainnet governance vote power). The
 *     affordance is present but declared-unbuilt — it NEVER renders a
 *     "voted"/success state.
 */

const DASH = '—'

export interface ProposalDetailProps {
  /** The proposal's full detail, the honest `unknown` shape, or `undefined` while a read is pending. */
  readonly detail?: ProposalDetailView | ProposalUnknown
  /** Header identity when `detail` is `undefined` (nothing read yet). */
  readonly proposalId?: bigint
  readonly source?: ProposalSource
  /** The cross-network label — this proposal is read from mainnet. */
  readonly networkLabel?: string
  /** Vote-power scale/unit — governance weight is 18-decimal WNat, labelled `VP`. */
  readonly votesDecimals?: number
  readonly votesAsset?: string
  /** The carried-vote reason from core's `planCastVote`, when the host has one. */
  readonly carriedVoteReason?: string
  readonly theme?: 'light' | 'dark'
  readonly className?: string
}

/** The full view carries tallies; `ProposalUnknown` does not — `for` is the discriminator. */
function isDetailView(detail: ProposalDetailView | ProposalUnknown): detail is ProposalDetailView {
  return 'for' in detail
}

function bips(value: number) {
  return <span className="fk-mono">{value} BIPS</span>
}

export function ProposalDetail({
  detail,
  proposalId,
  source,
  networkLabel = 'Flare mainnet',
  votesDecimals = 18,
  votesAsset = 'VP',
  carriedVoteReason,
  theme,
  className,
}: ProposalDetailProps) {
  const id = detail?.id ?? proposalId
  const src = detail?.source ?? source
  const state = detail?.state ?? 'unknown'
  const view = detail && isDetailView(detail) ? detail : undefined
  const visual = PROPOSAL_STATE_VISUAL[state]
  const isFtso = src === 'ftso'

  return (
    <div
      className={`fk fk-gov-detail${className ? ` ${className}` : ''}`}
      {...(theme ? { 'data-theme': theme } : {})}
      data-proposal-state={state}
      data-source={src ?? 'unknown'}
      data-vote="carried"
    >
      <Panel
        title={<span className="fk-mono">{id !== undefined ? `Proposal ${id}` : 'Proposal'}</span>}
        subtitle={`${src ? PROPOSAL_SOURCE_LABEL[src] : 'Source unknown'} · ${networkLabel}`}
        aside={
          <ToneChip tone={visual.tone} glyph={visual.glyph}>
            {visual.word}
          </ToneChip>
        }
        {...(theme ? { theme } : {})}
      >
        {/* Tallies + thresholds. On a `ProposalUnknown` (a failed detail read)
            every value is "—" — never a fabricated tally. */}
        <Details aria-label="Tallies and thresholds">
          <DetailRow label="For" value={view ? amount(view.for, votesDecimals, votesAsset) : DASH} />
          <DetailRow label="Against" value={view ? amount(view.against, votesDecimals, votesAsset) : DASH} />
          <DetailRow
            label="Quorum threshold"
            value={view ? bips(view.thresholdBIPS) : DASH}
            {...(view ? { sub: `${view.thresholdBIPS / 100}% of vote power must turn out` } : {})}
          />
          <DetailRow
            label="Majority"
            value={view ? bips(view.majorityBIPS) : DASH}
            {...(view ? { sub: `${view.majorityBIPS / 100}% of votes cast must be in favour` } : {})}
          />
          <DetailRow
            label="Total vote power"
            value={view && view.totalVotePower !== undefined ? amount(view.totalVotePower, votesDecimals, votesAsset) : DASH}
            {...(view && isFtso
              ? { sub: 'As reported by the FTSO proposal — a vote-power total, not a definitive circulating supply.' }
              : {})}
          />
        </Details>

        {/* The fields the FTSO shape does not carry. `undefined` → "—", never a
            fabricated block / Yes-No / 0. */}
        <Details aria-label="Voting record" className="fk-gov-detail-record">
          <DetailRow
            label="Vote-power block"
            value={
              view?.votePowerBlock !== undefined ? <span className="fk-mono">{view.votePowerBlock.toString()}</span> : DASH
            }
            {...(view && isFtso && view.votePowerBlock === undefined
              ? { sub: 'The FTSO proposal shape carries no vote-power block.' }
              : {})}
          />
          <DetailRow
            label="You voted"
            value={view?.hasVoted !== undefined ? (view.hasVoted ? 'Yes' : 'No') : DASH}
            {...(view && isFtso && view.hasVoted === undefined
              ? { sub: 'The FTSO proposal shape exposes no per-account hasVoted.' }
              : {})}
          />
          <DetailRow
            label="Your vote power"
            value={view?.accountVotes !== undefined ? amount(view.accountVotes, votesDecimals, votesAsset) : DASH}
            {...(view && isFtso && view.accountVotes === undefined
              ? { sub: 'The FTSO proposal shape exposes no per-account getVotes.' }
              : {})}
          />
        </Details>

        {detail === undefined ? (
          <Note tone="info" title="Nothing read yet">
            This proposal hasn't been read. Open it from the catalogue to read its state and tallies from {networkLabel}.
          </Note>
        ) : null}

        {detail !== undefined && view === undefined ? (
          <Note tone="att" title="This proposal's detail could not be read">
            The state and tallies couldn't be read, so they are shown as {DASH} rather than as a fabricated result. It
            refreshes on the next read.
          </Note>
        ) : null}

        {/* castVote is CARRIED: built and gated, never signable this milestone.
            The affordance is present but disabled — it NEVER renders a success. */}
        <div className="fk-gov-actions">
          <Button variant="primary" block disabled>
            Cast vote
          </Button>
        </div>

        <Note tone="info" title="Voting isn't built here yet">
          {carriedVoteReason ??
            'Casting a vote is carried this milestone: no Active proposal is executable on the write network (Coston2 hosts none) and this account holds no verified mainnet governance vote power. The path is built and gated — never signed until a live run confirms it.'}
        </Note>
      </Panel>
    </div>
  )
}
