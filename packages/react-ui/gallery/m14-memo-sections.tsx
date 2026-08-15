import {
  MEMO_MOCK_EPOCH,
  OBSERVED_CORE_VAULT,
  OBSERVED_MEMO_ACCOUNT,
  OBSERVED_MEMO_FEES,
  OBSERVED_MEMO_INTENT,
  OBSERVED_MEMO_RUN,
  memoRecoveryOrderFor,
  memoSpine,
  mockMemoObservation,
  mockMemoObservationAwaitingEffect,
  mockMemoPlan,
  planMemoInstruction,
  planMemoRecovery,
  reconcileMemoInstruction,
  smartAccountsFor,
} from '@flarekit-dev/core'
import type { MemoRecoveryKind, MemoRecoveryResult } from '@flarekit-dev/core'
import { MemoInstructionComposer, RecoveryComposer } from '@flarekit-dev/react-ui'
import type { Section } from './sections'

/**
 * Dev-only. Every state of the M14 memo surfaces, in both themes (M14-AC6).
 *
 * The rule this file follows, as M13's did: NO STATE IS HAND-WRITTEN. Plans come from the
 * REAL `planMemoInstruction`, recoveries from the REAL `planMemoRecovery`, lifecycles from the
 * REAL `reconcileMemoInstruction` fed the observations the live run produced. The gallery
 * demonstrates the invariants rather than asserting them — the same record reaches `succeeded`
 * only under an observation carrying the effect, and never from the event alone.
 *
 * WHAT IS DRIVEN FROM SOMETHING OTHER THAN THE LIVE RUN, each saying so on its case:
 *
 * - **Delayed.** No mint was rate-limited on 2026-08-15, so there is no observed delay. AC5
 *   requires the state to be reachable FROM PROPS and that is exactly how it is reached here.
 *   It is labelled as constructed, because a mock record of a delay nobody saw would be
 *   invented protocol reality.
 * - **The refusals.** The gate refused nothing on the successful run except the first
 *   oversized attempt. Each refusal below is produced by feeding the REAL gate an input that
 *   genuinely triggers it — a tagged payment, a stale nonce, a below-minimum total — because a
 *   refusal that cannot be seen cannot be checked.
 * - **The recoveries.** None was driven live. They are real planner output for real inputs,
 *   and nothing here claims a chain has accepted one.
 */

const NOW = MEMO_MOCK_EPOCH
const COSTON2 = smartAccountsFor('coston2')
const MOCK_LABEL = 'Mock · the 2026-08-15 Coston2 run'

const SHARED = {
  feesRead: true,
  fassetSymbol: 'FTestXRP',
  fassetDecimals: 6,
  nativeSymbol: 'C2FLR',
  now: NOW,
  networkLabel: 'Coston2',
  mockLabel: MOCK_LABEL,
  xrplDestination: OBSERVED_CORE_VAULT,
  relayer: OBSERVED_MEMO_RUN.proofOwner,
} as const

/** The REAL gate, fed an input that genuinely reaches the refusal being shown. */
const refuse = (over: Parameters<typeof planMemoInstruction>[0] extends infer T ? Partial<T> : never) =>
  planMemoInstruction({
    deployment: COSTON2,
    personalAccount: OBSERVED_MEMO_ACCOUNT,
    fees: OBSERVED_MEMO_FEES,
    intent: OBSERVED_MEMO_INTENT,
    replayed: false,
    simulation: { ok: true },
    ...over,
  })

const spine = () => ({
  id: 'op_m14_mock',
  capability: 'smartAccounts.memoInstruction',
  network: 114,
  state: 'submitted' as const,
  intent: {},
  createdAt: NOW,
  updatedAt: NOW,
  steps: memoSpine(),
  evidence: [],
  transitions: [],
})

const reconciled = (observation: Parameters<typeof reconcileMemoInstruction>[1], at = NOW + 120_000) =>
  reconcileMemoInstruction(spine() as never, observation, { now: at })

const RECOVERY_ORDER = memoRecoveryOrderFor({ stuckPaymentMinted: false })
const RECOVERY_RESULTS: Partial<Record<MemoRecoveryKind, MemoRecoveryResult>> = {
  'skip-memo': planMemoRecovery({
    kind: 'skip-memo',
    targetTransactionId: `0x${OBSERVED_MEMO_RUN.xrplTransactionId.toLowerCase()}`,
    stuckIdUsed: false,
  }),
  'fast-forward-nonce': planMemoRecovery({
    kind: 'fast-forward-nonce',
    currentNonce: 1n,
    newNonce: 2n,
  }),
  'unpin-executor': planMemoRecovery({ kind: 'unpin-executor' }),
}

