import {
  type InstructionObservation,
  type ObservedInstruction,
  OBSERVED_ACCOUNT_AFTER_TRANSFER,
  OBSERVED_ACCOUNT_BLANK,
  OBSERVED_ACCOUNT_FUNDED,
  OBSERVED_ACCOUNT_LIVE,
  OBSERVED_DEPOSIT,
  OBSERVED_FDC_REQUEST_FEE_WEI,
  OBSERVED_MAINNET_ACCOUNT,
  OBSERVED_MAINNET_SETTINGS,
  OBSERVED_SETTINGS,
  OBSERVED_TRANSFER,
  SMART_ACCOUNT_MOCK_EPOCH,
  buildInstructionCatalogue,
  decodePaymentReference,
  mockInstructionCatalogue,
  mockInstructionRecord,
  mockObservation,
  mockPlan,
  planInstruction,
  proofDeadlineMs,
  reconcileInstruction,
  smartAccountsFor,
} from '@flare-kit/core'
import { InstructionCatalogue, InstructionComposer, SmartAccountCard } from '../src/index.js'
import type { SmartAccountNetworkView } from '../src/index.js'
import type { Section } from './sections.js'

/**
 * Dev-only. Every state of the M13 SmartAccountCard, InstructionCatalogue and
 * InstructionComposer that the live runs and the keyless probe OBSERVED, in both themes.
 *
 * The rule the whole file follows: no state here is hand-written. Plans come from the REAL
 * `planInstruction` (through `mockPlan`, or directly for the mainnet refusal), catalogues from
 * the REAL `buildInstructionCatalogue`, lifecycles from the REAL `reconcileInstruction` fed
 * the observations the runs produced, and history rows carry actions decoded by the REAL
 * `decodePaymentReference`. The gallery demonstrates the invariants rather than asserting
 * them: the same submitted record reaches `succeeded` only under an observation carrying the
 * effect, and reaches `expired` only under a clock past the deadline.
 *
 * What this milestone can honestly show that M11 could not: the Coston2 round trip LANDED
 * (XRPL E4385C7A…117D → FDC round 1424618 → dispatch 0xd23a2d66…abb1, confirmed by exact
 * balance deltas), so `succeeded` is a state the run genuinely reached.
 *
 * Two states are driven from something other than a live read, and both say so on the case:
 * the `unavailable` reads (a read that did not land — a failure state, not invented protocol
 * data) and the catalogue's `Not served here` row, which NO observed deployment produces
 * because both networks register vaults of both types. That one is driven from a deployment
 * with an empty vault registry, because the state must be visible to be checked.
 */

const NOW = SMART_ACCOUNT_MOCK_EPOCH
const COSTON2 = smartAccountsFor('coston2')
const FLARE = smartAccountsFor('flare')
const MOCK_LABEL = 'Mock · the 2026-08-13 Coston2 runs'

// ── SmartAccountCard views ───────────────────────────────────────────────────────────────
const coston2View = (account: SmartAccountNetworkView['account']): SmartAccountNetworkView => ({
  deployment: COSTON2,
  networkLabel: 'Coston2',
  nativeSymbol: 'C2FLR',
  settings: OBSERVED_SETTINGS,
  account,
})

const MAINNET_VIEW: SmartAccountNetworkView = {
  deployment: FLARE,
  networkLabel: 'Flare Mainnet',
  nativeSymbol: 'FLR',
  settings: OBSERVED_MAINNET_SETTINGS,
  account: OBSERVED_MAINNET_ACCOUNT,
}

// A read that did NOT land, on both halves. Not a zero, not an empty list, not a `false`.
const UNREAD_VIEW: SmartAccountNetworkView = {
  deployment: COSTON2,
  networkLabel: 'Coston2',
  nativeSymbol: 'C2FLR',
  settings: undefined,
  account: undefined,
}

