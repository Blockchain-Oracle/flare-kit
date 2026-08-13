'use client'

import { M11_STAKING_SECTIONS } from '@gallery/m11-staking-sections'
import { GalleryDemo } from './gallery-demo'

/**
 * StakeCard's live preview. The eleven states come wholesale from the gallery's
 * `m11-staking` section — discovery, the pre-sign value lock, the carried
 * `stakeVerified: false` refusal, the four invariant refusals, the in-flight
 * spine, and the three distinct position renderings. Nothing is re-authored
 * here, so the docs cannot show a state the surface never reached.
 */
const STAKE_CASES = M11_STAKING_SECTIONS.find((section) => section.id === 'm11-staking')!.cases

const CODE = `import { parseAmount } from '@flare-kit/core'
import { useStaking, type UseStakingInput } from '@flare-kit/react'
import { StakeCard } from '@flare-kit/react-ui'
import '@flare-kit/react-ui/styles.css'
import { useState } from 'react'

const NATIVE = { symbol: 'C2FLR', address: '0x…', decimals: 18 }

export function Stake({ input }: { input: UseStakingInput }) {
  const staking = useStaking(input)
  const [nodeId, setNodeId] = useState('')
  const [amountText, setAmountText] = useState('')
  const [durationDays, setDurationDays] = useState(14)

  const start = BigInt(Math.floor(Date.now() / 1000))
  const planResult = nodeId
    ? staking.buildPlan({
        nodeId,
        amount: parseAmount(amountText || '0', 18, NATIVE.symbol).value,
        startTime: start,
        endTime: start + BigInt(durationDays) * 86_400n,
        rewardAddress: input.account!,
      })
    : undefined

  return (
    <StakeCard
      nativeToken={NATIVE}
      position={staking.position}
      validators={staking.validators}
      limits={staking.limits}
      planResult={planResult}
      selectedNodeId={nodeId}
      amountText={amountText}
      durationDays={durationDays}
      networkLabel="Coston2"
      onValidatorChange={setNodeId}
      onAmountChange={setAmountText}
      onDurationChange={setDurationDays}
      onSubmit={() => {
        if (planResult?.ok) void staking.submit(planResult.plan)
      }}
    />
  )
}`

export function StakeCardDemo() {
  return <GalleryDemo cases={STAKE_CASES} code={CODE} />
}
