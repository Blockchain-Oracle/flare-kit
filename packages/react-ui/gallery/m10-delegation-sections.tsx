import {
  type DelegationIntent,
  type DelegationPlanResult,
  type DelegationReads,
  type DexToken,
  type EvidenceItem,
  type OperationStep,
  MOCK_DELEGATION_OBSERVED,
  MOCK_EPOCH,
  amount,
  delegationPosition,
} from '@flare-kit/core'
import { DelegationCard, type DelegationOperation } from '@flare-kit/react-ui'
import type { Section } from './sections'

/**
 * Dev-only. Every required state of the M10 DelegationCard, in both themes (the one
 * gallery toggle re-themes them). States are positions + records built from the OBSERVED
 * live round trip (`MOCK_DELEGATION_OBSERVED`, 2026-08-12: signer wrapped 5 C2FLR,
 * delegated 100% — 10000 bips — to one FTSO provider, mode PERCENTAGE) — the surface is
 * prop-driven, so each state is data, never a live call. A fixed `now` (MOCK_EPOCH) keeps
 * the screenshots deterministic. The load-bearing honesty is visible here: `unavailable`
 * renders `—`, never a confident zero-delegation (and never collapsed into `no-balance`),
 * and `mode-conflict` reads "undelegate first", never a silent no-op.
 */

const NOW = MOCK_EPOCH + 5_000
const NOW_S = Math.floor(NOW / 1000)

const NATIVE: DexToken = { symbol: 'C2FLR', address: '0x0000000000000000000000000000000000000001', decimals: 18 }
const WRAPPED: DexToken = { symbol: 'WC2FLR', address: '0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273', decimals: 18 }

const PROVIDER = MOCK_DELEGATION_OBSERVED.provider
const FIVE = MOCK_DELEGATION_OBSERVED.wrapAmount
const NATIVE_BAL = amount(MOCK_DELEGATION_OBSERVED.nativeBalance, 18, NATIVE.symbol)

const blankReads: DelegationReads = {
  nativeBalance: MOCK_DELEGATION_OBSERVED.nativeBalance,
  wrappedBalance: 0n,
  mode: 0,
  delegates: [],
  votePower: 0n,
  undelegatedVotePower: 0n,
}
const wrappedReads: DelegationReads = { ...blankReads, wrappedBalance: FIVE, votePower: FIVE, undelegatedVotePower: FIVE }
const delegatedReads: DelegationReads = {
  ...blankReads,
  wrappedBalance: FIVE,
  mode: 1,
  delegates: [{ address: PROVIDER, bips: MOCK_DELEGATION_OBSERVED.bips }],
  votePower: 0n,
  undelegatedVotePower: 0n,
}

// DEL-02 — the real observed portfolio position (2026-08-12 live round trip): wrapped 5
// C2FLR, delegated 100% (10000 bips) to the one FTSO provider, mode PERCENTAGE.
const positionObserved = delegationPosition(delegatedReads)
const positionWrapped = delegationPosition(wrappedReads)
const positionBlank = delegationPosition(blankReads)
const positionUnavailable = delegationPosition(undefined)

const WRAP_INTENT: DelegationIntent = { kind: 'wrap', amount: FIVE }
const DELEGATE_INTENT: DelegationIntent = { kind: 'delegate', targets: [{ to: PROVIDER, bips: MOCK_DELEGATION_OBSERVED.bips }] }

