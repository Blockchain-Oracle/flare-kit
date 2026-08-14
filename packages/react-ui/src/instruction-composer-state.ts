// packages/react-ui/src/instruction-composer-state.ts
import type { InstructionPlanResult, OperationRecord, PlanWarning, RefusalCode } from '@flare-kit/core'
import type { CardNote, Cta } from './card-chrome.js'

/**
 * How an instruction plan and its record become the InstructionComposer's chrome (M13-R10).
 *
 * Split from the composer at the seam every card-state file sits on, and carrying the two
 * rules this surface exists to hold:
 *
 * 1. **A refusal is copy, not an error toast.** Each `RefusalCode` names a revert the
 *    controller would raise AFTER the XRP reached the operator's wallet, so the note says
 *    what would have gone wrong and what to change — before anything is signed.
 * 2. **A dead operation gets no retry affordance.** Past the proof window the instruction can
 *    never execute while the XRP is already spent, so `expired` yields a CTA that is disabled
 *    with a terminal word, and the composer states that paying again is a NEW payment. A
 *    "Retry" button here is `R-SA-008`'s named failure mode.
 */

/** Which evidence sits beside which leg of the four-step instruction spine. */
export const INSTRUCTION_STEP_EVIDENCE: Record<string, readonly string[]> = {
  'xrpl-payment': ['xrpl_destination', 'payment_reference', 'xrpl_tx'],
  attestation: ['fdc_round', 'fdc_request', 'fdc_proof'],
  dispatch: ['flare_tx'],
  effect: ['recipient_address'],
}

const REFUSAL_NOTE: Record<RefusalCode, { title: string; body: string; tone: CardNote['tone'] }> = {
  unverified: {
    title: 'Not built for this network',
    body:
      'No live instruction round trip has been verified here, so the kit will not ask you to ' +
      'sign an XRPL payment against it. The reads above are real; the write is declared unbuilt.',
    tone: 'info',
  },
  deployment_unreadable: {
    title: 'The deployment could not be read',
    body:
      'The controller’s operator wallets, fees and window are unknown right now, and a plan ' +
      'built on guesses at those would send a real payment to the wrong place.',
    tone: 'att',
  },
  unknown_instruction: {
    title: 'Instruction not recognised',
    body: 'This kit cannot build a payment reference for that instruction id.',
    tone: 'info',
  },
  not_composable: {
    title: 'Not composable here',
    body:
      'The catalogue read this deployment and this instruction is not one it can serve. The ' +
      'catalogue row states why.',
    tone: 'info',
  },
  no_operator_wallet: {
    title: 'No operator wallet registered',
    body:
      'The controller lists no XRPL wallet to pay, so there is no destination a payment could ' +
      'reach. This is a deployment gap, not something a different amount fixes.',
    tone: 'att',
  },
  fee_unmet: {
    title: 'Below the instruction fee',
    body:
      'The payment would not cover this instruction’s fee, so the controller would refuse the ' +
      'proof — with the XRP already at the operator.',
    tone: 'att',
  },
  fee_unreadable: {
    title: 'The fee could not be read',
    body:
      'This instruction’s fee did not read, and the default is a DIFFERENT number on a live ' +
      'deployment. Quoting the default could leave you hundreds of thousands of drops short of ' +
      'what the controller requires.',
    tone: 'att',
  },
  paused: {
    title: 'The controller is paused',
    body:
      'Every dispatch entry point refuses while it is paused. A payment made now could not be ' +
      'executed until it resumes — and the proof window keeps running.',
    tone: 'att',
  },
  executor_fee_unreadable: {
    title: 'The executor fee could not be read',
    body:
      'A redeem must carry at least the executor fee as value, and that fee did not read. ' +
      'Dispatching without it can never succeed.',
    tone: 'att',
  },
  vault_not_registered: {
    title: 'Vault not registered on this controller',
    body:
      'Vault ids come from the CONTROLLER, not from the kit’s own vault registry — on this ' +
      'network the two disagree, so a kit vault id here would deposit somewhere else.',
    tone: 'att',
  },
  vault_type_mismatch: {
    title: 'Wrong vault type for this instruction',
    body: 'The controller would revert with InvalidInstructionType after the payment landed.',
    tone: 'att',
  },
  agent_vault_not_registered: {
    title: 'Agent vault not registered',
    body: 'This controller does not list that agent vault, so the instruction could not dispatch.',
    tone: 'att',
  },
  recipient_unfunded: {
    title: 'The account cannot cover this',
    body:
      'The personal account holds less than this instruction moves. The inner call would revert ' +
      'and roll the whole instruction back, with the payment spent.',
    tone: 'att',
  },
  already_dispatched: {
    title: 'This payment has already dispatched',
    body:
      'The controller has seen this transaction id. Paying again would be a NEW payment, not a ' +
      'retry of this one.',
    tone: 'att',
  },
  invalid_reference: {
    title: 'The reference cannot be encoded',
    body: 'The parser’s own rules reject these values, so no valid 32-byte memo exists for them.',
    tone: 'att',
  },
}

