import {
  type Eligibility,
  type EvidenceItem,
  type GovernanceIntent,
  type GovernanceOperation,
  type GovernancePlanResult,
  type OperationStep,
  type ProposalDetailView,
  type ProposalSummary,
  type ProposalUnknown,
  MOCK_EPOCH,
  MOCK_GOVERNANCE_OBSERVED,
  governanceFor,
  governancePosition,
  mapProposalState,
  planCastVote,
  planGovernance,
  reconcileGovernance,
} from '@flare-kit/core'
import { GovernanceCard, ProposalCatalogue, ProposalDetail } from '../src/index.js'
import type { Section } from './sections.js'

/**
 * Dev-only. Every state of the M12 GovernanceCard, ProposalCatalogue and ProposalDetail that
 * the Task-6 live run OBSERVED, in both themes (the one gallery toggle re-themes them). States
 * are props built from `MOCK_GOVERNANCE_OBSERVED` — the surface is prop-driven, so each state
 * is data, never a live call. A fixed `now` (MOCK_EPOCH) keeps the screenshots deterministic.
 *
 * What separates this milestone from M11's carried gallery: the Coston2 delegate/undelegate
 * round trip LANDED (txs `0xc0da39ab…` / `0x5537335d…`, read back via `getDelegateOfAtNow`), so
 * `succeeded` is a state the live run genuinely reached and may be shown. It is still never
 * hand-written here — the two settled cases are produced by feeding the OBSERVED read-back into
 * the REAL `reconcileGovernance`, so the gallery demonstrates the invariant instead of asserting
 * it: the identical submitted record yields `awaiting_external` under a not-yet-reflecting read
 * and `succeeded` only under the reflecting one.
 *
 * The rest of the honesty, all driven through the real code path:
 *  - the plan states come from the REAL `planGovernance`. The `unverified` refusal needs no
 *    gallery override (M11 needed one): Flare mainnet really is `governanceVerified:false` — it
 *    is a read lens, never a write target — so `governanceFor('flare')` IS the honest refusal.
 *  - governance VP stayed 0 through the whole round trip (delegating 0 weight moves the delegate
 *    POINTER only), so the delegated position reads `0 VP` with a non-zero delegate — the real
 *    observed shape, never a fabricated balance to make the screen look fuller.
 *  - `isMember` is `undefined` (PollingFtso.isMember REVERTS for a non-member — probe CONCERN A)
 *    and renders `—`, NEVER `No`.
 *  - the catalogue's three outcomes stay three: `undefined`+error = unavailable, `[]` =
 *    confirmed-empty (Coston2 hosts no proposal), rows = listed. Coston2 is shown honest-empty;
 *    NO Coston2 proposal is invented, and no `Active` proposal exists anywhere to invent.
 *  - `castVote` is CARRIED — the reason is the REAL `planCastVote` refusal string, and no cast
 *    or "voted" state is reachable from any prop.
 */

