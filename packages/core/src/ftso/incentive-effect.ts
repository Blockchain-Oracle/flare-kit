import { fastUpdateIncentiveManagerAbi, ftsoRegistryFor } from '@flarekit-dev/contracts'
import type { RoundReader } from '../voting-round.js'

/**
 * What a Fast Update incentive actually bought, according to the chain — the
 * confirmation half of M4-R7.
 *
 * Split from `incentive.ts` at the seam between pricing an offer and confirming
 * one: quoting reads current state to decide what to send, confirming reads
 * historical state at a fixed block to establish what happened. They share a
 * contract and nothing else.
 *
 * The measurement is pinned to the offer's **own block** on both sides, because
 * the effect decays: mainnet's range was back to base hours after a real offer.
 * Reading `getRange()` "now" would report no effect for any offer older than its
 * duration, and rendering that as a failed offer would assert a negative fact
 * about a transaction that demonstrably succeeded.
 */

/** What the chain says the offer actually bought. Never the caller's intent. */
export interface IncentiveEffect {
  readonly transactionHash: `0x${string}`
  readonly blockNumber: bigint
  /** `getRange()` at the offer's own block minus the block before it. */
  readonly measuredRangeDelta: bigint
  /** `rangeIncrease` from this transaction's own `IncentiveOffered` event. */
  readonly eventRangeIncrease: bigint
  /**
   * Frequently `0`, and rendered as exactly that. An incentive buys a range
   * widening; it does not necessarily buy a larger sample.
   */
  readonly eventSampleSizeIncrease: bigint
  readonly eventOfferAmount: bigint
  /** Whether the measured delta matches what the event says was bought. */
  readonly confirmed: boolean
}

export interface RangeReader extends RoundReader {
  readContract(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
    blockNumber?: bigint
  }): Promise<unknown>
}

export interface ConfirmIncentiveInput {
  reader: RangeReader
  chainId: number
  transactionHash: `0x${string}`
  blockNumber: bigint
  /** Decoded `IncentiveOffered` from this transaction's own receipt. */
  event: {
    rangeIncrease: bigint
    sampleSizeIncrease: bigint
    offerAmount: bigint
  }
}

/**
 * Confirm an offer against the chain's own account of it.
 *
 * Pinned to the offer's block on both sides. Reading `getRange()` "now" would
 * report no effect for any offer older than its duration, and rendering that as
 * a failed offer would be asserting a negative fact about a transaction that
 * demonstrably succeeded.
 */
export async function confirmIncentiveEffect(
  input: ConfirmIncentiveInput,
): Promise<IncentiveEffect> {
  const address = ftsoRegistryFor(input.chainId).fastUpdateIncentiveManager
  const rangeAt = async (blockNumber: bigint) =>
    BigInt(
      (await input.reader.readContract({
        address,
        abi: fastUpdateIncentiveManagerAbi as readonly unknown[],
        functionName: 'getRange',
        blockNumber,
      })) as bigint,
    )

  const [atOffer, beforeOffer] = await Promise.all([
    rangeAt(input.blockNumber),
    rangeAt(input.blockNumber - 1n),
  ])

  const measuredRangeDelta = atOffer - beforeOffer
  return Object.freeze({
    transactionHash: input.transactionHash,
    blockNumber: input.blockNumber,
    measuredRangeDelta,
    eventRangeIncrease: input.event.rangeIncrease,
    eventSampleSizeIncrease: input.event.sampleSizeIncrease,
    eventOfferAmount: input.event.offerAmount,
    confirmed: measuredRangeDelta === input.event.rangeIncrease,
  })
}

/**
 * Whether a widening bought at a known time is still in force.
 *
 * Expired is a normal end state, not a fault — which is why this returns a
 * boolean for the surface to label rather than an error for it to catch.
 */
export function isEffectExpired(
  offeredAtSeconds: bigint,
  durationSeconds: bigint,
  nowSeconds: bigint,
): boolean {
  return nowSeconds > offeredAtSeconds + durationSeconds
}
