import {
  type MemoHeader,
  encodeIgnoreMemo,
  encodeRemoveExecutor,
  encodeReplacementFee,
  encodeSetExecutor,
  encodeSetNonce,
} from './memo.js'

/**
 * The five recovery opcodes, as first-class operations (M14-R9).
 *
 * They exist because of one asymmetry: `executeDirectMinting` is atomic and the XRPL payment
 * is not. Any revert inside `handleMintedFAssets` unwinds the mint AND the memo, while the XRP
 * stays settled at the Core Vault — unminted, unrefunded, and stuck until the user acts
 * (`3-custom-instruction.mdx:199-204`).
 *
 * THERE IS NO FREE CANCEL. Every recovery is itself an XRPL payment that pays fees and mints a
 * little FAsset, and a surface that implies otherwise is lying about what the user is about to
 * spend. Each plan below carries that in its notes rather than leaving it to the UI.
 *
 * `0xE0` is the one that matters most: `ignoreMemo` is checked BEFORE any memo validation
 * (`MemoInstructionsFacet.sol:52-61`), so it is the only thing that works on a memo too
 * malformed to parse — the contract's own comment lists "length < 6, bad instruction ID,
 * malformed UserOp".
 */

export type MemoRecoveryKind =
  | 'skip-memo'
  | 'fast-forward-nonce'
  | 'replacement-fee'
  | 'pin-executor'
  | 'unpin-executor'

export type MemoRecoveryRefusalCode =
  | 'already_used'
  | 'used_state_unknown'
  | 'nonce_not_greater'
  | 'nonce_jump_too_large'
  | 'fee_too_large'
  | 'invalid_executor'

export interface MemoRecoveryRefusal {
  readonly code: MemoRecoveryRefusalCode
  readonly message: string
}

export interface MemoRecoveryPlan {
  readonly kind: MemoRecoveryKind
  readonly memo: `0x${string}`
  /** What the user must know before signing. Never decoration. */
  readonly notes: readonly string[]
}

export type MemoRecoveryResult =
  | { readonly ok: true; readonly plan: MemoRecoveryPlan }
  | { readonly ok: false; readonly refusal: MemoRecoveryRefusal }

export type MemoRecoveryInput = MemoHeader &
  (
    | {
        readonly kind: 'skip-memo'
        readonly targetTransactionId: string
        /** From `isTransactionIdUsed`. `undefined` is unread and never read as `false`. */
        readonly stuckIdUsed: boolean | undefined
      }
    | { readonly kind: 'fast-forward-nonce'; readonly currentNonce: bigint; readonly newNonce: bigint }
    | { readonly kind: 'replacement-fee'; readonly targetTransactionId: string; readonly newFee: bigint }
    | { readonly kind: 'pin-executor'; readonly executor: string }
    | { readonly kind: 'unpin-executor' }
  )

const refuse = (code: MemoRecoveryRefusalCode, message: string): MemoRecoveryResult => ({
  ok: false,
  refusal: { code, message },
})

/** Every recovery costs a payment. Said once, here, so no surface has to remember. */
const COSTS_A_PAYMENT =
  'This recovery is itself an XRPL payment: it pays the ledger and minting fees and mints a ' +
  'small amount of FAsset. There is no free cancel.'

/** The protocol's own ceiling on a single nonce jump. */
const MAX_NONCE_JUMP = 2n ** 32n - 1n

