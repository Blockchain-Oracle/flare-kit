import {
  type OperationRecord,
  type OperationState,
  applyTransition,
  createOperation,
} from '../src/operation.js'
import type { InstructionIntent } from '../src/smart-accounts/plan-types.js'

/**
 * The ONE smart-account op fixture, shared by the lifecycle and mock tests.
 *
 * It walks the FULL legal path `draft → quoting → ready → executing → submitted`, and then
 * ASSERTS it arrived. That is load-bearing rather than tidy: `draft → executing` is not a
 * legal edge, `applyTransition` DROPS its patch on a rejected hop, and a fixture that
 * jumped one would strand at `draft` with `steps: []` — making every downstream
 * `steps.every(...)` assertion vacuously true, including the ones written specifically to
 * guard a dropped patch. `governance-fixtures.ts` is the repair template this follows; the
 * M12 review gate found that exact bug, and `delegation-states.test.ts` still carries it.
 */

function assertTransition<I>(
  record: OperationRecord<I>,
  to: OperationState,
  at: number,
  patch?: Record<string, unknown>,
) {
  const result = applyTransition(record, patch ? { to, at, patch } : { to, at })
  if (result.rejection) {
    throw new Error(`smart-account fixture: illegal transition ${record.state} -> ${to} (${result.rejection})`)
  }
  return result.record
}

/**
 * The four-leg spine an instruction plan produces: the XRPL payment the user signs, then
 * one record step per external leg the kit waits on.
 */
function instructionSpine() {
  return [
    { id: 'xrpl-payment', type: 'pay_operator', actor: 'your_wallet' as const, state: 'pending' as const, attempts: 0 },
    { id: 'attestation', type: 'await_fdc_proof', actor: 'fdc' as const, state: 'pending' as const, attempts: 0 },
    { id: 'dispatch', type: 'execute_instruction', actor: 'flare' as const, state: 'pending' as const, attempts: 0 },
    { id: 'effect', type: 'await_instruction_effect', actor: 'flare' as const, state: 'pending' as const, attempts: 0 },
  ]
}

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
  const now = opts.now ?? 1_700_000_000_000
  const base = createOperation({
    capability: 'smart-account-instruction',
    network: 114,
    intent,
    now,
    id: opts.id ?? 'sa1',
  })
  const quoting = assertTransition(base, 'quoting', now, { steps: instructionSpine() })
  const ready = assertTransition(quoting, 'ready', now)
  const executing = assertTransition(ready, 'executing', now)
  const submitted = assertTransition(executing, 'submitted', now)
  if (submitted.state !== 'submitted' || submitted.steps.length !== 4) {
    throw new Error(
      `smart-account fixture stranded at ${submitted.state} with ${submitted.steps.length} steps`,
    )
  }
  return submitted
}
