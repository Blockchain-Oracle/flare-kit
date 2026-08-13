'use client'

import {
  type StakeIntent,
  MOCK_STAKE_OBSERVED as OBSERVED,
  mockStakingDeployment,
} from '@flare-kit/core'
import { useStaking } from '@flare-kit/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import { mockStakingDeployment } from '@flare-kit/core'
import { useStaking } from '@flare-kit/react'
import { StakeCard } from '@flare-kit/react-ui'

const deployment = mockStakingDeployment() // live: stakingFor('coston2')

export function Stake({ account, executor, publicClient, intent }) {
  const { position, limits, validators, reward, buildPlan, submit } = useStaking({
    deployment,
    account,
    publicClient,                       // keyless: limits, mirrored vote power, reward
    rpcBase: deployment.pChainRpcBase,  // keyless: the validator set
    executor,                           // the ONLY signing seam; absent = read and plan only
  })
  const planResult = buildPlan(intent) // undefined until the reads land

  return (
    <StakeCard
      position={position}
      limits={limits}
      validators={validators}
      planResult={planResult}
      onSubmit={() => planResult?.ok && submit(planResult.plan)}
    />
  )
}`

/**
 * The honest shipped deployment — `stakeVerified: false`, because no stake ever
 * settled live on this network. The real `planStake` gate refuses off that flag;
 * the mock does not simulate the refusal, it just declines to fake verification.
 */
const deployment = mockStakingDeployment()

/** The Task-6 planning intent: the observed validator, the read minimum, the read minimum window. */
const INTENT: StakeIntent = {
  nodeId: OBSERVED.chosenValidator,
  amount: OBSERVED.minAmountWei,
  startTime: OBSERVED.chosenValidatorEnd - OBSERVED.minDurationSeconds,
  endTime: OBSERVED.chosenValidatorEnd,
  rewardAddress: OBSERVED.account,
}

/**
 * The hook runs for real — and this page has no network, so it is handed no viem
 * client, no P-chain RPC base and no executor. What the readout shows is the
 * point: the position is `unavailable` rather than a confident zero stake, the
 * live limits and validator set are `null` rather than the numbers this page's
 * prose quotes, and `buildPlan` returns nothing rather than plan off bounds the
 * hook has not read. Absence of a reader is never absence of a stake.
 */
function Probe() {
  const { operation, isSettled, position, limits, validators, reward, error, buildPlan } = useStaking({
    deployment,
    account: OBSERVED.account,
    publicClient: undefined,
    rpcBase: undefined,
  })
  return (
    <HookReadout
      name="useStaking"
      value={{
        operation: operation ?? null,
        isSettled,
        position,
        limits: limits ?? null,
        validators: validators ?? null,
        reward: reward ?? null,
        error: error ?? null,
        'buildPlan(intent)': buildPlan(INTENT) ?? null,
      }}
    />
  )
}

export function UseStakingDemo() {
  return (
    <Preview code={CODE}>
      <Probe />
    </Preview>
  )
}
