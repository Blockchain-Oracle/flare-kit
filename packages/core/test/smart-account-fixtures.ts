import { mockInstructionRecord } from '../src/mock-smart-accounts.js'
import type { InstructionIntent } from '../src/smart-accounts/plan-types.js'

/**
 * The ONE smart-account op fixture, shared by the lifecycle and mock tests.
 *
 * It is the SHIPPED builder, not a test copy of it. `mockInstructionRecord` walks the full
 * legal path `draft → quoting → ready → executing → submitted` and throws if it did not
 * arrive — which is load-bearing rather than tidy: `draft → executing` is not a legal edge,
 * `applyTransition` DROPS its patch on a rejected hop, and a record that jumped one would
 * strand at `draft` with `steps: []`, making every downstream `steps.every(...)` assertion
 * vacuously true. The M12 review gate found exactly that bug in a hand-built fixture, so this
 * one keeps no second path that could drift from the code under test.
 *
 * The fixture clock stays its own: the lifecycle tests reason about a proof window relative
 * to a round number, and inheriting the mock's real wall-clock epoch would make those
 * assertions read as though they depended on the live run's timing.
 */

const FIXTURE_EPOCH = 1_700_000_000_000

export const TRANSFER_INTENT: InstructionIntent = {
  xrplOwner: 'rGEgtYVznwNWsrtLoT5AWkPS6qyxvxdHio',
  instructionId: 0x01,
  value: 1_000_000n,
  recipient: '0xDddF991858311597bFD3D125cb342a0d4B56ea0a',
}

/** An instruction op whose XRPL payment has been signed and broadcast. */
export function submittedInstructionRecord(
  intent: InstructionIntent = TRANSFER_INTENT,
  opts: { now?: number; id?: string } = {},
) {
  return mockInstructionRecord(intent, {
    now: opts.now ?? FIXTURE_EPOCH,
    id: opts.id ?? 'sa1',
  })
}
