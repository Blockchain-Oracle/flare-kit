import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import { OPERATION_STATES } from '../src/states.js'
import { type OperationStep, applyTransition, createOperation } from '../src/operation.js'
import type { StakeIntent } from '../src/stake-adapter.js'
import type { StakePosition } from '../src/pchain-rpc.js'
import { reconcileStake } from '../src/stake-states.js'

// M11: the durable four-leg stake reconciler. A broadcast `delegate` is only `submitted`;
// the OUTCOME is chain state (the P-chain stake position read back via readStakesOf), not
// the transaction receipt. `succeeded` is entered ONLY when the matching position is
// present on-chain — a submitted delegate the chain does not yet reflect is
// `awaiting_external`/in-flight, NEVER succeeded and NEVER failed. The delayed P→C return
// is the standard M7/M10 delayed shape: awaiting_external (≥14-day lock clock) →
// action_required (unlocked) → succeeded, reusing the SAME canonical state ids.

const NODE = 'NodeID-P7oB2McjBGgW2NXXWVYjV8JEDFoW9xDE5'
const REWARD: Address = '0x00000000000000000000000000000000000000A1'
const NOW = 1_700_000_000
const END = 1_800_000_000 // the stake's on-chain endTime (unix seconds)

const INTENT: StakeIntent = {
  nodeId: NODE,
  amount: 50_000n * 10n ** 18n,
  startTime: BigInt(NOW),
  endTime: BigInt(END),
  rewardAddress: REWARD,
}

const POSITION: StakePosition = {
  nodeId: NODE,
  amount: INTENT.amount,
  startTime: INTENT.startTime,
  endTime: INTENT.endTime,
}

/**
 * Build an op in `submitted` WITH its spine actually attached.
 *
 * NB: `draft → executing` is NOT a legal hop, so the sibling
 * `applyTransition(base, { to:'executing', patch:{ steps } })` idiom silently DROPS its
 * steps patch (`applyTransition` drops the patch on an illegal jump), leaving `steps: []`
 * — which is exactly why step-status assertions can pass vacuously. We walk the LEGAL path
 * draft→quoting→ready→executing→submitted and attach the spine at the first legal hop, so
 * every step-status assertion below is real.
 */
function submittedWith(capability: string, id: string, steps: readonly OperationStep[], now = NOW) {
  const base = createOperation({ capability, network: 114, intent: INTENT, now, id })
  const quoting = applyTransition(base, { to: 'quoting', at: now, patch: { steps: [...steps] } }).record
  const ready = applyTransition(quoting, { to: 'ready', at: now }).record
  const executing = applyTransition(ready, { to: 'executing', at: now }).record
  return applyTransition(executing, { to: 'submitted', at: now }).record
}

/** A stake-in op that has broadcast the delegate leg (state `submitted`, spine present). */
function submittedStakeOp(now = NOW) {
  return submittedWith(
    'staking',
    'stake1',
    [
      { id: 'export', type: 'transfer_to_p', actor: 'your_wallet', state: 'pending', attempts: 0 },
      { id: 'delegate', type: 'delegate', actor: 'your_wallet', state: 'pending', attempts: 0 },
      { id: 'record', type: 'await_stake', actor: 'flare', state: 'pending', attempts: 0 },
    ],
    now,
  )
}

/** A P→C return op (the delayed leg), ready to reconcile against the lock. */
function submittedReturnOp(now = NOW) {
  return submittedWith(
    'staking-return',
    'return1',
    [
      { id: 'return', type: 'transfer_to_c', actor: 'your_wallet', state: 'pending', attempts: 0 },
      { id: 'record', type: 'await_return', actor: 'flare', state: 'pending', attempts: 0 },
    ],
    now,
  )
}

describe('reconcileStake — stake leg: succeeded ONLY from the position read (M11)', () => {
  it('a submitted delegate with no on-chain position stays awaiting_external (actor flare), NEVER succeeded', () => {
    const r = reconcileStake(submittedStakeOp(), { leg: 'stake', now: NOW + 5000, stakePosition: undefined })
    expect(r.state).toBe('awaiting_external')
    expect(r.awaiting?.actor).toBe('flare')
    // The load-bearing honesty: a broadcast delegate is not a confirmed stake.
    expect(r.state).not.toBe('succeeded')
    expect(OPERATION_STATES).toContain(r.state)
  })

  it('reaches succeeded ONLY once the matching position is present, finalizing the spine and clearing the wait', () => {
    const r = reconcileStake(submittedStakeOp(), { leg: 'stake', now: NOW + 8000, stakePosition: POSITION })
    expect(r.state).toBe('succeeded')
    expect(r.awaiting).toBeUndefined()
    expect(r.steps.every((s) => s.state === 'done')).toBe(true)
    expect(OPERATION_STATES).toContain(r.state)
  })

  it('awaiting then present reaches succeeded (idempotent table walk, no lost patch)', () => {
    let op = submittedStakeOp()
    op = reconcileStake(op, { leg: 'stake', now: NOW + 1000, stakePosition: undefined })
    expect(op.state).toBe('awaiting_external')
    op = reconcileStake(op, { leg: 'stake', now: NOW + 2000, stakePosition: POSITION })
    expect(op.state).toBe('succeeded')
    expect(op.steps.every((s) => s.state === 'done')).toBe(true)
  })

  it('preserves the flare wait `since` across repeated awaiting reconciles (same leg)', () => {
    let op = reconcileStake(submittedStakeOp(), { leg: 'stake', now: NOW + 1000, stakePosition: undefined })
    const since = op.awaiting?.since
    op = reconcileStake(op, { leg: 'stake', now: NOW + 9000, stakePosition: undefined })
    expect(op.awaiting?.since).toBe(since)
  })
})

