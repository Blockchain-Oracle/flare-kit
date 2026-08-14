import { smartAccountsFor } from '@flare-kit/contracts'
import {
  type OperationRecord,
  type OperationState,
  applyTransition,
  createOperation,
} from './operation.js'
import {
  MOCK_XRPL_OWNER,
  OBSERVED_ACCOUNT_LIVE,
  OBSERVED_DEPOSIT,
  OBSERVED_SETTINGS,
  OBSERVED_TRANSFER,
  SMART_ACCOUNT_MOCK_EPOCH,
} from './mock-smart-accounts-observed.js'
import { buildInstructionCatalogue } from './smart-accounts/catalogue.js'
import { planInstruction } from './smart-accounts/plan.js'
import type { InstructionIntent, InstructionPlanResult } from './smart-accounts/plan-types.js'
import { type InstructionObservation, instructionSpine } from './smart-accounts/states.js'

/**
 * The smart-accounts mock, written AFTER the live runs and copying what they observed.
 *
 * It is a READER the real code is driven by, not a second implementation: `mockPlan` calls the
 * real `planInstruction`, `mockInstructionRecord` walks the real state table, and a caller
 * reconciles with the real `reconcileInstruction`. There is no second state machine here to
 * drift from the first one.
 *
 * It REFUSES anything the live runs did not observe — an unobserved XRPL owner, an instruction
 * that was never driven, a network that was never verified. An unmocked call is a loud error
 * rather than a plausible answer, because a mock that invents a smart account would be
 * inventing the one thing this milestone exists to prove.
 *
 * The observed values themselves live in `mock-smart-accounts-observed.ts` and are re-exported
 * here, so `@flare-kit/core`'s public surface is unchanged by the split.
 */

export * from './mock-smart-accounts-observed.js'

const OBSERVED_RUNS = [OBSERVED_TRANSFER, OBSERVED_DEPOSIT] as const

function refuse(what: string): never {
  throw new Error(
    `mock-smart-accounts: ${what} was never observed. The mock answers only what the ` +
      '2026-08-13 Coston2 runs actually drove; anything else would be an invented smart account.',
  )
}

/** The catalogue as the live deployment produced it. */
export function mockInstructionCatalogue() {
  return buildInstructionCatalogue(OBSERVED_SETTINGS)
}

/**
 * A plan from the REAL planner over the observed deployment. Refuses an owner or an
 * instruction the runs never drove — including the nine built-ins that were never
 * dispatched, which the live evidence says nothing about.
 */
export function mockPlan(intent: InstructionIntent, account = OBSERVED_ACCOUNT_LIVE): InstructionPlanResult {
  if (intent.xrplOwner !== MOCK_XRPL_OWNER) refuse(`XRPL owner ${intent.xrplOwner}`)
  if (!OBSERVED_RUNS.some((run) => run.intent.instructionId === intent.instructionId)) {
    refuse(`instruction 0x${intent.instructionId.toString(16).padStart(2, '0')}`)
  }
  return planInstruction({
    // Coston2 only, and its flag is genuinely `true` — flipped by run 1, not by the mock.
    deployment: smartAccountsFor('coston2'),
    settings: OBSERVED_SETTINGS,
    catalogue: mockInstructionCatalogue(),
    personalAccount: account,
    intent,
    replayed: false,
    balanceRequested: true,
  })
}

/**
 * An operation record at the point the XRPL payment has been broadcast — the state both live
 * runs were genuinely in before anything on Flare could be known.
 *
 * It walks the FULL legal path rather than jumping to `submitted`, because `applyTransition`
 * SILENTLY DROPS its patch on an illegal hop: a record that skipped `quoting` would arrive
 * with `steps: []` and every downstream leg assertion would pass vacuously. The throw is the
 * guard that a caller cannot forget.
 */
export function mockInstructionRecord(
  intent: InstructionIntent,
  opts: { now?: number; id?: string } = {},
): OperationRecord<InstructionIntent> {
  const now = opts.now ?? SMART_ACCOUNT_MOCK_EPOCH
  let record = createOperation({
    capability: 'smart-account-instruction',
    network: 114,
    intent,
    now,
    id: opts.id ?? 'sa-mock',
  })
  const hops: readonly [OperationState, Record<string, unknown>?][] = [
    ['quoting', { steps: instructionSpine() }],
    ['ready'],
    ['executing'],
    ['submitted'],
  ]
  for (const [to, patch] of hops) {
    const result = applyTransition(record, patch ? { to, at: now, patch } : { to, at: now })
    if (result.rejection) {
      throw new Error(`mock-smart-accounts: illegal transition ${record.state} -> ${to}`)
    }
    record = result.record
  }
  if (record.state !== 'submitted' || record.steps.length !== 4) {
    throw new Error(`mock-smart-accounts: record stranded at ${record.state}`)
  }
  return record
}

/**
 * The observation feed for one of the two runs, at a chosen point along its four legs. The
 * caller passes this to the REAL `reconcileInstruction`; the mock never advances a record
 * itself.
 *
 * `leg: 'settled'` for the DEPOSIT still reports `instructionExecuted` — the instruction did
 * execute — because that is what the chain says. Whether this kit sent that transaction is
 * `OBSERVED_DEPOSIT.dispatchedByUs`, and a surface that cares must read it there rather than
 * inferring it from the operation reaching `succeeded`.
 */
export function mockObservation(
  run: typeof OBSERVED_TRANSFER | typeof OBSERVED_DEPOSIT,
  leg: 'unpaid' | 'paid' | 'proved' | 'submitted' | 'settled',
): InstructionObservation {
  if (leg === 'unpaid') return {}
  const xrplPayment = {
    transactionId: run.xrplTransactionId,
    // The run's REAL ledger close, read back off the XRP Ledger. It used to be dispatch time
    // minus two minutes with a comment claiming it was the close — a plausible number wearing
    // an observed one's label, which is the exact thing this file exists not to do.
    blockTimestamp: run.xrplCloseUnix,
  }
  if (leg === 'paid') return { xrplPayment }
  if (leg === 'proved') return { xrplPayment, proofRetrieved: true }
  if (leg === 'submitted') {
    return { xrplPayment, proofRetrieved: true, submissionHash: run.dispatchHash }
  }
  return {
    xrplPayment,
    proofRetrieved: true,
    submissionHash: run.dispatchHash,
    instructionExecuted: {
      personalAccount: OBSERVED_ACCOUNT_LIVE.address,
      transactionId: `0x${run.xrplTransactionId.toLowerCase()}`,
      instructionId: run.intent.instructionId,
    },
    dispatchReadSucceeded: true,
    effectObserved: true,
  }
}
