'use client'

import {
  type DelegationIntent,
  MOCK_DELEGATION_OBSERVED as OBSERVED,
  createMockDelegationAdapter,
} from '@flarekit-dev/core'
import { useDelegation } from '@flarekit-dev/react'
import { Preview } from '../preview'
import { HookReadout } from './hook-readout'

const CODE = `import { createMockDelegationAdapter } from '@flarekit-dev/core'
import { useDelegation } from '@flarekit-dev/react'
import { DelegationCard } from '@flarekit-dev/react-ui'

const adapter = createMockDelegationAdapter() // live: makeDelegationAdapter(client, delegationFor('coston2'))
const reconcile = (owner) => adapter.read(owner) // keyless: the read holds no key

export function Delegate({ account, provider }) {
  const { position, operation, error, buildPlan, submit } = useDelegation({
    account,
    adapter,
    operation: undefined,
    reconcile,
  })
  const planResult = buildPlan({ kind: 'delegate', targets: [{ to: provider, bips: 10000 }] })

  return (
    <DelegationCard
      position={position}
      operation={operation}
      planResult={planResult}
      onSubmit={() => planResult?.kind === 'plan' && submit(planResult.plan)}
    />
  )
}`

/**
 * The mock adapter and the reconcile closure live at module scope on purpose: the
 * hook's poll effect keys on `reconcile`'s identity, so a closure rebuilt every
 * render would restart the poll on every render.
 *
 * The config is the DELEGATED shape the live Coston2 round trip observed on
 * 2026-08-12 — 5 C2FLR wrapped, 100% (10000 bips) delegated to one FTSO provider,
 * mode PERCENTAGE, vote power fully delegated away — not an invented position.
 */
const adapter = createMockDelegationAdapter({
  wrappedBalance: OBSERVED.wrapAmount,
  mode: 1,
  delegates: [{ address: OBSERVED.provider, bips: OBSERVED.bips }],
  votePower: 0n,
  undelegatedVotePower: 0n,
})

const reconcile = (account: `0x${string}`) => adapter.read(account)

const INTENT: DelegationIntent = {
  kind: 'delegate',
  targets: [{ to: OBSERVED.provider, bips: OBSERVED.bips }],
}

/**
 * The hook runs for real against the mock adapter — the readout is its actual
 * return value on this render. There is no wallet and no `onSubmit`, so the
 * signing leg stays idle and `operation` is honestly `null`; everything on
 * screen came from the keyless read and the pure planner.
 */
function Probe() {
  const { operation, isSettled, position, error, buildPlan } = useDelegation({
    account: OBSERVED.signer,
    adapter,
    operation: undefined,
    reconcile,
  })
  return (
    <HookReadout
      name="useDelegation"
      value={{
        operation: operation ?? null,
        isSettled,
        position,
        error: error ?? null,
        'buildPlan({ kind: "delegate" })': buildPlan(INTENT) ?? null,
      }}
    />
  )
}

export function UseDelegationDemo() {
  return (
    <Preview code={CODE}>
      <Probe />
    </Preview>
  )
}
