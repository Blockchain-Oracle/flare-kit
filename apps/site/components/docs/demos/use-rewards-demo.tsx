'use client'

import {
  type ClaimIntent,
  MOCK_REWARDS_OBSERVED as OBSERVED,
  createMockRewardsAdapter,
} from '@flare-kit/core'
import { type FtsoProofResult, useRewards } from '@flare-kit/react'
import { useEffect, useState } from 'react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import { createMockRewardsAdapter } from '@flare-kit/core'
import { useRewards } from '@flare-kit/react'
import { ClaimCard } from '@flare-kit/react-ui'

const adapter = createMockRewardsAdapter() // live: makeRewardsAdapter(client, rewardsFor('coston2'), fetch)
const reconcile = (owner) => adapter.read(owner) // keyless: the read holds no key

export function Rewards({ account }) {
  const { reads, ftso, rnat, flaredrop, buildPlan, submit } = useRewards({
    account,
    adapter,
    reconcile,
  })
  const planResult = buildPlan({ kind: 'ftso-delegation', recipient: account, wrap: false })

  // The three kinds are tracked independently — ftso settling never moves rnat.
  return (
    <ClaimCard
      kind="ftso-delegation"
      reads={reads}
      operation={ftso.operation}
      planResult={planResult}
      onSubmit={() => planResult?.kind === 'plan' && submit(planResult.plan)}
    />
  )
}`

/**
 * Module scope on purpose: the hook's poll effect keys on `reconcile`'s identity,
 * so a closure rebuilt every render would restart the poll on every render.
 *
 * The adapter is the mock written after the live Coston2 keyless read pass of
 * 2026-08-12 — the empty FTSO entitlement, the "no RNat account" revert and the
 * concluded FlareDrop below are that account's REAL reads, not zeroes typed here.
 */
const adapter = createMockRewardsAdapter()
const reconcile = (account: `0x${string}`) => adapter.read(account)

const INTENT: ClaimIntent = { kind: 'ftso-delegation', recipient: OBSERVED.account, wrap: false }

/**
 * The hook runs for real against the mock adapter — the readout is its actual
 * return value on this render. No wallet and no `onSubmit`, so all three claim
 * legs stay idle; the position, the plan refusal and the proof lookup are all
 * keyless work.
 */
function Probe() {
  const { reads, error, ftso, rnat, flaredrop, buildPlan, fetchProof } = useRewards({
    account: OBSERVED.account,
    adapter,
    reconcile,
  })
  const [proof, setProof] = useState<FtsoProofResult | undefined>(undefined)

  // The mirror is unofficial and per-epoch: ask it for the one epoch whose data the
  // live pass captured, and let it answer for itself.
  useEffect(() => {
    let live = true
    void fetchProof(OBSERVED.proofPresentEpoch).then((result) => {
      if (live) setProof(result)
    })
    return () => {
      live = false
    }
  }, [fetchProof])

  return (
    <HookReadout
      name="useRewards"
      value={{
        reads: reads ?? null,
        error: error ?? null,
        ftso,
        rnat,
        flaredrop,
        'buildPlan({ kind: "ftso-delegation" })': buildPlan(INTENT) ?? null,
        ...(proof ? { [`fetchProof(${OBSERVED.proofPresentEpoch})`]: proof } : {}),
      }}
    />
  )
}

export function UseRewardsDemo() {
  return (
    <Preview code={CODE}>
      <Probe />
    </Preview>
  )
}
