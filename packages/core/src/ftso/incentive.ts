import { fastUpdateIncentiveManagerAbi, ftsoRegistryFor } from '@flare-kit/contracts'
import { FlareKitError } from '../errors.js'
import type { RoundReader } from '../voting-round.js'

/**
 * Fast Update incentives — M4-R7. The only surface in this milestone that spends.
 *
 * Three measured facts shape everything here, and each one rules out an
 * implementation that would otherwise look reasonable:
 *
 * 1. **The price is a function of the offer.** Bisected live on Coston2: a
 *    `rangeIncrease` of `getRange()/100` is rejected at `366210937499999998`
 *    wei and accepted at `366210937499999999` — about 0.3662 C2FLR, identical
 *    minimum on mainnet. So a quote is computed for the exact offer about to be
 *    made. A cached or per-unit price would be wrong for every other offer.
 * 2. **The effect decays.** On mainnet tx `0x440e8845…a101cdb` (block 66637469)
 *    `getRange()` at the preceding block versus that block differs by exactly
 *    the `rangeIncrease` in that transaction's own `IncentiveOffered` event —
 *    but the range is back to base hours later. Confirmation therefore reads the
 *    offer's **own block**, and a later read showing no effect is a decayed
 *    incentive, never a failed one.
 * 3. **An incentive is not a purchase of both dimensions.** `sampleSizeIncrease`
 *    was `0` in that real offer. Rendering a zero as though something was bought
 *    would be inventing a result.
 */

export interface IncentiveQuote {
  /** The exact offer this price is for. Re-quoting a different one is required. */
  readonly rangeIncrease: bigint
  readonly rangeLimit: bigint
  /** What must be sent as `value`, for this offer and no other. */
  readonly offerAmountWei: bigint
  readonly currentRange: bigint
  readonly expectedSampleSize: bigint
  /** How long the widening lasts, stated rather than implied. */
  readonly durationSeconds: bigint
  /** The fixed-point precision the price divides by. Kept so a surface can show its own arithmetic. */
  readonly precision: bigint
}

export interface ReadIncentiveStateInput {
  reader: RoundReader
  chainId: number
  /** The widening being priced. The quote is meaningless without it. */
  rangeIncrease: bigint
  /** Defaults to the contract's own `rangeIncreaseLimit`. */
  rangeLimit?: bigint
}

/**
 * A reader that can dry-run the offer. `simulateContract` executes the call
 * without a signature and without spending, which is the only way to learn what
 * the contract will actually accept.
 */
export interface OfferSimulator extends RoundReader {
  simulateContract(args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
    value?: bigint
    account?: `0x${string}`
  }): Promise<{ result: unknown }>
}

/**
 * Price the specific offer the caller is about to make.
 *
 * `rangeIncreasePrice` is the per-unit rate the contract exposes; the amount is
 * that rate applied to this offer's own increase. Quoting anything else would
 * price a different transaction from the one submitted.
 */
export async function quoteIncentive(input: ReadIncentiveStateInput): Promise<IncentiveQuote> {
  const { reader, chainId } = input
  const address = ftsoRegistryFor(chainId).fastUpdateIncentiveManager
  const call = (functionName: string) =>
    reader.readContract({
      address,
      abi: fastUpdateIncentiveManagerAbi as readonly unknown[],
      functionName,
    }) as Promise<bigint>

  const [currentRange, expectedSampleSize, durationSeconds, rateWei, defaultLimit, precision] =
    await Promise.all([
      call('getRange'),
      call('getExpectedSampleSize'),
      call('getIncentiveDuration'),
      call('rangeIncreasePrice'),
      call('rangeIncreaseLimit'),
      call('getPrecision'),
    ])

  const rangeLimit = input.rangeLimit ?? BigInt(defaultLimit)
  const offerAmountWei = priceFor(input.rangeIncrease, BigInt(rateWei), BigInt(precision))

  return Object.freeze({
    rangeIncrease: input.rangeIncrease,
    rangeLimit,
    offerAmountWei,
    currentRange: BigInt(currentRange),
    expectedSampleSize: BigInt(expectedSampleSize),
    durationSeconds: BigInt(durationSeconds),
    precision: BigInt(precision),
  })
}