// The account read landed but two of its individual reads did not — a real reachable shape,
// and the one that proves `—` and an observed `0` are different marks on the same screen.
const PARTIAL_ACCOUNT = {
  ...OBSERVED_ACCOUNT_LIVE,
  fassetBalance: undefined,
  nonce: undefined,
  deployed: undefined,
}

// ── History, decoded by the real codec ───────────────────────────────────────────────────
const historyRow = (run: typeof OBSERVED_TRANSFER | typeof OBSERVED_DEPOSIT): ObservedInstruction => ({
  personalAccount: OBSERVED_ACCOUNT_LIVE.address,
  transactionId: `0x${run.xrplTransactionId.toLowerCase()}`,
  paymentReference: run.reference,
  instructionId: run.intent.instructionId,
  // Decoded, not typed out: the row's action name comes from the same call the real scan
  // makes, so a codec that stopped recognising these bytes would show it here.
  action: decodePaymentReference(run.reference).instruction?.action,
  blockNumber: run.dispatchBlock,
  transactionHash: run.dispatchHash,
})
const HISTORY = [historyRow(OBSERVED_TRANSFER), historyRow(OBSERVED_DEPOSIT)]
const SCAN_FAILED = 'The node refused the log range before the scan reached the boundary.'

// ── Catalogues ───────────────────────────────────────────────────────────────────────────
const COSTON2_CATALOGUE = mockInstructionCatalogue()
const MAINNET_CATALOGUE = buildInstructionCatalogue(OBSERVED_MAINNET_SETTINGS)
// Every row `unknown`: the honest shape when the controller itself could not be read.
const UNKNOWN_CATALOGUE = buildInstructionCatalogue(undefined)
// NOT an observed deployment. Both live networks register Firelight AND Upshift vaults, so
// `Not served here` is unreachable from either — it is driven here from a controller with an
// empty vault registry so the state can be looked at.
const NO_VAULTS_CATALOGUE = buildInstructionCatalogue({ ...OBSERVED_SETTINGS, vaults: [] })

// ── Plans, from the real planner ─────────────────────────────────────────────────────────
const TRANSFER_PLAN = mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_FUNDED)
// Planned against the account as it stood WHEN THE DEPOSIT RAN — deployed by run 1, holding
// 1 000 000. Using the pre-run-1 account made the composer claim this instruction would
// deploy the account and that it did not exist yet; both were false of this run.
const DEPOSIT_PLAN = mockPlan(OBSERVED_DEPOSIT.intent, OBSERVED_ACCOUNT_AFTER_TRANSFER)
// The account as the runs left it holds 500 000 and genuinely cannot cover a 1 000 000
// transfer. The real refusal, not a contrived one.
const UNFUNDED_PLAN = mockPlan(OBSERVED_TRANSFER.intent, OBSERVED_ACCOUNT_LIVE)
// Flare mainnet really is `smartAccountsVerified: false`, so the planner's own gate is the
// honest refusal — no gallery override, exactly as M12's mainnet case.
const UNVERIFIED_PLAN = planInstruction({
  deployment: FLARE,
  settings: OBSERVED_MAINNET_SETTINGS,
  catalogue: MAINNET_CATALOGUE,
  personalAccount: OBSERVED_MAINNET_ACCOUNT,
  intent: OBSERVED_TRANSFER.intent,
  replayed: false,
  balanceRequested: true,
})

// ── Lifecycles, walked by the real reconciler ────────────────────────────────────────────
const CLOCK = { now: NOW, proofWindowSeconds: OBSERVED_SETTINGS.proofValidityDurationSeconds }
const at = (run: Parameters<typeof mockObservation>[0], leg: Parameters<typeof mockObservation>[1]) =>
  reconcileInstruction(mockInstructionRecord(run.intent), mockObservation(run, leg), CLOCK)

