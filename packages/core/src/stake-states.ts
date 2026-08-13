// packages/core/src/stake-states.ts
import type { OperationRecord } from './operation.js'
import { advance, reconcileTo, waitSince } from './reconcile.js'
import type { StakeIntent } from './stake-adapter.js'
import type { StakePosition } from './pchain-rpc.js'

/**
 * The durable M11 stake reconciler. Flare staking is a cross-substrate round trip — a
 * broadcast `transferToP` + `AddPermissionlessDelegator` is only `submitted`; the OUTCOME
 * is P-chain state (the stake position read back via `readStakesOf`), not a transaction
 * receipt — so on app open the hook re-reads the position and this function advances the
 * operation. There is no Resume button.
 *
 * It reuses the EXISTING canonical states (no new identifier, R-LIFE-001 — the same call
 * the M7 delayed vault claim and M10 delegation reconciler made). Every hop walks the
 * table via `reconcileTo` — which silently drops nothing on an illegal jump — and a
 * terminal advances the whole spine `done` AND clears `awaiting`, so a settled op stops
 * claiming it waits on somebody.
 *
 * Two legs, one honesty rule:
 *
 *  - The STAKE-IN leg reaches `succeeded` ONLY when `readStakesOf` shows the matching
 *    position on-chain. A submitted delegate the chain does not yet reflect is
 *    `awaiting_external` (actor `flare`), NEVER `succeeded` from the submission alone and
 *    NEVER `failed` from a not-yet-reflecting read (an unknown outcome is not a failure).
 *    The hook matches the intent against `readStakesOf` and passes the matched position (or
 *    `undefined` — the honest in-flight `[]`) as `reads.stakePosition`.
 *
 *  - The delayed P→C RETURN leg is the M7/M10 delayed shape: `awaiting_external` (the
 *    ≥14-day lock clock, `now < endTime`, nothing broadcast) → `action_required` (unlocked,
 *    `now ≥ endTime` — the user signs `transferToC`) → `succeeded`. Its `succeeded` is
 *    entered ONLY from a CONFIRMED-ABSENT read (`readStakesOf` returned successfully and the
 *    stake is gone), never from an ambiguous `undefined`: `readStakesOf` THROWS on a
 *    transport fault, so a pre-collapsed `undefined` could fabricate `succeeded` with funds
 *    still on the P-chain. The `transfer_to_c` step is only marked `done` at that confirmed
 *    terminal — never while locked or merely unlocked-and-awaiting-signature.
 */

/**
 * A return-leg stake read, three-way ON PURPOSE (the return terminal is the unsafe
 * direction). `present` still-staked; `absent` is a SUCCESSFUL `readStakesOf` that no
 * longer contains the stake (the confirmed "left the P-chain" signal — the ONLY path to
 * `succeeded`); `unavailable` is a THROWN/unreachable read (`RPC_UNREACHABLE` /
 * `PCHAIN_RPC_ERROR`) → do NOT reconcile, never `succeeded` on silence.
 *
 * `absent` is a deliberately explicit, swappable signal: T6 can STRENGTHEN the return
 * terminal to a C-chain balance increase (the true "landed" proof) by computing `absent`
 * from that stronger check — this reconciler needs no change.
 */
export type StakeReturnRead =
  | { readonly status: 'present'; readonly position: StakePosition }
  | { readonly status: 'absent' }
  | { readonly status: 'unavailable' }

/**
 * The reconcile snapshot: which leg of the round trip is being reconciled, plus its read.
 * `now` is unix seconds — it timestamps the record and, on the return leg, drives the lock
 * clock against the position's `endTime`.
 *
 * The two legs carry DIFFERENT read contracts on purpose. The stake-in leg's `stakePosition`
 * is `StakePosition | undefined`, where `undefined` is the honest in-flight `[]` — a SAFE
 * `undefined` that maps to `awaiting_external`, never `succeeded`. The return leg's read is
 * the three-way `StakeReturnRead`, because its terminal IS `succeeded`.
 */
export type StakeReads =
  | { readonly leg: 'stake'; readonly now: number; readonly stakePosition: StakePosition | undefined }
  | { readonly leg: 'return'; readonly now: number; readonly stakeRead: StakeReturnRead }

/** The capability of a stake-in op and of the delayed P→C return op. The guard pins each. */
export const STAKE_CAPABILITY = 'staking'
export const STAKE_RETURN_CAPABILITY = 'staking-return'

