import { FlareKitError } from '../errors.js'

/**
 * M3-R8. Everything that must be true before a proof is offered for execution.
 *
 * Checked in core rather than at the button, because core is also what an agent
 * calls — and an agent presenting a proof bound to somebody else's address
 * fails on chain with `OnlyProofOwner()` after paying gas. A refusal here is a
 * state a surface renders, not a revert a person pays to discover.
 */

export interface ExecutionPreconditions {
  /** The address the proof is bound to, when the family binds one. */
  readonly proofOwner?: string
  /** The account that would send the consuming transaction. */
  readonly sender?: string
  readonly operationNetwork: number
  readonly connectedNetwork: number
  readonly sourceId: string
  readonly proofSourceId: string
  readonly alreadyConsumed: boolean
}

function refuse(code: string, message: string): never {
  throw new FlareKitError(code, {
    domain: 'policy',
    message,
    recovery: 'requires_new_value',
    valueMoved: 'no',
  })
}

export function assertExecutable(preconditions: ExecutionPreconditions): void {
  if (preconditions.alreadyConsumed) {
    // Not a failure and not a second execution: the work is already done.
    refuse(
      'PROOF_ALREADY_CONSUMED',
      'This proof has already been consumed. Presenting it again would revert; it is not a second execution.',
    )
  }
  if (preconditions.operationNetwork !== preconditions.connectedNetwork) {
    refuse(
      'PROOF_NETWORK_MISMATCH',
      `This proof was attested on network ${preconditions.operationNetwork}; the connected network is ${preconditions.connectedNetwork}. A proof does not carry across deployments.`,
    )
  }
  if (preconditions.sourceId !== preconditions.proofSourceId) {
    refuse(
      'PROOF_SOURCE_MISMATCH',
      `This proof attests source ${preconditions.proofSourceId}, not ${preconditions.sourceId}.`,
    )
  }
  if (
    preconditions.proofOwner &&
    preconditions.sender &&
    preconditions.proofOwner.toLowerCase() !== preconditions.sender.toLowerCase()
  ) {
    refuse(
      'PROOF_OWNER_MISMATCH',
      `This proof is bound to ${preconditions.proofOwner}. Only that address can present it — sending from ${preconditions.sender} reverts with OnlyProofOwner().`,
    )
  }
}
