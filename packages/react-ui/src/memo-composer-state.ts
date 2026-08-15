// packages/react-ui/src/memo-composer-state.ts
import type { MemoPlanResult, MemoPlanWarning, MemoRefusalCode, OperationRecord } from '@flare-kit/core'
import type { CardNote, Cta } from './card-chrome.js'

/**
 * How a memo plan becomes the MemoInstructionComposer's chrome (M14-R11).
 *
 * The same seam every `*-card-state.ts` sits on, and carrying a rule M13's version did not
 * have to: on this flow a refusal is not merely a saved mistake, it is a SAVED PAYMENT. The
 * dispatch is unguarded — no `try/catch` anywhere on the path — so any opcode revert unwinds
 * the mint while the XRPL payment stays settled at the Core Vault, unminted and unrefunded.
 * Two of the codes below are worse than that again:
 *
 * - `payment_too_small` is a TOTAL, UNRECOVERABLE BURN. The protocol converts a below-minimum
 *   payment entirely into fee and mints nothing to the payer. No opcode recovers it, so the
 *   note says so plainly rather than suggesting a retry.
 * - `destination_tag` has no override anywhere in this surface, because a registered tag
 *   redirects the whole mint to the tag holder and discards the memo.
 *
 * Every other refusal points at what to change while changing it is still free.
 */

/** Which evidence sits beside which leg of the four-step memo spine (`memoSpine`). */
export const MEMO_STEP_EVIDENCE: Record<string, readonly string[]> = {
  'xrpl-payment': ['xrpl_destination', 'payment_reference', 'xrpl_tx'],
  attestation: ['fdc_round', 'fdc_request', 'fdc_proof'],
  relay: ['flare_tx'],
  effect: ['recipient_address'],
}

const REFUSAL_NOTE: Record<MemoRefusalCode, { title: string; body: string; tone: CardNote['tone'] }> =
  {
    unverified: {
      title: 'Not built for this network',
      body:
        'No live memo round trip has been verified here, so the kit will not ask you to sign an ' +
        'XRPL payment against it. The reads above are real; the write is declared unbuilt.',
      tone: 'info',
    },
    account_unknown: {
      title: 'The personal account could not be derived',
      body:
        'Without the account address there is no sender to build the operation for, and an ' +
        'operation naming the wrong sender reverts after the payment has settled.',
      tone: 'att',
    },
    destination_tag: {
      title: 'This payment must carry no destination tag',
      body:
        'A registered tag redirects the entire mint to the tag holder and discards the memo — ' +
        'the protocol’s own comment says it ignores memo data in that case. Tag 0 is not a safe ' +
        'default; tags start at 0 and anyone can reserve one. There is no override for this.',
      tone: 'att',
    },
    nonce_unreadable: {
      title: 'The account’s nonce could not be read',
      body:
        'A guessed nonce reverts InvalidNonce after the payment has settled, so the kit will not ' +
        'guess one.',
      tone: 'att',
    },
    nonce_mismatch: {
      title: 'The nonce has moved',
      body:
        'This operation was built against an earlier nonce. Two payments sharing one nonce read ' +
        'means the first to execute wins and the second is refused with its XRP already spent.',
      tone: 'att',
    },
    payment_too_small: {
      title: 'This payment would be burned entirely',
      body:
        'Below the minimum minting fee the protocol converts the whole payment into fee and mints ' +
        'nothing to you. The loss is total and no recovery opcode reaches it, which is why this ' +
        'is a hard block and not a warning.',
      tone: 'att',
    },
    executor_fee_excessive: {
      title: 'The memo would overpay whoever relays',
      body:
        'The chain’s only check is that the mint covers the fee, so a memo may legally assign the ' +
        'entire mint to the relayer. This kit clamps it to the deployment’s own executor fee.',
      tone: 'att',
    },
    executor_fee_unaffordable: {
      title: 'The mint would not cover the memo’s executor fee',
      body:
        'What reaches the controller after the minting fee is less than the memo promises the ' +
        'relayer, which reverts after the payment has settled.',
      tone: 'att',
    },
    memo_too_large: {
      title: 'This operation does not fit an XRPL memo',
      body:
        'Even committed to by hash it exceeds the ledger’s memo ceiling. Nothing on chain checks ' +
        'the size, so an over-long memo becomes a spent payment rather than a rejection.',
      tone: 'att',
    },
    already_dispatched: {
      title: 'This payment has already dispatched',
      body:
        'The controller has seen this transaction id. Paying again would be a NEW payment, not a ' +
        'retry of this one.',
      tone: 'att',
    },
    simulation_reverted: {
      title: 'The inner call reverts when simulated now',
      body:
        'The simulation exists to move exactly this revert from after settlement to before ' +
        'signing. One case it gets wrong in the safe direction: it runs against your account as ' +
        'it stands NOW, before this payment mints, while on chain the credit lands before the ' +
        'instruction runs — so an operation that spends the mint it arrives with fails here and ' +
        'would have succeeded.',
      tone: 'att',
    },
    no_calls: {
      title: 'This operation does nothing',
      body: 'A user operation with no calls would pay minting fees to execute an empty batch.',
      tone: 'info',
    },
  }

