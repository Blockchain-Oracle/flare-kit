import { FDC_PROTOCOL_ID, expectedFinalizationSeconds } from '@flarekit-dev/contracts'
import { FlareKitError } from '../errors.js'
import {
  type RoundReader,
  type VotingEpochs,
  isRoundFinalized,
  votingRoundAt,
  votingRoundStartsAt,
} from '../voting-round.js'

/**
 * The submission-shaped half of the voting round: which round a *request*
 * landed in, and waiting for it.
 *
 * M4-R4 moved everything protocol-generic to `../voting-round.ts` — reading the
 * epochs, deriving a round from a timestamp, and asking the Relay whether a
 * round finalized under a given protocol id. Those copies are deleted here, not
 * kept beside the generalisation.
 *
 * What remains has no FTSO analogue, which is why it remains: FTSO publishes
 * anchor values for rounds that have already closed. There is nothing to submit
 * and therefore no submitting block to derive a round from, and no open-ended
 * wait for a round the caller caused.
 */

export type { RoundReader, VotingEpochs }

export interface RoundForSubmission {
  readonly votingRoundId: bigint
  /**
   * When the round's root should be expected, in milliseconds. M3-R9 puts this
   * on the timeline so a wait states its own duration. It is an expectation:
   * `isRoundFinalized` remains the only thing that says a round is done.
   */
  readonly expectedFinalizedAt: number
  readonly expectedDurationSeconds: bigint
  /**
   * The wait as a **range**, which is what DESIGN.md asks a long wait to state.
   * A single number would be wrong for almost every request: how long you wait
   * depends on where in the collecting round you landed. A request submitted in
   * the last second of a round waits one epoch; one submitted in the first
   * second waits two. Both are normal, and a person watching the shorter one
   * elapse should not think something has gone wrong.
   */
  readonly expectedRangeSeconds: { readonly min: bigint; readonly max: bigint }
}

/**
 * The round a request belongs to, from the timestamp of the block that carried
 * it. Never from the wall clock: a transaction that took forty seconds to mine
 * belongs to the round that was open when it landed, not when it was sent.
 */
export function roundForSubmission(
  blockTimestampSeconds: bigint,
  epochs: VotingEpochs,
): RoundForSubmission {
  const votingRoundId = votingRoundAt(blockTimestampSeconds, epochs)
  const expectedDurationSeconds = expectedFinalizationSeconds(epochs.votingEpochDurationSeconds)
  const roundStart = votingRoundStartsAt(votingRoundId, epochs)
  return {
    votingRoundId,
    expectedDurationSeconds,
    expectedFinalizedAt: Number(roundStart + expectedDurationSeconds) * 1_000,
    expectedRangeSeconds: {
      // The remainder of the collecting round, plus one round to finalize.
      min: epochs.votingEpochDurationSeconds,
      max: expectedDurationSeconds,
    },
  }
}

export interface AwaitFinalityInput {
  reader: RoundReader
  chainId: number
  votingRoundId: bigint
  /** Give up after this long and report an unknown, never a failure. */
  timeoutMs: number
  pollIntervalMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Poll until the round finalizes under the FDC protocol or the budget runs out.
 *
 * Exhausting the budget throws `FDC_ROUND_NOT_FINALIZED` with
 * `valueMoved: 'unknown'` and `recovery: 'wait'` — M3-R10. A round that has not
 * finalized within the window has not said anything about the underlying
 * transaction, and rendering that as a failure would be inventing a negative
 * fact about a chain nobody asked.
 */
export async function awaitRoundFinality(input: AwaitFinalityInput): Promise<void> {
  const sleep = input.sleep ?? defaultSleep
  const now = input.now ?? Date.now
  const pollIntervalMs = input.pollIntervalMs ?? 10_000
  const deadline = now() + input.timeoutMs

  for (;;) {
    if (await isRoundFinalized(input.reader, input.chainId, FDC_PROTOCOL_ID, input.votingRoundId)) {
      return
    }
    if (now() >= deadline) {
      throw new FlareKitError('FDC_ROUND_NOT_FINALIZED', {
        domain: 'provider',
        message: `Voting round ${input.votingRoundId} had not finalized after ${Math.round(input.timeoutMs / 1000)}s. The round may still finalize; nothing here says the attested data is invalid.`,
        recovery: 'wait',
        valueMoved: 'unknown',
        evidence: { votingRoundId: input.votingRoundId.toString() },
      })
    }
    await sleep(pollIntervalMs)
  }
}