export function planMemoRecovery(input: MemoRecoveryInput): MemoRecoveryResult {
  switch (input.kind) {
    case 'skip-memo': {
      if (input.stuckIdUsed === undefined) {
        return refuse(
          'used_state_unknown',
          'Whether the stuck payment has already been consumed could not be read. Sending this ' +
            'without knowing risks paying for a recovery that has nothing left to recover.',
        )
      }
      if (input.stuckIdUsed) {
        return refuse(
          'already_used',
          'That payment has already been consumed, so there is no memo left to skip. Skipping ' +
            'now would spend a second payment for nothing.',
        )
      }
      return {
        ok: true,
        plan: {
          kind: input.kind,
          memo: encodeIgnoreMemo(input),
          notes: [
            'The stuck payment can then be resubmitted and will mint FAsset to your account ' +
              'WITHOUT running its original instruction.',
            'This recovers FAsset on Flare — not the XRP on the XRP Ledger, which is already spent.',
            'The recovery payment must itself mint something: a fee-only direct mint reverts.',
            COSTS_A_PAYMENT,
          ],
        },
      }
    }

    case 'fast-forward-nonce': {
      if (input.newNonce <= input.currentNonce) {
        return refuse(
          'nonce_not_greater',
          `The new nonce must be strictly greater than the current ${input.currentNonce}; the ` +
            'controller refuses anything else.',
        )
      }
      if (input.newNonce - input.currentNonce > MAX_NONCE_JUMP) {
        return refuse(
          'nonce_jump_too_large',
          'A single jump may not exceed 2^32 - 1; the controller reverts InvalidNonceIncrease.',
        )
      }
      return {
        ok: true,
        plan: {
          kind: input.kind,
          memo: encodeSetNonce(input),
          notes: [
            'This moves the account past an abandoned nonce. It does NOT recover a stuck ' +
              'payment — if one was never minted, skip its memo first.',
            COSTS_A_PAYMENT,
          ],
        },
      }
    }

    case 'replacement-fee': {
      // The controller stores `newFee + 1` so 0 can mean "unset", under checked arithmetic.
      if (input.newFee > 2n ** 64n - 2n) {
        return refuse(
          'fee_too_large',
          'The replacement fee must be at most 2^64 - 2; the controller stores it plus one and ' +
            'the addition would overflow.',
        )
      }
      return {
        ok: true,
        plan: {
          kind: input.kind,
          memo: encodeReplacementFee(input),
          notes: [
            'This re-prices a payment nobody will relay. It applies ONCE — the controller ' +
              'consumes the override the first time it is used.',
            'The chain offers no way to read a pending override back, so this cannot be ' +
              'confirmed as still outstanding once set.',
            COSTS_A_PAYMENT,
          ],
        },
      }
    }

    case 'pin-executor': {
      if (/^0x0{40}$/i.test(input.executor)) {
        return refuse('invalid_executor', 'The controller rejects the zero address as an executor.')
      }
      return {
        ok: true,
        plan: {
          kind: input.kind,
          memo: encodeSetExecutor(input),
          notes: [
            'Once pinned, ONLY this executor can deliver instructions to your account — and the ' +
              'restriction applies to plain, no-memo mints as well, because only the pin and ' +
              'unpin memos bypass it.',
            'If that executor stops relaying, mints to this account are blocked until you send ' +
              'an unpin payment. Nothing else clears it.',
            COSTS_A_PAYMENT,
          ],
        },
      }
    }

    case 'unpin-executor':
      return {
        ok: true,
        plan: {
          kind: input.kind,
          memo: encodeRemoveExecutor(input),
          notes: [
            'This clears the pin and is deliberately exempt from the executor check, so it ' +
              'works even when the pinned executor has gone dark.',
            COSTS_A_PAYMENT,
          ],
        },
      }
  }
}

/**
 * Which recoveries to offer, in order.
 *
 * The ordering is a protocol rule, not a preference: if the stuck payment never minted, its
 * memo must be skipped FIRST. Fast-forwarding the nonce first abandons the payment — `0xE0`
 * recovers the money and `0xE1` only tidies up the nonce afterwards.
 */
export function memoRecoveryOrderFor(state: { readonly stuckPaymentMinted: boolean }): MemoRecoveryKind[] {
  if (!state.stuckPaymentMinted) {
    return ['skip-memo', 'fast-forward-nonce', 'replacement-fee', 'pin-executor', 'unpin-executor']
  }
  // Nothing left to skip — offering it would invite a payment that recovers nothing.
  return ['fast-forward-nonce', 'replacement-fee', 'pin-executor', 'unpin-executor']
}