const PAID = at(OBSERVED_TRANSFER, 'paid')
const PROVED = at(OBSERVED_TRANSFER, 'proved')
const SUBMITTED = at(OBSERVED_TRANSFER, 'submitted')
// Dispatched, effect NOT yet confirmed. The event alone never completes the operation, so
// this is the same observation as `settled` with the one field the run had not yet read.
const DISPATCHED_OBSERVATION: InstructionObservation = {
  ...mockObservation(OBSERVED_TRANSFER, 'settled'),
  effectObserved: undefined,
}
const DISPATCHED = reconcileInstruction(
  mockInstructionRecord(OBSERVED_TRANSFER.intent),
  DISPATCHED_OBSERVATION,
  CLOCK,
)
const SUCCEEDED = at(OBSERVED_TRANSFER, 'settled')
const DEPOSIT_SETTLED = at(OBSERVED_DEPOSIT, 'settled')

// Expiry: the SAME paid observation under a clock past the deadline. The live run never
// expired — the reconciler produces this from a real observation and a later hour.
const PAID_OBSERVATION = mockObservation(OBSERVED_TRANSFER, 'paid')
const DEADLINE = proofDeadlineMs(PAID_OBSERVATION, OBSERVED_SETTINGS.proofValidityDurationSeconds)!
const AFTER_DEADLINE = DEADLINE + 60_000
const EXPIRED = reconcileInstruction(mockInstructionRecord(OBSERVED_TRANSFER.intent), PAID_OBSERVATION, {
  now: AFTER_DEADLINE,
  proofWindowSeconds: OBSERVED_SETTINGS.proofValidityDurationSeconds,
})

const deadlineFor = (observation: InstructionObservation) =>
  proofDeadlineMs(observation, OBSERVED_SETTINGS.proofValidityDurationSeconds)

const composerBase = {
  now: NOW,
  networkLabel: 'Coston2',
  nativeSymbol: 'C2FLR',
  mockLabel: MOCK_LABEL,
  fdcRequestFee: OBSERVED_FDC_REQUEST_FEE_WEI,
  reconciling: true,
} as const