/** A stake operation record — the canonical record specialised to a `StakeIntent`. */
export type StakeOperation<Q = unknown, P = unknown> = OperationRecord<StakeIntent, Q, P>

export function reconcileStake<I, Q, P>(
  record: OperationRecord<I, Q, P>,
  reads: StakeReads,
): OperationRecord<I, Q, P> {
  // Guard: the leg must match the operation's capability, so a stake-in op fed a
  // `leg:'return'` read (whose terminal is `succeeded`) can never jump to success on the
  // wrong contract, and vice versa. A mismatch is a no-op — the record is left untouched.
  const expected = reads.leg === 'return' ? STAKE_RETURN_CAPABILITY : STAKE_CAPABILITY
  if (record.capability !== expected) return record

  return reads.leg === 'return'
    ? reconcileReturn(record, reads.stakeRead, reads.now)
    : reconcileStakeIn(record, reads.stakePosition, reads.now)
}

/**
 * The stake-in leg: `succeeded` ONLY from the on-chain position read; absent is in-flight.
 */
function reconcileStakeIn<I, Q, P>(
  record: OperationRecord<I, Q, P>,
  position: StakePosition | undefined,
  now: number,
): OperationRecord<I, Q, P> {
  const n = record.steps.length
  if (position !== undefined) {
    return reconcileTo(record, 'succeeded', now, { steps: advance(record, now, n, 'done'), awaiting: undefined })
  }
  return reconcileTo(record, 'awaiting_external', now, {
    steps: advance(record, now, Math.max(0, n - 1), 'active'),
    awaiting: {
      actor: 'flare',
      reason: 'Flare is recording your stake on the P-chain.',
      since: waitSince(record, now, 'flare'),
    },
  })
}

/**
 * The delayed P→C return leg: locked (`awaiting_external`) → unlocked (`action_required`)
 * → returned (`succeeded`). The `transfer_to_c` step is only marked `done` at the confirmed
 * terminal — while locked or awaiting the user's signature it stays `pending`/`active`,
 * because no return transaction has completed (I1).
 */
function reconcileReturn<I, Q, P>(
  record: OperationRecord<I, Q, P>,
  read: StakeReturnRead,
  now: number,
): OperationRecord<I, Q, P> {
  const n = record.steps.length

  // Unavailable (the read THREW): an unknown outcome is never `succeeded`. Do NOT
  // reconcile — leave the operation exactly where it was rather than guess it returned.
  if (read.status === 'unavailable') return record

  // Terminal: a SUCCESSFUL read confirms the stake left the P-chain — the return landed.
  // The ONLY path to `succeeded` here; only now is `transfer_to_c` genuinely `done`.
  if (read.status === 'absent') {
    return reconcileTo(record, 'succeeded', now, { steps: advance(record, now, n, 'done'), awaiting: undefined })
  }

  const { position } = read
  // Unlocked: the ≥14-day lock has expired — the return is claimable; the user signs it.
  // `transfer_to_c` is the CURRENT step (`active`), never `done` — the offered action is
  // what performs it.
  if (BigInt(now) >= position.endTime) {
    return reconcileTo(record, 'action_required', now, {
      steps: advance(record, now, 0, 'active'),
      awaiting: {
        actor: 'you',
        reason: 'Your stake has unlocked — return it from the P-chain to the C-chain.',
        since: waitSince(record, now, 'you'),
      },
      recovery: [
        {
          id: 'return-stake',
          label: 'Return stake',
          effect: 'Exports your unlocked stake from the P-chain and imports it back to the C-chain.',
          preconditions: [],
          signs: true,
          broadcasts: true,
          // Settles an existing, matured commitment — it moves no NEW value.
          movesNewValue: false,
          nextState: 'executing',
        },
      ],
    })
  }

  // Locked: the ≥14-day value-lock clock is still running. Nothing has been broadcast, so
  // NO step patch is applied — every step stays `pending` (the wait is external, on the
  // lock clock, not on a spine step). Marking `transfer_to_c` anything here would assert a
  // return that has not happened (I1).
  return reconcileTo(record, 'awaiting_external', now, {
    awaiting: {
      actor: 'flare',
      reason: 'Your stake is locked on the P-chain until it matures.',
      since: waitSince(record, now, 'flare'),
      expectedRange: { minMs: 0, maxMs: Math.max(0, (Number(position.endTime) - now) * 1000) },
    },
  })
}
