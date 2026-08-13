import { describe, expect, it } from 'vitest'
import { FDC_PROTOCOL_ID, FTSO_PROTOCOL_ID, registryFor } from '@flarekit-dev/contracts'
import {
  isRoundFinalized,
  readVotingEpochs,
  votingRoundAt,
  votingRoundStartsAt,
} from '../src/voting-round.js'
import { awaitRoundFinality, roundForSubmission } from '../src/fdc/round.js'

/**
 * M4-AC9. The voting-round machinery became protocol-generic; these pin both
 * halves of what that has to mean.
 *
 * The FDC half is the risk: it was live, verified on chain in round 1415859, and
 * had **no unit tests at all** before this migration. So the arithmetic below is
 * asserted against values computed from the epoch parameters as they read on
 * chain, not against whatever the new code happens to return.
 */

const CHAIN_ID = 114

/** Coston2 and Flare share these; read live from FlareSystemsManager. */
const EPOCHS = {
  firstVotingRoundStartTs: 1_658_430_000n,
  votingEpochDurationSeconds: 90n,
}

interface RecordedCall {
  address: string
  functionName: string
  args?: readonly unknown[]
}

/** Captures what a reader was asked, so the protocol id is observable. */
function recordingReader(result: unknown) {
  const calls: RecordedCall[] = []
  return {
    calls,
    /** Asserting accessor: a missing call is a test failure, not an `undefined`. */
    call(index: number): RecordedCall {
      const recorded = calls[index]
      if (!recorded) throw new Error(`expected a call at index ${index}, saw ${calls.length}`)
      return recorded
    },
    readContract(args: {
      address: `0x${string}`
      abi: readonly unknown[]
      functionName: string
      args?: readonly unknown[]
    }) {
      calls.push({ address: args.address, functionName: args.functionName, args: args.args })
      return Promise.resolve(result)
    },
  }
}

describe('isRoundFinalized asks about a named protocol', () => {
  it('passes FDC 200 through to Relay.isFinalized', async () => {
    const reader = recordingReader(true)
    await isRoundFinalized(reader, CHAIN_ID, FDC_PROTOCOL_ID, 1_415_859n)

    expect(reader.calls).toHaveLength(1)
    expect(reader.call(0).address).toBe(registryFor(CHAIN_ID).relay)
    expect(reader.call(0).functionName).toBe('isFinalized')
    expect(reader.call(0).args).toEqual([200n, 1_415_859n])
  })

  it('passes FTSO 100 through to the same Relay for the same round', async () => {
    const reader = recordingReader(true)
    await isRoundFinalized(reader, CHAIN_ID, FTSO_PROTOCOL_ID, 1_415_859n)

    expect(reader.call(0).address).toBe(registryFor(CHAIN_ID).relay)
    expect(reader.call(0).args).toEqual([100n, 1_415_859n])
  })

  /**
   * The two protocol ids are genuinely independent questions about one round.
   * If a future refactor ever defaults the id, this is what catches it.
   */
  it('never conflates the two protocols', async () => {
    const fdc = recordingReader(true)
    const ftso = recordingReader(true)
    await isRoundFinalized(fdc, CHAIN_ID, FDC_PROTOCOL_ID, 42n)
    await isRoundFinalized(ftso, CHAIN_ID, FTSO_PROTOCOL_ID, 42n)
    expect(fdc.call(0).args).not.toEqual(ftso.call(0).args)
  })

  it('treats anything other than a literal true as not finalized', async () => {
    for (const answer of [false, undefined, null, 0, '']) {
      const reader = recordingReader(answer)
      expect(await isRoundFinalized(reader, CHAIN_ID, FTSO_PROTOCOL_ID, 1n)).toBe(false)
    }
  })
})

describe('readVotingEpochs reads the clock off FlareSystemsManager', () => {
  it('does not ask the Relay, which reverts on both getters', async () => {
    const reader = recordingReader(90n)
    await readVotingEpochs(reader, CHAIN_ID)

    const registry = registryFor(CHAIN_ID)
    expect(reader.calls).toHaveLength(2)
    for (const call of reader.calls) {
      expect(call.address).toBe(registry.flareSystemsManager)
      expect(call.address).not.toBe(registry.relay)
    }
    expect(reader.calls.map((c) => c.functionName).sort()).toEqual([
      'firstVotingRoundStartTs',
      'votingEpochDurationSeconds',
    ])
  })
})

describe('round derivation', () => {
  it('floors to the round that was already open', () => {
    const start = EPOCHS.firstVotingRoundStartTs
    expect(votingRoundAt(start, EPOCHS)).toBe(0n)
    expect(votingRoundAt(start + 89n, EPOCHS)).toBe(0n)
    expect(votingRoundAt(start + 90n, EPOCHS)).toBe(1n)
    expect(votingRoundAt(start + 179n, EPOCHS)).toBe(1n)
  })

  it('round-trips a round to its own start', () => {
    for (const round of [0n, 1n, 1_415_859n]) {
      expect(votingRoundAt(votingRoundStartsAt(round, EPOCHS), EPOCHS)).toBe(round)
    }
  })

  it('refuses a timestamp before the first round rather than returning zero', () => {
    expect(() => votingRoundAt(EPOCHS.firstVotingRoundStartTs - 1n, EPOCHS)).toThrow()
  })
})

describe('roundForSubmission is unchanged by the migration', () => {
  /** The round M3 actually finalized in, so this is a real submission. */
  const round = 1_415_859n
  const blockTs = EPOCHS.firstVotingRoundStartTs + round * EPOCHS.votingEpochDurationSeconds + 30n

  it('derives the round from the block that carried the request', () => {
    expect(roundForSubmission(blockTs, EPOCHS).votingRoundId).toBe(round)
  })

  it('states the wait as a range, not a point', () => {
    const { expectedRangeSeconds, expectedDurationSeconds } = roundForSubmission(blockTs, EPOCHS)
    // One epoch if you landed at the end of the collecting round, two if at the
    // start. Both are normal; a single number would be wrong for almost every
    // request.
    expect(expectedRangeSeconds.min).toBe(90n)
    expect(expectedRangeSeconds.max).toBe(180n)
    expect(expectedDurationSeconds).toBe(180n)
  })

  it('anchors the expected finalization to the round start, not to the block', () => {
    const { expectedFinalizedAt } = roundForSubmission(blockTs, EPOCHS)
    const roundStart = votingRoundStartsAt(round, EPOCHS)
    expect(expectedFinalizedAt).toBe(Number(roundStart + 180n) * 1_000)
  })
})

describe('awaitRoundFinality still asks about FDC', () => {
  it('polls Relay.isFinalized with protocol 200', async () => {
    const reader = recordingReader(true)
    await awaitRoundFinality({ reader, chainId: CHAIN_ID, votingRoundId: 7n, timeoutMs: 1_000 })
    expect(reader.call(0).args).toEqual([200n, 7n])
  })

  it('reports an unknown rather than a failure when the budget runs out', async () => {
    const reader = recordingReader(false)
    let clock = 0
    await expect(
      awaitRoundFinality({
        reader,
        chainId: CHAIN_ID,
        votingRoundId: 7n,
        timeoutMs: 100,
        pollIntervalMs: 1,
        sleep: () => Promise.resolve(),
        now: () => (clock += 60),
      }),
    ).rejects.toMatchObject({
      code: 'FDC_ROUND_NOT_FINALIZED',
      // A round that has not finalized has said nothing about the underlying
      // transaction. Rendering that as failed would invent a negative fact.
      valueMoved: 'unknown',
      recovery: 'wait',
    })
  })
})
