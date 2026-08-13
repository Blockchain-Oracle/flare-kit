import { flareSystemsManagerAbi, relayAbi, registryFor, votingRoundIdAt } from '@flarekit-dev/contracts'

/**
 * The Flare Systems Protocol clock, shared by every protocol that publishes on
 * it.
 *
 * FTSO scaling and the Flare Data Connector finalize on the **same** Relay, for
 * the same voting rounds, under different protocol ids — 100 and 200. Neither
 * owns the clock. M4-R4 moved this out of `fdc/` so there is exactly one
 * implementation of round derivation and finality in the repository, rather than
 * a second copy that agrees with the first until the day it does not.
 *
 * What stayed in `fdc/round.ts` is the submission-shaped half: deriving a round
 * from the block that carried a *request*, and waiting for it. FTSO has no
 * request, so it has no analogue of either.
 *
 * The epoch parameters are read from the chain rather than hardcoded. They are
 * declared on `IRelay` in the periphery package but revert on the deployed
 * Relay — a live probe on Coston2 confirmed it — so they are read from
 * `FlareSystemsManager`. Only `isFinalized` is on Relay.
 */

export interface RoundReader {
  readContract(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
  }): Promise<unknown>
}

export interface VotingEpochs {
  readonly firstVotingRoundStartTs: bigint
  readonly votingEpochDurationSeconds: bigint
}

export async function readVotingEpochs(
  reader: RoundReader,
  chainId: number,
): Promise<VotingEpochs> {
  const address = registryFor(chainId).flareSystemsManager
  const call = (functionName: string) =>
    reader.readContract({ address, abi: flareSystemsManagerAbi as readonly unknown[], functionName })

  const [start, duration] = await Promise.all([
    call('firstVotingRoundStartTs'),
    call('votingEpochDurationSeconds'),
  ])
  return {
    firstVotingRoundStartTs: BigInt(start as bigint),
    votingEpochDurationSeconds: BigInt(duration as bigint),
  }
}

/** The voting round covering a timestamp, under the epochs read from the chain. */
export function votingRoundAt(timestampSeconds: bigint, epochs: VotingEpochs): bigint {
  return votingRoundIdAt(
    timestampSeconds,
    epochs.firstVotingRoundStartTs,
    epochs.votingEpochDurationSeconds,
  )
}

/** When a voting round opened, in seconds. */
export function votingRoundStartsAt(votingRoundId: bigint, epochs: VotingEpochs): bigint {
  return epochs.firstVotingRoundStartTs + votingRoundId * epochs.votingEpochDurationSeconds
}

/**
 * Whether the Relay has published a merkle root for this round under this
 * protocol.
 *
 * The protocol id is a parameter and not a constant, which is the whole point of
 * M4-R4: `isRoundFinalized(reader, chainId, 200, r)` and
 * `isRoundFinalized(reader, chainId, 100, r)` are two independent questions
 * about one round, and both are live on both networks. A caller that forgets
 * which protocol it is asking about is asking the wrong question, so there is no
 * default.
 */
export async function isRoundFinalized(
  reader: RoundReader,
  chainId: number,
  protocolId: number,
  votingRoundId: bigint,
): Promise<boolean> {
  const finalized = await reader.readContract({
    address: registryFor(chainId).relay,
    abi: relayAbi as readonly unknown[],
    functionName: 'isFinalized',
    args: [BigInt(protocolId), votingRoundId],
  })
  return finalized === true
}
