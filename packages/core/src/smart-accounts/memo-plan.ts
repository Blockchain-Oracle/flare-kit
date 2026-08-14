import type { SmartAccountsDeployment } from '@flare-kit/contracts'
import { MEMO_MAX_BYTES, MEMO_OPCODE } from './memo.js'
import type { PersonalAccountState } from './personal-account.js'
import { creditForTotal, totalForNetCredit } from './direct-mint-fees.js'
import {
  type PersonalAccountCall,
  buildUserOperation,
  encodeUserOperationMemo,
  encodeUserOperationWithDataMemo,
  totalCallValue,
} from './user-operation.js'

/**
 * The gate between an intent and an XRPL payment that cannot be taken back (M14-R6/R7).
 *
 * M13's planner was strict because a bad instruction cost the payment. This one is stricter,
 * because this flow has more ways to lose it and fewer ways to report why:
 *
 * - the dispatch is UNGUARDED — no `try/catch` anywhere (`MemoInstructionsFacet.sol:82-99`) —
 *   so any opcode revert unwinds the mint while the XRPL payment stays settled;
 * - a malformed `0xFF` payload reverts as a BARE PANIC with no named error, so the user
 *   cannot even be told what went wrong;
 * - and an underpayment is not a refusal but a total, unrecoverable burn.
 *
 * So everything checkable is checked here, and the inner call is SIMULATED before signing.
 */

export type MemoRefusalCode =
  | 'unverified'
  | 'account_unknown'
  | 'destination_tag'
  | 'nonce_unreadable'
  | 'nonce_mismatch'
  | 'payment_too_small'
  | 'executor_fee_excessive'
  | 'executor_fee_unaffordable'
  | 'memo_too_large'
  | 'already_dispatched'
  | 'simulation_reverted'
  | 'no_calls'

export interface MemoRefusal {
  readonly code: MemoRefusalCode
  readonly message: string
}

export interface MemoPlanWarning {
  readonly code: 'replay_unknown' | 'not_simulated' | 'payload_public' | 'executor_pinned'
  readonly message: string
}

/**
 * How much the payment is, said in one of the only two ways a caller can honestly mean it.
 *
 * `netUBA` is the composer's framing — "credit my account this much" — and the total is
 * derived from the contract's own forward model, so it lands above the minimum by
 * construction.
 *
 * `totalUBA` is the PAYER's framing: "this is the payment I am about to sign." It is used as
 * given, and it is the only one of the two that can be below the minimum minting fee. AC7
 * lives on this branch: a below-minimum payment is converted entirely into fee and mints
 * nothing to the payer, the loss is total and unrecoverable, and it must be blocked before a
 * signature is requested. Deriving the total from `netUBA` can never reproduce that, which is
 * why offering only that framing left the refusal unreachable.
 */
export type MemoAmount =
  | { readonly netUBA: bigint; readonly totalUBA?: undefined }
  | { readonly totalUBA: bigint; readonly netUBA?: undefined }

export type MemoIntent = MemoAmount & {
  readonly calls: readonly PersonalAccountCall[]
  /** The account's CURRENT nonce, read once for this payment. */
  readonly nonce: bigint
  /** Paid to whoever relays, out of the minted FAsset. Defaults to 0. */
  readonly executorFeeUBA?: bigint
  readonly walletId?: number
}

export interface MemoFeeSettings {
  readonly feeBIPS: bigint
  readonly minimumFeeUBA: bigint
  /** `getDirectMintingExecutorFeeUBA()` — the clamp for the memo's own fee field. */
  readonly assetManagerExecutorFeeUBA: bigint
}

/** The result of `eth_call`-ing the inner calldata before anything is signed. */
export type MemoSimulation = { readonly ok: true } | { readonly ok: false; readonly reason: string }

export interface PlanMemoInstructionInput {
  readonly deployment: SmartAccountsDeployment
  readonly personalAccount: PersonalAccountState | undefined
  readonly fees: MemoFeeSettings
  readonly intent: MemoIntent
  /** From `isTransactionIdUsed`. `undefined` means unread and is never read as `false`. */
  readonly replayed?: boolean | undefined
  /** Whatever tag the caller intends to set. Any value at all is refused. */
  readonly destinationTag?: number
  readonly simulation?: MemoSimulation
}