export function memoRefusalNote(code: MemoRefusalCode, message: string): CardNote {
  const copy = REFUSAL_NOTE[code]
  // The planner's own message carries the specific half — the exact minimum, the two nonces,
  // the revert reason. Dropping it for tidy generic copy takes the actionable detail away.
  return { tone: copy.tone, title: copy.title, body: `${copy.body} ${message}` }
}

const WARNING_TITLE: Record<MemoPlanWarning['code'], string> = {
  replay_unknown: 'Replay state unknown',
  not_simulated: 'The inner call was not simulated',
  payload_public: 'This memo is readable by anyone',
  executor_pinned: 'An executor is pinned on this account',
}

/**
 * A warning is NOT a refusal. Each is something the planner could not establish, or a real
 * consequence the user may accept — refusing on either would assert something the kit does not
 * know, or make the decision for someone entitled to make it.
 *
 * `payload_public` is the one that is neither a gap nor a risk to the money: an inline `0xFF`
 * memo carries the operation's target, value and calldata in the clear on a public ledger.
 * That is a privacy fact, and it is stated because a user cannot un-publish it afterwards.
 */
export function memoWarningNote(warning: MemoPlanWarning): CardNote {
  return { tone: 'info', title: WARNING_TITLE[warning.code], body: warning.message }
}

/**
 * The one honest sentence about the whole flow, shown wherever a plan is.
 *
 * It is not decoration and it is not a disclaimer. Every path out of this surface — the
 * instruction itself and all five recoveries — is an XRPL payment that costs fees and mints
 * FAsset. There is no free cancel anywhere on this flow, and a surface implying one would
 * misrepresent what the user is about to spend.
 */
export const NO_FREE_CANCEL: CardNote = {
  tone: 'att',
  title: 'Every step here is a real payment',
  body:
    'This instruction travels inside a direct mint, so approving it sends XRP that mints FAsset ' +
    'and pays fees. If it goes wrong, the fix is another payment — there is no cancel on this ' +
    'flow that costs nothing.',
}

export function ctaForMemo(input: {
  readonly planResult: MemoPlanResult | undefined
  readonly record: OperationRecord | undefined
  /** `false` when the fee settings could not be read — no plan can be built at all. */
  readonly feesRead: boolean
}): Cta {
  const { planResult, record } = input
  if (record) {
    switch (record.state) {
      case 'succeeded':
        return { label: 'Instruction executed', disabled: true }
      case 'failed':
        // Reached only by the burn, which is terminal. Never labelled "Retry": there is
        // nothing to retry and the money is gone.
        return { label: 'Payment consumed', disabled: true }
      case 'awaiting_external':
      case 'submitted':
      case 'executing':
      case 'confirming':
        return { label: 'In flight…', disabled: true }
      default:
        break
    }
  }
  if (!input.feesRead) return { label: 'Fees unavailable', disabled: true }
  if (!planResult) return { label: 'Build an operation', disabled: true }
  if (!planResult.ok) {
    return planResult.refusal.code === 'unverified'
      ? { label: 'Not available here', disabled: true }
      : { label: 'Cannot send this', disabled: true }
  }
  // The kit never holds an XRPL seed. The affordance names who signs: the host's XRPL wallet.
  return { label: 'Sign the XRPL payment', disabled: false }
}
