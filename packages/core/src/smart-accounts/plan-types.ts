import type { SmartAccountsDeployment } from '@flare-kit/contracts'
import type { DeploymentSettings } from './adapter.js'
import type { InstructionRow } from './catalogue.js'
import type { PersonalAccountState } from './personal-account.js'

/**
 * The plan vocabulary — split from `plan.ts` to keep it under 300 lines, and because the
 * React and UI layers need these types without pulling in the planner's logic.
 *
 * Every `RefusalCode` names a revert the controller would raise AFTER the XRP has reached
 * the operator's wallet. `PlanWarning` is the other half: things a user must see before
 * signing that are NOT grounds to refuse, because refusing would assert something the kit
 * does not know.
 */

export interface InstructionIntent {
  /**
   * The XRPL address that controls the personal account AND signs the payment. These
   * cannot differ: the controller resolves the account from the proof's
   * `sourceAddressHash`, so whoever signs is whose account acts.
   */
  readonly xrplOwner: string
  readonly instructionId: number
  readonly value: bigint
  readonly vaultId?: number
  readonly agentVaultId?: number
  readonly recipient?: string
  readonly walletId?: number
  /** Drops to send. Defaults to exactly the instruction fee when omitted. */
  readonly amountDrops?: bigint
}

export type RefusalCode =
  | 'unverified'
  | 'deployment_unreadable'
  | 'unknown_instruction'
  | 'not_composable'
  | 'no_operator_wallet'
  | 'fee_unmet'
  | 'vault_not_registered'
  | 'vault_type_mismatch'
  | 'agent_vault_not_registered'
  | 'recipient_unfunded'
  | 'already_dispatched'
  | 'invalid_reference'

export interface InstructionRefusal {
  readonly code: RefusalCode
  readonly message: string
}

/** Something the user should see before signing that is NOT a reason to refuse. */
export interface PlanWarning {
  readonly code: 'replay_unknown' | 'balance_unknown' | 'account_undeployed'
  readonly message: string
}

export interface InstructionPlan {
  readonly intent: InstructionIntent
  readonly row: InstructionRow
  /** The 32 bytes that will travel as the XRPL memo. */
  readonly reference: `0x${string}`
  /** A registered operator wallet, read live — never a constant. */
  readonly destination: string
  readonly amountDrops: bigint
  readonly feeDrops: bigint
  /** The personal account this will act as, and whether it exists yet. */
  readonly personalAccount: PersonalAccountState
  /** `testXRP` / `XRP` — the FDC source the attestation must be requested against. */
  readonly sourceId: string
  /**
   * How long the proof stays usable, in seconds, measured from the XRPL block timestamp.
   *
   * NOT an absolute deadline: at plan time the payment has not landed, so there is no
   * block timestamp to measure from. Rendering a wall-clock instant here would mean
   * assuming the payment validates now. The lifecycle computes the real instant from the
   * observed timestamp once the payment is on the ledger.
   */
  readonly proofWindowSeconds: bigint
  /** What the personal account will do on Flare once the proof is submitted. */
  readonly downstream: string
  readonly warnings: readonly PlanWarning[]
}

export type InstructionPlanResult =
  | { readonly ok: true; readonly plan: InstructionPlan }
  | { readonly ok: false; readonly refusal: InstructionRefusal }

export interface PlanInstructionInput {
  readonly deployment: SmartAccountsDeployment
  readonly settings: DeploymentSettings | undefined
  readonly catalogue: readonly InstructionRow[]
  readonly personalAccount: PersonalAccountState | undefined
  readonly intent: InstructionIntent
  /** From `readTransactionIdUsed`. `undefined` means unread — never treated as `false`. */
  readonly replayed?: boolean | undefined
}
