// packages/react-ui/src/recovery-composer-state.ts
import type { MemoRecoveryKind, MemoRecoveryRefusalCode } from '@flare-kit/core'
import type { CardNote } from './card-chrome.js'

/**
 * The five recovery paths, as a surface describes them (M14-R11).
 *
 * Order is NOT this file's to choose — `memoRecoveryOrderFor` owns it, because it encodes a
 * protocol rule rather than a layout preference: if the stuck payment never minted, its memo
 * must be skipped FIRST. Fast-forwarding the nonce first abandons the payment permanently.
 * A surface that reordered these to look tidier would cost someone their money.
 *
 * What this file owns is the sentence each path gets, and every one of them names the ONE
 * thing that path does not do — because each of these opcodes is routinely mistaken for a
 * cancel, and none of them is one.
 */

export interface RecoveryPathCopy {
  readonly opcode: string
  readonly title: string
  /** What it does, in one line. */
  readonly effect: string
  /** What it does NOT do. The half a user assumes wrongly. */
  readonly limit: string
}

export const RECOVERY_PATHS: Record<MemoRecoveryKind, RecoveryPathCopy> = {
  'skip-memo': {
    opcode: '0xE0',
    title: 'Skip a stuck payment’s memo',
    effect:
      'Marks one stuck payment so it can be resubmitted and mint FAsset to your account without ' +
      'running its original instruction.',
    limit:
      'It recovers the FAsset on Flare, not the XRP — that is already spent. It is also the only ' +
      'path that works on a memo too malformed to parse, because the flag is checked before any ' +
      'memo validation.',
  },
  'fast-forward-nonce': {
    opcode: '0xE1',
    title: 'Move the account past an abandoned nonce',
    effect: 'Advances the account’s nonce so later operations can be built and dispatched.',
    limit:
      'It recovers no money at all. If a stuck payment never minted, skip its memo FIRST — doing ' +
      'this one first abandons that payment for good.',
  },
  'replacement-fee': {
    opcode: '0xE2',
    title: 'Re-price a payment nobody will relay',
    effect: 'Sets a one-time fee override for a specific stuck transaction, to make relaying it worth doing.',
    limit:
      'It applies ONCE and the controller consumes it on first use. The chain offers no way to ' +
      'read a pending override back, so it can never be confirmed as still outstanding.',
  },
  'pin-executor': {
    opcode: '0xD0',
    title: 'Pin an executor to this account',
    effect: 'Restricts who may deliver instructions to your account.',
    limit:
      'The restriction applies to plain, no-memo mints too — only the pin and unpin memos bypass ' +
      'it. If that executor goes dark, mints to this account are blocked until you unpin.',
  },
  'unpin-executor': {
    opcode: '0xD1',
    title: 'Remove the pinned executor',
    effect: 'Clears the pin so anyone may relay for this account again.',
    limit:
      'Deliberately exempt from the executor check, so it works even when the pinned executor has ' +
      'stopped responding. Nothing else clears a pin.',
  },
}

const REFUSAL_NOTE: Record<
  MemoRecoveryRefusalCode,
  { title: string; tone: CardNote['tone'] }
> = {
  already_used: { title: 'There is nothing left to skip', tone: 'att' },
  used_state_unknown: { title: 'Whether it was consumed could not be read', tone: 'att' },
  nonce_not_greater: { title: 'The nonce must move forward', tone: 'att' },
  nonce_jump_too_large: { title: 'That jump is past the protocol’s ceiling', tone: 'att' },
  fee_too_large: { title: 'That fee is past the protocol’s ceiling', tone: 'att' },
  invalid_executor: { title: 'That is not a usable executor address', tone: 'att' },
}

export function recoveryRefusalNote(code: MemoRecoveryRefusalCode, message: string): CardNote {
  return { tone: REFUSAL_NOTE[code].tone, title: REFUSAL_NOTE[code].title, body: message }
}

/**
 * Why `0xE0` is not on the list.
 *
 * An option that silently vanishes reads as a bug, and a user who came here to recover a
 * payment needs to know the reason is that there is nothing left to recover — not that the
 * surface forgot. Withheld because offering it would spend a second payment for nothing.
 */
export const SKIP_MEMO_WITHHELD: CardNote = {
  tone: 'info',
  title: 'Skipping the memo is not offered here',
  body:
    'That payment has already minted, so there is no stuck memo left to skip. Sending a skip ' +
    'payment now would cost a second payment and recover nothing, so it is withheld rather than ' +
    'shown as an option that cannot help.',
}
