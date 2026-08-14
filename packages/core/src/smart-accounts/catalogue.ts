import {
  BUILT_IN_INSTRUCTIONS,
  type BuiltInInstruction,
  requiredVaultType,
} from '@flarekit-dev/contracts'
import type { DeploymentSettings } from './adapter.js'

/**
 * The instruction catalogue — DISCOVERED from live deployment state, never declared.
 *
 * `R-SA-002` requires capability discovery rather than a permanent assumed list. The eleven
 * built-in instructions are the protocol's vocabulary; whether a given deployment can serve
 * one depends on what it has registered right now, and that is read, not assumed.
 *
 * Four availability states, and the difference between the last two is the whole point:
 *
 * - `available` — the deployment can serve it.
 * - `superseded` — the protocol has moved on. The three legacy collateral-reservation
 *   commands are redirected to FAssets minting by the deployment's own documentation.
 * - `unavailable` — read successfully, and the deployment cannot serve it (no registered
 *   vault of the required type). A CLAIM about the deployment.
 * - `unknown` — the state needed to decide could not be read. NOT a claim about anything.
 *   Collapsing this into `unavailable` would tell a user their deployment lacks a vault
 *   when in truth the RPC call failed.
 */

export type InstructionAvailability =
  | { readonly kind: 'available' }
  | { readonly kind: 'superseded'; readonly reason: string }
  | { readonly kind: 'unavailable'; readonly reason: string }
  | { readonly kind: 'unknown'; readonly reason: string }

export interface InstructionRow {
  readonly instruction: BuiltInInstruction
  /**
   * In drops, from `getInstructionFee(id)` — the deployment's number, not a constant, and
   * `undefined` when that read failed. Never defaulted: the per-id fee and the default fee
   * genuinely differ on mainnet, so a substituted number is a wrong price, and a renderer
   * showing `0` or the default would be quoting a payment the controller will refuse.
   */
  readonly feeDrops: bigint | undefined
  readonly availability: InstructionAvailability
  /**
   * The controller vault ids this instruction may target, from `getVaults()`. `undefined`
   * where the instruction targets no vault OR the registry could not be read — the
   * availability state distinguishes those two.
   */
  readonly eligibleVaultIds: readonly number[] | undefined
  /** The agent vault ids registered, for the reserve-and-deposit commands. */
  readonly eligibleAgentVaultIds: readonly number[] | undefined
}

const SUPERSEDED_REASON =
  'Superseded: the deployment directs minting to FAssets direct minting, which the kit ' +
  'already drives. This command is catalogued for completeness and is never composable.'

function availabilityFor(
  instruction: BuiltInInstruction,
  settings: DeploymentSettings,
  eligibleVaultIds: readonly number[] | undefined,
): InstructionAvailability {
  // A protocol fact, checked before any deployment read: no amount of registered vaults
  // makes a superseded command the right thing to compose.
  if (instruction.standing === 'superseded') {
    return { kind: 'superseded', reason: SUPERSEDED_REASON }
  }

  const needsVault = requiredVaultType(instruction)
  if (needsVault) {
    if (settings.vaults === undefined) {
      return {
        kind: 'unknown',
        reason: 'The vault registry could not be read, so whether this can be served is unknown.',
      }
    }
    if (!eligibleVaultIds || eligibleVaultIds.length === 0) {
      return {
        kind: 'unavailable',
        reason: `This deployment registers no ${needsVault} vault, so the controller cannot dispatch this instruction.`,
      }
    }
  }

  return { kind: 'available' }
}

/**
 * One row per built-in instruction, with availability derived from `settings`.
 *
 * When the deployment settings themselves are `undefined` — an unreadable controller —
 * every row is `unknown`. The catalogue still lists the vocabulary, because hiding it
 * would imply the protocol has no such instruction rather than that we could not look.
 */
export function buildInstructionCatalogue(
  settings: DeploymentSettings | undefined,
): readonly InstructionRow[] {
  return BUILT_IN_INSTRUCTIONS.map((instruction) => {
    if (!settings) {
      return {
        instruction,
        feeDrops: undefined,
        availability: {
          kind: 'unknown',
          reason: 'The deployment could not be read, so its fees and vaults are unknown.',
        },
        eligibleVaultIds: undefined,
        eligibleAgentVaultIds: undefined,
      } satisfies InstructionRow
    }

    const needsVault = requiredVaultType(instruction)
    const eligibleVaultIds = needsVault
      ? settings.vaults
          ?.filter((vault) => vault.vaultType === needsVault)
          .map((vault) => vault.vaultId)
      : undefined
    const needsAgentVault =
      instruction.tail === 'agentVault' || instruction.tail === 'agentVaultAndVault'

    return {
      instruction,
      feeDrops: settings.instructionFees[instruction.id],
      availability: availabilityFor(instruction, settings, eligibleVaultIds),
      eligibleVaultIds,
      eligibleAgentVaultIds: needsAgentVault
        ? settings.agentVaults?.map((vault) => vault.agentVaultId)
        : undefined,
    } satisfies InstructionRow
  })
}

/** The row for an id, or `undefined` where the kit does not know the instruction. */
export function instructionRow(
  catalogue: readonly InstructionRow[],
  instructionId: number,
): InstructionRow | undefined {
  return catalogue.find((row) => row.instruction.id === instructionId)
}

/** Only what a composer may legitimately offer. `superseded` and `unknown` never qualify. */
export function composableInstructions(
  catalogue: readonly InstructionRow[],
): readonly InstructionRow[] {
  return catalogue.filter((row) => row.availability.kind === 'available')
}
