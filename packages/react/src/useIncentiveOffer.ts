import { type IncentiveQuote, type RoundReader, quoteIncentive } from '@flare-kit/core'
import { type ObservedRead, useObservedRead } from './use-observed-read.js'

/**
 * Quote a Fast Update incentive — FTSO-05's `PLAN` state.
 *
 * The quote is for the **exact** offer about to be made; changing the range
 * increase changes the price, so this re-reads when it changes rather than
 * scaling a cached number.
 *
 * This hook only quotes. Submitting is a signed, value-moving action and belongs
 * to the caller's own wallet flow — a read hook that could spend would be a hook
 * a component could spend from by rendering.
 */

export interface UseIncentiveOfferOptions {
  reader: RoundReader
  chainId: number
  rangeIncrease: bigint
  rangeLimit?: bigint
}

export function useIncentiveOffer(
  options: UseIncentiveOfferOptions,
): ObservedRead<IncentiveQuote> {
  const { reader, chainId, rangeIncrease, rangeLimit } = options
  return useObservedRead(
    () =>
      quoteIncentive({
        reader,
        chainId,
        rangeIncrease,
        ...(rangeLimit === undefined ? {} : { rangeLimit }),
      }),
    [chainId, rangeIncrease, rangeLimit],
  )
}