export function refusalNote(code: RefusalCode, message: string): CardNote {
  const copy = REFUSAL_NOTE[code]
  // The planner's own message is the specific half — it names the vault id, the amount, the
  // balance. Dropping it for tidy generic copy would take the actionable detail away.
  return { tone: copy.tone, title: copy.title, body: `${copy.body} ${message}` }
}

const WARNING_TITLE: Record<PlanWarning['code'], string> = {
  replay_unknown: 'Replay state unknown',
  balance_unknown: 'Balance could not be read',
  balance_not_read: 'Balance not read',
  balance_not_comparable: 'Balance not comparable',
  account_undeployed: 'The account does not exist yet',
  deployment_state_unknown: 'Deployment state unknown',
}

/**
 * A warning is NOT a refusal. Each of these is something the planner could not establish, and
 * refusing on it would assert something the kit does not know — so it is shown before signing
 * and the decision stays the user's.
 */
export function warningNote(warning: PlanWarning): CardNote {
  return { tone: 'info', title: WARNING_TITLE[warning.code], body: warning.message }
}

/** The terminal expiry copy. It states where the funds are; it never offers a retry. */
export const EXPIRY_NOTE: CardNote = {
  tone: 'att',
  title: 'The proof window has closed',
  body:
    'Past this deadline the controller refuses the proof forever, so this instruction can never ' +
    'execute. Your XRP is at the operator’s wallet — it did not come back and this operation ' +
    'cannot be retried. Composing this instruction again means making a NEW payment.',
}

export function ctaForInstruction(input: {
  readonly planResult: InstructionPlanResult | undefined
  readonly record: OperationRecord | undefined
}): Cta {
  const { planResult, record } = input
  if (record) {
    switch (record.state) {
      case 'expired':
        // Deliberately not "Retry" and deliberately disabled: the operation is dead.
        return { label: 'Window closed', disabled: true }
      case 'succeeded':
        return { label: 'Instruction executed', disabled: true }
      case 'failed':
        return { label: 'Failed', disabled: true }
      case 'awaiting_external':
      case 'submitted':
      case 'executing':
      case 'confirming':
        return { label: 'In flight…', disabled: true }
      default:
        break
    }
  }
  if (!planResult) return { label: 'Choose an instruction', disabled: true }
  if (!planResult.ok) {
    return planResult.refusal.code === 'unverified'
      ? { label: 'Not available here', disabled: true }
      : { label: 'Cannot compose this', disabled: true }
  }
  // The kit never holds an XRPL seed, so the affordance is honest about who signs: the host's
  // XRPL wallet does, and this button hands the built payment to it.
  return { label: 'Sign the XRPL payment', disabled: false }
}