export const M14_MEMO_SECTIONS: readonly Section[] = [
  {
    id: 'm14-composer',
    title: 'M14 · MemoInstructionComposer — the plan, from the real gate',
    cases: [
      {
        name: 'Ready — the 0xFF plan the live run actually signed (810 bytes)',
        node: <MemoInstructionComposer {...SHARED} planResult={mockMemoPlan()} />,
      },
      {
        name: 'Fees unread — an availability state, not a refusal',
        node: <MemoInstructionComposer {...SHARED} feesRead={false} planResult={undefined} />,
      },
      {
        name: 'Refused · destination tag — no override anywhere on the surface',
        node: <MemoInstructionComposer {...SHARED} planResult={refuse({ destinationTag: 0 })} />,
      },
      {
        name: 'Refused · below the minimum — the payer-named total that would burn in full',
        node: (
          <MemoInstructionComposer
            {...SHARED}
            planResult={refuse({
              intent: {
                calls: OBSERVED_MEMO_INTENT.calls,
                nonce: OBSERVED_MEMO_INTENT.nonce,
                totalUBA: OBSERVED_MEMO_FEES.minimumFeeUBA - 1n,
              },
            })}
          />
        ),
      },
      {
        name: 'Refused · the nonce moved after the operation was built',
        node: (
          <MemoInstructionComposer
            {...SHARED}
            planResult={refuse({
              personalAccount: { ...OBSERVED_MEMO_ACCOUNT, nonce: 7n },
            })}
          />
        ),
      },
      {
        name: 'Refused · the nonce could not be read — a refusal to guess, not a zero',
        node: (
          <MemoInstructionComposer
            {...SHARED}
            planResult={refuse({
              personalAccount: { ...OBSERVED_MEMO_ACCOUNT, nonce: undefined },
            })}
          />
        ),
      },
      {
        name: 'Refused · the inner call reverts when simulated now',
        node: (
          <MemoInstructionComposer
            {...SHARED}
            planResult={refuse({
              simulation: { ok: false, reason: 'ERC20: transfer amount exceeds balance' },
            })}
          />
        ),
      },
    ],
  },
  {
    id: 'm14-lifecycle',
    title: 'M14 · the lifecycle — succeeded needs BOTH the event and the effect',
    cases: [
      {
        name: 'Succeeded — UserOperationExecuted AND the 400 000 UBA effect, both observed',
        node: (
          <MemoInstructionComposer
            {...SHARED}
            planResult={mockMemoPlan()}
            record={reconciled(mockMemoObservation()) as never}
            reconciling
          />
        ),
      },
      {
        name: 'Ran, but not yet succeeded — the event without the effect read back',
        node: (
          <MemoInstructionComposer
            {...SHARED}
            planResult={mockMemoPlan()}
            record={reconciled(mockMemoObservationAwaitingEffect()) as never}
            reconciling
          />
        ),
      },
      {
        name: 'Delayed — CONSTRUCTED FROM PROPS (no live mint was rate-limited)',
        node: (
          <MemoInstructionComposer
            {...SHARED}
            planResult={mockMemoPlan()}
            record={
              reconciled({
                xrplPayment: { transactionId: OBSERVED_MEMO_RUN.xrplTransactionId },
                proofRetrieved: true,
                relayHash: OBSERVED_MEMO_RUN.userOperationExecuted.transactionHash,
                delayed: { executionAllowedAt: NOW + 3_600_000 },
              }) as never
            }
            reconciling
          />
        ),
      },
      {
        name: 'In flight with nothing watching — the leg is last-observed, not current',
        node: (
          <MemoInstructionComposer
            {...SHARED}
            planResult={mockMemoPlan()}
            record={reconciled({ xrplPayment: { transactionId: OBSERVED_MEMO_RUN.xrplTransactionId } }) as never}
            reconciling={false}
          />
        ),
      },
    ],
  },
  {
    id: 'm14-recovery',
    title: 'M14 · RecoveryComposer — the protocol’s order, and no free cancel',
    cases: [
      {
        name: 'Payment never minted — 0xE0 leads, because it is the one that recovers the money',
        node: (
          <RecoveryComposer
            order={RECOVERY_ORDER}
            results={RECOVERY_RESULTS}
            stuckPaymentMinted={false}
            networkLabel="Coston2"
          />
        ),
      },
      {
        name: 'Skip-memo selected — the exact bytes, and what it does not do',
        node: (
          <RecoveryComposer
            order={RECOVERY_ORDER}
            results={RECOVERY_RESULTS}
            selected="skip-memo"
            stuckPaymentMinted={false}
            networkLabel="Coston2"
          />
        ),
      },
      {
        name: 'Already minted — 0xE0 withheld, and its absence explained',
        node: (
          <RecoveryComposer
            order={memoRecoveryOrderFor({ stuckPaymentMinted: true })}
            results={RECOVERY_RESULTS}
            stuckPaymentMinted
            networkLabel="Coston2"
          />
        ),
      },
      {
        name: 'Refused · the nonce must move forward',
        node: (
          <RecoveryComposer
            order={RECOVERY_ORDER}
            results={{
              ...RECOVERY_RESULTS,
              'fast-forward-nonce': planMemoRecovery({
                kind: 'fast-forward-nonce',
                currentNonce: 5n,
                newNonce: 5n,
              }),
            }}
            selected="fast-forward-nonce"
            stuckPaymentMinted={false}
            networkLabel="Coston2"
          />
        ),
      },
    ],
  },
]