export const M13_SMART_ACCOUNT_SECTIONS: readonly Section[] = [
  {
    id: 'm13-smart-account',
    title: 'M13 · SmartAccountCard (an identity surface; undeployed is a read, not an error)',
    cases: [
      {
        name: 'both-networks — the observed pair: Coston2 deployed after run 1, mainnet derived and untouched. The identical address is COMPARED, not claimed',
        node: (
          <SmartAccountCard
            xrplOwner={OBSERVED_ACCOUNT_LIVE.xrplOwner}
            networks={[coston2View(OBSERVED_ACCOUNT_LIVE), MAINNET_VIEW]}
            mockLabel={MOCK_LABEL}
          />
        ),
      },
      {
        name: 'undeployed — the account BEFORE the first instruction: a real CREATE2 address, observed zeroes, and the contract genuinely not there yet',
        node: (
          <SmartAccountCard
            xrplOwner={OBSERVED_ACCOUNT_BLANK.xrplOwner}
            networks={[coston2View(OBSERVED_ACCOUNT_BLANK)]}
            mockLabel={MOCK_LABEL}
          />
        ),
      },
      {
        name: 'funded-undeployed — the moment the transfer was planned: 2000000 drops held by an account that does not exist yet',
        node: (
          <SmartAccountCard
            xrplOwner={OBSERVED_ACCOUNT_FUNDED.xrplOwner}
            networks={[coston2View(OBSERVED_ACCOUNT_FUNDED)]}
            mockLabel={MOCK_LABEL}
          />
        ),
      },
      {
        name: 'partial-read — balance, nonce and code reads did not land while the rest did: — beside real values, and deployment stated as unknown, never as “no”',
        node: (
          <SmartAccountCard
            xrplOwner={OBSERVED_ACCOUNT_LIVE.xrplOwner}
            networks={[coston2View(PARTIAL_ACCOUNT)]}
          />
        ),
      },
      {
        name: 'unavailable — nothing landed: every value —, the controller stated as unread, and the two addresses explicitly NOT compared',
        node: (
          <SmartAccountCard
            xrplOwner={OBSERVED_ACCOUNT_LIVE.xrplOwner}
            networks={[UNREAD_VIEW, MAINNET_VIEW]}
          />
        ),
      },
      {
        name: 'history — the two real dispatches, their actions decoded from the references the controller accepted',
        node: (
          <SmartAccountCard
            xrplOwner={OBSERVED_ACCOUNT_LIVE.xrplOwner}
            networks={[coston2View(OBSERVED_ACCOUNT_LIVE)]}
            history={HISTORY}
            mockLabel={MOCK_LABEL}
          />
        ),
      },
      {
        name: 'history-confirmed-empty — the scan COMPLETED and found nothing. A claim about the chain, and a true one',
        node: (
          <SmartAccountCard
            xrplOwner={OBSERVED_ACCOUNT_BLANK.xrplOwner}
            networks={[coston2View(OBSERVED_ACCOUNT_BLANK)]}
            history={[]}
          />
        ),
      },
      {
        name: 'history-scanning — the backfill is still running: neither an empty history nor a failed one is claimed yet',
        node: (
          <SmartAccountCard
            xrplOwner={OBSERVED_ACCOUNT_LIVE.xrplOwner}
            networks={[coston2View(OBSERVED_ACCOUNT_LIVE)]}
            historyLoading
          />
        ),
      },
      {
        name: 'history-unavailable — the scan could NOT complete. Distinct from empty, and never wearing its shape',
        node: (
          <SmartAccountCard
            xrplOwner={OBSERVED_ACCOUNT_LIVE.xrplOwner}
            networks={[coston2View(OBSERVED_ACCOUNT_LIVE)]}
            historyError={SCAN_FAILED}
          />
        ),
      },
    ],
  },
  {
    id: 'm13-instruction-catalogue',
    title: 'M13 · InstructionCatalogue (availability READ from the deployment, never declared)',
    cases: [
      {
        name: 'coston2 — the live deployment: eight available, three superseded, every fee the controller’s own 1000 drops',
        node: <InstructionCatalogue rows={COSTON2_CATALOGUE} networkLabel="Coston2" mockLabel={MOCK_LABEL} />,
      },
      {
        name: 'mainnet — the read lens, showing the fee divergence the no-fallback rule exists for: 950000 for five ids against a 500000 default',
        node: <InstructionCatalogue rows={MAINNET_CATALOGUE} networkLabel="Flare Mainnet" />,
      },
      {
        name: 'unknown — the controller could not be read: every row unknown, the vocabulary still listed, nothing claimed about the deployment',
        node: <InstructionCatalogue rows={UNKNOWN_CATALOGUE} networkLabel="Coston2" />,
      },
      {
        name: 'not-served — NOT an observed deployment (both live networks register both vault types); driven from an empty vault registry so the state is visible',
        node: <InstructionCatalogue rows={NO_VAULTS_CATALOGUE} networkLabel="A controller with no vaults" />,
      },
      {
        name: 'loading — the deployment read is in flight; neither an empty catalogue nor a failure is claimed yet',
        node: <InstructionCatalogue loading />,
      },
    ],
  },
  {
    id: 'm13-instruction-composer',
    title: 'M13 · InstructionComposer (the whole chain before an irreversible payment)',
    cases: [
      {
        name: 'plan — the full chain for the transfer the run drove: the exact payment, all 32 memo bytes, no destination tag, the downstream call, and NO deadline yet',
        node: <InstructionComposer planResult={TRANSFER_PLAN} {...composerBase} />,
      },
      {
        name: 'plan-deposit — the vault deposit against CONTROLLER vault id 1 (0xC90D…0361), which is not the kit’s own vault registry',
        node: <InstructionComposer planResult={DEPOSIT_PLAN} {...composerBase} />,
      },
      {
        name: 'unverified — the HONEST Flare mainnet gate: every read landed, and there is still no signable plan on a network no live run confirmed',
        node: <InstructionComposer planResult={UNVERIFIED_PLAN} {...composerBase} networkLabel="Flare Mainnet" />,
      },
      {
        name: 'refused — the post-run account holds 500000 and this moves 1000000: refused before signing, because the inner call would revert with the payment spent',
        node: <InstructionComposer planResult={UNFUNDED_PLAN} {...composerBase} />,
      },
      {
        name: 'leg 1 — paid: the XRPL payment is on the ledger, and the deadline is now a real wall-clock instant',
        node: (
          <InstructionComposer
            planResult={TRANSFER_PLAN}
            record={PAID}
            proofDeadline={deadlineFor(mockObservation(OBSERVED_TRANSFER, 'paid'))}
            {...composerBase}
          />
        ),
      },
      {
        name: 'leg 2 — proved: the round finalized and the proof retrieved; nothing has been dispatched',
        node: (
          <InstructionComposer
            planResult={TRANSFER_PLAN}
            record={PROVED}
            proofDeadline={deadlineFor(mockObservation(OBSERVED_TRANSFER, 'proved'))}
            {...composerBase}
          />
        ),
      },
      {
        name: 'leg 3 — submitted: executeInstruction is broadcast (real tx 0xd23a2d66…abb1) and is still NOT success',
        node: (
          <InstructionComposer
            planResult={TRANSFER_PLAN}
            record={SUBMITTED}
            proofDeadline={deadlineFor(mockObservation(OBSERVED_TRANSFER, 'submitted'))}
            {...composerBase}
          />
        ),
      },
      {
        name: 'leg 4 — dispatched: the InstructionExecuted event is read back, the effect is not. The event alone never completes the operation',
        node: (
          <InstructionComposer
            planResult={TRANSFER_PLAN}
            record={DISPATCHED}
            proofDeadline={deadlineFor(DISPATCHED_OBSERVATION)}
            {...composerBase}
          />
        ),
      },
      {
        name: 'succeeded — the effect observed: recipient +1000000, personal account −1000000, exact on both sides. The only path to Done',
        node: (
          <InstructionComposer
            planResult={TRANSFER_PLAN}
            record={SUCCEEDED}
            proofDeadline={deadlineFor(mockObservation(OBSERVED_TRANSFER, 'settled'))}
            dispatchedByUs={OBSERVED_TRANSFER.dispatchedByUs}
            {...composerBase}
          />
        ),
      },
      {
        name: 'succeeded-by-another — the deposit: executed, effect real (500000 shares), dispatched by 0xca0bf4cb…4466 and not by this kit. Not our success, not a failure',
        node: (
          <InstructionComposer
            planResult={DEPOSIT_PLAN}
            record={DEPOSIT_SETTLED}
            proofDeadline={deadlineFor(mockObservation(OBSERVED_DEPOSIT, 'settled'))}
            dispatchedByUs={OBSERVED_DEPOSIT.dispatchedByUs}
            dispatchedBy={OBSERVED_DEPOSIT.dispatchedBy}
            {...composerBase}
          />
        ),
      },
      {
        name: 'expired — the same paid observation under a clock past the window: terminal, says where the XRP is, and carries NO retry affordance',
        node: (
          <InstructionComposer
            planResult={TRANSFER_PLAN}
            record={EXPIRED}
            proofDeadline={DEADLINE}
            {...composerBase}
            now={AFTER_DEADLINE}
          />
        ),
      },
      {
        name: 'not-watched — in flight while nothing is reconciling: the leg is the last thing observed, not the current state, and the surface says so',
        node: (
          <InstructionComposer
            planResult={TRANSFER_PLAN}
            record={SUBMITTED}
            proofDeadline={deadlineFor(mockObservation(OBSERVED_TRANSFER, 'submitted'))}
            {...composerBase}
            reconciling={false}
          />
        ),
      },
    ],
  },
]