const OBS = MOCK_GOVERNANCE_OBSERVED
const NOW = MOCK_EPOCH
const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`
const ACCOUNT = OBS.signer
const TARGET = OBS.delegateTarget

// The two live deployments, exactly as shipped: Coston2 flipped true by the Task-6 read-back;
// Flare mainnet still false (a proposal read lens, never a write target this milestone).
const COSTON2 = governanceFor('coston2')
const FLARE = governanceFor('flare')

// GOV-VP positions via the REAL `governancePosition`. Governance VP was 0 THROUGHOUT the round
// trip — `delegate(to)` sets a pointer, it does not move weight — so the delegated position is
// honestly `0 VP` + a real delegate, and `unavailable` is a distinct unknown, never a zero.
const POS_BLANK = governancePosition({ votes: 0n, delegate: ZERO })
const POS_DELEGATED = governancePosition({ votes: 0n, delegate: TARGET })
const POS_UNAVAILABLE = governancePosition(undefined)

// GOV-ELIG — the observed read on both networks. `isMember` is the honest unknown (the on-chain
// revert), never coerced to `false`.
const ELIGIBILITY: Eligibility = { isProposer: false, canPropose: false, isMember: undefined }

// Plan states via the REAL `planGovernance` — every refusal below is the shipped builder's own,
// not a hand-typed error object.
const plan = (intent: GovernanceIntent, deployment = COSTON2, delegate: `0x${string}` = ZERO) =>
  planGovernance({ intent, deployment, reads: { delegate }, account: ACCOUNT })

const DELEGATE_INTENT: GovernanceIntent = { kind: 'delegate', to: TARGET }
const UNDELEGATE_INTENT: GovernanceIntent = { kind: 'undelegate' }

const DELEGATE_PLAN = plan(DELEGATE_INTENT) // ok — the verified Coston2 path the live run drove
const UNVERIFIED_PLAN = plan(DELEGATE_INTENT, FLARE) // the REAL mainnet refusal, no override
const SELF_PLAN = plan({ kind: 'delegate', to: ACCOUNT }) // → self_delegation
const INVALID_PLAN = plan({ kind: 'delegate', to: ZERO }) // → invalid_target
const NO_DELEGATE_PLAN = plan(UNDELEGATE_INTENT) // undelegate against a zero delegate → no_delegate
const UNDELEGATE_PLAN = plan(UNDELEGATE_INTENT, COSTON2, TARGET) // ok — clearing a real delegate

// Each lifecycle spine comes from ITS OWN real plan, so the gallery walks the shipped step
// shape: `planGovernance` names the call step after the function (`delegate` / `undelegate`) and
// the trailing wait step per intent (`await_governance_delegation` / `…_undelegate`). Building
// both from the delegate plan would label the undelegate spine with the wrong call.
const stepsOf = (result: GovernancePlanResult): readonly OperationStep[] => (result.ok ? result.plan.steps : [])
const at = (steps: readonly OperationStep[], index: number, state: OperationStep['state']): OperationStep[] =>
  steps.map((step, i) => (i === index ? { ...step, state } : step))

const DELEGATE_STEPS = stepsOf(DELEGATE_PLAN)
const UNDELEGATE_STEPS = stepsOf(UNDELEGATE_PLAN)
const SIGNING_STEPS = at(DELEGATE_STEPS, 0, 'active') // the wallet call in flight, nothing broadcast
const BROADCAST_STEPS = at(DELEGATE_STEPS, 0, 'done') // signed; the `flare` record step still pending
const UNDELEGATE_SIGNING_STEPS = at(UNDELEGATE_STEPS, 0, 'active')
const UNDELEGATE_BROADCAST_STEPS = at(UNDELEGATE_STEPS, 0, 'done')

const txEvidence = (value: string, label: string): EvidenceItem[] => [
  { kind: 'flare_tx', label, value, observedAt: NOW },
]

const mkOp = (
  state: GovernanceOperation['state'],
  intent: GovernanceIntent,
  over: Partial<GovernanceOperation> = {},
): GovernanceOperation => ({
  state,
  id: 'op',
  capability: 'governance',
  network: 114,
  intent,
  steps: [],
  evidence: [],
  attempts: [],
  quoteHistory: [],
  createdAt: NOW,
  updatedAt: NOW,
  schemaVersion: 1,
  ...over,
})

// The two BROADCAST records, carrying the real Coston2 tx hashes.
const SUBMITTED_DELEGATE = mkOp('submitted', DELEGATE_INTENT, {
  steps: BROADCAST_STEPS,
  evidence: txEvidence(OBS.delegateTx, 'Delegate tx'),
})
const SUBMITTED_UNDELEGATE = mkOp('submitted', UNDELEGATE_INTENT, {
  steps: UNDELEGATE_BROADCAST_STEPS,
  evidence: txEvidence(OBS.undelegateTx, 'Undelegate tx'),
})

// The settled states, produced by the REAL reconciler from the OBSERVED read-back. The SAME
// submitted record yields `awaiting_external` while the read has not caught up and `succeeded`
// only once `getDelegateOfAtNow` reflects the intent — the invariant, demonstrated.
const AWAITING_DELEGATE = reconcileGovernance(SUBMITTED_DELEGATE, { delegate: ZERO }, NOW)
const SUCCEEDED_DELEGATE = reconcileGovernance(SUBMITTED_DELEGATE, { delegate: TARGET }, NOW)
const SUCCEEDED_UNDELEGATE = reconcileGovernance(SUBMITTED_UNDELEGATE, { delegate: ZERO }, NOW)

// ── Proposals ────────────────────────────────────────────────────────────────────────────────
// The ONE real proposal ever discovered live: Flare mainnet, FTSO source, id 1. Its state comes
// from the REAL `mapProposalState('ftso', 3)` — the FTSO enum maps 3 → Defeated, where the
// foundation enum would read the same index as Succeeded. The field shape mirrors
// `readProposalDetail`'s ftso branch exactly: no votePowerBlock / hasVoted / accountVotes exist
// in the deployed shape, so they stay `undefined` and render `—`.
const P = OBS.proposal
const FTSO_SUMMARY: ProposalSummary = {
  id: P.id,
  source: 'ftso',
  state: mapProposalState('ftso', P.stateIndex),
  proposer: P.proposer,
  votePowerBlock: undefined,
  voteStart: P.voteStart,
  voteEnd: P.voteEnd,
}
const FTSO_DETAIL: ProposalDetailView = {
  ...FTSO_SUMMARY,
  for: P.forVotes,
  against: P.against,
  thresholdBIPS: Number(P.thresholdBIPS),
  majorityBIPS: Number(P.majorityBIPS),
  totalVotePower: P.totalVotePower,
  hasVoted: undefined,
  accountVotes: undefined,
}
const UNKNOWN_DETAIL: ProposalUnknown = { id: P.id, source: 'ftso', state: 'unknown' }

// The carried-vote copy is the REAL `planCastVote` refusal — never a hand-written apology.
const CARRIED_VOTE = planCastVote({ proposal: FTSO_SUMMARY, reads: { votes: 0n, delegate: ZERO } }).error.reason

const READ_FAILED = 'The RPC did not answer the discovery read.'
const govBase = { account: ACCOUNT, eligibility: ELIGIBILITY, networkLabel: 'Coston2' } as const

export const M12_GOVERNANCE_SECTIONS: readonly Section[] = [
  {
    id: 'm12-governance',
    title: 'M12 · GovernanceCard (single-target VP delegation; succeeded ONLY from the read-back)',
    cases: [
      {
        name: 'compose — the observed blank slate: 0.000000000000000000 VP, no delegate (a real read, not a fabricated fill)',
        node: <GovernanceCard position={POS_BLANK} {...govBase} />,
      },
      {
        name: 'compose-with-target — a valid single target; the REAL planGovernance emits the one delegate call',
        node: <GovernanceCard position={POS_BLANK} planResult={DELEGATE_PLAN} targetText={TARGET} {...govBase} />,
      },
      {
        name: 'delegated — the observed post-round-trip position: still 0 VP (delegate moves a POINTER, not weight) with a real delegate',
        node: <GovernanceCard position={POS_DELEGATED} {...govBase} />,
      },
      {
        name: 'unverified — the HONEST Flare mainnet deployment (governanceVerified false): no signable plan on a read-lens network',
        node: <GovernanceCard position={POS_BLANK} planResult={UNVERIFIED_PLAN} targetText={TARGET} {...govBase} networkLabel="Flare mainnet" />,
      },
      {
        name: 'self-delegation — to === account, a no-op the protocol would silently accept; refused before a call is built',
        node: <GovernanceCard position={POS_BLANK} planResult={SELF_PLAN} targetText={ACCOUNT} {...govBase} />,
      },
      {
        name: 'invalid-target — the zero address, a burn-to-nowhere delegate; refused before a call is built',
        node: <GovernanceCard position={POS_BLANK} planResult={INVALID_PLAN} targetText={ZERO} {...govBase} />,
      },
      {
        name: 'no-delegate — undelegate against the observed zero delegate; refused rather than burning gas on a no-op',
        node: <GovernanceCard position={POS_BLANK} planResult={NO_DELEGATE_PLAN} {...govBase} />,
      },
      {
        name: 'delegating — the wallet call in flight, pre-broadcast; no txId and the position still blank',
        node: <GovernanceCard operation={mkOp('executing', DELEGATE_INTENT, { steps: SIGNING_STEPS })} position={POS_BLANK} {...govBase} />,
      },
      {
        name: 'submitted — broadcast (real tx 0xc0da39ab…); getDelegateOfAtNow not yet re-read, so never succeeded from the submit',
        node: <GovernanceCard operation={SUBMITTED_DELEGATE} position={POS_BLANK} {...govBase} />,
      },
      {
        name: 'awaiting — the REAL reconciler under a not-yet-reflecting read: Flare is recording the delegation',
        node: <GovernanceCard operation={AWAITING_DELEGATE} position={POS_BLANK} {...govBase} />,
      },
      {
        name: 'succeeded — the REAL reconciler under the OBSERVED read-back (getDelegateOfAtNow === target); the only path to Done',
        node: <GovernanceCard operation={SUCCEEDED_DELEGATE} position={POS_DELEGATED} {...govBase} />,
      },
      {
        name: 'undelegating — the clearing call in flight; the spine carries the undelegate call, not the delegate one',
        node: <GovernanceCard operation={mkOp('executing', UNDELEGATE_INTENT, { steps: UNDELEGATE_SIGNING_STEPS })} position={POS_DELEGATED} {...govBase} />,
      },
      {
        name: 'undelegate-succeeded — the read-back returned the zero address; the round trip closed with no residual delegation',
        node: <GovernanceCard operation={SUCCEEDED_UNDELEGATE} position={POS_BLANK} {...govBase} />,
      },
      {
        name: 'unavailable — the last read didn’t land; VP and delegate render —, never a confident zero',
        node: <GovernanceCard position={POS_UNAVAILABLE} {...govBase} />,
      },
    ],
  },
  {
    id: 'm12-proposals',
    title: 'M12 · ProposalCatalogue (mainnet read lens; unavailable ≠ confirmed-empty)',
    cases: [
      {
        name: 'loading — the discovery read is in flight; neither an empty list nor a failure is claimed yet',
        node: <ProposalCatalogue proposals={undefined} loading />,
      },
      {
        name: 'listed — the ONE real proposal discovered live: mainnet FTSO id 1, Defeated (FTSO enum index 3), row-labelled cross-network',
        node: <ProposalCatalogue proposals={[FTSO_SUMMARY]} />,
      },
      {
        name: 'confirmed-empty — Coston2: the discovery read SUCCEEDED and came back empty (probe-confirmed); no proposal is invented',
        node: <ProposalCatalogue proposals={[]} networkLabel="Coston2" />,
      },
      {
        name: 'unavailable — the discovery read FAILED; stated as unreadable, never wearing the shape of an empty catalogue',
        node: <ProposalCatalogue proposals={undefined} error={READ_FAILED} />,
      },
      {
        name: 'stale — a later refresh failed while a good read is still held: the rows are shown, stated as previously-read',
        node: <ProposalCatalogue proposals={[FTSO_SUMMARY]} error={READ_FAILED} />,
      },
    ],
  },
  {
    id: 'm12-proposal-detail',
    title: 'M12 · ProposalDetail (full precision; absent FTSO fields are —; castVote CARRIED)',
    cases: [
      {
        name: 'defeated — the real mainnet proposal in full: for 2354.308387975507843417 VP, against 0, 6600/5000 BIPS, mono + full precision',
        node: <ProposalDetail detail={FTSO_DETAIL} carriedVoteReason={CARRIED_VOTE} />,
      },
      {
        name: 'unknown — the detail read failed; every tally renders —, never a fabricated number',
        node: <ProposalDetail detail={UNKNOWN_DETAIL} carriedVoteReason={CARRIED_VOTE} />,
      },
      {
        name: 'nothing-read — opened before any read landed; identity only, no invented state',
        node: <ProposalDetail proposalId={P.id} source="ftso" carriedVoteReason={CARRIED_VOTE} />,
      },
    ],
  },
]