/**
 * The offer amount the contract will require for a given widening.
 *
 * Established by bisecting `offerIncentive` against the live Coston2 contract at
 * four different increases — `getRange()` over 400, 200, 100 and 50 — and this
 * expression reproduces the minimum accepted amount **exactly** at all four. The
 * 1% case lands on `366210937499999999` wei, accepted, with
 * `366210937499999998` rejected, which independently reproduces the figure the
 * spec recorded.
 *
 * The obvious reading — pricing against `getRange()` — overstates the amount by
 * about 5,500x. That error is invisible in a unit test written against the same
 * wrong formula, and on mainnet it would ask somebody to sign away 2000 FLR for
 * a 0.37 FLR purchase. It was caught by driving the live contract.
 *
 * The divisor of 64 is empirical: it is a fixed-point shift inside the contract,
 * whose Solidity is not vendored here. Because it is fitted rather than derived,
 * `verifyOfferAmount` re-checks the number against the chain before anything is
 * signed, so a future contract change surfaces as a caught refusal rather than
 * as a revert in the wallet.
 */
export const INCENTIVE_PRICE_SHIFT = 64n

export function priceFor(
  rangeIncrease: bigint,
  rangeIncreasePrice: bigint,
  precision: bigint,
): bigint {
  if (precision === 0n) {
    throw new FlareKitError('FTSO_INCENTIVE_PRECISION_ZERO', {
      domain: 'protocol',
      message:
        'The incentive manager reported a precision of zero, so an offer cannot be priced. Nothing was sent.',
      recovery: 'safe_to_retry',
      valueMoved: 'no',
      evidence: { rangeIncrease: rangeIncrease.toString() },
    })
  }
  return (rangeIncrease * rangeIncreasePrice) / (precision * INCENTIVE_PRICE_SHIFT)
}

/**
 * Refuse an offer that exceeds the contract's own limit before sending it.
 *
 * The alternative is a revert after the wallet has already asked the person to
 * sign, which spends their attention to learn something we could have told them.
 */
export function assertOfferWithinLimit(quote: IncentiveQuote): void {
  if (quote.rangeIncrease <= quote.rangeLimit) return
  throw new FlareKitError('FTSO_INCENTIVE_ABOVE_LIMIT', {
    domain: 'input',
    message: `A range increase of ${quote.rangeIncrease} is above the contract's limit of ${quote.rangeLimit}. Nothing was sent.`,
    recovery: 'safe_to_retry',
    valueMoved: 'no',
    evidence: {
      rangeIncrease: quote.rangeIncrease.toString(),
      rangeLimit: quote.rangeLimit.toString(),
    },
  })
}

/**
 * Dry-run the offer before anybody signs it.
 *
 * `priceFor` is fitted to four live measurements rather than derived from
 * Solidity this repository does not vendor, so it is exactly the kind of number
 * that is right until a contract upgrade makes it quietly wrong. Simulating the
 * real call converts that risk into a caught refusal: the node executes
 * `offerIncentive` with the quoted value and no signature, spending nothing.
 *
 * A failure here is reported as a refusal to offer, never as a failed offer —
 * nothing was submitted, so nothing failed.
 */
export async function verifyOfferAmount(
  simulator: OfferSimulator,
  chainId: number,
  quote: IncentiveQuote,
  account: `0x${string}`,
): Promise<void> {
  try {
    await simulator.simulateContract({
      address: ftsoRegistryFor(chainId).fastUpdateIncentiveManager,
      abi: fastUpdateIncentiveManagerAbi as readonly unknown[],
      functionName: 'offerIncentive',
      args: [{ rangeIncrease: quote.rangeIncrease, rangeLimit: quote.rangeLimit }],
      value: quote.offerAmountWei,
      account,
    })
  } catch (cause) {
    throw new FlareKitError('FTSO_INCENTIVE_QUOTE_REJECTED', {
      domain: 'protocol',
      message: `The incentive manager rejected a dry run of this offer at ${quote.offerAmountWei} wei, so it was not submitted. The quoted price may no longer match the contract.`,
      recovery: 'safe_to_retry',
      valueMoved: 'no',
      evidence: {
        rangeIncrease: quote.rangeIncrease.toString(),
        offerAmountWei: quote.offerAmountWei.toString(),
        precision: quote.precision.toString(),
      },
      cause,
    })
  }
}
