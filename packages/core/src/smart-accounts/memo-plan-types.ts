import type { SmartAccountsDeployment } from '@flarekit-dev/contracts'
import type { PersonalAccountState } from './personal-account.js'
import type { PersonalAccountCall } from './user-operation.js'

/**
 * The memo plan's vocabulary, split from `memo-plan.ts` (M14-R6/R7).
 *
 * The same split M13 made between `plan-types.ts` and `plan.ts`, for the same reason and at
 * the same seam: this file is the CONTRACT a caller programs against — the refusal codes, the
 * warnings, the two ways of naming an amount — while its neighbour is the GATE that decides.
 * Surfaces import the vocabulary without pulling in the decision logic, and the gate stays
 * under the size ceiling as its checks grow.
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