const step = (id: string, type: string, state: OperationStep['state'], actor: OperationStep['actor'] = 'your_wallet'): OperationStep => ({
  id,
  type,
  actor,
  state,
  attempts: 0,
})
const mkOp = (state: DelegationOperation['state'], intent: DelegationIntent, over: Partial<DelegationOperation> = {}): DelegationOperation => ({
  state,
  id: 'op',
  capability: 'delegation',
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
const awaiting = (reason: string) => ({ awaiting: { actor: 'flare' as const, reason, since: NOW_S } })
const txEvidence = (value: string): EvidenceItem[] => [{ kind: 'flare_tx', label: 'Flare tx', value, observedAt: NOW }]

const WRAP_STEPS = [step('call-0', 'deposit', 'active')]
const DELEGATE_STEPS_EXECUTING = [step('call-0', 'delegate', 'active')]
const DELEGATE_STEPS_INFLIGHT = [step('call-0', 'delegate', 'done'), step('record', 'await_delegation', 'active', 'flare')]
const DELEGATE_STEPS_DONE = [step('call-0', 'delegate', 'done'), step('record', 'await_delegation', 'done', 'flare')]

const NOT_VERIFIED: DelegationPlanResult = { kind: 'error', error: { kind: 'not-verified' } }
const TOO_MANY: DelegationPlanResult = { kind: 'error', error: { kind: 'too-many-delegates', max: 2 } }
const OVER_100: DelegationPlanResult = { kind: 'error', error: { kind: 'bips-over-100', sum: 12_000 } }
const MODE_CONFLICT: DelegationPlanResult = { kind: 'error', error: { kind: 'mode-conflict', current: 'amount' } }

const base = { nativeToken: NATIVE, wrappedToken: WRAPPED, networkLabel: 'Coston2' } as const

export const M10_DELEGATION_SECTIONS: readonly Section[] = [
  {
    id: 'm10-delegation',
    title: 'M10 · DelegationCard (wrap → delegate; observed position, unavailable ≠ zero)',
    cases: [
      {
        name: 'compose — the real observed position: 5.000000000000000000 WC2FLR delegated 10000 bips (100%) to 0xB63C1E02…38B5D · PERCENTAGE',
        node: <DelegationCard position={positionObserved} {...base} />,
      },
      {
        name: 'no-balance — a real observed-empty holding (nothing wrapped, no delegates), distinct from unavailable',
        node: <DelegationCard position={positionBlank} {...base} />,
      },
      {
        name: 'needs-wrap — composing a delegate with nothing wrapped yet',
        node: <DelegationCard position={positionBlank} providers={[{ to: PROVIDER, bips: MOCK_DELEGATION_OBSERVED.bips }]} {...base} />,
      },
      {
        name: 'wrapping — the wrap call in flight',
        node: (
          <DelegationCard
            operation={mkOp('executing', WRAP_INTENT, { steps: WRAP_STEPS })}
            position={positionBlank}
            amountText="5"
            nativeBalance={NATIVE_BAL}
            {...base}
          />
        ),
      },
      {
        name: 'delegating — the delegate call in flight',
        node: (
          <DelegationCard
            operation={mkOp('executing', DELEGATE_INTENT, { steps: DELEGATE_STEPS_EXECUTING })}
            position={positionWrapped}
            providers={[{ to: PROVIDER, bips: MOCK_DELEGATION_OBSERVED.bips }]}
            {...base}
          />
        ),
      },
      {
        name: 'submitted — broadcast; the delegatesOf read still pending (never succeeded from the submit)',
        node: (
          <DelegationCard
            operation={mkOp('submitted', DELEGATE_INTENT, { steps: DELEGATE_STEPS_INFLIGHT, evidence: txEvidence(MOCK_DELEGATION_OBSERVED.delegateTx) })}
            position={positionWrapped}
            {...base}
          />
        ),
      },
      {
        name: 'awaiting — Flare recording the delegation (delegatesOf not yet reflecting it)',
        node: (
          <DelegationCard
            operation={mkOp('awaiting_external', DELEGATE_INTENT, {
              steps: DELEGATE_STEPS_INFLIGHT,
              evidence: txEvidence(MOCK_DELEGATION_OBSERVED.delegateTx),
              ...awaiting('Flare is recording your delegation.'),
            })}
            position={positionWrapped}
            {...base}
          />
        ),
      },
      {
        name: 'succeeded — ONLY once delegatesOf reflects the target',
        node: (
          <DelegationCard
            operation={mkOp('succeeded', DELEGATE_INTENT, { steps: DELEGATE_STEPS_DONE, evidence: txEvidence(MOCK_DELEGATION_OBSERVED.delegateTx) })}
            position={positionObserved}
            {...base}
          />
        ),
      },
      {
        name: 'unavailable — the last read failed; renders —, never a confident zero-delegation',
        node: <DelegationCard position={positionUnavailable} {...base} />,
      },
      {
        name: 'too-many-delegates — the two-provider cap, refused before a call is built',
        node: <DelegationCard position={positionWrapped} planResult={TOO_MANY} {...base} />,
      },
      {
        name: 'bips-over-100 — Σ>10000, refused before a call is built',
        node: <DelegationCard position={positionWrapped} planResult={OVER_100} {...base} />,
      },
      {
        name: 'mode-conflict — "undelegate first", never a silent no-op',
        node: <DelegationCard position={positionWrapped} planResult={MODE_CONFLICT} {...base} />,
      },
      {
        name: 'not-verified — declared gap; the kit will not sign against it',
        node: <DelegationCard position={positionWrapped} planResult={NOT_VERIFIED} {...base} />,
      },
    ],
  },
]