/** The `transfer_to_c` step of a return op — the one whose status must not lie (I1). */
function transferStep(op: ReturnType<typeof submittedReturnOp>) {
  return op.steps.find((s) => s.id === 'return')!
}

describe('reconcileStake — the delayed P→C return leg (M11)', () => {
  it('maps the lock clock → unlocked → returned across the SAME canonical state ids', () => {
    // 1. Locked: the position is present and now < endTime — the ≥14-day value-lock clock.
    const locked = reconcileStake(submittedReturnOp(), {
      leg: 'return',
      now: END - 1_000,
      stakeRead: { status: 'present', position: POSITION },
    })
    expect(locked.state).toBe('awaiting_external')
    expect(OPERATION_STATES).toContain(locked.state)

    // 2. Unlocked: now >= endTime — the return is claimable; the user must sign transferToC.
    const unlocked = reconcileStake(locked, {
      leg: 'return',
      now: END + 10,
      stakeRead: { status: 'present', position: POSITION },
    })
    expect(unlocked.state).toBe('action_required')
    expect(OPERATION_STATES).toContain(unlocked.state)

    // 3. Returned: a SUCCESSFUL read confirms the stake left the P-chain → succeeded.
    const returned = reconcileStake(unlocked, {
      leg: 'return',
      now: END + 20,
      stakeRead: { status: 'absent' },
    })
    expect(returned.state).toBe('succeeded')
    expect(returned.awaiting).toBeUndefined()
    expect(returned.steps.every((s) => s.state === 'done')).toBe(true)
    expect(OPERATION_STATES).toContain(returned.state)
  })

  // I1: the return tx must not be shown as `done` until it actually completes.
  it('keeps transfer_to_c NOT done while locked (nothing has been broadcast)', () => {
    const locked = reconcileStake(submittedReturnOp(), {
      leg: 'return',
      now: END - 500_000,
      stakeRead: { status: 'present', position: POSITION },
    })
    expect(locked.state).toBe('awaiting_external')
    expect(transferStep(locked).state).not.toBe('done')
    expect(transferStep(locked).state).toBe('pending')
    // The lock clock is surfaced as an expected range so a countdown can render.
    expect(locked.awaiting?.expectedRange?.maxMs).toBeGreaterThan(0)
  })

  it('keeps transfer_to_c NOT done while unlocked-and-awaiting-signature (the offered action performs it)', () => {
    const unlocked = reconcileStake(submittedReturnOp(), {
      leg: 'return',
      now: END + 10,
      stakeRead: { status: 'present', position: POSITION },
    })
    expect(unlocked.state).toBe('action_required')
    expect(transferStep(unlocked).state).not.toBe('done')
    // It is the current step, awaiting the user's signature.
    expect(transferStep(unlocked).state).toBe('active')
    // The claimable action that performs the very step is offered.
    expect(unlocked.recovery?.some((r) => r.id === 'return-stake')).toBe(true)
  })

  it('marks transfer_to_c done ONLY at the confirmed-absent terminal', () => {
    const returned = reconcileStake(submittedReturnOp(), {
      leg: 'return',
      now: END + 20,
      stakeRead: { status: 'absent' },
    })
    expect(returned.state).toBe('succeeded')
    expect(transferStep(returned).state).toBe('done')
  })

  // I2(i): an unavailable (thrown) read must never fabricate `succeeded` on silence.
  it('does NOT advance to succeeded on an unavailable (thrown) read — it does not reconcile', () => {
    const locked = reconcileStake(submittedReturnOp(), {
      leg: 'return',
      now: END - 1_000,
      stakeRead: { status: 'present', position: POSITION },
    })
    const stalled = reconcileStake(locked, {
      leg: 'return',
      now: END + 1_000,
      stakeRead: { status: 'unavailable' },
    })
    expect(stalled.state).not.toBe('succeeded')
    // Left exactly where it was — a thrown read is "do not reconcile", not a terminal.
    expect(stalled.state).toBe('awaiting_external')
    expect(stalled).toBe(locked)
  })

  it('adds no new state id — every reconciled state is one of OPERATION_STATES', () => {
    const states = [
      reconcileStake(submittedReturnOp(), { leg: 'return', now: END - 1, stakeRead: { status: 'present', position: POSITION } }).state,
      reconcileStake(submittedReturnOp(), { leg: 'return', now: END + 1, stakeRead: { status: 'present', position: POSITION } }).state,
      reconcileStake(submittedReturnOp(), { leg: 'return', now: END + 1, stakeRead: { status: 'absent' } }).state,
    ]
    for (const state of states) expect(OPERATION_STATES).toContain(state)
  })
})

// I2(ii): the leg must match the operation's capability, so a stake-in op fed a
// `leg:'return'` read (whose terminal is `succeeded`) can never jump to success.
describe('reconcileStake — leg/capability guard (M11)', () => {
  it('a stake-in op fed a leg:return absent read is a no-op, NEVER succeeded', () => {
    const stakeIn = submittedStakeOp() // capability 'staking'
    const result = reconcileStake(stakeIn, { leg: 'return', now: END + 1, stakeRead: { status: 'absent' } })
    expect(result.state).not.toBe('succeeded')
    expect(result.state).toBe('submitted') // untouched
    expect(result).toBe(stakeIn)
  })

  it('a return op fed a leg:stake present read is a no-op (guard is symmetric)', () => {
    const ret = submittedReturnOp() // capability 'staking-return'
    const result = reconcileStake(ret, { leg: 'stake', now: NOW, stakePosition: POSITION })
    expect(result).toBe(ret)
  })
})
