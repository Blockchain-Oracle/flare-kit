'use client'

import { FLARE_NETWORKS } from '@flare-kit/contracts'
import { OBSERVED_INCENTIVE_PRICING } from '@flare-kit/core'
import { useIncentiveOffer } from '@flare-kit/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import type { RoundReader } from '@flare-kit/core'
import { useIncentiveOffer } from '@flare-kit/react'
import { IncentiveComposer } from '@flare-kit/react-ui'

export function Incentive({ reader, payer, onOffer }) {
  // The quote is for this exact widening. Changing it changes the price, so a
  // different offer is a different read rather than a scaled cached number.
  const { data, loading, error, refresh } = useIncentiveOffer({
    reader,
    chainId: 114,
    rangeIncrease: 2433889152438200450873670154321n,
  })

  if (error) return <p>The incentive manager could not be quoted: {error}</p>

  return (
    <IncentiveComposer
      quote={data}
      loading={loading}
      payer={payer}
      nativeAsset="C2FLR"
      now={Date.now()}
      onRequote={refresh}
      onSubmit={onOffer}
    />
  )
}`

/**
 * The six values `quoteIncentive` reads, exactly as the Coston2
 * `FastUpdateIncentiveManager` answered them on 2026-08-05 — recorded in
 * `.thoughts/verification/2026-08-05-live-ftso-flare-testnet-coston2.json`.
 *
 * `createMockFtsoReader` deliberately answers no incentive-manager call: it
 * mocks what was observed on the feed contracts and refuses everything else. So
 * this replays the recorded reading here rather than inventing one, and the
 * rate and precision come from the constant in `@flare-kit/core` that owns them
 * rather than being retyped.
 *
 * The point of driving the real `quoteIncentive` over them is that the price is
 * computed rather than quoted: it lands on 366210937499999999 wei, which the
 * live contract accepted in a dry run and rejected one wei below.
 */
/* The five literal readings below are the recorded Coston2 measurements —
   .thoughts/verification/2026-08-05-live-ftso-flare-testnet-coston2.json. If
   the incentive state is ever re-measured, update them from that record so
   this page cannot silently disagree with OBSERVED_INCENTIVE_PRICING. */
const OBSERVED_COSTON2_INCENTIVE_STATE: Readonly<Record<string, bigint>> = {
  getRange: 243_388_915_243_820_045_087_367_015_432_192n,
  getExpectedSampleSize: 1_993_841_993_677_373_809_355_710_590_420_516_864n,
  /** Seventeen seconds. A widening is short-lived, and it decays. */
  getIncentiveDuration: 17n,
  rangeIncreasePrice: OBSERVED_INCENTIVE_PRICING.rangeIncreasePrice,
  rangeIncreaseLimit: 1_216_944_576_219_100_225_436_835_077_160_960n,
  getPrecision: OBSERVED_INCENTIVE_PRICING.precision,
}

/**
 * A reader over that recording, refusing anything it has no measurement for —
 * the same rule `createMockFtsoReader` follows, for the same reason: a reader
 * that answers what it never observed is a fabricated number wearing a real
 * one's clothes.
 */
const READER = {
  readContract({ functionName }: { functionName: string }) {
    const value = OBSERVED_COSTON2_INCENTIVE_STATE[functionName]
    if (value === undefined) {
      return Promise.reject(
        new Error(
          `This docs reader replays the incentive-manager state recorded on Coston2 on 2026-08-05. It has no measurement for ${functionName}.`,
        ),
      )
    }
    return Promise.resolve(value)
  },
}

const COSTON2 = FLARE_NETWORKS.coston2.id

/**
 * `getRange() / 100`, which is the widening the live price was bisected at:
 * accepted at 366210937499999999 wei and rejected at 366210937499999998.
 */
const RANGE_INCREASE = 2_433_889_152_438_200_450_873_670_154_321n

function Probe() {
  const { data, loading, error } = useIncentiveOffer({
    reader: READER,
    chainId: COSTON2,
    rangeIncrease: RANGE_INCREASE,
  })
  return (
    <HookReadout name="useIncentiveOffer" value={{ loading, error: error ?? null, data }} />
  )
}

export function UseIncentiveOfferDemo() {
  return (
    <Preview code={CODE} label="recorded Coston2 read">
      <Probe />
    </Preview>
  )
}
