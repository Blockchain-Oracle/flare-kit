import { builtInInstruction, requiredVaultType } from '@flare-kit/contracts'
import { type InstructionRow, instructionRow } from './catalogue.js'
import { encodePaymentReference } from './payment-reference.js'
import type {
  InstructionIntent,
  InstructionPlanResult,
  PlanInstructionInput,
  PlanWarning,
  RefusalCode,
} from './plan-types.js'

/**
 * `planInstruction` — the gate between a user's intent and an XRPL payment they cannot
 * take back.
 *
 * Every refusal here corresponds to a revert the controller would raise AFTER the XRP has
 * reached the operator's wallet. That asymmetry is the whole reason this file is strict:
 * on Flare a bad transaction reverts and costs gas; here a bad instruction costs the
 * payment, and the only way forward is a NEW payment.
 *
 * Order matters. The verification gate runs FIRST, before any read is trusted, exactly as
 * `governance.ts` and `delegation.ts` do — an unverified deployment never produces a plan,
 * only a declared-unbuilt affordance.
 *
 * Two deliberate non-refusals, both cases where refusing would assert something unknown:
 *
 * - An UNREADABLE replay flag (`isTransactionIdUsed`) is a warning, not a refusal. It is
 *   also not treated as `false`.
 * - An UNKNOWN personal-account balance is a warning. Refusing would block the legitimate
 *   "fund the account, then instruct it" order, which is how a first-ever instruction
 *   necessarily works.
 */

const refuse = (code: RefusalCode, message: string): InstructionPlanResult => ({
  ok: false,
  refusal: { code, message },
})

function downstreamOf(row: InstructionRow, intent: InstructionIntent): string {
  const { instruction } = row
  switch (instruction.id) {
    case 0x01:
      return `The personal account will transfer ${intent.value} drops of the FAsset to ${intent.recipient}.`
    case 0x02:
      return `The personal account will redeem ${intent.value} lot(s) of the FAsset.`
    default:
      return `The personal account will call ${instruction.action} on ${instruction.type} vault ${intent.vaultId}.`
  }
}

export function planInstruction(input: PlanInstructionInput): InstructionPlanResult {
  const { deployment, settings, catalogue, personalAccount, intent } = input

  // 1. The verification gate, before anything read is acted on.
  if (!deployment.smartAccountsVerified) {
    return refuse(
      'unverified',
      'This network has no live-verified instruction round trip yet, so the kit will not ' +
        'ask you to sign an XRPL payment against it.',
    )
  }

  // 2. Reads that must have succeeded for a plan to mean anything.
  if (!settings) {
    return refuse(
      'deployment_unreadable',
      'The controller could not be read, so its operator wallets and fees are unknown.',
    )
  }
  if (!personalAccount) {
    return refuse(
      'deployment_unreadable',
      'The personal account for this XRPL address could not be derived.',
    )
  }
  const instruction = builtInInstruction(intent.instructionId)
  if (!instruction) {
    return refuse(
      'unknown_instruction',
      `Instruction 0x${intent.instructionId.toString(16).padStart(2, '0')} is not one the kit can build.`,
    )
  }
  const row = instructionRow(catalogue, intent.instructionId)
  if (!row || row.availability.kind !== 'available') {
    return refuse(
      'not_composable',
      row && row.availability.kind !== 'available'
        ? row.availability.reason
        : 'This instruction is not in the catalogue for this deployment.',
    )
  }

  // 3. The destination must be a wallet the deployment registers RIGHT NOW.
  const destination = settings.xrplProviderWallets[0]
  if (!destination) {
    return refuse(
      'no_operator_wallet',
      'This deployment registers no operator XRPL wallet, so there is nowhere to send the payment.',
    )
  }

  // 4. The controller requires `receivedAmount >= instructionFee`.
  const feeDrops = row.feeDrops
  const amountDrops = intent.amountDrops ?? feeDrops
  if (amountDrops < feeDrops) {
    return refuse(
      'fee_unmet',
      `This instruction costs ${feeDrops} drops and the payment is ${amountDrops}. The controller would reject the proof.`,
    )
  }

  // 5. Vault and agent-vault targeting, checked against the CONTROLLER's namespace.
  const needsVault = requiredVaultType(instruction)
  if (needsVault) {
    const vault = settings.vaults?.find((candidate) => candidate.vaultId === intent.vaultId)
    if (!vault) {
      return refuse(
        'vault_not_registered',
        `Vault ${intent.vaultId} is not registered on this controller. Vault ids come from the ` +
          'controller, not from the kit’s own vault registry, and on this network the two differ.',
      )
    }
    if (vault.vaultType !== needsVault) {
      return refuse(
        'vault_type_mismatch',
        `Vault ${intent.vaultId} is a ${vault.vaultType} vault and this is a ${needsVault} instruction. ` +
          'The controller would revert with InvalidInstructionType.',
      )
    }
  }
  if (instruction.tail === 'agentVault' || instruction.tail === 'agentVaultAndVault') {
    const known = settings.agentVaults?.some(
      (candidate) => candidate.agentVaultId === intent.agentVaultId,
    )
    if (!known) {
      return refuse(
        'agent_vault_not_registered',
        `Agent vault ${intent.agentVaultId} is not registered on this controller.`,
      )
    }
  }

  // 6. A transfer the account demonstrably cannot cover. An inner-call revert rolls the
  //    whole Flare transaction back, so the instruction is dead and the XRP is spent.
  const warnings: PlanWarning[] = []
  if (instruction.id === 0x01) {
    if (personalAccount.fassetBalance === undefined) {
      warnings.push({
        code: 'balance_unknown',
        message:
          'The personal account’s FAsset balance could not be read, so whether it can cover ' +
          'this transfer is unknown. If it cannot, the instruction reverts and the payment is spent.',
      })
    } else if (personalAccount.fassetBalance < intent.value) {
      return refuse(
        'recipient_unfunded',
        `The personal account holds ${personalAccount.fassetBalance} and this transfers ${intent.value}. ` +
          'The inner call would revert and roll the whole instruction back.',
      )
    }
  }

  // 7. Replay. Unknown is a warning; only a confirmed `true` refuses.
  if (input.replayed === true) {
    return refuse(
      'already_dispatched',
      'This XRPL payment has already dispatched an instruction. Paying again would be a new ' +
        'payment, not a retry.',
    )
  }
  if (input.replayed === undefined) {
    warnings.push({
      code: 'replay_unknown',
      message: 'Whether this payment has already dispatched could not be read.',
    })
  }

  if (personalAccount.deployed === false) {
    warnings.push({
      code: 'account_undeployed',
      message:
        'This personal account has not been deployed yet. The controller will deploy it by ' +
        'CREATE2 as part of executing this instruction, at the address shown.',
    })
  }

  // 8. Encode last: the codec enforces the parser's own non-zero rules, and a throw here
  //    means an invariant above missed something.
  let reference: `0x${string}`
  try {
    reference = encodePaymentReference({
      instructionId: intent.instructionId,
      value: intent.value,
      walletId: intent.walletId,
      agentVaultId: intent.agentVaultId,
      vaultId: intent.vaultId,
      recipient: intent.recipient,
    })
  } catch (error) {
    return refuse('invalid_reference', error instanceof Error ? error.message : String(error))
  }

  return {
    ok: true,
    plan: {
      intent,
      row,
      reference,
      destination,
      amountDrops,
      feeDrops,
      personalAccount,
      sourceId: settings.sourceId,
      proofWindowSeconds: settings.proofValidityDurationSeconds,
      downstream: downstreamOf(row, intent),
      warnings,
    },
  }
}