export interface MemoPlan {
  readonly opcode: number
  /** The bytes that travel as the XRPL payment's first (and only) memo. */
  readonly memo: `0x${string}`
  /** For `0xFE`, the bytes an executor must supply. `undefined` for inline `0xFF`. */
  readonly executorData?: `0x${string}`
  /** What the XRPL payment must deliver, in UBA. */
  readonly totalUBA: bigint
  readonly mintingFeeUBA: bigint
  readonly memoExecutorFeeUBA: bigint
  /** What the account is credited once both fees are taken. */
  readonly creditedUBA: bigint
  /** What the relay must attach as `msg.value` — the batch's sum, arriving as one lump. */
  readonly attachValueWei: bigint
  readonly personalAccount: PersonalAccountState
  readonly warnings: readonly MemoPlanWarning[]
}

export type MemoPlanResult =
  | { readonly ok: true; readonly plan: MemoPlan }
  | { readonly ok: false; readonly refusal: MemoRefusal }

const refuse = (code: MemoRefusalCode, message: string): MemoPlanResult => ({
  ok: false,
  refusal: { code, message },
})

export function planMemoInstruction(input: PlanMemoInstructionInput): MemoPlanResult {
  const { deployment, personalAccount, fees, intent } = input

  // 1. The verified gate, before anything read is acted on — the M10/M11/M12/M13 shape.
  if (!deployment.smartAccountsVerified) {
    return refuse(
      'unverified',
      'This network has no live-verified memo round trip yet, so the kit will not ask you to ' +
        'sign an XRPL payment against it.',
    )
  }
  if (!personalAccount) {
    return refuse('account_unknown', 'The personal account for this XRPL address could not be derived.')
  }

  // 2. The destination tag. FIRST among the payment checks and absolute, because it is the
  //    one that silently sends the whole mint to a stranger AND discards the instruction:
  //    a registered tag sets `mintToSmartAccount: false` and the source's own comment says
  //    "ignore memo data in this case" (`DirectMintingFacet.sol:311-320`). Tag 0 is not a
  //    safe default — `nextAvailableTag` starts at zero and tags are reservable by anyone.
  if (input.destinationTag !== undefined) {
    return refuse(
      'destination_tag',
      `A smart-account payment must carry NO destination tag; this one carries ${input.destinationTag}. ` +
        'A registered tag redirects the mint to the tag holder and discards the memo entirely, ' +
        'and tag 0 is claimable like any other.',
    )
  }

  if (intent.calls.length === 0) {
    return refuse('no_calls', 'A user operation with no calls would pay fees to do nothing.')
  }

  // 3. The nonce. Unreadable is its own refusal — guessing it strands the payment.
  if (personalAccount.nonce === undefined) {
    return refuse(
      'nonce_unreadable',
      'The account’s nonce could not be read, and a wrong nonce reverts InvalidNonce after the ' +
        'payment has settled.',
    )
  }
  if (intent.nonce !== personalAccount.nonce) {
    return refuse(
      'nonce_mismatch',
      `This operation is built for nonce ${intent.nonce} and the account is at ` +
        `${personalAccount.nonce}. Two payments sharing one nonce read: the first to execute ` +
        'wins and the second is refused with its XRP already spent.',
    )
  }

  // 4. The memo's executor fee, clamped. The only on-chain check is `_amount >= _executorFee`,
  //    so a memo may legally assign the entire mint to whoever relays it.
  const memoExecutorFeeUBA = intent.executorFeeUBA ?? 0n
  if (memoExecutorFeeUBA > fees.assetManagerExecutorFeeUBA) {
    return refuse(
      'executor_fee_excessive',
      `The memo would pay the relayer ${memoExecutorFeeUBA}, above this deployment's own ` +
        `${fees.assetManagerExecutorFeeUBA}. The chain would allow it; this kit will not.`,
    )
  }

  // 5. The amount. Below the minimum minting fee the payment is burned entirely and the memo
  //    never runs, so this is checked against the CONTRACT's forward model, not an estimate.
  // A payer-named total is used AS GIVEN. Nudging it up to clear the minimum would silently
  // spend more of their money than they said, and quietly clearing the one condition this
  // check exists to catch.
  const totalUBA =
    intent.totalUBA !== undefined
      ? intent.totalUBA
      : totalForNetCredit({
          netUBA: intent.netUBA,
          memoExecutorFeeUBA,
          feeBIPS: fees.feeBIPS,
          minimumFeeUBA: fees.minimumFeeUBA,
        })
  const credit = creditForTotal({
    totalUBA,
    memoExecutorFeeUBA,
    feeBIPS: fees.feeBIPS,
    minimumFeeUBA: fees.minimumFeeUBA,
  })
  if (credit.paymentTooSmall) {
    return refuse(
      'payment_too_small',
      `A payment of ${totalUBA} does not cover the minimum minting fee of ${fees.minimumFeeUBA}. ` +
        'Everything would go to the fee receiver, nothing would be minted, and there is no ' +
        'recovery path for it.',
    )
  }
  if (credit.executorFeeUnaffordable) {
    return refuse(
      'executor_fee_unaffordable',
      'What reaches the controller would not cover the memo’s executor fee, which reverts after ' +
        'the payment has settled.',
    )
  }

  // 6. Encode, and let the MEASURED size choose the opcode. No size table: the length depends
  //    on each call's own payload, so a constant would be wrong for every batch but one.
  const userOperation = buildUserOperation({
    sender: personalAccount.address,
    nonce: intent.nonce,
    calls: intent.calls,
  })
  const headerFields = { walletId: intent.walletId ?? 0, executorFeeUBA: memoExecutorFeeUBA }
  const inline = encodeUserOperationMemo({ ...headerFields, userOperation })
  const inlineFits = (inline.length - 2) / 2 <= MEMO_MAX_BYTES

  const withData = inlineFits ? undefined : encodeUserOperationWithDataMemo({ ...headerFields, userOperation })
  const memo = withData ? withData.memo : inline
  if ((memo.length - 2) / 2 > MEMO_MAX_BYTES) {
    // `0xFE` is a constant 42 bytes, so this is unreachable today. It stays because the
    // ceiling is a ledger property and the alternative to a check here is a truncated memo.
    return refuse('memo_too_large', 'This operation does not fit an XRPL memo, even by hash.')
  }

  // 7. Replay. Only a confirmed `true` refuses; unread is a warning.
  if (input.replayed === true) {
    return refuse(
      'already_dispatched',
      'This payment has already dispatched. Paying again would be a NEW payment, not a retry.',
    )
  }

  // 8. The simulation. Its whole purpose is to move a revert from after settlement to before
  //    signing — `CallFailed` is otherwise the user's first news, with the XRP gone.
  if (input.simulation && !input.simulation.ok) {
    return refuse(
      'simulation_reverted',
      `The inner call reverts when simulated against the chain now: ${input.simulation.reason}. ` +
        'Signing would spend the payment and roll the instruction back.',
    )
  }

  const warnings: MemoPlanWarning[] = []
  if (input.replayed === undefined) {
    warnings.push({
      code: 'replay_unknown',
      message: 'Whether this payment has already dispatched could not be read.',
    })
  }
  if (!input.simulation) {
    warnings.push({
      code: 'not_simulated',
      message:
        'The inner call was not simulated, so whether it succeeds is unknown. If it reverts, the ' +
        'instruction rolls back with the payment spent.',
    })
  }
  if (!withData) {
    warnings.push({
      code: 'payload_public',
      message:
        'This memo carries the whole operation, so its target, value and calldata are readable ' +
        'by anyone on the XRP Ledger.',
    })
  }
  if (personalAccount.pinnedExecutor && !/^0x0{40}$/i.test(personalAccount.pinnedExecutor)) {
    warnings.push({
      code: 'executor_pinned',
      message:
        'This account has an executor pinned, and the pin applies to ordinary mints too — only ' +
        'the pin/unpin memos bypass it. If that executor stops relaying, mints to this account ' +
        'are blocked until a 0xD1 payment clears it.',
    })
  }

  return {
    ok: true,
    plan: {
      opcode: withData ? MEMO_OPCODE.userOperationWithData : MEMO_OPCODE.userOperation,
      memo,
      ...(withData ? { executorData: withData.data } : {}),
      totalUBA,
      mintingFeeUBA: credit.mintingFeeUBA,
      memoExecutorFeeUBA,
      creditedUBA: credit.creditedUBA,
      attachValueWei: totalCallValue(intent.calls),
      personalAccount,
      warnings,
    },
  }
}
