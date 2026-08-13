import { describe, expect, it } from 'vitest'
import {
  type InstructionObservation,
  proofDeadlineMs,
  reconcileInstruction,
} from '../src/smart-accounts/states.js'
import { submittedInstructionRecord } from './smart-account-fixtures.js'

/**
 * The instruction lifecycle. The invariant under test throughout is that `succeeded` is
 * reachable ONLY from the effect being observed — never from the payment landing, the proof
 * retrieving, or the dispatch transaction being mined.
 */

const NOW = 1_700_000_000_000
/** Ledger close time in SECONDS, an hour before `NOW`. */
const PAYMENT_TS = BigInt(Math.floor(NOW / 1000) - 3600)
const COSTON2_WINDOW = 86_400n

const clock = (now = NOW, proofWindowSeconds = COSTON2_WINDOW) => ({ now, proofWindowSeconds })

const PAID: InstructionObservation = {
  xrplPayment: { transactionId: `0x${'ab'.repeat(32)}`, blockTimestamp: PAYMENT_TS },
}
const EXECUTED: InstructionObservation = {
  ...PAID,
  proofRetrieved: true,
  submissionHash: `0x${'cd'.repeat(32)}`,
  instructionExecuted: {
    personalAccount: '0x89023176a776CDB1d339a7649116B1a6f3DeFfcb',
    transactionId: `0x${'ab'.repeat(32)}`,
    instructionId: 0x01,
  },
}

describe('the only route to succeeded', () => {
  it('completes when the dispatch AND its effect are both observed', () => {
    const record = reconcileInstruction(
      submittedInstructionRecord(),
      { ...EXECUTED, effectObserved: true },
      clock(),
    )
    expect(record.state).toBe('succeeded')
    // The M8 lesson: a terminal reconcile must finalize the spine AND clear the descriptor,
    // or a settled op draws as "outcome unknown" while still claiming it waits on somebody.
    expect(record.steps).toHaveLength(4)
    expect(record.steps.every((step) => step.state === 'done')).toBe(true)
    expect(record.awaiting).toBeUndefined()
  })

  it('stays in flight when the controller dispatched but the effect is unconfirmed', () => {
    // The event says the controller dispatched, not that the user's FAsset moved.
    const record = reconcileInstruction(submittedInstructionRecord(), EXECUTED, clock())
    expect(record.state).toBe('awaiting_external')
    expect(record.awaiting?.actor).toBe('flare')
  })

  it('never treats an unlooked-at effect as a failed one', () => {
    const undefinedEffect = reconcileInstruction(submittedInstructionRecord(), EXECUTED, clock())
    const falseEffect = reconcileInstruction(
      submittedInstructionRecord(),
      { ...EXECUTED, effectObserved: false },
      clock(),
    )
    expect(undefinedEffect.state).toBe('awaiting_external')
    expect(falseEffect.state).toBe('awaiting_external')
    expect(undefinedEffect.state).not.toBe('failed')
  })

  it.each([
    ['nothing observed yet', {} as InstructionObservation, 'xrpl'],
    ['the payment validated', PAID, 'fdc'],
    ['the proof was retrieved', { ...PAID, proofRetrieved: true }, 'flare'],
    ['the dispatch was submitted', { ...PAID, proofRetrieved: true, submissionHash: '0xaa' }, 'flare'],
  ])('waits on the right actor once %s', (_what, observation, actor) => {
    const record = reconcileInstruction(submittedInstructionRecord(), observation, clock())
    expect(record.state).toBe('awaiting_external')
    expect(record.awaiting?.actor).toBe(actor)
    expect(record.state).not.toBe('succeeded')
  })
})

describe('the proof window', () => {
  it('is measured from the XRPL block timestamp, not from when we looked', () => {
    expect(proofDeadlineMs(PAID, COSTON2_WINDOW)).toBe(Number(PAYMENT_TS + COSTON2_WINDOW) * 1000)
    // Before the payment lands there is no timestamp to measure from, so there is no
    // deadline to render — and inventing one would mean assuming the payment landed now.
    expect(proofDeadlineMs({}, COSTON2_WINDOW)).toBeUndefined()
  })

  it('expires an undispatched instruction once the window closes', () => {
    const past = NOW + Number(COSTON2_WINDOW) * 1000
    const record = reconcileInstruction(submittedInstructionRecord(), PAID, clock(past))
    expect(record.state).toBe('expired')
    expect(record.awaiting).toBeUndefined()
    // Not `succeeded`, and not silently in-flight forever.
    expect(record.steps.some((step) => step.state === 'failed')).toBe(true)
  })

  it('does not expire an instruction that already dispatched', () => {
    // The window governs whether the controller will ACCEPT a proof. Once it has, a late
    // read must not retroactively declare the instruction dead.
    const past = NOW + Number(COSTON2_WINDOW) * 1000
    const record = reconcileInstruction(
      submittedInstructionRecord(),
      { ...EXECUTED, effectObserved: true },
      clock(past),
    )
    expect(record.state).toBe('succeeded')
  })

  it('uses the network’s own window rather than a hardcoded one', () => {
    // Mainnet's window is 2 hours, Coston2's is 24. A payment an hour old is live on one
    // and dead on the other, and the difference is read, never assumed.
    const mainnetWindow = 7200n
    expect(reconcileInstruction(submittedInstructionRecord(), PAID, clock(NOW, mainnetWindow)).state).toBe(
      'awaiting_external',
    )
    const later = NOW + 2 * 3600 * 1000
    expect(reconcileInstruction(submittedInstructionRecord(), PAID, clock(later, mainnetWindow)).state).toBe(
      'expired',
    )
  })
})

describe('the wait clock', () => {
  it('keeps one leg’s start time across re-reads, and restarts it on a new leg', () => {
    const first = reconcileInstruction(submittedInstructionRecord(), PAID, clock())
    const again = reconcileInstruction(first, PAID, clock(NOW + 60_000))
    expect(again.awaiting?.since).toBe(first.awaiting?.since)

    const nextLeg = reconcileInstruction(
      again,
      { ...PAID, proofRetrieved: true },
      clock(NOW + 120_000),
    )
    expect(nextLeg.awaiting?.actor).toBe('flare')
    expect(nextLeg.awaiting?.since).toBe(NOW + 120_000)
  })

  it('is idempotent — reconciling the same observation twice changes no state', () => {
    const once = reconcileInstruction(submittedInstructionRecord(), EXECUTED, clock())
    const twice = reconcileInstruction(once, EXECUTED, clock())
    expect(twice.state).toBe(once.state)
    expect(twice.awaiting?.actor).toBe(once.awaiting?.actor)
  })
})
