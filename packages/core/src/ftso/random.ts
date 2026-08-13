import { chainFor, randomNumberAbi, registryFor } from '@flare-kit/contracts'
import { type Observation, observe } from '../observation.js'
import type { RoundReader } from '../voting-round.js'

/**
 * Secure randomness — M4-R6.
 *
 * Read from the **Relay**: the contract registry lists `RandomNumberV2` at the
 * Relay's own address on both networks, which is why `FtsoRegistry` carries no
 * separate field for it.
 *
 * `isSecureRandom = false` genuinely occurs. Sampling 401 rounds across the full
 * retained range on Coston2 found four insecure ones — 872874, 882520, 951420
 * and 1167766, roughly 1%. A surface that hardcoded "secure" would eventually
 * lie, and it would lie about the one property anybody reads this for.
 *
 * There is no policy engine here, deliberately. `requireSecure` is one option on
 * one read, which is the whole policy surface this milestone owns.
 */

export interface RandomReading {
  readonly value: bigint
  readonly isSecure: boolean
  readonly timestampSeconds: bigint
  /** Absent for the current read, present when a specific round was asked for. */
  readonly votingRoundId?: bigint
}

/**
 * A refusal is a value-shaped answer, not an exception.
 *
 * A caller that asked for a secure random and got an insecure one has received a
 * complete, correct answer to its question — "no, and here is why". Throwing
 * would make that indistinguishable from the RPC being down, and would tempt a
 * `catch` that silently proceeds with the insecure value.
 */
export interface RandomRefusal {
  readonly refused: true
  readonly reason: string
  /**
   * The round whose randomness was refused, so the refusal names something
   * checkable rather than being a bare "no".
   */
  readonly votingRoundId?: bigint
  readonly timestampSeconds: bigint
}

export type RandomResult = RandomReading | RandomRefusal

export function isRefusal(result: RandomResult): result is RandomRefusal {
  return 'refused' in result
}

export interface ReadRandomInput {
  reader: RoundReader
  chainId: number
  /**
   * Omit for the current random. `getRandomNumberHistorical` reaches back to
   * about round 864606 on Coston2 — roughly 574 days, far past the anchor-feed
   * floor, so a round can have retrievable randomness and an unretrievable
   * price at the same time.
   */
  votingRoundId?: bigint
  /**
   * Refuse to return an insecure value rather than returning it with a flag.
   *
   * The flag alone is not enough: `isSecure` sitting beside a perfectly usable
   * `value` is an invitation to use the value. This makes the refusal the only
   * thing there is to use.
   */
  requireSecure?: boolean
  now?: () => number
}

export async function readSecureRandom(
  input: ReadRandomInput,
): Promise<Observation<RandomResult>> {
  const { reader, chainId } = input
  const now = input.now ?? Date.now
  const chain = chainFor(chainId)
  const historical = input.votingRoundId !== undefined

  const raw = (await reader.readContract({
    address: registryFor(chainId).relay,
    abi: randomNumberAbi as readonly unknown[],
    functionName: historical ? 'getRandomNumberHistorical' : 'getRandomNumber',
    ...(historical ? { args: [input.votingRoundId] } : {}),
  })) as readonly [bigint, boolean, bigint]

  const [value, isSecure, timestampSeconds] = raw
  const source = {
    class: 'chain' as const,
    // Named for what it is rather than for the registry alias, so a reader
    // comparing this against an explorer finds the same contract.
    provider: 'Relay (RandomNumberV2)',
    network: chain.name,
    chainId,
  }

  if (input.requireSecure && !isSecure) {
    return observe(
      {
        refused: true as const,
        reason: `The protocol reports this random as not secure${historical ? ` for voting round ${input.votingRoundId}` : ''}, and a secure value was required. No value is returned.`,
        ...(historical ? { votingRoundId: input.votingRoundId } : {}),
        timestampSeconds,
      },
      source,
      now(),
    )
  }

  return observe(
    {
      value,
      isSecure,
      timestampSeconds,
      ...(historical ? { votingRoundId: input.votingRoundId } : {}),
    },
    source,
    now(),
  )
}
